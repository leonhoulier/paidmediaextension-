import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EXTENSION_DIR = path.resolve(ROOT, 'packages/extension/dist');
const PROFILE_DIR = path.resolve(ROOT, 'packages/e2e/.live-profile');
const ARTIFACT_DIR = path.resolve(ROOT, 'packages/e2e/.live-artifacts');
const START_URL =
  process.env.META_URL ??
  'https://adsmanager.facebook.com/adsmanager/manage/campaigns';

if (!fs.existsSync(EXTENSION_DIR)) {
  throw new Error(
    `Extension build not found at ${EXTENSION_DIR}. Run the extension build first.`,
  );
}

fs.mkdirSync(PROFILE_DIR, { recursive: true });
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1440, height: 960 },
  args: [
    `--disable-extensions-except=${EXTENSION_DIR}`,
    `--load-extension=${EXTENSION_DIR}`,
    '--no-first-run',
    '--disable-default-apps',
    '--disable-popup-blocking',
  ],
});

const rl = readline.createInterface({ input, output });

try {
  const extensionId = await waitForExtensionId(context);
  const page = await context.newPage();
  await page.bringToFront();

  page.on('console', (msg) => {
    const text = msg.text();
    if (
      text.includes('[EXTRACTION]') ||
      text.includes('[VALIDATION]') ||
      text.includes('[INIT]')
    ) {
      console.log(`[page] ${text}`);
    }
  });

  await page.goto(START_URL, { waitUntil: 'domcontentloaded' });

  console.log('');
  console.log(`Extension loaded: ${extensionId}`);
  console.log(`Opened Meta URL: ${START_URL}`);
  console.log('Use the browser window to log in and navigate to the Meta editor page you want to inspect.');
  console.log(
    'Commands: url, open <url>, snapshot, debug-on, debug-off, screenshot, wait <ms>, scroll <px>, click-text <text>, sections, exit',
  );
  console.log('');

  while (true) {
    const raw = await rl.question('live-meta> ');
    const trimmed = raw.trim();
    const command = trimmed.toLowerCase();

    if (command === 'exit' || command === 'quit') {
      break;
    }

    if (command.startsWith('open ')) {
      const targetUrl = trimmed.slice(5).trim();
      const activePage = context.pages().find(
        (candidate) => !candidate.url().startsWith('chrome-extension://'),
      );

      if (!targetUrl) {
        console.log('Missing URL. Example: open https://adsmanager.facebook.com/...');
        continue;
      }

      if (!activePage) {
        console.log('No active web page found.');
        continue;
      }

      await activePage.bringToFront();
      await activePage.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      await activePage.bringToFront();
      console.log(`Opened ${targetUrl}`);
      continue;
    }

    if (command.startsWith('wait ')) {
      const waitValue = Number.parseInt(trimmed.slice(5).trim(), 10);
      if (!Number.isFinite(waitValue) || waitValue < 0) {
        console.log('Invalid wait value. Example: wait 3000');
        continue;
      }

      const activePage = getActivePage(context);
      if (!activePage) {
        console.log('No active web page found.');
        continue;
      }

      await activePage.waitForTimeout(waitValue);
      console.log(`Waited ${waitValue}ms`);
      continue;
    }

    if (command.startsWith('scroll ')) {
      const scrollAmount = Number.parseInt(trimmed.slice(7).trim(), 10);
      if (!Number.isFinite(scrollAmount)) {
        console.log('Invalid scroll value. Example: scroll 1200');
        continue;
      }

      const activePage = getActivePage(context);
      if (!activePage) {
        console.log('No active web page found.');
        continue;
      }

      await activePage.bringToFront();
      await activePage.mouse.move(720, 720);
      await activePage.mouse.wheel(0, scrollAmount);
      await activePage.evaluate((amount) => {
        const isVisible = (element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);

          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight &&
            style.visibility !== 'hidden' &&
            style.display !== 'none'
          );
        };

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const scrollables = Array.from(document.querySelectorAll('*'))
          .filter((element) => {
            const htmlElement = element;
            return (
              htmlElement.scrollHeight > htmlElement.clientHeight + 40 &&
              isVisible(htmlElement)
            );
          })
          .sort((a, b) => (b.clientHeight * b.clientWidth) - (a.clientHeight * a.clientWidth));

        const target =
          scrollables.find((element) => {
            const rect = element.getBoundingClientRect();
            return (
              rect.left <= centerX &&
              rect.right >= centerX &&
              rect.top <= centerY &&
              rect.bottom >= centerY
            );
          }) ??
          scrollables[0] ??
          document.scrollingElement;

        target?.scrollBy({ top: amount, left: 0, behavior: 'auto' });
        window.scrollBy({ top: amount, left: 0, behavior: 'auto' });
      }, scrollAmount);
      await activePage.waitForTimeout(1000);
      console.log(`Scrolled ${scrollAmount}px`);
      continue;
    }

    if (command.startsWith('click-text ')) {
      const targetText = trimmed.slice('click-text '.length).trim();
      const activePage = getActivePage(context);

      if (!targetText) {
        console.log('Missing text. Example: click-text Advantage+ audience');
        continue;
      }

      if (!activePage) {
        console.log('No active web page found.');
        continue;
      }

      try {
        const locator = activePage.getByText(targetText, { exact: false }).first();
        await locator.scrollIntoViewIfNeeded();
        await locator.click({ timeout: 5000 });
        await activePage.waitForTimeout(1500);
        console.log(`Clicked text: ${targetText}`);
      } catch (error) {
        console.log(
          `Could not click text "${targetText}": ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      continue;
    }

    if (command === 'url') {
      console.log(await getActiveTabInfo(context));
      continue;
    }

    if (command === 'sections') {
      const activePage = getActivePage(context);
      if (!activePage) {
        console.log('No active web page found.');
        continue;
      }

      const sections = await activePage.evaluate(() => {
        const isVisible = (element) => {
          const htmlElement = element;
          const rect = htmlElement.getBoundingClientRect();
          const style = window.getComputedStyle(htmlElement);

          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight &&
            style.visibility !== 'hidden' &&
            style.display !== 'none'
          );
        };

        const candidates = Array.from(
          document.querySelectorAll(
            'h1, h2, h3, h4, h5, label, legend, [role="heading"], [aria-label]',
          ),
        );

        const values = [];
        for (const element of candidates) {
          if (!isVisible(element)) continue;
          const text =
            element.textContent?.trim() ||
            element.getAttribute('aria-label')?.trim() ||
            '';
          if (!text || text.length < 3) continue;
          values.push(text.replace(/\s+/g, ' '));
        }

        return Array.from(new Set(values)).slice(0, 80);
      });

      console.log(JSON.stringify(sections, null, 2));
      continue;
    }

    if (command === 'snapshot') {
      const result = await sendToActiveTab(context, { type: 'captureExtractionSnapshot' });
      console.log(JSON.stringify(summarizeSnapshotResult(result), null, 2));
      continue;
    }

    if (command === 'debug-on') {
      console.log(
        await sendToActiveTab(context, { type: 'toggleDebugMode', enabled: true }),
      );
      continue;
    }

    if (command === 'debug-off') {
      console.log(
        await sendToActiveTab(context, { type: 'toggleDebugMode', enabled: false }),
      );
      continue;
    }

    if (command === 'screenshot') {
      const activePage = getActivePage(context);
      if (!activePage) {
        console.log('No active web page found for screenshot.');
        continue;
      }

      const screenshotPath = path.join(
        ARTIFACT_DIR,
        `live-meta-${Date.now()}.png`,
      );
      await activePage.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`Saved screenshot: ${screenshotPath}`);
      continue;
    }

    console.log(
      'Unknown command. Use: url, open <url>, snapshot, debug-on, debug-off, screenshot, wait <ms>, scroll <px>, click-text <text>, sections, exit',
    );
  }
} finally {
  rl.close();
  await context.close();
}

async function waitForExtensionId(context) {
  for (let i = 0; i < 40; i += 1) {
    const workers = context.serviceWorkers();
    const worker = workers.find((candidate) =>
      candidate.url().includes('chrome-extension://'),
    );

    if (worker) {
      return worker.url().split('/')[2];
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('Could not find extension service worker after 20 seconds.');
}

async function getExtensionWorker(context) {
  const worker = context
    .serviceWorkers()
    .find((candidate) => candidate.url().includes('chrome-extension://'));

  if (!worker) {
    throw new Error('Extension service worker is not available.');
  }

  return worker;
}

async function getActiveTabInfo(context) {
  const worker = await getExtensionWorker(context);
  return worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      return { error: 'No active tab found.' };
    }

    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
    };
  });
}

function getActivePage(context) {
  return context
    .pages()
    .find((candidate) => !candidate.url().startsWith('chrome-extension://'));
}

async function sendToActiveTab(context, message) {
  const worker = await getExtensionWorker(context);
  return worker.evaluate(async (payload) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      return { success: false, error: 'No active tab found.' };
    }

    try {
      return await chrome.tabs.sendMessage(tab.id, payload);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, message);
}

function summarizeSnapshotResult(result) {
  if (!result?.success || !result.snapshot) {
    return result;
  }

  const snapshot = result.snapshot;
  const getterGaps = snapshot.fields
    .filter((field) => !field.hasValue && field.selectorFound === true)
    .slice(0, 8)
    .map((field) => field.fieldPath);
  const selectorGaps = snapshot.fields
    .filter((field) => !field.hasValue && field.selectorFound === false)
    .slice(0, 8)
    .map((field) => field.fieldPath);
  const extracted = snapshot.fields
    .filter((field) => field.hasValue)
    .slice(0, 8)
    .map((field) => ({
      fieldPath: field.fieldPath,
      valuePreview: field.valuePreview,
    }));

  return {
    success: true,
    platform: snapshot.platform,
    capturedAt: snapshot.capturedAt,
    totals: {
      totalFields: snapshot.totalFields,
      extractedFields: snapshot.extractedFields,
      selectorHits: snapshot.selectorHits,
      missingWithSelector: snapshot.missingWithSelector,
      missingWithoutSelector: snapshot.missingWithoutSelector,
    },
    getterGaps,
    selectorGaps,
    extracted,
  };
}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EXTENSION_DIR = path.resolve(ROOT, 'packages/extension/dist');
const PROFILE_DIR = path.resolve(ROOT, 'packages/e2e/.live-profile');

const targetUrl = process.argv[2];
const waitMs = Number(process.argv[3] ?? '8000');

if (!targetUrl) {
  throw new Error(
    'Usage: node packages/e2e/scripts/meta-snapshot-url.mjs <meta-url> [wait-ms]',
  );
}

if (!fs.existsSync(EXTENSION_DIR)) {
  throw new Error(`Extension build not found at ${EXTENSION_DIR}`);
}

fs.mkdirSync(PROFILE_DIR, { recursive: true });

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

try {
  const worker = await waitForExtensionWorker(context);
  const page = await context.newPage();
  await page.bringToFront();
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await page.waitForTimeout(waitMs);

  const activeTab = await worker.evaluate(async () => {
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

  const snapshot = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      return { success: false, error: 'No active tab found.' };
    }

    const timeout = new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: false, error: 'Snapshot timed out after 15 seconds.' });
      }, 15000);
    });

    try {
      return await Promise.race([
        chrome.tabs.sendMessage(tab.id, { type: 'captureExtractionSnapshot' }),
        timeout,
      ]);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  console.log(
    JSON.stringify(
      {
        activeTab,
        snapshot,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
}

async function waitForExtensionWorker(context) {
  for (let i = 0; i < 40; i += 1) {
    const worker = context
      .serviceWorkers()
      .find((candidate) => candidate.url().includes('chrome-extension://'));

    if (worker) {
      return worker;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('Could not find extension service worker after 20 seconds.');
}

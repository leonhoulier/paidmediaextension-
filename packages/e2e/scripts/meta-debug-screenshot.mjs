import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EXTENSION_DIR = path.resolve(ROOT, 'packages/extension/dist');
const PROFILE_DIR = path.resolve(ROOT, 'packages/e2e/.live-profile');
const ARTIFACT_DIR = path.resolve(ROOT, 'packages/e2e/.live-artifacts');

const targetUrl = process.argv[2];
const waitMs = Number(process.argv[3] ?? '8000');

if (!targetUrl) {
  throw new Error(
    'Usage: node packages/e2e/scripts/meta-debug-screenshot.mjs <meta-url> [wait-ms]',
  );
}

if (!fs.existsSync(EXTENSION_DIR)) {
  throw new Error(`Extension build not found at ${EXTENSION_DIR}`);
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

try {
  const worker = await waitForExtensionWorker(context);
  const page = await context.newPage();
  await page.bringToFront();
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await page.waitForTimeout(waitMs);

  const toggleResult = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      return { success: false, error: 'No active tab found.' };
    }

    const timeout = new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: false, error: 'toggleDebugMode timed out after 20 seconds.' });
      }, 20000);
    });

    try {
      return await Promise.race([
        chrome.tabs.sendMessage(tab.id, { type: 'toggleDebugMode', enabled: true }),
        timeout,
      ]);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  await page.waitForTimeout(2500);

  const screenshotPath = path.join(
    ARTIFACT_DIR,
    `meta-debug-${Date.now()}.png`,
  );
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(
    JSON.stringify(
      {
        toggleResult,
        screenshotPath,
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

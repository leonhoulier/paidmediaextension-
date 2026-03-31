/**
 * Shared Playwright fixture for Chrome extension tests.
 *
 * Launches a persistent Chromium context with the patched test extension
 * loaded. All extension tests import from this module to get a
 * pre-configured `context` and `extensionId`.
 *
 * Important:
 * - Must use `chromium.launchPersistentContext()` (headful) for extensions
 * - Extension is loaded from `.test-extension/` (patched by global-setup)
 * - Provides helpers for navigating to mock fixtures served on :8080
 */

import { test as base, chromium, type BrowserContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/** Read runtime data written by global-setup */
function runtimeData(): Record<string, string> {
  const p = path.resolve(__dirname, '../../.runtime-data.json');
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

/**
 * Extended test fixture that provides:
 * - `context` – persistent browser context with the extension loaded
 * - `extensionId` – the installed extension's chrome ID
 * - `runtimeData` – dynamic test data from global setup
 */
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  testData: Record<string, string>;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const data = runtimeData();
    const extensionDir = data.testExtensionDir ?? path.resolve(__dirname, '../../.test-extension');

    if (!fs.existsSync(extensionDir)) {
      throw new Error(
        `Test extension directory not found: ${extensionDir}. ` +
        'Make sure global-setup has run.'
      );
    }

    // Launch persistent context with extension loaded
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
        '--no-first-run',
        '--disable-default-apps',
        '--disable-popup-blocking',
      ],
    });

    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    // Wait for the service worker to be available
    let swTarget: { url: () => string } | undefined;

    // Poll for the service worker (may take a moment after launch)
    for (let i = 0; i < 20; i++) {
      const workers = context.serviceWorkers();
      swTarget = workers.find((w) => w.url().includes('chrome-extension://'));
      if (swTarget) break;

      // Also check background pages (MV2 fallback)
      const pages = context.backgroundPages();
      const bgPage = pages.find((p) => p.url().includes('chrome-extension://'));
      if (bgPage) {
        const id = bgPage.url().split('/')[2];
        await use(id);
        return;
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    if (!swTarget) {
      throw new Error('Could not find extension service worker after 10 seconds');
    }

    const extensionId = swTarget.url().split('/')[2];
    await use(extensionId);
  },

  testData: async ({}, use) => {
    await use(runtimeData());
  },
});

export { expect } from '@playwright/test';

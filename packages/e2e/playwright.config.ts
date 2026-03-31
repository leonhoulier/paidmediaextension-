import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright configuration for Media Buying Governance E2E tests.
 *
 * Three projects:
 *   1. api          – HTTP-only integration tests (no browser)
 *   2. admin-portal – Smoke tests for the React admin UI
 *   3. extension    – Chrome extension tests against mock platform fixtures
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 1,
  workers: 1, // sequential – avoids port conflicts and DB race conditions
  fullyParallel: false,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports', open: 'never' }],
  ],

  use: {
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },

  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',

  projects: [
    /* ── API integration tests (no browser) ──────────────────────── */
    {
      name: 'api',
      testDir: './tests/api',
      use: {
        baseURL: 'http://localhost:3000',
      },
    },

    /* ── Admin portal smoke tests ────────────────────────────────── */
    {
      name: 'admin-portal',
      testDir: './tests/admin-portal',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5173',
      },
    },

    /* ── Extension tests (uses custom fixture, not standard browser) */
    {
      name: 'extension',
      testDir: './tests/extension',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8080',
      },
    },
  ],

  webServer: [
    /* Mock-platform fixture server (serves extension test fixtures) */
    {
      command: `npx serve "${path.resolve(__dirname, '../extension/test/fixtures')}" -l 8080 --cors --no-clipboard`,
      port: 8080,
      reuseExistingServer: true,
      timeout: 10_000,
    },
  ],
});

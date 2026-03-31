import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * API Integration: Extension rules endpoints.
 *
 * Tests GET /api/v1/rules (extension-facing) and GET /api/v1/rules/version
 * using the buyer's X-Extension-Token header.
 */

function runtimeData(): Record<string, string> {
  const p = path.resolve(__dirname, '../../.runtime-data.json');
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

test.describe('Extension Rules API', () => {
  let extensionToken: string;

  test.beforeAll(() => {
    const data = runtimeData();
    extensionToken = data.buyerExtensionToken ?? '';
  });

  test('GET /rules returns rules with valid extension token', async ({ request }) => {
    test.skip(!extensionToken, 'No buyer extension token');

    const response = await request.get('/api/v1/rules', {
      headers: { 'X-Extension-Token': extensionToken },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('rules');
    expect(body).toHaveProperty('namingTemplates');
    expect(body).toHaveProperty('version');
    expect(Array.isArray(body.rules)).toBe(true);
    expect(body.rules.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /rules filters by platform', async ({ request }) => {
    test.skip(!extensionToken, 'No buyer extension token');

    const metaResp = await request.get('/api/v1/rules?platform=meta', {
      headers: { 'X-Extension-Token': extensionToken },
    });
    expect(metaResp.status()).toBe(200);
    const metaBody = await metaResp.json();

    // All returned rules should be for meta or all platforms
    for (const rule of metaBody.rules) {
      expect(['meta', 'all']).toContain(rule.platform);
    }

    const googleResp = await request.get('/api/v1/rules?platform=google_ads', {
      headers: { 'X-Extension-Token': extensionToken },
    });
    expect(googleResp.status()).toBe(200);
    const googleBody = await googleResp.json();

    for (const rule of googleBody.rules) {
      expect(['google_ads', 'all']).toContain(rule.platform);
    }
  });

  test('GET /rules rejects request without token', async ({ request }) => {
    const response = await request.get('/api/v1/rules');
    expect(response.status()).toBe(401);
  });

  test('GET /rules rejects request with invalid token', async ({ request }) => {
    const response = await request.get('/api/v1/rules', {
      headers: { 'X-Extension-Token': 'invalid-token-12345' },
    });
    expect(response.status()).toBe(401);
  });

  test('GET /rules/version returns version and lastUpdated', async ({ request }) => {
    test.skip(!extensionToken, 'No buyer extension token');

    const response = await request.get('/api/v1/rules/version', {
      headers: { 'X-Extension-Token': extensionToken },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('lastUpdated');
    expect(typeof body.version).toBe('string');
  });
});

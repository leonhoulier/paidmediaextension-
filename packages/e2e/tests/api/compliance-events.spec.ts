import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * API Integration: Compliance events endpoints.
 *
 * Tests POST /api/v1/compliance/events (batch create) and
 * POST /api/v1/compliance/comment using the buyer's extension token.
 */

function runtimeData(): Record<string, string> {
  const p = path.resolve(__dirname, '../../.runtime-data.json');
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

test.describe('Compliance Events API', () => {
  let extensionToken: string;
  let metaAccountId: string;
  let ruleId: string;

  test.beforeAll(async ({ request }) => {
    const data = runtimeData();
    extensionToken = data.buyerExtensionToken ?? '';
    metaAccountId = data.metaAccountId ?? '';

    expect(extensionToken, 'buyerExtensionToken must be present in .runtime-data.json').toBeTruthy();
    expect(metaAccountId, 'metaAccountId must be present in .runtime-data.json').toBeTruthy();

    // Get a rule ID to reference in events
    const rulesResp = await request.get('http://localhost:3000/api/v1/rules', {
      headers: { 'X-Extension-Token': extensionToken },
    });
    expect(rulesResp.ok(), 'GET /rules must succeed to obtain a ruleId for events').toBeTruthy();
    const body = await rulesResp.json();
    expect(body.rules.length, 'At least one rule must exist for compliance event tests').toBeGreaterThan(0);
    ruleId = body.rules[0].id;
  });

  test('POST /compliance/events creates batch events', async ({ request }) => {
    const response = await request.post('/api/v1/compliance/events', {
      headers: { 'X-Extension-Token': extensionToken },
      data: {
        events: [
          {
            adAccountId: metaAccountId,
            platform: 'meta',
            entityLevel: 'campaign',
            entityName: 'E2E_US_Brand_Test_20260207',
            ruleId,
            status: 'passed',
            fieldValue: '5000',
            expectedValue: '100-50000',
          },
          {
            adAccountId: metaAccountId,
            platform: 'meta',
            entityLevel: 'campaign',
            entityName: 'E2E_US_Brand_Test_20260207',
            ruleId,
            status: 'violated',
            fieldValue: '99',
            expectedValue: '100-50000',
          },
          {
            adAccountId: metaAccountId,
            platform: 'meta',
            entityLevel: 'campaign',
            entityName: 'E2E_US_Brand_Test_20260207',
            ruleId,
            status: 'overridden',
            fieldValue: '50',
            expectedValue: '100-50000',
            comment: 'Approved by manager for small test campaign',
          },
        ],
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ created: 3 });
  });

  test('POST /compliance/events rejects empty events array', async ({ request }) => {
    const response = await request.post('/api/v1/compliance/events', {
      headers: { 'X-Extension-Token': extensionToken },
      data: { events: [] },
    });

    expect(response.status()).toBe(400);
  });

  test('POST /compliance/comment creates a comment event', async ({ request }) => {
    const response = await request.post('/api/v1/compliance/comment', {
      headers: { 'X-Extension-Token': extensionToken },
      data: {
        ruleId,
        entityName: 'E2E_Comment_Test_Campaign',
        comment: 'This campaign requires an open-ended schedule for always-on brand presence.',
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty('eventId');
    expect(typeof body.eventId).toBe('string');
  });

  test('POST /compliance/comment rejects missing fields', async ({ request }) => {
    const response = await request.post('/api/v1/compliance/comment', {
      headers: { 'X-Extension-Token': extensionToken },
      data: {
        ruleId,
        // missing entityName and comment
      },
    });

    expect(response.status()).toBe(400);
  });
});

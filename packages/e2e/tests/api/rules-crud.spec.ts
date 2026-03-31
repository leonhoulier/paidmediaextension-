import { test, expect } from '@playwright/test';
import { adminAuthToken } from '../../fixtures/test-data';
import fs from 'fs';
import path from 'path';

/**
 * API Integration: Full CRUD cycle for rules.
 *
 * Creates a rule via the admin API, reads it back, updates it, and finally
 * deletes it, verifying each step returns correct data.
 */

const AUTH = `Bearer ${adminAuthToken()}`;

function runtimeData(): Record<string, string> {
  const p = path.resolve(__dirname, '../../.runtime-data.json');
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

test.describe('Rules CRUD API', () => {
  let ruleId: string;
  let ruleSetId: string;

  test.beforeAll(() => {
    const data = runtimeData();
    ruleSetId = data.ruleSetId ?? '';
    expect(ruleSetId, 'ruleSetId must be present in .runtime-data.json').toBeTruthy();
  });

  test('POST /admin/rules creates a new rule', async ({ request }) => {
    const data = runtimeData();
    ruleSetId = data.ruleSetId;

    const response = await request.post('/api/v1/admin/rules', {
      headers: { Authorization: AUTH },
      data: {
        ruleSetId,
        name: 'E2E Test Budget Rule',
        description: 'Created by E2E test suite',
        entityLevel: 'campaign',
        ruleType: 'budget_enforcement',
        enforcement: 'warning',
        condition: {
          field: 'campaign.budget_value',
          operator: 'in_range',
          value: { min: 200, max: 75000 },
        },
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty('id');
    expect(body.name).toBe('E2E Test Budget Rule');
    ruleId = body.id;
  });

  test('GET /admin/rules/:id reads the created rule', async ({ request }) => {
    expect(ruleId, 'ruleId must exist — POST test must run first').toBeTruthy();

    const response = await request.get(`/api/v1/admin/rules/${ruleId}`, {
      headers: { Authorization: AUTH },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(ruleId);
    expect(body.name).toBe('E2E Test Budget Rule');
  });

  test('GET /admin/rules lists rules including the new one', async ({ request }) => {
    const response = await request.get('/api/v1/admin/rules', {
      headers: { Authorization: AUTH },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);

    const found = body.find((r: { id: string }) => r.id === ruleId);
    expect(found).toBeTruthy();
  });

  test('PUT /admin/rules/:id updates the rule and increments version', async ({ request }) => {
    expect(ruleId, 'ruleId must exist — POST test must run first').toBeTruthy();

    const response = await request.put(`/api/v1/admin/rules/${ruleId}`, {
      headers: { Authorization: AUTH },
      data: { name: 'E2E Updated Budget Rule' },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.name).toBe('E2E Updated Budget Rule');
    expect(body.version).toBe(2);
  });

  test('DELETE /admin/rules/:id deletes the rule', async ({ request }) => {
    expect(ruleId, 'ruleId must exist — POST test must run first').toBeTruthy();

    const response = await request.delete(`/api/v1/admin/rules/${ruleId}`, {
      headers: { Authorization: AUTH },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.deleted).toBe(true);
  });

  test('GET /admin/rules/:id returns 404 after deletion', async ({ request }) => {
    expect(ruleId, 'ruleId must exist — POST test must run first').toBeTruthy();

    const response = await request.get(`/api/v1/admin/rules/${ruleId}`, {
      headers: { Authorization: AUTH },
    });

    expect(response.status()).toBe(404);
  });
});

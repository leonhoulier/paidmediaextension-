/**
 * API Client Tests
 *
 * Tests for the extension API client: fetchWithToken, createApprovalRequest,
 * getApprovalRequestStatus, cancelApprovalRequest.
 *
 * @module api/__tests__/client
 */

// Mock the logger before imports
jest.mock('../../utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Setup chrome.storage.local mock
const mockChromeStorageGet = jest.fn();
global.chrome = {
  storage: {
    local: {
      get: mockChromeStorageGet,
      set: jest.fn(),
      remove: jest.fn(),
    },
  },
} as unknown as typeof chrome;

// Setup global fetch mock
const mockFetch = jest.fn();
global.fetch = mockFetch;

import {
  fetchWithToken,
  createApprovalRequest,
  getApprovalRequestStatus,
  cancelApprovalRequest,
} from '../client.js';

beforeEach(() => {
  jest.clearAllMocks();
  // Default: token is present, no custom API base
  mockChromeStorageGet.mockImplementation(async (key: string | string[] | Record<string, unknown> | null) => {
    if (key === 'extensionToken') return { extensionToken: 'test-token-abc' };
    if (key === 'apiBaseUrl') return {};
    return {};
  });
});

// ---------------------------------------------------------------------------
// fetchWithToken()
// ---------------------------------------------------------------------------
describe('fetchWithToken()', () => {
  it('no token in storage throws', async () => {
    mockChromeStorageGet.mockImplementation(async (key: string | string[] | Record<string, unknown> | null) => {
      if (key === 'extensionToken') return {};
      if (key === 'apiBaseUrl') return {};
      return {};
    });

    await expect(fetchWithToken('/api/v1/test')).rejects.toThrow(
      'No extension token found'
    );
  });

  it('successful request returns JSON', async () => {
    const payload = { data: 'hello' };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => payload,
    });

    const result = await fetchWithToken('/api/v1/test');
    expect(result).toEqual(payload);

    // Verify auth header
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/v1/test');
    expect(opts.headers['X-Extension-Token']).toBe('test-token-abc');
  });

  it('HTTP error throws with status', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'Access denied',
    });

    await expect(fetchWithToken('/api/v1/test')).rejects.toThrow(
      'API request failed: 403 Forbidden - Access denied'
    );
  });

  it('empty response (no JSON content-type) returns undefined', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers({}),
      json: async () => ({}),
    });

    const result = await fetchWithToken('/api/v1/test');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createApprovalRequest()
// ---------------------------------------------------------------------------
describe('createApprovalRequest()', () => {
  it('sends correct body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ requestId: 'req-42' }),
    });

    const result = await createApprovalRequest({
      ruleId: 'rule-1',
      approverId: 'approver-1',
      campaignSnapshot: { budget: 5000 },
    });

    expect(result.id).toBe('req-42');
    expect(result.status).toBe('pending');

    // Verify the body sent to the API
    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body).toEqual({
      ruleId: 'rule-1',
      entitySnapshot: { budget: 5000 },
    });
  });
});

// ---------------------------------------------------------------------------
// getApprovalRequestStatus()
// ---------------------------------------------------------------------------
describe('getApprovalRequestStatus()', () => {
  it('returns mapped response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: 'req-42', status: 'approved', comment: 'Looks good' }),
    });

    const result = await getApprovalRequestStatus('req-42');
    expect(result).toEqual({
      id: 'req-42',
      status: 'approved',
      comment: 'Looks good',
    });

    // Verify the correct URL was called
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/v1/extension/approval/requests/req-42');
  });
});

// ---------------------------------------------------------------------------
// cancelApprovalRequest()
// ---------------------------------------------------------------------------
describe('cancelApprovalRequest()', () => {
  it('sends DELETE', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers({}),
    });

    await cancelApprovalRequest('req-42');

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/v1/extension/approval/requests/req-42');
    expect(opts.method).toBe('DELETE');
  });
});

/**
 * Tests for Feature Flags integration — Backend
 *
 * Verifies:
 * - initFeatureFlags is a no-op when SPLITIO_API_KEY is not set
 * - getFlag returns 'control' when SDK not initialized
 * - isFeatureEnabled returns false when SDK not initialized
 * - Flag cache respects 30-second TTL
 */

import { initFeatureFlags, getFlag, isFeatureEnabled, destroyFeatureFlags } from '../feature-flags';

// Mock the Split.io SDK
const mockGetTreatment = jest.fn().mockReturnValue('on');
const mockDestroy = jest.fn().mockResolvedValue(undefined);
const mockOn = jest.fn();

jest.mock('@splitsoftware/splitio', () => ({
  SplitFactory: jest.fn().mockImplementation(() => ({
    client: () => ({
      getTreatment: mockGetTreatment,
      destroy: mockDestroy,
      on: mockOn,
      Event: {
        SDK_READY: 'init::ready',
        SDK_READY_TIMED_OUT: 'init::timeout',
      },
    }),
  })),
}));

describe('Backend Feature Flags instrumentation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    await destroyFeatureFlags();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should be a no-op when SPLITIO_API_KEY is not set', () => {
    delete process.env.SPLITIO_API_KEY;
    initFeatureFlags();

    // getFlag should return 'control' (default)
    expect(getFlag('test-flag')).toBe('control');
  });

  it('should return control when SDK is not ready', () => {
    process.env.SPLITIO_API_KEY = 'test-key';
    initFeatureFlags();

    // SDK not ready yet (no SDK_READY event fired)
    expect(getFlag('test-flag')).toBe('control');
    expect(isFeatureEnabled('test-flag')).toBe(false);
  });

  it('should register SDK_READY and SDK_READY_TIMED_OUT handlers', () => {
    process.env.SPLITIO_API_KEY = 'test-key';
    initFeatureFlags();

    expect(mockOn).toHaveBeenCalledWith('init::ready', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('init::timeout', expect.any(Function));
  });

  it('should evaluate flags after SDK_READY fires', () => {
    process.env.SPLITIO_API_KEY = 'test-key';
    initFeatureFlags();

    // Simulate SDK_READY
    const readyCallback = mockOn.mock.calls.find(
      (call: unknown[]) => call[0] === 'init::ready',
    )?.[1];
    expect(readyCallback).toBeDefined();
    readyCallback();

    // Now getFlag should call getTreatment
    mockGetTreatment.mockReturnValue('on');
    expect(getFlag('enable-expanded-rules', 'org-123')).toBe('on');
    expect(isFeatureEnabled('enable-expanded-rules', 'org-123')).toBe(true);

    mockGetTreatment.mockReturnValue('off');
    // Cache should still return 'on' (within 30s TTL)
    expect(getFlag('enable-expanded-rules', 'org-123')).toBe('on');
  });

  it('should clean up on destroy', async () => {
    process.env.SPLITIO_API_KEY = 'test-key';
    initFeatureFlags();

    await destroyFeatureFlags();
    expect(mockDestroy).toHaveBeenCalled();

    // After destroy, should return control again
    expect(getFlag('test-flag')).toBe('control');
  });
});

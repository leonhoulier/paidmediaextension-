/**
 * Tests for Feature Flags integration — Extension
 *
 * Verifies:
 * - initFeatureFlags is a no-op when SPLITIO_API_KEY is not set
 * - getFlag returns 'control' when SDK not initialized
 * - isEnabled returns false when SDK not initialized
 * - 30-second TTL cache behavior
 */

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

import {
  initFeatureFlags,
  getFlag,
  isEnabled,
  destroyFeatureFlags,
} from '../feature-flags.js';

describe('Extension Feature Flags instrumentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (process.env as Record<string, string>).SPLITIO_API_KEY = '';
  });

  afterEach(async () => {
    await destroyFeatureFlags();
  });

  it('should be a no-op when SPLITIO_API_KEY is empty', () => {
    (process.env as Record<string, string>).SPLITIO_API_KEY = '';
    initFeatureFlags();
    expect(getFlag('enable-require-extraction')).toBe('control');
  });

  it('should return control when SDK is not ready', () => {
    (process.env as Record<string, string>).SPLITIO_API_KEY = 'test-key';
    initFeatureFlags();

    // SDK not ready yet
    expect(getFlag('enable-require-extraction')).toBe('control');
    expect(isEnabled('enable-require-extraction')).toBe(false);
  });

  it('should evaluate flags after SDK_READY fires', () => {
    (process.env as Record<string, string>).SPLITIO_API_KEY = 'test-key';
    initFeatureFlags();

    // Simulate SDK_READY
    const readyCallback = mockOn.mock.calls.find(
      (call: unknown[]) => call[0] === 'init::ready',
    )?.[1];
    expect(readyCallback).toBeDefined();
    readyCallback();

    mockGetTreatment.mockReturnValue('on');
    expect(getFlag('enable-require-extraction')).toBe('on');
    expect(isEnabled('enable-require-extraction')).toBe(true);
  });

  it('should cache flag values for 30 seconds', () => {
    (process.env as Record<string, string>).SPLITIO_API_KEY = 'test-key';
    initFeatureFlags();

    // Simulate SDK_READY
    const readyCallback = mockOn.mock.calls.find(
      (call: unknown[]) => call[0] === 'init::ready',
    )?.[1];
    readyCallback();

    // First call gets 'on'
    mockGetTreatment.mockReturnValue('on');
    expect(getFlag('test-flag')).toBe('on');

    // Change return value — but cache should still return 'on'
    mockGetTreatment.mockReturnValue('off');
    expect(getFlag('test-flag')).toBe('on');

    // getTreatment should have been called only once (second call used cache)
    expect(mockGetTreatment).toHaveBeenCalledTimes(1);
  });

  it('should clean up on destroy', async () => {
    (process.env as Record<string, string>).SPLITIO_API_KEY = 'test-key';
    initFeatureFlags();

    await destroyFeatureFlags();
    expect(mockDestroy).toHaveBeenCalled();
    expect(getFlag('test-flag')).toBe('control');
  });
});

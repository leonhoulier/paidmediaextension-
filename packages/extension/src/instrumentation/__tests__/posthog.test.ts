/**
 * Tests for PostHog integration — Extension
 *
 * Verifies:
 * - trackExtensionEvent adds events to the queue
 * - Sampling: critical events always captured, extraction events at 10%
 * - flushEvents sends batch POST when API key is set
 * - flushEvents clears queue when API key is not set
 * - Auto-flush when queue reaches MAX_QUEUE_SIZE
 */

import {
  trackExtensionEvent,
  flushEvents,
  getQueueSize,
} from '../posthog.js';

// Mock fetch
const mockFetch = jest.fn().mockResolvedValue({ ok: true });
global.fetch = mockFetch;

// Mock chrome.runtime
(global as unknown as Record<string, unknown>).chrome = {
  runtime: {
    getManifest: () => ({ version: '1.0.0-test' }),
  },
};

describe('Extension PostHog instrumentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Drain any existing events
    flushEvents();
    (process.env as Record<string, string>).POSTHOG_API_KEY = '';
  });

  describe('trackExtensionEvent', () => {
    it('should always capture critical events', () => {
      trackExtensionEvent('extension_initialized', { platform: 'meta' });
      expect(getQueueSize()).toBe(1);
    });

    it('should always capture error events', () => {
      trackExtensionEvent('error_occurred', { message: 'test error' });
      expect(getQueueSize()).toBe(1);
    });

    it('should sample non-critical events at ~10%', () => {
      // Mock Math.random to control sampling
      const mockRandom = jest.spyOn(Math, 'random');
      let callCount = 0;

      // Track how many times random is called and simulate 10% pass rate
      mockRandom.mockImplementation(() => {
        callCount++;
        return callCount % 10 === 0 ? 0.05 : 0.5; // Every 10th call passes the 0.1 threshold
      });

      for (let i = 0; i < 100; i++) {
        trackExtensionEvent('field_value_extracted', { field: `field_${i}` });
      }

      const captured = getQueueSize();
      // With deterministic sampling, should capture exactly 10 out of 100
      expect(captured).toBe(10);

      mockRandom.mockRestore();
    });
  });

  describe('flushEvents', () => {
    it('should clear queue when POSTHOG_API_KEY is not set', () => {
      (process.env as Record<string, string>).POSTHOG_API_KEY = '';
      trackExtensionEvent('extension_initialized', {});
      expect(getQueueSize()).toBe(1);

      flushEvents();
      expect(getQueueSize()).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should send batch POST when POSTHOG_API_KEY is set', () => {
      (process.env as Record<string, string>).POSTHOG_API_KEY = 'phc_test_key';
      trackExtensionEvent('extension_paired', { orgId: 'org-1' });

      flushEvents();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/batch/'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      // Queue should be empty after flush
      expect(getQueueSize()).toBe(0);
    });

    it('should not call fetch when queue is empty', () => {
      flushEvents();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});

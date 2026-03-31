/**
 * Tests for Sentry integration — Extension
 *
 * Verifies:
 * - initSentryServiceWorker is a no-op when SENTRY_DSN is not set
 * - initSentryContentScript is a no-op when SENTRY_DSN is not set
 * - beforeSend filters out compliance_violation events
 * - captureException delegates to Sentry.captureException
 */

// Mock the Sentry SDK
const mockInit = jest.fn();
const mockCaptureException = jest.fn();
const mockSetTag = jest.fn();

jest.mock('@sentry/browser', () => ({
  init: mockInit,
  captureException: mockCaptureException,
  setTag: mockSetTag,
}));

// Must import after mock setup
import {
  initSentryServiceWorker,
  initSentryContentScript,
  captureException,
} from '../sentry.js';

describe('Extension Sentry instrumentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset process.env.SENTRY_DSN
    (process.env as Record<string, string>).SENTRY_DSN = '';
  });

  describe('initSentryServiceWorker', () => {
    it('should be a no-op when SENTRY_DSN is empty', () => {
      (process.env as Record<string, string>).SENTRY_DSN = '';
      initSentryServiceWorker();
      expect(mockInit).not.toHaveBeenCalled();
    });

    it('should call Sentry.init when SENTRY_DSN is set', () => {
      (process.env as Record<string, string>).SENTRY_DSN = 'https://test@sentry.io/123';
      initSentryServiceWorker();
      expect(mockInit).toHaveBeenCalledTimes(1);
      expect(mockSetTag).toHaveBeenCalledWith('context', 'service-worker');
    });

    it('should filter compliance_violation events via beforeSend', () => {
      (process.env as Record<string, string>).SENTRY_DSN = 'https://test@sentry.io/123';
      initSentryServiceWorker();

      const initCall = mockInit.mock.calls[0][0];
      const beforeSend = initCall.beforeSend;

      // compliance_violation in message should be filtered
      expect(beforeSend({ message: 'compliance_violation: field X' })).toBeNull();

      // Normal errors should pass through
      const normalEvent = { message: 'Network error' };
      expect(beforeSend(normalEvent)).toEqual(normalEvent);
    });
  });

  describe('initSentryContentScript', () => {
    it('should be a no-op when SENTRY_DSN is empty', () => {
      (process.env as Record<string, string>).SENTRY_DSN = '';
      initSentryContentScript();
      expect(mockInit).not.toHaveBeenCalled();
    });

    it('should call Sentry.init and tag context as content-script', () => {
      (process.env as Record<string, string>).SENTRY_DSN = 'https://test@sentry.io/456';
      initSentryContentScript();
      expect(mockInit).toHaveBeenCalledTimes(1);
      expect(mockSetTag).toHaveBeenCalledWith('context', 'content-script');
    });
  });

  describe('captureException', () => {
    it('should delegate to Sentry.captureException with context', () => {
      const error = new Error('test error');
      captureException(error, { tabId: 42 });
      expect(mockCaptureException).toHaveBeenCalledWith(error, {
        extra: { tabId: 42 },
      });
    });
  });
});

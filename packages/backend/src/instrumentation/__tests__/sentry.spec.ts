/**
 * Tests for Sentry integration — Backend
 *
 * Verifies:
 * - initSentry is a no-op when SENTRY_DSN is not set
 * - initSentry calls Sentry.init when DSN is provided
 * - beforeSend filters out compliance_violation events
 * - captureException delegates to Sentry.captureException
 */

import { initSentry, captureException } from '../sentry';

// Mock the Sentry SDK
jest.mock('@sentry/nestjs', () => {
  const initMock = jest.fn();
  const captureExceptionMock = jest.fn();

  return {
    init: initMock,
    captureException: captureExceptionMock,
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SentryMock = require('@sentry/nestjs');

describe('Backend Sentry instrumentation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should be a no-op when SENTRY_DSN is not set', () => {
    delete process.env.SENTRY_DSN;
    initSentry();
    expect(SentryMock.init).not.toHaveBeenCalled();
  });

  it('should call Sentry.init when SENTRY_DSN is set', () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    initSentry();
    expect(SentryMock.init).toHaveBeenCalledTimes(1);
    expect(SentryMock.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://test@sentry.io/123',
        sampleRate: 1.0,
      }),
    );
  });

  it('should filter compliance_violation events via beforeSend', () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    initSentry();

    const initCall = SentryMock.init.mock.calls[0][0];
    const beforeSend = initCall.beforeSend;

    // compliance_violation in message should be filtered
    const filteredEvent = beforeSend({ message: 'compliance_violation: field X' });
    expect(filteredEvent).toBeNull();

    // compliance_violation in exception value should be filtered
    const filteredExceptionEvent = beforeSend({
      exception: {
        values: [{ value: 'compliance_violation detected' }],
      },
    });
    expect(filteredExceptionEvent).toBeNull();

    // Normal errors should pass through
    const normalEvent = { message: 'Database connection failed' };
    expect(beforeSend(normalEvent)).toEqual(normalEvent);
  });

  it('should call Sentry.captureException with context', () => {
    const testError = new Error('test error');
    captureException(testError, { userId: 'user-123' });

    expect(SentryMock.captureException).toHaveBeenCalledWith(testError, {
      extra: { userId: 'user-123' },
    });
  });
});

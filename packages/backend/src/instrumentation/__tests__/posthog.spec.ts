/**
 * Tests for PostHog integration — Backend
 *
 * Verifies:
 * - initPostHog is a no-op when POSTHOG_API_KEY is not set
 * - trackServerEvent delegates to PostHog.capture
 * - identifyServerUser delegates to PostHog.identify
 * - flushPostHog calls client.shutdown
 */

import { initPostHog, trackServerEvent, identifyServerUser, flushPostHog } from '../posthog';

// Mock the PostHog Node SDK
const mockCapture = jest.fn();
const mockIdentify = jest.fn();
const mockShutdown = jest.fn().mockResolvedValue(undefined);

jest.mock('posthog-node', () => ({
  PostHog: jest.fn().mockImplementation(() => ({
    capture: mockCapture,
    identify: mockIdentify,
    shutdown: mockShutdown,
  })),
}));

describe('Backend PostHog instrumentation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should be a no-op when POSTHOG_API_KEY is not set', () => {
    delete process.env.POSTHOG_API_KEY;
    initPostHog();

    // trackServerEvent should silently no-op
    trackServerEvent('user-1', 'test_event', { key: 'value' });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('should initialize and track events when API key is set', () => {
    process.env.POSTHOG_API_KEY = 'phc_test_key';
    initPostHog();

    trackServerEvent('user-1', 'rule_created', { ruleId: 'rule-abc' });
    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: 'user-1',
      event: 'rule_created',
      properties: { ruleId: 'rule-abc' },
    });
  });

  it('should identify users', () => {
    process.env.POSTHOG_API_KEY = 'phc_test_key';
    initPostHog();

    identifyServerUser('user-1', { email: 'test@example.com', role: 'admin' });
    expect(mockIdentify).toHaveBeenCalledWith({
      distinctId: 'user-1',
      properties: { email: 'test@example.com', role: 'admin' },
    });
  });

  it('should flush on shutdown', async () => {
    process.env.POSTHOG_API_KEY = 'phc_test_key';
    initPostHog();

    await flushPostHog();
    expect(mockShutdown).toHaveBeenCalled();
  });
});

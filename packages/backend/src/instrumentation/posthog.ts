/**
 * PostHog Product Analytics — Backend (NestJS)
 *
 * Provides server-side event tracking for the backend.
 * Uses posthog-node for server-side event capture.
 *
 * If POSTHOG_API_KEY is not set, all calls are no-ops.
 */

import { PostHog } from 'posthog-node';

/** PostHog client instance (null if not configured) */
let client: PostHog | null = null;

/**
 * Initialize PostHog for the NestJS backend.
 *
 * Must be called in main.ts before NestFactory.create().
 * If POSTHOG_API_KEY is not set, PostHog is a no-op.
 */
export function initPostHog(): void {
  const apiKey = process.env.POSTHOG_API_KEY;
  const host = process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com';

  if (!apiKey) {
    console.info('[posthog] No POSTHOG_API_KEY set — PostHog disabled');
    return;
  }

  client = new PostHog(apiKey, {
    host,
    // Flush events every 30 seconds or when 20 events are queued
    flushAt: 20,
    flushInterval: 30000,
  });

  console.info('[posthog] Initialized for backend');
}

/**
 * Track a server-side event in PostHog.
 *
 * @param distinctId - User or system identifier
 * @param eventName - Event name (e.g., 'rule_created', 'extension_paired')
 * @param properties - Event properties
 */
export function trackServerEvent(
  distinctId: string,
  eventName: string,
  properties?: Record<string, unknown>,
): void {
  if (!client) return;

  client.capture({
    distinctId,
    event: eventName,
    properties,
  });
}

/**
 * Identify a user in PostHog with server-side properties.
 *
 * @param distinctId - User identifier
 * @param properties - User properties
 */
export function identifyServerUser(
  distinctId: string,
  properties?: Record<string, string | boolean | number>,
): void {
  if (!client) return;

  client.identify({
    distinctId,
    properties,
  });
}

/**
 * Flush pending PostHog events.
 * Call during graceful shutdown.
 */
export async function flushPostHog(): Promise<void> {
  if (!client) return;
  await client.shutdown();
}

/**
 * Get the PostHog client instance (for advanced use).
 */
export function getPostHogClient(): PostHog | null {
  return client;
}

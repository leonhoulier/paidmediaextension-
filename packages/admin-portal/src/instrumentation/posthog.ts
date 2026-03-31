/**
 * PostHog Product Analytics — Admin Portal
 *
 * Provides event tracking and user identification for the admin portal.
 * Sampling rate: 100% for admin portal (low volume, high value).
 *
 * If VITE_POSTHOG_API_KEY is not set, all calls are no-ops.
 */

import posthog from 'posthog-js';

/** Whether PostHog has been successfully initialized */
let initialized = false;

/**
 * Initialize PostHog analytics for the admin portal.
 *
 * Must be called in main.tsx before React renders.
 * If VITE_POSTHOG_API_KEY is not set, PostHog is a no-op.
 */
export function initPostHog(): void {
  const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;
  const host = import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com';

  if (!apiKey) {
    console.info('[posthog] No VITE_POSTHOG_API_KEY set — PostHog disabled');
    return;
  }

  posthog.init(apiKey, {
    api_host: host,
    // 100% capture for admin portal
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage',
    // Respect Do Not Track
    respect_dnt: true,
    // Disable session recording by default (use Sentry Replay instead)
    disable_session_recording: true,
  });

  initialized = true;
  console.info('[posthog] Initialized for admin portal');
}

/**
 * Identify the current user in PostHog after authentication.
 *
 * Call this in AuthContext after successful login.
 *
 * @param userId - Unique user identifier (Firebase UID)
 * @param traits - User properties (email, name, etc.)
 */
export function identifyUser(
  userId: string,
  traits?: Record<string, string | boolean | number>
): void {
  if (!initialized) return;

  posthog.identify(userId, traits);
}

/**
 * Track a custom event in PostHog.
 *
 * @param eventName - Event name (e.g., 'rule_created', 'rule_set_activated')
 * @param properties - Event properties
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>
): void {
  if (!initialized) return;

  posthog.capture(eventName, properties);
}

/**
 * Reset PostHog identity on logout.
 */
export function resetPostHog(): void {
  if (!initialized) return;

  posthog.reset();
}

export { posthog };

/**
 * Sentry Error Monitoring — Admin Portal
 *
 * Initializes Sentry for the React admin portal with:
 * - Source map upload support (via @sentry/vite-plugin in build)
 * - Session replay for error reproduction
 * - compliance_violation event filtering
 * - Environment and release tagging
 */

import * as Sentry from '@sentry/react';

/**
 * Events matching these patterns are filtered out (not sent to Sentry).
 * compliance_violation events are business-logic events, not application errors.
 */
const FILTERED_EVENT_TYPES = ['compliance_violation'];

/**
 * Initialize Sentry for the admin portal.
 *
 * Must be called before React renders (in main.tsx).
 * If VITE_SENTRY_DSN is not set, Sentry is a no-op.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.info('[sentry] No VITE_SENTRY_DSN set — Sentry disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE ?? 'development',
    release: import.meta.env.VITE_APP_VERSION ?? 'unknown',

    // 100% of errors in admin portal (low volume, high value)
    sampleRate: 1.0,

    // 10% session replay for error reproduction
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],

    // Performance monitoring: 20% of transactions
    tracesSampleRate: 0.2,

    beforeSend(event) {
      // Filter out compliance_violation events (business logic, not errors)
      if (
        event.message &&
        FILTERED_EVENT_TYPES.some((type) => event.message?.includes(type))
      ) {
        return null;
      }

      // Filter out compliance_violation from exception values
      if (event.exception?.values) {
        const isFiltered = event.exception.values.some((ex) =>
          FILTERED_EVENT_TYPES.some((type) => ex.value?.includes(type))
        );
        if (isFiltered) return null;
      }

      return event;
    },
  });

  console.info('[sentry] Initialized for admin portal');
}

/**
 * Capture an exception in Sentry with optional extra context.
 *
 * Use this in error boundaries and catch blocks.
 */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>
): void {
  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Set the Sentry user context after authentication.
 */
export function setSentryUser(user: {
  id: string;
  email?: string;
  username?: string;
}): void {
  Sentry.setUser(user);
}

/**
 * Clear the Sentry user context on logout.
 */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}

export { Sentry };

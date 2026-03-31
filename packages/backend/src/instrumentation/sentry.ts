/**
 * Sentry Error Monitoring — Backend (NestJS)
 *
 * Initializes Sentry for the NestJS backend with:
 * - Node.js performance tracing
 * - compliance_violation event filtering
 * - Environment and release tagging
 * - Express request data capture
 */

import * as Sentry from '@sentry/nestjs';

/**
 * Events matching these patterns are filtered out (not sent to Sentry).
 * compliance_violation events are business-logic events, not application errors.
 */
const FILTERED_EVENT_TYPES = ['compliance_violation'];

/**
 * Initialize Sentry for the NestJS backend.
 *
 * Must be called before NestFactory.create() in main.ts.
 * If SENTRY_DSN is not set, Sentry is a no-op.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.info('[sentry] No SENTRY_DSN set — Sentry disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.APP_VERSION ?? 'unknown',

    // 100% error capture for backend
    sampleRate: 1.0,

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

  console.info('[sentry] Initialized for backend');
}

/**
 * Capture an exception in Sentry with optional extra context.
 */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  Sentry.captureException(error, {
    extra: context,
  });
}

export { Sentry };

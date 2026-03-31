/**
 * Sentry Error Monitoring — Chrome Extension
 *
 * Provides separate initialization for:
 * - Service worker (background script)
 * - Content scripts (injected into ad platform pages)
 *
 * Uses @sentry/browser since the extension runs in browser contexts.
 * compliance_violation events are filtered out.
 */

import * as Sentry from '@sentry/browser';

/**
 * Events matching these patterns are filtered out (not sent to Sentry).
 * compliance_violation events are business-logic events, not application errors.
 */
const FILTERED_EVENT_TYPES = ['compliance_violation'];

/**
 * Shared beforeSend filter for both service worker and content script contexts.
 */
function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
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
}

/**
 * Initialize Sentry for the service worker (background script).
 *
 * Called at the top of service-worker.ts before any other logic.
 * The DSN is injected at build time via esbuild define.
 */
export function initSentryServiceWorker(): void {
  const dsn = typeof process !== 'undefined'
    ? process.env.SENTRY_DSN
    : undefined;

  if (!dsn) {
    console.info('[sentry] No SENTRY_DSN set — Sentry disabled in service worker');
    return;
  }

  Sentry.init({
    dsn,
    environment: typeof process !== 'undefined'
      ? (process.env.NODE_ENV ?? 'development')
      : 'development',

    // 100% error capture in extension
    sampleRate: 1.0,

    // No tracing in service worker (no HTTP requests to trace)
    tracesSampleRate: 0,

    beforeSend,
  });

  // Tag all events from this context
  Sentry.setTag('context', 'service-worker');

  console.info('[sentry] Initialized for service worker');
}

/**
 * Initialize Sentry for content scripts (ISOLATED world).
 *
 * Called at the top of content-scripts/injector.ts.
 * The DSN is injected at build time via esbuild define.
 */
export function initSentryContentScript(): void {
  const dsn = typeof process !== 'undefined'
    ? process.env.SENTRY_DSN
    : undefined;

  if (!dsn) {
    console.info('[sentry] No SENTRY_DSN set — Sentry disabled in content script');
    return;
  }

  Sentry.init({
    dsn,
    environment: typeof process !== 'undefined'
      ? (process.env.NODE_ENV ?? 'development')
      : 'development',

    sampleRate: 1.0,
    tracesSampleRate: 0,

    beforeSend,
  });

  // Tag all events from this context
  Sentry.setTag('context', 'content-script');
  Sentry.setTag('page_url', window.location.href);

  console.info('[sentry] Initialized for content script');
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

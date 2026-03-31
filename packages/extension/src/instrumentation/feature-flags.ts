/**
 * Feature Flags — Chrome Extension (Split.io)
 *
 * Provides feature flag evaluation with a 30-second TTL cache.
 * Uses the Split.io browser SDK for client-side flag evaluation.
 *
 * Key flags:
 * - 'enable-require-extraction': Controls whether the Meta adapter uses
 *   require()-based field extraction (passed to Meta adapter).
 *
 * If SPLITIO_API_KEY is not set (injected at build time), all flags
 * default to 'control' (off).
 */

import { SplitFactory } from '@splitsoftware/splitio';

/** Split.io client instance */
let splitClient: SplitIO.IClient | null = null;

/** Whether the client is ready */
let isReady = false;

/** In-memory flag cache with TTL */
const flagCache = new Map<string, { value: string; expiresAt: number }>();

/** Cache TTL in milliseconds (30 seconds) */
const CACHE_TTL_MS = 30_000;

/**
 * Initialize Split.io feature flags for the extension.
 *
 * Called from the service worker after pairing completes.
 * The API key is injected at build time via esbuild define.
 */
export function initFeatureFlags(): void {
  const apiKey = typeof process !== 'undefined'
    ? process.env.SPLITIO_API_KEY
    : undefined;

  if (!apiKey) {
    console.info('[feature-flags] No SPLITIO_API_KEY set — feature flags disabled');
    return;
  }

  // Avoid re-initializing if already set up
  if (splitClient) {
    return;
  }

  const factory = SplitFactory({
    core: {
      authorizationKey: apiKey,
      key: 'extension',
    },
    startup: {
      readyTimeout: 5,
    },
    scheduler: {
      featuresRefreshRate: 30,
    },
  });

  splitClient = factory.client();

  splitClient.on(splitClient.Event.SDK_READY, () => {
    isReady = true;
    console.info('[feature-flags] Split.io SDK ready in extension');
  });

  splitClient.on(splitClient.Event.SDK_READY_TIMED_OUT, () => {
    console.warn('[feature-flags] Split.io SDK timed out — using defaults');
  });
}

/**
 * Get the value of a feature flag.
 *
 * Results are cached for 30 seconds.
 *
 * @param flagName - The feature flag name (e.g., 'enable-require-extraction')
 * @returns The flag treatment string
 */
export function getFlag(flagName: string): string {
  // Check cache first
  const cached = flagCache.get(flagName);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  if (!splitClient || !isReady) {
    return 'control';
  }

  const treatment = splitClient.getTreatment(flagName);

  // Cache the result
  flagCache.set(flagName, {
    value: treatment,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return treatment;
}

/**
 * Check if a feature flag is enabled (treatment === 'on').
 *
 * @param flagName - The feature flag name
 * @returns true if the flag treatment is 'on'
 */
export function isEnabled(flagName: string): boolean {
  return getFlag(flagName) === 'on';
}

/**
 * Destroy the Split.io client.
 */
export async function destroyFeatureFlags(): Promise<void> {
  if (splitClient) {
    await splitClient.destroy();
    splitClient = null;
    isReady = false;
    flagCache.clear();
  }
}

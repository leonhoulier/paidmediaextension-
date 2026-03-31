/**
 * Feature Flags — Backend (Split.io)
 *
 * Provides server-side feature flag evaluation with a 30-second TTL cache.
 * Uses the Split.io Node.js SDK for server-side flag evaluation.
 *
 * If SPLITIO_API_KEY is not set, all flags default to 'control' (off).
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
 * Initialize Split.io feature flags for the backend.
 *
 * Must be called in main.ts before NestFactory.create().
 * If SPLITIO_API_KEY is not set, feature flags are disabled.
 */
export function initFeatureFlags(): void {
  const apiKey = process.env.SPLITIO_API_KEY;

  if (!apiKey) {
    console.info('[feature-flags] No SPLITIO_API_KEY set — feature flags disabled');
    return;
  }

  const factory = SplitFactory({
    core: {
      authorizationKey: apiKey,
    },
    startup: {
      readyTimeout: 5,
    },
    // Sync flag definitions every 30 seconds
    scheduler: {
      featuresRefreshRate: 30,
    },
  });

  splitClient = factory.client();

  splitClient.on(splitClient.Event.SDK_READY, () => {
    isReady = true;
    console.info('[feature-flags] Split.io SDK ready');
  });

  splitClient.on(splitClient.Event.SDK_READY_TIMED_OUT, () => {
    console.warn('[feature-flags] Split.io SDK timed out — using defaults');
  });
}

/**
 * Get the value of a feature flag for a given key (user/org ID).
 *
 * Results are cached for 30 seconds.
 *
 * @param flagName - The feature flag name
 * @param key - The evaluation key (user ID, org ID, etc.)
 * @returns The flag treatment string
 */
export function getFlag(flagName: string, key: string = 'server'): string {
  const cacheKey = `${flagName}:${key}`;

  // Check cache first
  const cached = flagCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  if (!splitClient || !isReady) {
    return 'control';
  }

  const treatment = splitClient.getTreatment(key, flagName);

  // Cache the result
  flagCache.set(cacheKey, {
    value: treatment,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return treatment;
}

/**
 * Check if a feature flag is enabled (treatment === 'on').
 *
 * @param flagName - The feature flag name
 * @param key - The evaluation key
 * @returns true if the flag treatment is 'on'
 */
export function isFeatureEnabled(flagName: string, key: string = 'server'): boolean {
  return getFlag(flagName, key) === 'on';
}

/**
 * Destroy the Split.io client on shutdown.
 */
export async function destroyFeatureFlags(): Promise<void> {
  if (splitClient) {
    await splitClient.destroy();
    splitClient = null;
    isReady = false;
    flagCache.clear();
  }
}

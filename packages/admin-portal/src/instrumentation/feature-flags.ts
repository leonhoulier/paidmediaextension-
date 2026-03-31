/**
 * Feature Flags — Admin Portal (Split.io)
 *
 * Provides feature flag evaluation with a 30-second TTL cache.
 * Uses the Split.io browser SDK for client-side flag evaluation.
 *
 * If VITE_SPLITIO_API_KEY is not set, all flags default to 'control' (off).
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
 * Initialize Split.io feature flags for the admin portal.
 *
 * Must be called in main.tsx during app bootstrap.
 * If VITE_SPLITIO_API_KEY is not set, feature flags are disabled (all flags return 'control').
 */
export function initFeatureFlags(): void {
  const apiKey = import.meta.env.VITE_SPLITIO_API_KEY;

  if (!apiKey) {
    console.info('[feature-flags] No VITE_SPLITIO_API_KEY set — feature flags disabled');
    return;
  }

  const factory = SplitFactory({
    core: {
      authorizationKey: apiKey,
      key: 'admin-portal',
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
 * Get the value of a feature flag.
 *
 * Returns the flag treatment string (e.g., 'on', 'off', 'v2').
 * Returns 'control' if Split.io is not initialized or the flag doesn't exist.
 *
 * Results are cached for 30 seconds.
 *
 * @param flagName - The feature flag name (e.g., 'enable-new-dashboard')
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
 * Destroy the Split.io client on app unmount.
 */
export async function destroyFeatureFlags(): Promise<void> {
  if (splitClient) {
    await splitClient.destroy();
    splitClient = null;
    isReady = false;
    flagCache.clear();
  }
}

/**
 * Selector Telemetry Module
 *
 * Tracks selector success/failure rates across the extension's
 * platform adapters. Failed selector lookups are stored in
 * chrome.storage.local as a ring buffer (max 100 entries).
 *
 * This data is surfaced in the popup's "Selector Health" section
 * and helps identify which selectors need updating when ad platform
 * UIs change.
 *
 * @module selector-telemetry
 */

import { logger } from './logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single selector telemetry entry */
export interface SelectorTelemetryEntry {
  /** The CSS selector or selector chain that was attempted */
  selector: string;
  /** The platform (meta or google_ads) */
  platform: string;
  /** The field path this selector targets (e.g. 'campaign.name') */
  fieldPath: string;
  /** ISO timestamp of when the failure occurred */
  timestamp: string;
  /** Whether the selector found an element */
  found: boolean;
  /** The strategy that was used (e.g. 'aria-label', 'data-testid', 'debugid') */
  strategy?: string;
}

/** Aggregated selector health stats */
export interface SelectorHealthStats {
  /** Total number of selector lookups */
  totalLookups: number;
  /** Number of successful lookups */
  successCount: number;
  /** Number of failed lookups */
  failureCount: number;
  /** Success rate as a percentage (0-100) */
  successRate: number;
  /** Field paths that consistently fail */
  failingFields: Array<{ fieldPath: string; platform: string; failureCount: number }>;
  /** Most recent failures */
  recentFailures: SelectorTelemetryEntry[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of telemetry entries to store */
const MAX_ENTRIES = 100;

/** Storage key for telemetry data */
const STORAGE_KEY = 'selectorTelemetry';

/** Storage key for telemetry stats */
const STATS_KEY = 'selectorTelemetryStats';

// ─── In-memory buffer ────────────────────────────────────────────────────────

/**
 * In-memory buffer for batching writes to chrome.storage.local.
 * Flushed every 5 seconds or when the buffer reaches 10 entries.
 */
let pendingEntries: SelectorTelemetryEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_THRESHOLD = 10;

// ─── Counters (in-memory, flushed with entries) ──────────────────────────────

let sessionSuccessCount = 0;
let sessionFailureCount = 0;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Record a selector lookup result.
 *
 * Call this from `findElement()` (Meta) and `queryByChain()` (Google)
 * to track whether selectors successfully found their target elements.
 *
 * @param entry - Telemetry data for the lookup
 */
export function recordSelectorLookup(entry: SelectorTelemetryEntry): void {
  if (entry.found) {
    sessionSuccessCount++;
  } else {
    sessionFailureCount++;
    // Only persist failures (successes are tracked as counts only)
    pendingEntries.push(entry);
  }

  // Flush if threshold reached
  if (pendingEntries.length >= FLUSH_THRESHOLD) {
    flushTelemetry();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTelemetry();
    }, FLUSH_INTERVAL_MS);
  }
}

/**
 * Get the current selector health statistics.
 *
 * Reads from chrome.storage.local and combines with in-memory session data.
 *
 * @returns Aggregated selector health stats
 */
export async function getSelectorHealth(): Promise<SelectorHealthStats> {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY, STATS_KEY]);

    const entries = (result[STORAGE_KEY] as SelectorTelemetryEntry[] | undefined) ?? [];
    const persistedStats = (result[STATS_KEY] as { successCount: number; failureCount: number } | undefined) ?? {
      successCount: 0,
      failureCount: 0,
    };

    const totalSuccess = persistedStats.successCount + sessionSuccessCount;
    const totalFailure = persistedStats.failureCount + sessionFailureCount;
    const totalLookups = totalSuccess + totalFailure;
    const successRate = totalLookups > 0
      ? Math.round((totalSuccess / totalLookups) * 100)
      : 100;

    // Group failures by field path
    const failureMap = new Map<string, { fieldPath: string; platform: string; count: number }>();
    for (const entry of entries) {
      if (!entry.found) {
        const key = `${entry.platform}:${entry.fieldPath}`;
        const existing = failureMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          failureMap.set(key, {
            fieldPath: entry.fieldPath,
            platform: entry.platform,
            count: 1,
          });
        }
      }
    }

    // Sort by failure count descending
    const failingFields = Array.from(failureMap.values())
      .map((f) => ({ fieldPath: f.fieldPath, platform: f.platform, failureCount: f.count }))
      .sort((a, b) => b.failureCount - a.failureCount)
      .slice(0, 10);

    // Most recent failures (last 5)
    const recentFailures = entries
      .filter((e) => !e.found)
      .slice(-5)
      .reverse();

    return {
      totalLookups,
      successCount: totalSuccess,
      failureCount: totalFailure,
      successRate,
      failingFields,
      recentFailures,
    };
  } catch (err) {
    logger.error('Failed to get selector health:', err);
    return {
      totalLookups: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 100,
      failingFields: [],
      recentFailures: [],
    };
  }
}

/**
 * Clear all stored telemetry data.
 */
export async function clearTelemetry(): Promise<void> {
  try {
    await chrome.storage.local.remove([STORAGE_KEY, STATS_KEY]);
    pendingEntries = [];
    sessionSuccessCount = 0;
    sessionFailureCount = 0;
    logger.info('Selector telemetry cleared');
  } catch (err) {
    logger.error('Failed to clear telemetry:', err);
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

/**
 * Flush pending telemetry entries to chrome.storage.local.
 *
 * Uses a ring buffer pattern: if total entries exceed MAX_ENTRIES,
 * the oldest entries are dropped.
 */
async function flushTelemetry(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (pendingEntries.length === 0 && sessionSuccessCount === 0 && sessionFailureCount === 0) {
    return;
  }

  const entriesToFlush = [...pendingEntries];
  const successToFlush = sessionSuccessCount;
  const failureToFlush = sessionFailureCount;

  // Reset in-memory state
  pendingEntries = [];
  sessionSuccessCount = 0;
  sessionFailureCount = 0;

  try {
    const result = await chrome.storage.local.get([STORAGE_KEY, STATS_KEY]);

    // Merge entries (ring buffer)
    const existing = (result[STORAGE_KEY] as SelectorTelemetryEntry[] | undefined) ?? [];
    const merged = [...existing, ...entriesToFlush];

    // Trim to MAX_ENTRIES (keep most recent)
    const trimmed = merged.length > MAX_ENTRIES
      ? merged.slice(merged.length - MAX_ENTRIES)
      : merged;

    // Merge stats
    const persistedStats = (result[STATS_KEY] as { successCount: number; failureCount: number } | undefined) ?? {
      successCount: 0,
      failureCount: 0,
    };

    const updatedStats = {
      successCount: persistedStats.successCount + successToFlush,
      failureCount: persistedStats.failureCount + failureToFlush,
    };

    await chrome.storage.local.set({
      [STORAGE_KEY]: trimmed,
      [STATS_KEY]: updatedStats,
    });

    logger.debug(
      `Flushed ${entriesToFlush.length} telemetry entries ` +
      `(${successToFlush} successes, ${failureToFlush} failures)`
    );
  } catch (err) {
    // Put entries back so they aren't lost
    pendingEntries = [...entriesToFlush, ...pendingEntries];
    sessionSuccessCount += successToFlush;
    sessionFailureCount += failureToFlush;
    logger.error('Failed to flush telemetry:', err);
  }
}

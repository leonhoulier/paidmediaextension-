/**
 * Service Worker (Background Script)
 *
 * This is the Manifest V3 background service worker. It manages:
 * - URL pattern detection to identify ad platform pages
 * - Dynamic content script injection (no static content_scripts in manifest)
 * - Dynamic eval bridge injection into MAIN world
 * - Rule cache polling via alarms (every 60 seconds)
 * - Message handling for popup and content script communication
 */

import { Platform } from '@media-buying-governance/shared';
import { logger } from './utils/logger.js';
import { syncRules, forceRefresh } from './storage/sync.js';
import { invalidateAllCaches } from './storage/rule-cache.js';
import { initSentryServiceWorker } from './instrumentation/sentry.js';
import { flushEvents as flushPostHogEvents } from './instrumentation/posthog.js';
import { initFeatureFlags } from './instrumentation/feature-flags.js';
import { startSSESync } from './sync/sse-sync.js';

// Initialize production instrumentation
initSentryServiceWorker();

// ─── SSE Initialization ───────────────────────────────────────────────────────

/**
 * Initialize SSE connection if extension is already paired.
 * Called on service worker startup.
 */
async function initializeSSEIfPaired(): Promise<void> {
  try {
    const result = await chrome.storage.local.get('extensionToken');
    if (result.extensionToken) {
      logger.info('Extension is paired, starting SSE sync...');
      startSSESync(async (message) => {
        logger.info('SSE rules_updated event received:', message);
        // Invalidate cache and notify content scripts
        await invalidateAllCaches();
        if (message.accountIdsAffected && message.accountIdsAffected.length > 0) {
          await notifyContentScripts({ type: 'rulesUpdated', accountIds: message.accountIdsAffected });
        }
      });
    } else {
      logger.debug('Extension not paired yet, SSE will start after pairing');
    }
  } catch (err) {
    logger.error('Failed to initialize SSE:', err);
  }
}

// Start SSE connection on service worker load
initializeSSEIfPaired();

// ─── Constants ────────────────────────────────────────────────────────────────

/** Alarm name for periodic rule version polling */
const RULES_POLL_ALARM = 'rules-version-poll';

/** Polling interval in minutes */
const POLL_INTERVAL_MINUTES = 1;

/** URL patterns for platform detection */
const PLATFORM_PATTERNS: Array<{ pattern: RegExp; platform: Platform }> = [
  {
    pattern: /^https:\/\/adsmanager\.facebook\.com\/.*/,
    platform: Platform.META,
  },
  {
    pattern: /^https:\/\/business\.facebook\.com\/adsmanager\/.*/,
    platform: Platform.META,
  },
  {
    pattern: /^https:\/\/ads\.google\.com\/.*/,
    platform: Platform.GOOGLE_ADS,
  },
  // ── Test Mode: localhost fixture patterns ──────────────────────────────
  // These allow the extension to recognise locally-served HTML fixture files
  // so that injection, selectors, and UI components can be tested end-to-end
  // without navigating to the real ad platforms.
  {
    pattern: /^http:\/\/localhost(:\d+)?\/.*meta-.*/,
    platform: Platform.META,
  },
  {
    pattern: /^http:\/\/localhost(:\d+)?\/.*google-.*/,
    platform: Platform.GOOGLE_ADS,
  },
];

// ─── Platform Detection ───────────────────────────────────────────────────────

/**
 * Detect which platform a URL belongs to
 *
 * @param url - The tab URL to check
 * @returns The detected platform or null
 */
function detectPlatform(url: string): Platform | null {
  for (const { pattern, platform } of PLATFORM_PATTERNS) {
    if (pattern.test(url)) {
      return platform;
    }
  }
  return null;
}

// ─── Content Script Injection ─────────────────────────────────────────────────

/**
 * Track which tabs have already been injected to avoid duplicates.
 * Uses chrome.storage.session for persistence across service worker restarts.
 */
async function isTabInjected(tabId: number): Promise<boolean> {
  try {
    const result = await chrome.storage.session.get(`injected_${tabId}`);
    return !!result[`injected_${tabId}`];
  } catch {
    return false;
  }
}

/**
 * Mark a tab as injected
 */
async function markTabInjected(tabId: number, platform: Platform): Promise<void> {
  try {
    await chrome.storage.session.set({
      [`injected_${tabId}`]: { platform, timestamp: Date.now() },
    });
  } catch (err) {
    logger.error('Failed to mark tab as injected:', err);
  }
}

/**
 * Clear injection tracking for a tab
 */
async function clearTabInjection(tabId: number): Promise<void> {
  try {
    await chrome.storage.session.remove(`injected_${tabId}`);
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Inject content scripts and CSS into a tab
 *
 * This follows a dynamic injection pattern from the service worker rather
 * than using static content_scripts in manifest.json. Uses injectImmediately
 * to ensure the eval bridge lands before the page's React tree renders.
 *
 * Injection order:
 *   1. Eval bridge (MAIN world, injectImmediately) - includes FacebookClearExtensionDetection()
 *   2. Platform theme CSS
 *   3. history.pushState interceptor (MAIN world) for SPA navigation
 *   4. Main content script (ISOLATED world)
 *
 * @param tabId - The tab to inject into
 * @param platform - The detected platform
 */
async function injectContentScripts(
  tabId: number,
  platform: Platform
): Promise<void> {
  // Check if already injected
  if (await isTabInjected(tabId)) {
    logger.debug(`Tab ${tabId} already injected, skipping`);
    return;
  }

  logger.info(`Injecting content scripts into tab ${tabId} (platform: ${platform})`);

  try {
    // 1. Inject eval bridge into MAIN world FIRST with injectImmediately
    //    This ensures FacebookClearExtensionDetection() runs before
    //    Facebook's own scripts can detect our extension.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-scripts/eval-bridge.js'],
      world: 'MAIN',
      injectImmediately: true,
    } as chrome.scripting.ScriptInjection);

    // 2. Inject platform theme CSS
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['styles/platform-theme.css'],
    });

    // 3. Inject history.pushState interceptor into MAIN world
    //    Meta Ads Manager is an SPA; pushState navigation doesn't trigger
    //    webNavigation.onCompleted, so we intercept it to re-check context.
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        if ((window as unknown as Record<string, unknown>).__dlgPushStateIntercepted) return;
        (window as unknown as Record<string, unknown>).__dlgPushStateIntercepted = true;

        const originalPushState = history.pushState.bind(history);
        history.pushState = function (...args: Parameters<typeof history.pushState>) {
          originalPushState(...args);
          window.dispatchEvent(new CustomEvent('governance:pushstate', { detail: { url: args[2] } }));
        };
      },
    } as chrome.scripting.ScriptInjection);

    // 4. Inject main content script into ISOLATED world
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-scripts/injector.js'],
      world: 'ISOLATED',
    });

    // Mark tab as injected
    await markTabInjected(tabId, platform);

    logger.info(`Content scripts injected successfully into tab ${tabId}`);
  } catch (err) {
    logger.error(`Failed to inject content scripts into tab ${tabId}:`, err);
  }
}

// ─── Navigation Monitoring ────────────────────────────────────────────────────

/**
 * Listen for completed navigations via webNavigation API.
 *
 * webNavigation.onCompleted fires once the page (including sub-frames) has
 * fully loaded. This is more reliable than tabs.onUpdated for detecting
 * page transitions, especially on SPAs that use client-side routing.
 *
 * We only care about top-level (frameId === 0) navigations.
 */
chrome.webNavigation.onCompleted.addListener(
  async (details: chrome.webNavigation.WebNavigationFramedCallbackDetails) => {
    // Only act on top-level navigations
    if (details.frameId !== 0) return;

    const { tabId, url } = details;
    logger.info(`[webNavigation.onCompleted] URL: ${url}`);
    const platform = detectPlatform(url);
    logger.info(`[Platform Detection] Detected: ${platform || 'none'}`);

    if (!platform) {
      // Not an ad platform page; clean up any previous injection tracking
      await clearTabInjection(tabId);
      return;
    }

    logger.debug(`Detected ${platform} page on tab ${tabId}: ${url}`);
    await injectContentScripts(tabId, platform);
  }
);

/**
 * Fallback: tabs.onUpdated for environments where webNavigation is unavailable.
 *
 * This listener also handles SPA-style in-page navigations that don't trigger
 * webNavigation.onCompleted (e.g. hash-only changes).
 */
chrome.tabs.onUpdated.addListener(
  async (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
    // Only act on completed page loads with a URL
    if (changeInfo.status !== 'complete' || !tab.url) {
      return;
    }

    const platform = detectPlatform(tab.url);
    if (!platform) {
      return;
    }

    // Only inject if not already injected (webNavigation may have already handled it)
    if (await isTabInjected(tabId)) {
      return;
    }

    logger.debug(`[tabs.onUpdated fallback] Detected ${platform} page on tab ${tabId}: ${tab.url}`);
    await injectContentScripts(tabId, platform);
  }
);

/**
 * Clean up injection tracking when tabs are closed
 */
chrome.tabs.onRemoved.addListener((tabId: number) => {
  clearTabInjection(tabId);
});

// ─── Extension Lifecycle ──────────────────────────────────────────────────────

/**
 * Handle extension installation or update
 *
 * On install: set up alarms, fetch initial rules
 * On update: re-fetch rules in case schema changed
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  logger.info(`Extension ${details.reason}: version ${chrome.runtime.getManifest().version}`);

  // Set up periodic alarm for rule version polling
  await chrome.alarms.create(RULES_POLL_ALARM, {
    periodInMinutes: POLL_INTERVAL_MINUTES,
  });

  logger.info(`Alarm set: polling rules every ${POLL_INTERVAL_MINUTES} minute(s)`);

  if (details.reason === 'install') {
    // On first install, the user needs to pair first.
    // Rules will be fetched after pairing completes.
    logger.info('Extension installed. Awaiting pairing flow.');
  } else if (details.reason === 'update') {
    // On update, invalidate caches and re-fetch
    logger.info('Extension updated. Invalidating rule caches.');
    await invalidateAllCaches();
  }
});

// ─── Alarm Handler ────────────────────────────────────────────────────────────

/**
 * Handle periodic alarms for rule version polling
 *
 * Every 60 seconds, check if the rules version has changed.
 * If changed, re-fetch and notify active content scripts.
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== RULES_POLL_ALARM) return;

  logger.debug('Rule version poll alarm fired');

  // Flush any pending PostHog events on each alarm tick
  flushPostHogEvents();

  try {
    // Get the current active account from storage
    const result = await chrome.storage.local.get('activeAccountId');
    const accountId = result.activeAccountId as string | undefined;

    if (!accountId) {
      logger.debug('No active account ID, skipping rule sync');
      return;
    }

    // Sync rules (checks version, fetches if changed)
    const updated = await syncRules(accountId);

    if (updated) {
      // Notify all active content scripts about the update
      await notifyContentScripts({ type: 'rulesUpdated', accountId });
    }
  } catch (err) {
    logger.error('Rule sync alarm failed:', err);
  }
});

// ─── Message Handling ─────────────────────────────────────────────────────────

/**
 * Message types exchanged between service worker, content scripts, and popup
 */
interface ServiceWorkerMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener(
  (
    message: ServiceWorkerMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((err) => {
        logger.error('Message handler error:', err);
        sendResponse({ error: String(err) });
      });

    // Return true to indicate async response
    return true;
  }
);

/**
 * Process incoming messages
 */
async function handleMessage(
  message: ServiceWorkerMessage,
  _sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (message.type) {
    case 'getRules': {
      const accountId = message.accountId as string;
      if (!accountId) return { error: 'Missing accountId' };
      const data = await syncRules(accountId);
      return data ?? { error: 'Failed to fetch rules' };
    }

    case 'forceRefresh': {
      const accountId = message.accountId as string;
      if (!accountId) return { error: 'Missing accountId' };
      const data = await forceRefresh(accountId);
      return data ?? { error: 'Failed to refresh rules' };
    }

    case 'getSyncStatus': {
      const storage = await chrome.storage.local.get([
        'orgName',
        'orgId',
        'activeAccountId',
      ]);
      return {
        orgName: storage.orgName ?? null,
        orgId: storage.orgId ?? null,
        activeAccountId: storage.activeAccountId ?? null,
        version: chrome.runtime.getManifest().version,
      };
    }

    case 'setActiveAccount': {
      const accountId = message.accountId as string;
      await chrome.storage.local.set({ activeAccountId: accountId });
      return { success: true };
    }

    case 'detectPlatform': {
      const url = message.url as string;
      return { platform: detectPlatform(url) };
    }

    case 'pairExtension': {
      const inviteCode = message.inviteCode as string;
      if (!inviteCode) return { error: 'Missing inviteCode' };
      return handlePairExtension(inviteCode);
    }

    case 'unpairExtension': {
      return handleUnpairExtension();
    }

    case 'getSelectorHealth': {
      return getSelectorHealthFromStorage();
    }

    case 'clearSelectorTelemetry': {
      await chrome.storage.local.remove(['selectorTelemetry', 'selectorTelemetryStats']);
      return { success: true };
    }

    case 'reportCompliance': {
      const events = message.events as Array<{
        ruleId: string;
        accountId: string;
        passed: boolean;
        entityId?: string;
        entityLevel?: string;
        fieldPath?: string;
        fieldValue?: unknown;
      }>;

      if (!events || events.length === 0) {
        return { success: true }; // Nothing to report
      }

      try {
        const storage = await chrome.storage.local.get(['extensionToken', 'apiBaseUrl']);
        const apiBaseUrl = storage.apiBaseUrl || 'http://localhost:3000';
        const extensionToken = storage.extensionToken;

        const response = await fetch(`${apiBaseUrl}/api/v1/compliance/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(extensionToken ? { Authorization: `Bearer ${extensionToken}` } : {}),
          },
          body: JSON.stringify({ events }),
        });

        if (!response.ok) {
          throw new Error(`Failed to report compliance events: ${response.status}`);
        }

        logger.debug(`Reported ${events.length} compliance events to backend`);
        return { success: true };
      } catch (error) {
        logger.error('Failed to report compliance events:', error);
        return { error: String(error) };
      }
    }

    default:
      logger.warn('Unknown message type:', message.type);
      return { error: `Unknown message type: ${message.type}` };
  }
}

// ─── Selector Telemetry ──────────────────────────────────────────────────────

/**
 * Read selector health telemetry data from chrome.storage.local.
 *
 * Called by the popup to display the "Selector Health" section.
 */
async function getSelectorHealthFromStorage(): Promise<{
  totalLookups: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  failingFields: Array<{ fieldPath: string; platform: string; failureCount: number }>;
  recentFailures: Array<{ selector: string; platform: string; fieldPath: string; timestamp: string }>;
}> {
  try {
    const result = await chrome.storage.local.get([
      'selectorTelemetry',
      'selectorTelemetryStats',
    ]);

    type TelemetryEntry = {
      selector: string;
      platform: string;
      fieldPath: string;
      timestamp: string;
      found: boolean;
    };

    const entries = (result.selectorTelemetry as TelemetryEntry[] | undefined) ?? [];
    const stats = (result.selectorTelemetryStats as { successCount: number; failureCount: number } | undefined) ?? {
      successCount: 0,
      failureCount: 0,
    };

    const totalLookups = stats.successCount + stats.failureCount;
    const successRate = totalLookups > 0
      ? Math.round((stats.successCount / totalLookups) * 100)
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

    const failingFields = Array.from(failureMap.values())
      .map((f) => ({ fieldPath: f.fieldPath, platform: f.platform, failureCount: f.count }))
      .sort((a, b) => b.failureCount - a.failureCount)
      .slice(0, 10);

    const recentFailures = entries
      .filter((e) => !e.found)
      .slice(-5)
      .reverse()
      .map((e) => ({
        selector: e.selector,
        platform: e.platform,
        fieldPath: e.fieldPath,
        timestamp: e.timestamp,
      }));

    return {
      totalLookups,
      successCount: stats.successCount,
      failureCount: stats.failureCount,
      successRate,
      failingFields,
      recentFailures,
    };
  } catch (err) {
    logger.error('Failed to read selector telemetry:', err);
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

// ─── Pairing Flow ──────────────────────────────────────────────────────────

/**
 * Handle extension pairing via invite code.
 *
 * The invite code is the raw extension token stored in the database.
 * We POST it to the backend pairing endpoint, which validates it and
 * returns organization info.
 *
 * For local dev, we construct a mock Bearer token to pass the
 * FirebaseAuthGuard (ALLOW_LOCAL_AUTH=true).
 *
 * @param inviteCode - The invite code / extension token
 * @returns Pairing result with org info, or error
 */
async function handlePairExtension(
  inviteCode: string
): Promise<{ success: boolean; organization?: { id: string; name: string; slug: string }; error?: string }> {
  try {
    const apiBase = await getApiBaseForPairing();

    // Construct a mock Bearer token for local dev.
    // The FirebaseAuthGuard in local mode (ALLOW_LOCAL_AUTH=true) accepts
    // base64({ uid, email }) where the email must exist in the database.
    // We use the default seed admin user.
    const mockToken = btoa(
      JSON.stringify({ uid: 'extension-pairing', email: 'admin1@dlg.com' })
    );

    const response = await fetch(`${apiBase}/api/v1/extension/pair`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mockToken}`,
      },
      body: JSON.stringify({ invite_code: inviteCode }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`Pairing failed: ${response.status} ${errorBody}`);
      return { success: false, error: `Pairing failed: ${response.status} ${response.statusText}` };
    }

    const data = (await response.json()) as {
      extension_token: string;
      organization: { id: string; name: string; slug: string };
    };

    // Store the extension token and org info
    await chrome.storage.local.set({
      extensionToken: data.extension_token,
      orgName: data.organization.name,
      orgId: data.organization.id,
      orgSlug: data.organization.slug,
      pairedAt: new Date().toISOString(),
    });

    // Initialize feature flags after successful pairing
    initFeatureFlags();

    // Start SSE sync for real-time rule updates
    startSSESync(async (message) => {
      logger.info('SSE rules_updated event received:', message);
      // Invalidate cache and notify content scripts
      await invalidateAllCaches();
      if (message.accountIdsAffected && message.accountIdsAffected.length > 0) {
        await notifyContentScripts({ type: 'rulesUpdated', accountIds: message.accountIdsAffected });
      }
    });

    logger.info(`Extension paired with org: ${data.organization.name}`);

    return {
      success: true,
      organization: data.organization,
    };
  } catch (err) {
    logger.error('Pairing request failed:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Handle extension unpairing (reset).
 *
 * Clears all stored credentials and org info.
 */
async function handleUnpairExtension(): Promise<{ success: boolean }> {
  try {
    await chrome.storage.local.remove([
      'extensionToken',
      'orgName',
      'orgId',
      'orgSlug',
      'pairedAt',
      'activeAccountId',
    ]);
    await invalidateAllCaches();
    logger.info('Extension unpaired');
    return { success: true };
  } catch (err) {
    logger.error('Unpairing failed:', err);
    return { success: false };
  }
}

/**
 * Get API base URL for the pairing request
 */
async function getApiBaseForPairing(): Promise<string> {
  try {
    const result = await chrome.storage.local.get('apiBaseUrl');
    return (result.apiBaseUrl as string) || 'http://localhost:3000';
  } catch {
    return 'http://localhost:3000';
  }
}

/**
 * Send a message to all content scripts in matching tabs
 */
async function notifyContentScripts(message: ServiceWorkerMessage): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      const platform = detectPlatform(tab.url);
      if (platform) {
        try {
          await chrome.tabs.sendMessage(tab.id, message);
        } catch {
          // Tab may not have content script loaded yet
        }
      }
    }
  } catch (err) {
    logger.error('Failed to notify content scripts:', err);
  }
}

// ─── Export for testing ───────────────────────────────────────────────────────

export { detectPlatform, PLATFORM_PATTERNS };

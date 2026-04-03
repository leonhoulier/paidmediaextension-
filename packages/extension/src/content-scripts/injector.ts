/**
 * Content Script Injector
 *
 * This is the main content script injected into ad platform pages
 * by the service worker. It runs in the ISOLATED world.
 *
 * Responsibilities:
 * - is-loaded guard to prevent duplicate injection
 * - Initialize the correct platform adapter
 * - Set up MutationObserver for field changes
 * - Run rule evaluation on field changes
 * - Render UI components (banners, sidebar, score, etc.)
 * - Handle cleanup on navigation
 */

import { Platform, type Rule, type NamingTemplate, type RuleEvaluationResult } from '@media-buying-governance/shared';
import { logger } from '../utils/logger.js';
import { debounce } from '../utils/debounce.js';
import { initSentryContentScript } from '../instrumentation/sentry.js';
import { trackExtensionEvent } from '../instrumentation/posthog.js';

// Initialize Sentry for content script context
initSentryContentScript();
import { evaluateRules, computeScore } from '../rules/evaluator.js';
import { createPlatformAdapter } from '../adapters/platform-adapter.js';
import type { PlatformAdapter } from '@media-buying-governance/shared';
import { RemoteEvalBatcher } from './remote-eval-batcher.js';
import { renderValidationBanner, removeValidationBanners } from '../components/validation-banner.js';
import { GuidelinesSidebar } from '../components/guidelines-sidebar.js';
import { renderCampaignScore, removeCampaignScore } from '../components/campaign-score.js';
import { CreationBlocker } from '../components/creation-blocker.js';
import { renderNamingPreview, removeNamingPreview } from '../components/naming-preview.js';
import { peekFieldElement } from '../adapters/meta/meta-selectors.js';
import { GOOGLE_FIELD_SELECTORS, queryByChain, queryWithShadowDom } from '../adapters/google/google-selectors.js';
import { buildExtractionSnapshot } from './extraction-snapshot.js';

// ─── is-loaded Guard ──────────────────────────────────────────────────────────

const LOADED_ATTRIBUTE = 'governance-loaded';

if (document.body.hasAttribute(LOADED_ATTRIBUTE)) {
  logger.info('Already loaded, skipping injection');
  // Early exit - script stops here if already loaded
} else {
  document.body.setAttribute(LOADED_ATTRIBUTE, 'true');
  logger.info('Governance extension initializing...');
  initializeGovernance();
}

// ─── State ────────────────────────────────────────────────────────────────────

/** Current platform adapter instance */
let currentAdapter: PlatformAdapter | null = null;

/** Remote eval batcher for cross-world communication */
let evalBatcher: RemoteEvalBatcher | null = null;

/** Guidelines sidebar instance */
let sidebar: GuidelinesSidebar | null = null;

/** Creation blocker instance */
let creationBlocker: CreationBlocker | null = null;

/** Current rule evaluation results */
let currentResults: RuleEvaluationResult[] = [];

/** Current rules loaded for this account */
let currentRules: Rule[] = [];

/** Best known field values — merged across multiple extractions to avoid regression */
let bestFieldValues: Record<string, unknown> | null = null;

/** Best number of passed rules — prevents body class regression */
let bestResultsPassedCount = 0;

/** Current naming templates */
let currentNamingTemplates: NamingTemplate[] = [];

/** Flag to prevent observer triggering during our own UI updates */
let isUpdatingUI = false;

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * Main initialization function
 *
 * 1. Detect platform from URL
 * 2. Load platform adapter
 * 3. Fetch rules from service worker
 * 4. Set up field observation
 * 5. Run initial evaluation
 */
async function initializeGovernance(): Promise<void> {
  try {
    // 1. Detect platform
    const platform = detectPlatformFromURL(window.location.href);
    if (!platform) {
      logger.warn('Could not detect platform from URL');
      return;
    }

    logger.info(`Platform detected: ${platform}`);

    // 2. Initialize eval batcher
    evalBatcher = new RemoteEvalBatcher();

    // 3. Create platform adapter
    currentAdapter = await createPlatformAdapter(platform);
    logger.info(`Platform adapter created: ${platform}`);

    // 4. Detect context (account ID, entity level, view)
    const context = currentAdapter.detectContext();
    if (!context) {
      logger.warn('Could not detect extension context (account/entity level)');
      return;
    }

    logger.info(
      `Context: account=${context.accountId}, entity=${context.entityLevel}, view=${context.view}`
    );

    // Register message handling early so debug tooling still works when
    // rules are unavailable or pairing is incomplete.
    chrome.runtime.onMessage.addListener(handleServiceWorkerMessage);

    // 5. Set active account and fetch rules from service worker
    await chrome.runtime.sendMessage({
      type: 'setActiveAccount',
      accountId: context.accountId,
    });

    let rulesResponse: { rules?: Rule[]; namingTemplates?: NamingTemplate[]; error?: string } | null = null;

    // Try SW first, fall back to direct HTTP if SW is dormant
    try {
      rulesResponse = await chrome.runtime.sendMessage({
        type: 'getRules',
        accountId: context.accountId,
      });
    } catch (err) {
      logger.warn('SW unreachable for getRules, trying direct HTTP fallback:', err);
    }

    // Direct HTTP fallback when SW is dormant
    if (!rulesResponse || ('error' in rulesResponse) || !rulesResponse.rules?.length) {
      try {
        const storage = await chrome.storage.local.get(['extensionToken', 'apiBaseUrl']);
        const token = storage.extensionToken as string;
        const baseUrl = (storage.apiBaseUrl as string) || 'http://localhost:3000';
        if (token) {
          logger.info('Fetching rules directly via HTTP...');
          const resp = await fetch(`${baseUrl}/api/v1/rules`, {
            headers: { 'X-Extension-Token': token },
          });
          if (resp.ok) {
            rulesResponse = await resp.json();
            logger.info(`Direct HTTP: got ${rulesResponse?.rules?.length ?? 0} rules`);
          }
        }
      } catch (httpErr) {
        logger.error('Direct HTTP fallback also failed:', httpErr);
      }
    }

    if (!rulesResponse || !rulesResponse.rules?.length) {
      logger.error('Failed to fetch rules from both SW and HTTP');
      return;
    }

    currentRules = rulesResponse.rules ?? [];
    currentNamingTemplates = rulesResponse.namingTemplates ?? [];

    logger.info(
      `Loaded ${currentRules.length} rules, ${currentNamingTemplates.length} naming templates`
    );

    // 6. Set up field change observation
    currentAdapter.observeFieldChanges(
      debounce((fieldPath: string, value: unknown) => {
        // If fieldPath is '__all__', the value contains pre-extracted field values
        // Use them directly to avoid re-extraction loop
        if (fieldPath === '__all__' && typeof value === 'object' && value !== null) {
          runEvaluation(value as Record<string, unknown>);
        } else {
          runEvaluation();
        }
      }, 200)
    );

    // 7. Set up creation interception
    setupCreationInterception();

    // 8. Initialize sidebar
    sidebar = new GuidelinesSidebar();

    // 9. Run initial extraction to populate cache
    console.log('[INIT] 🔄 Running initial field extraction...');
    await currentAdapter.extractFieldValues();
    console.log('[INIT] ✅ Initial extraction complete');

    // 10. Run initial evaluation (now with cached values)
    await runEvaluation();

    // 10. Listen for messages from service worker
    // Track successful initialization
    trackExtensionEvent('extension_initialized', {
      platform,
      accountId: context.accountId,
      ruleCount: currentRules.length,
      templateCount: currentNamingTemplates.length,
    });

    logger.info('Governance extension fully initialized');
  } catch (err) {
    logger.error('Failed to initialize governance extension:', err);
  }
}

// ─── Rule Evaluation Loop ─────────────────────────────────────────────────────

/**
 * Run rule evaluation against current field values
 *
 * This is the core validation loop called on every field change.
 * It extracts values, evaluates rules, and updates the UI.
 *
 * @param preExtractedValues - Optional pre-extracted field values to avoid re-extraction
 */
async function runEvaluation(preExtractedValues?: Record<string, unknown>): Promise<void> {
  console.log('[VALIDATION] 🔄 runEvaluation() called');

  if (!currentAdapter) {
    console.log('[VALIDATION] ⚠️ No adapter available, skipping');
    return;
  }

  if (currentRules.length === 0) {
    console.log('[VALIDATION] ⚠️ No rules loaded, cleaning up and skipping');
    // Clean up stale body classes when all rules are removed/disabled
    updateBodyClasses([]);
    return;
  }

  console.log(`[VALIDATION] 📋 Running evaluation with ${currentRules.length} rules`);

  try {
    let fieldValues: Record<string, unknown>;
    let extractionDuration = 0;

    // 1. Use pre-extracted values if provided, otherwise extract fresh
    if (preExtractedValues) {
      console.log('[VALIDATION] 🔍 Step 1: Using pre-extracted field values (from observer)');
      fieldValues = preExtractedValues;
      console.log('[VALIDATION] ✅ Using pre-extracted fields:', Object.keys(fieldValues));
    } else {
      console.log('[VALIDATION] 🔍 Step 1: Extracting fresh field values...');
      const startTime = Date.now();
      fieldValues = await currentAdapter.extractFieldValues();
      extractionDuration = Date.now() - startTime;
      console.log(`[VALIDATION] ⏱️ Extraction completed in ${extractionDuration}ms`);
      console.log('[VALIDATION] ✅ Extracted fields:', Object.keys(fieldValues));
    }

    // Log non-null field values for debugging
    const nonNullFields = Object.entries(fieldValues).filter(([, v]) => v !== null && v !== undefined);
    console.log(`[VALIDATION] 📊 Field values: ${nonNullFields.length} non-null of ${Object.keys(fieldValues).length} total`);
    nonNullFields.forEach(([k, v]) => console.log(`[VALIDATION]   ${k}: ${JSON.stringify(v)?.substring(0, 100)}`));

    // bestFieldValues is a cross-panel cache that persists field values
    // across Meta Ads Manager panel switches (Campaign / Ad Set / Ad).
    //
    // When the user switches panels, fields from the previous panel disappear
    // from the DOM and extraction returns null for them. Instead of clearing
    // those values, we KEEP the cached value so rules can still evaluate.
    //
    // Only a non-null extraction result overwrites the cache. Null means
    // "not in DOM right now", NOT "field is empty". Explicitly empty values
    // (empty string, 0, false) are non-null and DO update the cache.
    if (!bestFieldValues) {
      bestFieldValues = {};
    }

    // Merge: non-null extraction values update cache; null values fall back to cache
    let cachedFieldsUsed = 0;
    for (const [k, v] of Object.entries(fieldValues)) {
      if (v !== null && v !== undefined) {
        // Fresh non-null value from DOM — update cache
        bestFieldValues[k] = v;
      } else if (k in bestFieldValues && bestFieldValues[k] !== null && bestFieldValues[k] !== undefined) {
        // Field returned null but cache has a value — keep cached (cross-panel)
        cachedFieldsUsed++;
        console.log(`[CACHE] Using cached value for ${k} (not in current DOM panel)`);
      }
      // If both extraction and cache are null, field genuinely not extracted yet
    }

    // USE bestFieldValues as THE field values for evaluation — not the current extraction
    // Start with all extracted keys (preserves the key set), then overlay cached values
    fieldValues = { ...fieldValues };
    for (const [k, v] of Object.entries(bestFieldValues)) {
      if (v !== null && v !== undefined) {
        fieldValues[k] = v;
      }
    }

    if (cachedFieldsUsed > 0) {
      console.log(`[CACHE] Used ${cachedFieldsUsed} cached cross-panel field value(s)`);
    }

    const bestCount = Object.values(bestFieldValues).filter(v => v !== null && v !== undefined).length;
    console.log(`[VALIDATION] 🔀 Using bestFieldValues: ${bestCount} values (current extraction had ${nonNullFields.length})`);

    // Schedule retries if no values yet
    if (bestCount === 0) {
      console.log('[VALIDATION] ⏳ No values yet — scheduling retry...');
      setTimeout(() => runEvaluation(), 3000);
      setTimeout(() => runEvaluation(), 8000);
      setTimeout(() => runEvaluation(), 15000);
      return;
    }

    // 2. Evaluate rules
    console.log('[VALIDATION] ⚖️ Step 2: Evaluating rules...');
    currentResults = evaluateRules(fieldValues, currentRules, currentNamingTemplates);

    const passedRules = currentResults.filter(r => r.passed);
    const failedRules = currentResults.filter(r => !r.passed);
    console.log(`[VALIDATION] 📊 Results: ${passedRules.length} passed, ${failedRules.length} failed`);

    failedRules.forEach(result => {
      const rule = currentRules.find(r => r.id === result.ruleId);
      if (rule) {
        console.log(`[VALIDATION] ❌ Failed: ${rule.name}`, {
          enforcement: rule.enforcement,
          status: result.status,
          actualValue: result.fieldValue,
          expectedValue: result.expectedValue
        });
      } else {
        console.log(`[VALIDATION] ❌ Failed: Unknown rule ${result.ruleId}`);
      }
    });

    // 3. Compute score
    console.log('[VALIDATION] 🧮 Step 3: Computing score...');
    const score = computeScore(currentResults);
    console.log(`[VALIDATION] 📈 Score: ${score.overall}/100 (${score.passedCount}/${score.totalCount})`);

    // 4. Update UI components (pause observer to prevent infinite loop)
    console.log('[VALIDATION] 🎨 Step 4: Updating UI...');

    // Pause observer before UI updates to avoid detecting our own mutations
    if (currentAdapter && 'pauseObserver' in currentAdapter) {
      (currentAdapter as any).pauseObserver();
    }

    try {
      updateUI(currentResults, score);
      console.log('[VALIDATION] ✅ UI updated');
    } finally {
      // Resume observer after a short delay to ensure all UI mutations complete
      setTimeout(() => {
        if (currentAdapter && 'resumeObserver' in currentAdapter) {
          (currentAdapter as any).resumeObserver();
        }
      }, 100);
    }

    // 5. Update body CSS state classes
    updateBodyClasses(currentResults);

    // 6. Report compliance events (debounced via service worker)
    reportComplianceEvents(currentResults);

    console.log('[VALIDATION] ✨ Evaluation complete');
  } catch (err) {
    console.error('[VALIDATION] 💥 Error during evaluation:', err);
  }
}

// ─── UI Updates ───────────────────────────────────────────────────────────────

/**
 * Update all UI components with evaluation results
 */
function updateUI(
  results: RuleEvaluationResult[],
  score: { overall: number; byCategory: Record<string, number>; passedCount: number; totalCount: number }
): void {
  if (!currentAdapter) return;

  // Update validation banners
  removeValidationBanners();
  for (const result of results) {
    const rule = currentRules.find((r) => r.id === result.ruleId);
    if (!rule) continue;

    const injectionPoint = currentAdapter.getInjectionPoint(
      rule.ruleType,
      rule.condition.field ?? ''
    );

    if (injectionPoint) {
      const bannerStatus = result.status === 'unknown'
        ? 'warning'
        : result.passed ? 'success' : 'error';
      renderValidationBanner({
        message: result.status === 'unknown' ? `${result.message} (couldn't verify)` : result.message,
        status: bannerStatus,
        fieldPath: rule.condition.field ?? '',
        injectionPoint,
      });
    }

    // Render naming preview for naming convention rules
    if (rule.ruleType === 'naming_convention' && rule.condition.field) {
      const template = currentNamingTemplates.find(
        (t) => t.ruleId === rule.id
      );
      if (template && injectionPoint) {
        // Get current name value for the preview
        const nameFieldValue = results.find(
          (r) => r.ruleId === rule.id
        )?.fieldValue;
        if (typeof nameFieldValue === 'string') {
          renderNamingPreview({
            name: nameFieldValue,
            template,
            injectionPoint,
          });
        }
      }
    }
  }

  // Update sidebar
  if (sidebar) {
    sidebar.update(results);
  }

  // Update campaign score
  renderCampaignScore({
    score: score.overall,
    passedCount: score.passedCount,
    totalCount: score.totalCount,
  });

  // Update creation blocker violations (but don't show the modal).
  // The modal only appears when the user clicks Publish — the blocker's
  // click interceptor calls show() internally. Here we just update the
  // stored violations so the blocker has the latest list ready.
  const blockingViolations = results.filter(
    (r) => !r.passed && r.enforcement === 'blocking'
  );

  if (blockingViolations.length > 0) {
    if (!creationBlocker) {
      creationBlocker = new CreationBlocker();
    }
    creationBlocker.updateViolations(blockingViolations);
  } else if (creationBlocker) {
    creationBlocker.hide();
  }
}

/**
 * Update body-level CSS state classes for validation state propagation
 *
 * Pattern from Grasp: body.gg-invalid-{fieldname} / body.gg-valid-{fieldname}
 */
function updateBodyClasses(results: RuleEvaluationResult[]): void {
  // Remove existing governance classes
  const existingClasses = Array.from(document.body.classList).filter(
    (c) => c.startsWith('gov-valid-') || c.startsWith('gov-invalid-') || c.startsWith('gov-unknown-')
  );
  for (const cls of existingClasses) {
    document.body.classList.remove(cls);
  }

  // Add new classes based on results
  for (const result of results) {
    const rule = currentRules.find((r) => r.id === result.ruleId);
    if (!rule?.condition.field) continue;

    const fieldSlug = rule.condition.field.replace(/\./g, '-');
    const prefix = result.status === 'unknown'
      ? 'gov-unknown'
      : result.passed ? 'gov-valid' : 'gov-invalid';
    document.body.classList.add(`${prefix}-${fieldSlug}`);
  }
}

// ─── Creation Interception ────────────────────────────────────────────────────

/**
 * Set up interception of the platform's create/publish button
 */
function setupCreationInterception(): void {
  if (!currentAdapter) return;

  currentAdapter.interceptCreation((allow) => {
    if (!allow) return;

    // Check for blocking violations
    const blockingViolations = currentResults.filter(
      (r) => !r.passed && r.enforcement === 'blocking'
    );

    if (blockingViolations.length > 0) {
      // Block creation
      if (!creationBlocker) {
        creationBlocker = new CreationBlocker();
      }
      creationBlocker.show(blockingViolations);
      return;
    }

    // Check for comment-required rules
    const commentRequired = currentResults.filter(
      (r) => !r.passed && r.enforcement === 'comment_required'
    );

    if (commentRequired.length > 0) {
      // Show comment modal (handled by the comment-modal component)
      // The creation will proceed after the comment is submitted
      logger.info('Comment required before creation');
    }
  });
}

// ─── Compliance Reporting ─────────────────────────────────────────────────────

/**
 * Report compliance events to the service worker (debounced)
 */
const reportComplianceEvents = debounce(
  (results: RuleEvaluationResult[]) => {
    try {
      chrome.runtime.sendMessage({
        type: 'reportCompliance',
        results: results.map((r) => ({
          ruleId: r.ruleId,
          passed: r.passed,
          fieldValue: r.fieldValue,
          expectedValue: r.expectedValue,
        })),
      });
    } catch (err) {
      logger.error('Failed to report compliance events:', err);
    }
  },
  5000
);

// ─── Service Worker Messages ──────────────────────────────────────────────────

/**
 * Handle messages from the service worker or popup
 *
 * Supports both service-worker-initiated messages (rulesUpdated, forceRefresh)
 * and popup-initiated messages (toggleSidebar).
 *
 * @returns true when sendResponse will be called asynchronously, void otherwise
 */
function handleServiceWorkerMessage(
  message: { type: string; [key: string]: unknown },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
): boolean | void {
  switch (message.type) {
    case 'rulesUpdated':
      logger.info('Rules updated notification received, re-fetching...');
      refetchRules();
      break;

    case 'forceRefresh':
      logger.info('Force refresh requested');
      refetchRules();
      break;

    case 'toggleSidebar':
      logger.info('Toggle sidebar requested');
      if (sidebar) {
        sidebar.toggle();
        sendResponse({ success: true });
      } else {
        logger.warn('Sidebar not initialized yet');
        sendResponse({ success: false, error: 'Sidebar not initialized' });
      }
      break;

    case 'toggleDebugMode':
      logger.info(`Selector Debug Mode: ${message.enabled ? 'ON' : 'OFF'}`);
      void (async () => {
        try {
          if (message.enabled) {
            await enableSelectorDebugMode();
          } else {
            disableSelectorDebugMode();
          }
          sendResponse({ success: true });
        } catch (err) {
          logger.error('Failed to toggle debug mode:', err);
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
      return true;

    case 'captureExtractionSnapshot':
      void (async () => {
        try {
          const platform = detectPlatformFromURL(window.location.href);
          if (!platform || !currentAdapter) {
            sendResponse({
              success: false,
              error: 'No supported ad platform is active in this tab.',
            });
            return;
          }

          const fieldValues = await currentAdapter.extractFieldValues();
          const context = currentAdapter.detectContext();
          const snapshot = buildExtractionSnapshot(platform, fieldValues, {
            entityLevel: context?.entityLevel,
          });

          sendResponse({ success: true, snapshot });
        } catch (err) {
          logger.error('Failed to capture extraction snapshot:', err);
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
      return true;
  }
}

/**
 * Re-fetch rules and re-evaluate
 */
async function refetchRules(): Promise<void> {
  try {
    const context = currentAdapter?.detectContext();
    if (!context) return;

    let rulesResponse: { rules?: Rule[]; namingTemplates?: NamingTemplate[]; error?: string } | null = null;

    try {
      rulesResponse = await chrome.runtime.sendMessage({
        type: 'getRules',
        accountId: context.accountId,
      });
    } catch {
      logger.warn('SW unreachable for refetchRules');
    }

    // Direct HTTP fallback
    if (!rulesResponse || ('error' in rulesResponse) || !rulesResponse.rules?.length) {
      try {
        const storage = await chrome.storage.local.get(['extensionToken', 'apiBaseUrl']);
        const token = storage.extensionToken as string;
        const baseUrl = (storage.apiBaseUrl as string) || 'http://localhost:3000';
        if (token) {
          const resp = await fetch(`${baseUrl}/api/v1/rules`, {
            headers: { 'X-Extension-Token': token },
          });
          if (resp.ok) rulesResponse = await resp.json();
        }
      } catch {
        logger.error('Direct HTTP fallback failed in refetchRules');
      }
    }

    if (!rulesResponse?.rules?.length) return;

    currentRules = rulesResponse.rules ?? [];
    currentNamingTemplates = rulesResponse.namingTemplates ?? [];
    await runEvaluation();
  } catch (err) {
    logger.error('Failed to re-fetch rules:', err);
  }
}

// ─── Platform Detection ───────────────────────────────────────────────────────

/**
 * Detect platform from the current page URL.
 *
 * In addition to production ad-platform URLs, this recognises localhost
 * fixture URLs so the extension can be tested locally without navigating
 * to Meta Ads Manager or Google Ads.
 *
 * Convention: fixture files are named `meta-*.html` or `google-*.html`.
 */
function detectPlatformFromURL(url: string): Platform | null {
  if (
    url.includes('adsmanager.facebook.com') ||
    url.includes('business.facebook.com/adsmanager')
  ) {
    return Platform.META;
  }
  if (url.includes('ads.google.com')) {
    return Platform.GOOGLE_ADS;
  }

  // Test mode: localhost fixture detection
  if (url.match(/^http:\/\/localhost(:\d+)?\/.*meta-/)) {
    return Platform.META;
  }
  if (url.match(/^http:\/\/localhost(:\d+)?\/.*google-/)) {
    return Platform.GOOGLE_ADS;
  }

  return null;
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Clean up all injections and observers on navigation
 */
function cleanup(): void {
  logger.info('Cleaning up governance extension');

  if (currentAdapter) {
    currentAdapter.cleanup();
    currentAdapter = null;
  }

  if (evalBatcher) {
    evalBatcher.destroy();
    evalBatcher = null;
  }

  if (sidebar) {
    sidebar.destroy();
    sidebar = null;
  }

  if (creationBlocker) {
    creationBlocker.destroy();
    creationBlocker = null;
  }

  removeValidationBanners();
  removeCampaignScore();
  removeNamingPreview();
  disableSelectorDebugMode();

  // Remove body attribute
  document.body.removeAttribute(LOADED_ATTRIBUTE);

  // Remove body classes
  const govClasses = Array.from(document.body.classList).filter(
    (c) => c.startsWith('gov-valid-') || c.startsWith('gov-invalid-') || c.startsWith('gov-unknown-')
  );
  for (const cls of govClasses) {
    document.body.classList.remove(cls);
  }

  // Remove message listener
  chrome.runtime.onMessage.removeListener(handleServiceWorkerMessage);
}

// Clean up when the page is about to unload
window.addEventListener('beforeunload', cleanup);

// ─── Selector Debug Mode ─────────────────────────────────────────────────────

/** CSS class used to identify debug mode overlay elements */
const DEBUG_OVERLAY_CLASS = 'gov-debug-overlay';

/** Root element ID for the floating debug overlay layer */
const DEBUG_OVERLAY_ROOT_ID = 'gov-debug-overlay-root';

/** Summary card ID for the debug overlay HUD */
const DEBUG_SUMMARY_ID = 'gov-debug-summary';

type DebugOverlayStatus = 'extracted' | 'selector-only';

interface DebugOverlayEntry {
  target: HTMLElement;
  box: HTMLDivElement;
  label: HTMLDivElement;
  fieldPath: string;
  valuePreview: string;
  status: DebugOverlayStatus;
}

let debugOverlayEntries: DebugOverlayEntry[] = [];
let debugOverlayLayoutFrame: number | null = null;
let debugOverlayMutationObserver: MutationObserver | null = null;
let debugModeEnabled = false;

/**
 * Enable Selector Debug Mode.
 *
 * For each field in the selector registry (Meta or Google, depending on the
 * current platform), attempt to find the DOM element and overlay a colored
 * border:
 *   - Green border + label: selector found the element
 *   - Red floating banner: selector expected but element not found
 *
 * This provides instant visual feedback on selector health for manual testing.
 */
async function enableSelectorDebugMode(): Promise<void> {
  // First, clean up any existing debug overlays
  disableSelectorDebugMode();

  const platform = detectPlatformFromURL(window.location.href);
  if (!platform || !currentAdapter) {
    logger.warn('Cannot enable debug mode: platform not detected');
    return;
  }

  try {
    const fieldValues = await currentAdapter.extractFieldValues();
    const context = currentAdapter.detectContext();
    const snapshot = buildExtractionSnapshot(platform, fieldValues, {
      entityLevel: context?.entityLevel,
    });
    const overlayRoot = createDebugOverlayRoot();

    for (const field of snapshot.fields) {
      if (!field.hasValue && field.selectorFound !== true) {
        continue;
      }

      const element = resolveDebugFieldElement(platform, field.fieldPath);
      if (!element) {
        continue;
      }

      debugOverlayEntries.push(
        createDebugOverlayEntry(overlayRoot, element, field.fieldPath, field.valuePreview, field.hasValue ? 'extracted' : 'selector-only'),
      );
    }

    renderDebugSummary(overlayRoot, snapshot);
    debugModeEnabled = true;
    attachDebugOverlayListeners();
    scheduleDebugOverlayLayout();

    logger.info(
      `[Debug Mode] ${platform}: ${snapshot.extractedFields} extracted, ${snapshot.missingWithSelector} selector-only, ${snapshot.missingWithoutSelector} missing`,
    );
  } catch (err) {
    logger.error('Failed to enable debug mode:', err);
    disableSelectorDebugMode();
  }
}

/**
 * Create a floating debug overlay entry for a field.
 */
function createDebugOverlayEntry(
  root: HTMLElement,
  element: HTMLElement,
  fieldPath: string,
  valuePreview: string,
  status: DebugOverlayStatus,
): DebugOverlayEntry {
  const box = document.createElement('div');
  box.className = DEBUG_OVERLAY_CLASS;
  box.style.cssText = [
    'position: fixed',
    'z-index: 2147483647',
    'pointer-events: none',
    'border-radius: 8px',
    'box-sizing: border-box',
    'transition: opacity 120ms ease-out',
  ].join('; ');

  const label = document.createElement('div');
  label.className = DEBUG_OVERLAY_CLASS;
  label.textContent =
    status === 'extracted'
      ? `${fieldPath} = ${valuePreview}`
      : `${fieldPath} (selector only)`;
  label.style.cssText = [
    'position: fixed',
    'z-index: 2147483647',
    'pointer-events: none',
    'padding: 4px 8px',
    'font-size: 11px',
    'font-weight: 600',
    'font-family: "SF Mono", "Menlo", "Monaco", monospace',
    'border-radius: 6px',
    'white-space: nowrap',
    'max-width: min(60vw, 520px)',
    'overflow: hidden',
    'text-overflow: ellipsis',
    'box-shadow: 0 10px 25px rgba(15, 23, 42, 0.18)',
  ].join('; ');

  applyDebugOverlayTheme(box, label, status);
  root.appendChild(box);
  root.appendChild(label);

  return {
    target: element,
    box,
    label,
    fieldPath,
    valuePreview,
    status,
  };
}

/**
 * Theme a debug overlay entry based on its extraction state.
 */
function applyDebugOverlayTheme(
  box: HTMLDivElement,
  label: HTMLDivElement,
  status: DebugOverlayStatus,
): void {
  if (status === 'extracted') {
    box.style.border = '3px solid #16A34A';
    box.style.background = 'rgba(34, 197, 94, 0.10)';
    label.style.background = '#16A34A';
    label.style.color = '#FFFFFF';
  } else {
    box.style.border = '3px dashed #D97706';
    box.style.background = 'rgba(245, 158, 11, 0.12)';
    label.style.background = '#D97706';
    label.style.color = '#111827';
  }
}

/**
 * Create the fixed overlay root that holds highlight boxes and labels.
 */
function createDebugOverlayRoot(): HTMLElement {
  let root = document.getElementById(DEBUG_OVERLAY_ROOT_ID);
  if (root) {
    root.remove();
  }

  root = document.createElement('div');
  root.id = DEBUG_OVERLAY_ROOT_ID;
  root.className = DEBUG_OVERLAY_CLASS;
  root.style.cssText = [
    'position: fixed',
    'inset: 0',
    'z-index: 2147483647',
    'pointer-events: none',
  ].join('; ');
  document.body.appendChild(root);
  return root;
}

/**
 * Resolve a DOM element for a debug-highlighted field path without recording
 * selector telemetry.
 */
function resolveDebugFieldElement(
  platform: Platform,
  fieldPath: string,
): HTMLElement | null {
  if (platform === Platform.META) {
    return peekFieldElement(fieldPath);
  }

  const entry = GOOGLE_FIELD_SELECTORS[fieldPath];
  if (!entry) {
    return null;
  }

  return entry.shadowDom
    ? queryWithShadowDom(entry.selectors)
    : queryByChain(document, entry.selectors);
}

/**
 * Render the summary HUD with extracted, selector-only, and missing counts.
 */
function renderDebugSummary(
  root: HTMLElement,
  snapshot: ReturnType<typeof buildExtractionSnapshot>,
): void {
  const summary = document.createElement('div');
  summary.id = DEBUG_SUMMARY_ID;
  summary.className = DEBUG_OVERLAY_CLASS;
  summary.style.cssText = [
    'position: fixed',
    'top: 16px',
    'right: 16px',
    'width: min(360px, calc(100vw - 32px))',
    'background: rgba(15, 23, 42, 0.92)',
    'color: #F8FAFC',
    'border-radius: 14px',
    'padding: 14px 16px',
    'box-shadow: 0 16px 38px rgba(15, 23, 42, 0.35)',
    'font-family: Inter, system-ui, sans-serif',
    'pointer-events: none',
  ].join('; ');

  const missingFields = snapshot.fields
    .filter((field) => !field.hasValue && field.selectorFound === false)
    .slice(0, 8)
    .map((field) => field.fieldPath);

  const selectorOnlyFields = snapshot.fields
    .filter((field) => !field.hasValue && field.selectorFound === true)
    .slice(0, 5)
    .map((field) => field.fieldPath);

  summary.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;">
      <div style="font-size:13px;font-weight:700;letter-spacing:0.01em;">Extraction Highlights</div>
      <div style="font-size:11px;opacity:0.78;">${snapshot.platform.toUpperCase()}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px;">
      <div style="background:rgba(34,197,94,0.16);border:1px solid rgba(34,197,94,0.35);border-radius:10px;padding:8px;">
        <div style="font-size:18px;font-weight:700;color:#86EFAC;">${snapshot.extractedFields}</div>
        <div style="font-size:11px;opacity:0.82;">Extracted</div>
      </div>
      <div style="background:rgba(245,158,11,0.16);border:1px solid rgba(245,158,11,0.35);border-radius:10px;padding:8px;">
        <div style="font-size:18px;font-weight:700;color:#FCD34D;">${snapshot.missingWithSelector}</div>
        <div style="font-size:11px;opacity:0.82;">Selector Only</div>
      </div>
      <div style="background:rgba(239,68,68,0.16);border:1px solid rgba(239,68,68,0.35);border-radius:10px;padding:8px;">
        <div style="font-size:18px;font-weight:700;color:#FCA5A5;">${snapshot.missingWithoutSelector}</div>
        <div style="font-size:11px;opacity:0.82;">Missing</div>
      </div>
    </div>
    ${
      selectorOnlyFields.length > 0
        ? `<div style="margin-bottom:10px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#FCD34D;margin-bottom:6px;">Selector only</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${selectorOnlyFields
              .map(
                (fieldPath) =>
                  `<span style="background:rgba(245,158,11,0.18);border:1px solid rgba(245,158,11,0.28);border-radius:999px;padding:3px 8px;font-size:11px;">${escapeHtml(fieldPath)}</span>`,
              )
              .join('')}</div>
          </div>`
        : ''
    }
    ${
      missingFields.length > 0
        ? `<div>
            <div style="font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#FCA5A5;margin-bottom:6px;">Missing fields</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${missingFields
              .map(
                (fieldPath) =>
                  `<span style="background:rgba(239,68,68,0.18);border:1px solid rgba(239,68,68,0.28);border-radius:999px;padding:3px 8px;font-size:11px;">${escapeHtml(fieldPath)}</span>`,
              )
              .join('')}</div>
          </div>`
        : '<div style="font-size:11px;opacity:0.76;">No selector misses in the current viewport/state.</div>'
    }
  `;

  root.appendChild(summary);
}

/**
 * Update overlay boxes and labels to follow their live DOM targets.
 */
function layoutDebugOverlays(): void {
  debugOverlayLayoutFrame = null;

  for (const entry of debugOverlayEntries) {
    const rect = entry.target.getBoundingClientRect();
    const isVisible =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      rect.right > 0 &&
      rect.left < window.innerWidth;

    if (!isVisible) {
      entry.box.style.opacity = '0';
      entry.label.style.opacity = '0';
      continue;
    }

    entry.box.style.opacity = '1';
    entry.label.style.opacity = '1';
    entry.box.style.left = `${Math.max(0, rect.left)}px`;
    entry.box.style.top = `${Math.max(0, rect.top)}px`;
    entry.box.style.width = `${Math.max(8, rect.width)}px`;
    entry.box.style.height = `${Math.max(8, rect.height)}px`;

    const labelWidth = Math.min(420, Math.max(180, entry.label.offsetWidth || 220));
    const labelLeft = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - labelWidth - 8),
    );
    const labelTop =
      rect.top >= 34
        ? rect.top - 30
        : Math.min(window.innerHeight - 34, rect.bottom + 8);

    entry.label.style.left = `${labelLeft}px`;
    entry.label.style.top = `${Math.max(8, labelTop)}px`;
  }
}

/**
 * Schedule a layout pass for the live debug overlays.
 */
function scheduleDebugOverlayLayout(): void {
  if (!debugModeEnabled) {
    return;
  }

  if (debugOverlayLayoutFrame !== null) {
    cancelAnimationFrame(debugOverlayLayoutFrame);
  }

  debugOverlayLayoutFrame = window.requestAnimationFrame(() => {
    layoutDebugOverlays();
  });
}

/**
 * Attach listeners so overlay boxes follow scrolling and DOM movement.
 */
function attachDebugOverlayListeners(): void {
  window.addEventListener('scroll', scheduleDebugOverlayLayout, true);
  window.addEventListener('resize', scheduleDebugOverlayLayout);

  debugOverlayMutationObserver = new MutationObserver(() => {
    scheduleDebugOverlayLayout();
  });
  debugOverlayMutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
  });
}

/**
 * Disable Selector Debug Mode.
 *
 * Removes all debug overlays and listeners.
 */
function disableSelectorDebugMode(): void {
  debugModeEnabled = false;

  if (debugOverlayLayoutFrame !== null) {
    cancelAnimationFrame(debugOverlayLayoutFrame);
    debugOverlayLayoutFrame = null;
  }

  window.removeEventListener('scroll', scheduleDebugOverlayLayout, true);
  window.removeEventListener('resize', scheduleDebugOverlayLayout);

  if (debugOverlayMutationObserver) {
    debugOverlayMutationObserver.disconnect();
    debugOverlayMutationObserver = null;
  }

  debugOverlayEntries = [];

  const overlays = document.querySelectorAll(`.${DEBUG_OVERLAY_CLASS}`);
  for (const el of overlays) {
    el.remove();
  }

  document.getElementById(DEBUG_OVERLAY_ROOT_ID)?.remove();
  document.getElementById(DEBUG_SUMMARY_ID)?.remove();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Export for testing
export { cleanup, runEvaluation, detectPlatformFromURL };

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
import { META_FIELD_SELECTORS, findElement as metaFindElement } from '../adapters/meta/meta-selectors.js';
import { GOOGLE_FIELD_SELECTORS, queryByChain, queryWithShadowDom } from '../adapters/google/google-selectors.js';

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
    chrome.runtime.onMessage.addListener(handleServiceWorkerMessage);

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

    // bestFieldValues tracks the latest known field state.
    // When extraction returns null for a key that previously had a value,
    // the cached value is CLEARED so the evaluator sees the actual current state.
    if (!bestFieldValues) {
      bestFieldValues = {};
    }

    // Clear keys that are now null (field was removed or extraction failed)
    for (const key of Object.keys(bestFieldValues)) {
      if (!(key in fieldValues)) {
        delete bestFieldValues[key];
      }
    }
    // Merge non-null values; delete keys that are explicitly null/undefined
    for (const [k, v] of Object.entries(fieldValues)) {
      if (v !== null && v !== undefined) {
        bestFieldValues[k] = v;
      } else {
        delete bestFieldValues[k];
      }
    }

    // USE bestFieldValues as THE field values for evaluation — not the current extraction
    fieldValues = { ...fieldValues }; // keep all keys
    for (const [k, v] of Object.entries(bestFieldValues)) {
      fieldValues[k] = v;
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
          reason: result.reason,
          actualValue: result.actualValue
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
      if (message.enabled) {
        enableSelectorDebugMode();
      } else {
        disableSelectorDebugMode();
      }
      sendResponse({ success: true });
      break;
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

/** Data attribute used to mark elements styled by debug mode */
const DEBUG_OUTLINE_ATTR = 'data-gov-debug-outline';

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
function enableSelectorDebugMode(): void {
  // First, clean up any existing debug overlays
  disableSelectorDebugMode();

  const platform = detectPlatformFromURL(window.location.href);
  if (!platform) {
    logger.warn('Cannot enable debug mode: platform not detected');
    return;
  }

  const results: Array<{ fieldPath: string; found: boolean }> = [];

  if (platform === Platform.META) {
    // Meta: iterate META_FIELD_SELECTORS
    for (const config of META_FIELD_SELECTORS) {
      const element = metaFindElement(config.strategies);
      if (element) {
        applyDebugOverlayFound(element, config.fieldPath);
        results.push({ fieldPath: config.fieldPath, found: true });
      } else {
        applyDebugOverlayMissing(config.fieldPath);
        results.push({ fieldPath: config.fieldPath, found: false });
      }
    }
  } else if (platform === Platform.GOOGLE_ADS) {
    // Google: iterate GOOGLE_FIELD_SELECTORS
    for (const [fieldPath, entry] of Object.entries(GOOGLE_FIELD_SELECTORS)) {
      let element: HTMLElement | null = null;

      if (entry.shadowDom) {
        element = queryWithShadowDom(entry.selectors);
      } else {
        element = queryByChain(document, entry.selectors);
      }

      if (element) {
        applyDebugOverlayFound(element, fieldPath);
        results.push({ fieldPath, found: true });
      } else {
        applyDebugOverlayMissing(fieldPath);
        results.push({ fieldPath, found: false });
      }
    }
  }

  // Log summary
  const found = results.filter((r) => r.found).length;
  const missing = results.filter((r) => !r.found).length;
  logger.info(
    `[Debug Mode] ${platform}: ${found} selectors found, ${missing} selectors missing`
  );

  if (missing > 0) {
    const missingPaths = results
      .filter((r) => !r.found)
      .map((r) => r.fieldPath);
    logger.warn('[Debug Mode] Missing selectors:', missingPaths.join(', '));
  }
}

/**
 * Apply a green debug overlay to a found element.
 *
 * Adds a green outline border and a floating label above the element
 * showing the field path.
 */
function applyDebugOverlayFound(element: HTMLElement, fieldPath: string): void {
  // Add green outline to the element
  element.style.outline = '3px solid #16A34A';
  element.style.outlineOffset = '2px';
  element.setAttribute(DEBUG_OUTLINE_ATTR, 'true');

  // Create a floating label
  const label = document.createElement('div');
  label.className = DEBUG_OVERLAY_CLASS;
  label.textContent = fieldPath;
  label.style.cssText = [
    'position: absolute',
    'background: #16A34A',
    'color: white',
    'padding: 2px 8px',
    'font-size: 11px',
    'font-weight: 600',
    'font-family: "SF Mono", "Menlo", "Monaco", monospace',
    'border-radius: 3px',
    'z-index: 2147483647',
    'pointer-events: none',
    'white-space: nowrap',
    'box-shadow: 0 1px 3px rgba(0,0,0,0.2)',
  ].join('; ');

  // Position the label above the element
  const rect = element.getBoundingClientRect();
  label.style.left = `${window.scrollX + rect.left}px`;
  label.style.top = `${window.scrollY + rect.top - 22}px`;

  document.body.appendChild(label);
}

/**
 * Apply a red debug overlay for a missing element.
 *
 * Creates a floating red banner at the top of the page listing the
 * field path that could not be found.
 */
function applyDebugOverlayMissing(fieldPath: string): void {
  const banner = document.createElement('div');
  banner.className = DEBUG_OVERLAY_CLASS;
  banner.textContent = `MISSING: ${fieldPath}`;
  banner.style.cssText = [
    'position: relative',
    'background: #DC2626',
    'color: white',
    'padding: 4px 10px',
    'font-size: 11px',
    'font-weight: 600',
    'font-family: "SF Mono", "Menlo", "Monaco", monospace',
    'border-bottom: 1px solid #B91C1C',
    'z-index: 2147483647',
    'pointer-events: none',
  ].join('; ');

  // Get or create the debug banner container
  let container = document.getElementById('gov-debug-missing-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'gov-debug-missing-container';
    container.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'right: 0',
      'z-index: 2147483647',
      'max-height: 200px',
      'overflow-y: auto',
      'pointer-events: none',
    ].join('; ');
    container.className = DEBUG_OVERLAY_CLASS;
    document.body.appendChild(container);
  }

  container.appendChild(banner);
}

/**
 * Disable Selector Debug Mode.
 *
 * Removes all debug overlays (green outlines, labels, red banners).
 */
function disableSelectorDebugMode(): void {
  // Remove all debug overlay elements
  const overlays = document.querySelectorAll(`.${DEBUG_OVERLAY_CLASS}`);
  for (const el of overlays) {
    el.remove();
  }

  // Remove the missing container
  const container = document.getElementById('gov-debug-missing-container');
  if (container) {
    container.remove();
  }

  // Remove green outlines from elements
  const outlinedElements = document.querySelectorAll<HTMLElement>(
    `[${DEBUG_OUTLINE_ATTR}]`
  );
  for (const el of outlinedElements) {
    el.style.outline = '';
    el.style.outlineOffset = '';
    el.removeAttribute(DEBUG_OUTLINE_ATTR);
  }
}

// Export for testing
export { cleanup, runEvaluation, detectPlatformFromURL };

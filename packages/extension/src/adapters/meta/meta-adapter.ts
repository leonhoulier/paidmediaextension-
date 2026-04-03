/**
 * Meta Ads Manager Platform Adapter
 *
 * Implements the PlatformAdapter interface for Meta Ads Manager
 * (adsmanager.facebook.com / business.facebook.com).
 *
 * Responsibilities:
 * - Detect current context (account ID, entity level, view mode)
 * - Extract field values from the Meta Ads Manager DOM
 * - Provide injection points for governance rule overlays
 * - Intercept campaign creation/publish actions
 * - Observe field changes via MutationObserver
 * - Full end-to-end validation loop:
 *     field change -> MutationObserver -> extractFieldValues() ->
 *     rule evaluation -> update ValidationBanners -> update GuidelinesSidebar ->
 *     update CampaignScore -> debounced POST /api/v1/compliance/events
 * - Multi-entity creation flow (campaign -> ad set -> ad) tracking
 *
 * @module meta-adapter
 */

import {
  PlatformAdapter,
  Platform,
  ExtensionContext,
  InjectionPoint,
  EntityLevel,
  ExtensionView,
  EnforcementMode,
} from '@media-buying-governance/shared';

import type {
  Rule,
  NamingTemplate,
  RuleEvaluationResult,
  ComplianceScore,
  PostComplianceEventsRequest,
  ComplianceEvent,
} from '@media-buying-governance/shared';

import {
  extractAllFieldValues,
  destroyRemoteEvalBatcher,
} from './meta-fields.js';

import {
  getInjectionPointForField,
  findElement,
  PUBLISH_BUTTON_SELECTORS,
} from './meta-selectors.js';

import { evaluateRules, computeScore } from '../../rules/evaluator.js';
import { renderValidationBanner, removeValidationBanners } from '../../components/validation-banner.js';
import { GuidelinesSidebar } from '../../components/guidelines-sidebar.js';
import { renderCampaignScore, removeCampaignScore } from '../../components/campaign-score.js';
import { CreationBlocker } from '../../components/creation-blocker.js';
import { CommentModal } from '../../components/comment-modal.js';
import { ApprovalPendingModal } from '../../components/approval-pending-modal.js';
import { createApprovalRequest } from '../../api/client.js';
import { logger } from '../../utils/logger.js';
import { logComplianceEvent } from '../../utils/telemetry.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Recognised Meta Ads Manager hostnames */
const META_HOSTNAMES = [
  'adsmanager.facebook.com',
  'business.facebook.com',
];

/**
 * Check whether the given URL is a localhost test-mode page that
 * should be treated as Meta Ads Manager. Convention: the path
 * contains "meta-" (e.g. `/meta-campaign-creation.html`).
 */
function isLocalhostMetaFixture(url: URL): boolean {
  return (
    url.hostname === 'localhost' &&
    url.protocol === 'http:' &&
    /\/.*meta-/.test(url.pathname)
  );
}

/**
 * Mapping from Meta Ads Manager URL tool parameter values to EntityLevel.
 */
const TOOL_TO_ENTITY_LEVEL: Record<string, EntityLevel> = {
  'CAMPAIGN_CREATION_FLOW': EntityLevel.CAMPAIGN,
  'ADGROUP_CREATION_FLOW': EntityLevel.AD_SET,
  'AD_CREATION_FLOW': EntityLevel.AD,
};

/** Debounce interval for MutationObserver callbacks (ms) - reduced for better responsiveness */
const OBSERVER_DEBOUNCE_MS = 300;

/** Debounce interval for compliance event reporting (ms) -- max 1 batch per 5 seconds */
const COMPLIANCE_EVENT_DEBOUNCE_MS = 5_000;

/** Attribute set on body to prevent duplicate injection */
const LOADED_ATTRIBUTE = 'governance-loaded';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Simple debounce function.
 *
 * @param fn - The function to debounce
 * @param ms - Debounce interval in milliseconds
 * @returns A debounced version of the function with a cancel method
 */
function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = ((...args: unknown[]) => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  }) as unknown as T & { cancel: () => void };
  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}

/**
 * Deep equality check for comparing field values.
 * Handles primitives, arrays, and plain objects.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) =>
      deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
    );
  }

  return false;
}

/**
 * Convert a flat dot-separated key map into a nested object.
 *
 * The rule evaluator's getNestedValue() traverses nested objects by
 * splitting field paths on '.'. Since extractAllFieldValues() returns
 * flat keys like 'campaign.name', we need to convert them before
 * passing to evaluateRules().
 *
 * @example
 * toNestedObject({ 'campaign.name': 'Test', 'ad_set.targeting.age_range': '18-65' })
 * // => { campaign: { name: 'Test' }, ad_set: { targeting: { age_range: '18-65' } } }
 */
function toNestedObject(flat: Record<string, unknown>): Record<string, unknown> {
  const nested: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let current: Record<string, unknown> = nested;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
  }
  return nested;
}

// ---------------------------------------------------------------------------
// Entity Level Detection
// ---------------------------------------------------------------------------

/**
 * Detect the current entity level from DOM context clues.
 *
 * Meta allows campaign -> ad set -> ad creation in one flow.
 * The active entity is indicated by navigation steps, breadcrumbs,
 * or URL hash changes.
 */
function detectEntityLevelFromDOM(): EntityLevel | null {
  // Strategy 1: Look for active step indicators in the multi-step flow
  const activeStep = document.querySelector<HTMLElement>(
    '[aria-current="step"], [aria-current="page"], [data-active="true"]'
  );
  if (activeStep) {
    const text = activeStep.textContent?.toLowerCase() ?? '';
    if (text.includes('campaign')) return EntityLevel.CAMPAIGN;
    if (text.includes('ad set') || text.includes('adset')) return EntityLevel.AD_SET;
    if (text.includes('ad') && !text.includes('ad set')) return EntityLevel.AD;
  }

  // Strategy 2: Check visible section headers
  const headers = document.querySelectorAll<HTMLElement>(
    '.ams-card__title, [class*="section-title"], h2, h3'
  );
  let hasCampaignFields = false;
  let hasAdSetFields = false;
  let hasAdFields = false;

  for (const header of headers) {
    const text = header.textContent?.toLowerCase() ?? '';
    if (text.includes('campaign name') || text.includes('campaign objective') || text.includes('campaign budget')) {
      hasCampaignFields = true;
    }
    if (text.includes('ad set name') || text.includes('targeting') || text.includes('placement')) {
      hasAdSetFields = true;
    }
    if (text.includes('ad name') || text.includes('creative') || text.includes('website url')) {
      hasAdFields = true;
    }
  }

  // Strategy 3: Check for presence of specific fields
  if (!hasCampaignFields) {
    const campaignNameInput = document.querySelector('input[aria-label*="Campaign name"]');
    if (campaignNameInput) hasCampaignFields = true;
  }
  if (!hasAdSetFields) {
    const adSetNameInput = document.querySelector('input[aria-label*="Ad set name"]');
    if (adSetNameInput) hasAdSetFields = true;
  }
  if (!hasAdFields) {
    const adNameInput = document.querySelector('input[aria-label*="Ad name"]');
    if (adNameInput) hasAdFields = true;
  }

  // In multi-step flow, only the current entity's fields are visible
  if (hasAdFields && !hasAdSetFields && !hasCampaignFields) return EntityLevel.AD;
  if (hasAdSetFields && !hasCampaignFields) return EntityLevel.AD_SET;
  if (hasCampaignFields) return EntityLevel.CAMPAIGN;

  return null;
}

// ---------------------------------------------------------------------------
// MetaAdapter Implementation
// ---------------------------------------------------------------------------

/**
 * MetaAdapter implements the PlatformAdapter interface for Meta Ads Manager.
 *
 * In addition to the base PlatformAdapter contract, this adapter provides:
 * - Full validation loop orchestration (field -> rules -> UI -> API)
 * - Multi-entity creation flow tracking (campaign -> ad set -> ad)
 * - Debounced compliance event batching to /api/v1/compliance/events
 * - React Fiber deep extraction for complex fields
 *
 * @example
 * ```typescript
 * const adapter = new MetaAdapter();
 * const context = adapter.detectContext();
 * if (context) {
 *   // Start the full validation loop (self-contained orchestration)
 *   await adapter.startValidationLoop(rules, namingTemplates);
 * }
 * ```
 */
export class MetaAdapter implements PlatformAdapter {
  /** Platform identifier */
  readonly platform = Platform.META;

  /** MutationObserver instance for change detection */
  private observer: MutationObserver | null = null;

  /** MutationObserver for intercepting Meta's native publish dialogs */
  private publishDialogObserver: MutationObserver | null = null;

  /** Cached field values for diff-based change detection */
  private fieldValues: Record<string, unknown> = {};

  /** Timestamp of last successful field extraction (for cache staleness tracking) */
  private lastExtractionTimestamp: number = 0;

  /** Flag to prevent concurrent extraction calls during debounce window */
  private extractionInProgress: boolean = false;

  /** Flag to pause observer during our own UI updates */
  private observerPaused: boolean = false;

  /** Flag to track if initial validation has run */
  private initialValidationComplete: boolean = false;

  /** Set of buttons we have attached intercept listeners to */
  private interceptedButtons: WeakSet<HTMLElement> = new WeakSet();

  /** Event listeners registered for cleanup */
  private cleanupCallbacks: Array<() => void> = [];

  /** Set of injected governance DOM elements (for re-injection tracking) */
  private injectedElements: Set<HTMLElement> = new Set();

  // -- Validation loop state --

  /** Current rules loaded for this account */
  private rules: Rule[] = [];

  /** Current naming templates */
  private namingTemplates: NamingTemplate[] = [];

  /** Current rule evaluation results */
  private evaluationResults: RuleEvaluationResult[] = [];

  /** Guidelines sidebar instance */
  private sidebar: GuidelinesSidebar | null = null;

  /** Creation blocker instance */
  private creationBlocker: CreationBlocker | null = null;

  /** Comment modal instance */
  private commentModal: CommentModal | null = null;

  /** Approval pending modal instance */
  private approvalModal: ApprovalPendingModal | null = null;

  /** Current entity level tracked for multi-entity flow */
  private currentEntityLevel: EntityLevel = EntityLevel.CAMPAIGN;

  /** Pending compliance events waiting to be flushed */
  private pendingComplianceEvents: Omit<ComplianceEvent, 'id' | 'createdAt'>[] = [];

  /** Debounced compliance event poster */
  private debouncedPostComplianceEvents: ((() => void) & { cancel: () => void }) | null = null;

  /** Whether the validation loop is currently active */
  private validationLoopActive = false;

  /** API base URL for compliance event posting */
  private apiBaseUrl = '';

  /** Extension token for API authentication */
  private extensionToken = '';

  // ── detectContext ───────────────────────────────────────────────────────

  /**
   * Detect the current Meta Ads Manager context from URL and DOM.
   *
   * Parses the current URL to extract:
   * - accountId from the `act=` query parameter (formatted as `act_123456`)
   * - entityLevel from the `tool=` query parameter
   * - view mode (create vs. edit)
   *
   * @returns Extension context or null if not on a recognised Meta Ads Manager page
   */
  detectContext(): ExtensionContext | null {
    const url = window.location.href;

    // Verify we are on a Meta Ads Manager domain (or a localhost fixture)
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return null;
    }

    if (
      !META_HOSTNAMES.includes(parsedUrl.hostname) &&
      !isLocalhostMetaFixture(parsedUrl)
    ) {
      return null;
    }

    // Extract query parameters
    const params = parsedUrl.searchParams;

    // Account ID: `act=123456` -> `act_123456`
    const actRaw = params.get('act');
    if (!actRaw) {
      return null;
    }
    const accountId = actRaw.startsWith('act_') ? actRaw : `act_${actRaw}`;

    // Entity level and view from `tool=` parameter
    const tool = params.get('tool') ?? '';
    const entityLevel = TOOL_TO_ENTITY_LEVEL[tool] ?? null;

    // Determine view mode
    let view: ExtensionView;
    if (tool.endsWith('_CREATION_FLOW')) {
      view = ExtensionView.CREATE;
    } else if (tool) {
      view = ExtensionView.EDIT;
    } else {
      view = ExtensionView.EDIT;
    }

    // Entity level: URL param -> DOM detection -> URL path inference -> default
    const inferredEntityLevel =
      entityLevel ??
      inferEntityLevelFromUrl(parsedUrl) ??
      detectEntityLevelFromDOM() ??
      EntityLevel.CAMPAIGN;

    this.currentEntityLevel = inferredEntityLevel;

    return {
      accountId,
      entityLevel: inferredEntityLevel,
      view,
    };
  }

  // ── extractFieldValues ─────────────────────────────────────────────────

  /**
   * Extract current field values from the Meta Ads Manager DOM.
   *
   * Delegates to the meta-fields module which tries DOM queries first,
   * then falls back to React Fiber traversal via the remoteEval bridge.
   *
   * Includes extraction-in-progress guard to prevent concurrent extractions
   * during the debounce window, which could cause race conditions.
   *
   * @returns Record mapping field paths to their current values
   */
  async extractFieldValues(): Promise<Record<string, unknown>> {
    // Prevent concurrent extractions (return cached values if extraction in progress)
    if (this.extractionInProgress) {
      console.log('[EXTRACTION] ⏳ Extraction already in progress, returning cached values');
      return this.fieldValues;
    }

    this.extractionInProgress = true;
    try {
      const context = this.detectContext();
      const activeEntityLevel = context?.entityLevel ?? this.currentEntityLevel;
      this.currentEntityLevel = activeEntityLevel;
      console.log('[EXTRACTION] Starting field extraction...');
      const freshValues = await extractAllFieldValues(activeEntityLevel);

      // Cross-panel merge: retain cached values for fields not in current DOM panel
      const mergedValues: Record<string, unknown> = {};
      const allKeys = new Set([...Object.keys(freshValues), ...Object.keys(this.fieldValues)]);
      let cachedCount = 0;
      for (const key of allKeys) {
        const freshValue = freshValues[key];
        if (freshValue !== null && freshValue !== undefined) {
          mergedValues[key] = freshValue;
        } else if (this.fieldValues[key] !== null && this.fieldValues[key] !== undefined) {
          mergedValues[key] = this.fieldValues[key];
          cachedCount++;
        } else {
          mergedValues[key] = freshValue ?? null;
        }
      }

      const freshNonNull = Object.values(freshValues).filter(v => v !== null && v !== undefined).length;
      console.log(`[EXTRACTION] Extracted ${freshNonNull} fresh fields, retained ${cachedCount} cached cross-panel fields`);
      this.fieldValues = { ...mergedValues };
      this.lastExtractionTimestamp = Date.now();
      return mergedValues;
    } catch (error) {
      console.error('[EXTRACTION] ❌ Field extraction failed:', error);
      // Return cached values on error (better than throwing)
      return this.fieldValues;
    } finally {
      this.extractionInProgress = false;
    }
  }

  /**
   * Get cached field values from the last successful extraction.
   *
   * This returns the most recent extraction results without running a new
   * extraction. Use this in validation to avoid race conditions and timing issues.
   *
   * @returns Record of field paths to their cached values
   */
  getCachedFieldValues(): Record<string, unknown> {
    return { ...this.fieldValues };
  }

  /**
   * Get the timestamp of the last successful field extraction.
   *
   * Used for telemetry and cache staleness detection.
   *
   * @returns Unix timestamp in milliseconds, or 0 if no extraction has completed yet
   */
  getLastExtractionTimestamp(): number {
    return this.lastExtractionTimestamp;
  }

  /**
   * Temporarily pause the mutation observer to prevent infinite loops
   * during our own UI updates.
   */
  pauseObserver(): void {
    this.observerPaused = true;
  }

  /**
   * Resume the mutation observer after UI updates are complete.
   */
  resumeObserver(): void {
    this.observerPaused = false;
  }

  // ── getInjectionPoint ──────────────────────────────────────────────────

  /**
   * Get the DOM element where a governance injection should be placed.
   *
   * @param ruleType - The type of rule being injected
   * @param fieldPath - The field path this rule validates
   * @returns Injection point information or null if target cannot be found
   */
  getInjectionPoint(ruleType: string, fieldPath: string): InjectionPoint | null {
    return getInjectionPointForField(ruleType, fieldPath);
  }

  // ── interceptCreation ──────────────────────────────────────────────────

  /**
   * Hook into the "Publish" / "Next" button to intercept campaign creation.
   *
   * Uses capture-phase event listeners to intercept clicks before React
   * handlers fire. If the callback reports allow=false, the event is fully
   * blocked (preventDefault + stopPropagation + stopImmediatePropagation).
   *
   * @param callback - Called when user attempts to create/publish.
   *                   Pass true to allow, false to block.
   */
  interceptCreation(callback: (allow: boolean) => void): void {
    const publishButton = findElement(PUBLISH_BUTTON_SELECTORS);

    if (!publishButton) {
      console.warn(
        '[Governance] Could not find publish/next button. ' +
        'Creation interception not active. Will retry on next mutation.',
      );
      return;
    }

    // Avoid double-attaching
    if (this.interceptedButtons.has(publishButton)) {
      return;
    }
    this.interceptedButtons.add(publishButton);

    const handler = (event: Event): void => {
      // The callback is called with `true` to notify that a creation attempt
      // is happening. The callback (in the injector / validation loop) should
      // inspect current blocking violations and call event.preventDefault()
      // from the CreationBlocker if needed.
      callback(true);

      // If the blocker component has flagged the body, block the event
      if (document.body.classList.contains('governance-creation-blocked')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };

    // Capture phase: fires before React's synthetic event system
    publishButton.addEventListener('click', handler, { capture: true });

    this.cleanupCallbacks.push(() => {
      publishButton.removeEventListener('click', handler, { capture: true });
      document.body.classList.remove('governance-creation-blocked');
    });
  }

  // ── observeFieldChanges ────────────────────────────────────────────────

  /**
   * Observe field changes in the Meta Ads Manager DOM.
   *
   * Uses a MutationObserver on document.body to detect React re-renders.
   * Changes are debounced (300ms) to avoid excessive re-evaluation.
   *
   * @param callback - Called when a field value changes
   */
  observeFieldChanges(callback: (fieldPath: string, value: unknown) => void): void {
    // Disconnect any existing observer
    if (this.observer) {
      this.observer.disconnect();
    }

    // Shared extraction + evaluation logic.
    // forceEval=true bypasses the deepEqual guard (used for user input events).
    // forceEval=false uses the guard (used for MutationObserver to prevent loops).
    const extractAndEvaluate = async (forceEval: boolean) => {
      if (this.observerPaused) return;

      try {
        const newValues = await this.extractFieldValues();

        // Cross-panel merge: DOM non-null values win, DOM null values fall back
        // to the adapter's cached fieldValues from previous extractions.
        // This ensures fields from other panels (Campaign/Ad Set/Ad) are retained.
        const mergedValues: Record<string, unknown> = {};
        const allKeys = new Set([...Object.keys(newValues), ...Object.keys(this.fieldValues)]);
        for (const key of allKeys) {
          const freshValue = newValues[key];
          if (freshValue !== null && freshValue !== undefined) {
            mergedValues[key] = freshValue;
          } else if (this.fieldValues[key] !== null && this.fieldValues[key] !== undefined) {
            // Keep previously cached value (field not in current DOM panel)
            mergedValues[key] = this.fieldValues[key];
          } else {
            mergedValues[key] = freshValue ?? null;
          }
        }

        const changedFields: string[] = [];
        for (const [field, value] of Object.entries(mergedValues)) {
          if (!deepEqual(value, this.fieldValues[field])) {
            changedFields.push(field);
          }
        }

        this.fieldValues = { ...mergedValues };

        // MutationObserver path: only re-evaluate if fields actually changed
        // (prevents infinite loop from our own UI mutations).
        // User input path: always re-evaluate (forceEval=true).
        const shouldEval = forceEval || changedFields.length > 0 || !this.initialValidationComplete;

        if (shouldEval) {
          this.initialValidationComplete = true;
          callback('__all__', mergedValues);
        }
      } catch (error) {
        console.error('[INPUT-CHANGE] ❌ Error during field change detection:', error);
      }
    };

    // MutationObserver: guarded by deepEqual (our UI changes don't re-trigger)
    const debouncedMutationHandler = debounce(() => extractAndEvaluate(false), OBSERVER_DEBOUNCE_MS);

    // User input events: always force re-evaluation (user typed/clicked something)
    const debouncedInputHandler = debounce(() => extractAndEvaluate(true), OBSERVER_DEBOUNCE_MS);

    this.observer = new MutationObserver(() => {
      debouncedMutationHandler();
      this.checkInjectedElements();
      this.detectEntityTransition();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['value', 'aria-invalid', 'aria-checked', 'aria-selected'],
    });

    // Direct input event listeners — these are real user actions, always re-evaluate
    const inputHandler = () => debouncedInputHandler();

    document.body.addEventListener('input', inputHandler, true);
    document.body.addEventListener('change', inputHandler, true);
    document.body.addEventListener('blur', inputHandler, true);

    this.cleanupCallbacks.push(() => {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      document.body.removeEventListener('input', inputHandler, true);
      document.body.removeEventListener('change', inputHandler, true);
      document.body.removeEventListener('blur', inputHandler, true);
      debouncedMutationHandler.cancel();
      debouncedInputHandler.cancel();
    });
  }

  // ── Full Validation Loop ───────────────────────────────────────────────

  /**
   * Start the full end-to-end validation loop.
   *
   * This is the primary orchestrator for the Meta adapter. It wires together:
   *   1. MutationObserver field change detection
   *   2. Rule evaluation engine
   *   3. UI component updates (banners, sidebar, score)
   *   4. Debounced compliance event batching to the API
   *
   * @param rules - The set of rules to evaluate
   * @param namingTemplates - Naming convention templates
   * @param options - Configuration options (API URL, auth token)
   */
  async startValidationLoop(
    rules: Rule[],
    namingTemplates: NamingTemplate[] = [],
    options?: {
      apiBaseUrl?: string;
      extensionToken?: string;
    },
  ): Promise<void> {
    this.rules = rules;
    this.namingTemplates = namingTemplates;
    this.apiBaseUrl = options?.apiBaseUrl ?? '';
    this.extensionToken = options?.extensionToken ?? '';
    this.validationLoopActive = true;

    console.log(`[INIT] 🚀 Starting validation loop with ${rules.length} rules`);
    rules.forEach(rule => {
      console.log(`[INIT]    - ${rule.name} (${rule.ruleType}, ${rule.enforcement})`);
    });

    // Initialize UI components
    console.log('[INIT] 🎨 Initializing UI components...');
    this.sidebar = new GuidelinesSidebar();
    console.log('[INIT] ✅ Guidelines Sidebar created');
    this.creationBlocker = new CreationBlocker();
    console.log('[INIT] ✅ Creation Blocker created');
    this.commentModal = new CommentModal();
    console.log('[INIT] ✅ Comment Modal created');

    // Wire up "click to go to field" navigation callbacks
    console.log('[INIT] 🔗 Wiring up "click to go to field" callbacks...');
    this.creationBlocker.onViolationClick = (ruleId: string) => {
      console.log(`[CLICK-HANDLER] 🖱️ Creation Blocker violation clicked: ${ruleId}`);
      this.scrollToRuleField(ruleId);
    };

    this.sidebar.onScrollToField = (ruleId: string) => {
      console.log(`[CLICK-HANDLER] 🖱️ Sidebar "go to field" clicked: ${ruleId}`);
      this.scrollToRuleField(ruleId);
    };
    console.log('[INIT] ✅ Callbacks wired');

    // Set up the debounced compliance event poster
    this.debouncedPostComplianceEvents = debounce(() => {
      this.flushComplianceEvents();
    }, COMPLIANCE_EVENT_DEBOUNCE_MS);

    // Set up field change observation with validation loop
    console.log('[INIT] 👀 Setting up field change observation...');
    this.observeFieldChanges((_fieldPath: string, _value: unknown) => {
      console.log('[FIELD-CHANGE] 🔔 Field change detected, triggering validation loop');
      this.runValidationLoop();
    });

    // Set up creation interception with full validation
    console.log('[INIT] 🛡️ Setting up creation interception...');
    this.setupValidationInterception();

    // Listen for SPA navigation via history.pushState interception
    // (injected by service-worker.ts into MAIN world)
    const pushStateHandler = () => {
      logger.debug('SPA navigation detected via pushState');
      this.runValidationLoop();
    };
    window.addEventListener('governance:pushstate', pushStateHandler);
    this.cleanupCallbacks.push(() => {
      window.removeEventListener('governance:pushstate', pushStateHandler);
    });

    // Run initial evaluation
    await this.runValidationLoop();
  }

  /**
   * Run the full validation loop: extract -> evaluate -> update UI -> report.
   *
   * This is the core method called on every relevant DOM mutation.
   * It extracts field values, runs rule evaluation, and updates all
   * UI components in a single pass.
   */
  async runValidationLoop(): Promise<void> {
    console.log('[VALIDATION] 🔄 Validation loop triggered');

    if (!this.validationLoopActive) {
      console.log('[VALIDATION] ⏸️ Validation loop is inactive, skipping');
      return;
    }

    if (this.rules.length === 0) {
      console.log('[VALIDATION] ⚠️ No rules loaded, skipping validation');
      return;
    }

    console.log(`[VALIDATION] 📋 Running validation with ${this.rules.length} rules`);

    try {
      // 1. Extract all field values from DOM
      console.log('[VALIDATION] 🔍 Step 1: Extracting field values from DOM...');
      const fieldValues = await this.extractFieldValues();
      console.log('[VALIDATION] ✅ Extracted fields:', Object.keys(fieldValues));

      // 2. Convert flat field map to nested structure for rule evaluation
      console.log('[VALIDATION] 🔄 Step 2: Converting to nested structure...');
      const nestedValues = toNestedObject(fieldValues);
      console.log('[VALIDATION] ✅ Nested values ready:', nestedValues);

      // 3. Run rule evaluation engine
      console.log('[VALIDATION] ⚖️ Step 3: Evaluating rules...');
      this.evaluationResults = evaluateRules(nestedValues, this.rules, this.namingTemplates);

      const passedRules = this.evaluationResults.filter(r => r.passed);
      const failedRules = this.evaluationResults.filter(r => !r.passed);
      console.log(`[VALIDATION] 📊 Rule results: ${passedRules.length} passed, ${failedRules.length} failed`);

      failedRules.forEach(result => {
        const rule = this.rules.find((candidate) => candidate.id === result.ruleId);
        console.log(`[VALIDATION] ❌ Failed: ${rule?.name ?? result.ruleName}`, {
          enforcement: rule?.enforcement ?? result.enforcement,
          fieldPath: rule?.condition?.field,
          status: result.status,
          actualValue: result.fieldValue,
          expectedValue: result.expectedValue,
        });
      });

      // 4. Compute compliance score
      console.log('[VALIDATION] 🧮 Step 4: Computing compliance score...');
      const score = computeScore(this.evaluationResults);
      console.log(`[VALIDATION] 📈 Score: ${score.overall}/100 (${score.passedCount}/${score.totalCount} rules passed)`);

      // 5. Update all UI components
      console.log('[VALIDATION] 🎨 Step 5: Updating UI components...');
      this.updateValidationUI(this.evaluationResults, score, fieldValues);
      console.log('[VALIDATION] ✅ UI updated');

      // 6. Update body CSS state classes
      this.updateBodyClasses(this.evaluationResults);

      // 7. Queue compliance events for debounced POST
      this.queueComplianceEvents(this.evaluationResults, fieldValues);

      console.log(`[VALIDATION] ✨ Validation complete: ${score.passedCount}/${score.totalCount} rules passed (score: ${score.overall})`);
    } catch (error) {
      console.error('[VALIDATION] 💥 Error during validation loop:', error);
    }
  }

  /**
   * Update rules at runtime (e.g. when rules-updated push arrives).
   *
   * @param rules - New set of rules
   * @param namingTemplates - New naming templates
   */
  async updateRules(rules: Rule[], namingTemplates: NamingTemplate[] = []): Promise<void> {
    this.rules = rules;
    this.namingTemplates = namingTemplates;
    logger.info(`Rules updated: ${rules.length} rules`);

    // Re-run validation with new rules
    if (this.validationLoopActive) {
      await this.runValidationLoop();
    }
  }

  /**
   * Get current evaluation results (for external consumers).
   */
  getEvaluationResults(): RuleEvaluationResult[] {
    return [...this.evaluationResults];
  }

  /**
   * Get current compliance score (for external consumers).
   */
  getComplianceScore(): ComplianceScore {
    return computeScore(this.evaluationResults);
  }

  // ── UI Update Methods ──────────────────────────────────────────────────

  /**
   * Update all validation UI components.
   *
   * @param results - Rule evaluation results
   * @param score - Computed compliance score
   * @param fieldValues - Current field values (for naming preview)
   */
  private updateValidationUI(
    results: RuleEvaluationResult[],
    score: ComplianceScore,
    _fieldValues: Record<string, unknown>,
  ): void {
    console.log('[UI-UPDATE] 🎨 Starting UI updates...');

    // A. Update validation banners (inline field-level indicators)
    console.log('[UI-UPDATE] 🏷️ Removing old validation banners...');
    removeValidationBanners();

    let bannersRendered = 0;
    for (const result of results) {
      const rule = this.rules.find((r) => r.id === result.ruleId);
      if (!rule) continue;

      const fieldPath = rule.condition.field ?? '';
      const injectionPoint = this.getInjectionPoint(rule.ruleType, fieldPath);
      if (!injectionPoint) {
        console.log(`[UI-UPDATE] ⚠️ No injection point for ${fieldPath} (${rule.name})`);
        continue;
      }

      const bannerStatus = result.status === 'unknown'
        ? 'warning'
        : result.passed ? 'success' : 'error';

      console.log(`[UI-UPDATE] ➕ Rendering banner for ${fieldPath}:`, {
        ruleName: rule.name,
        passed: result.passed,
        status: bannerStatus
      });

      const banner = renderValidationBanner({
        message: result.status === 'unknown' ? `${result.message} (couldn't verify)` : result.message,
        status: bannerStatus,
        fieldPath,
        injectionPoint,
      });
      this.trackInjectedElement(banner);
      bannersRendered++;
    }
    console.log(`[UI-UPDATE] ✅ Rendered ${bannersRendered} validation banners`);

    // B. Update guidelines sidebar
    if (this.sidebar) {
      console.log('[UI-UPDATE] 📊 Updating Guidelines Sidebar...');
      this.sidebar.update(results);
      console.log('[UI-UPDATE] ✅ Sidebar updated');
    } else {
      console.log('[UI-UPDATE] ⚠️ Sidebar not initialized');
    }

    // C. Update campaign score widget
    console.log('[UI-UPDATE] 🏆 Updating Campaign Score widget:', {
      score: score.overall,
      passed: score.passedCount,
      total: score.totalCount
    });
    renderCampaignScore({
      score: score.overall,
      passedCount: score.passedCount,
      totalCount: score.totalCount,
    });

    // D. Update creation blocker state
    const blockingViolations = results.filter(
      (r) => !r.passed && r.enforcement === EnforcementMode.BLOCKING,
    );

    console.log(`[UI-UPDATE] 🚫 Blocking violations: ${blockingViolations.length}`);
    if (blockingViolations.length > 0) {
      console.log('[UI-UPDATE] ⏳ Blocking violations present (blocker will show when user clicks Publish)');
      blockingViolations.forEach(v => {
        console.log(`[UI-UPDATE]    - ${v.ruleName}`);
      });
    } else if (this.creationBlocker) {
      console.log('[UI-UPDATE] ✅ No blocking violations - hiding creation blocker');
      this.creationBlocker.hide();
    }
  }

  /**
   * Update body-level CSS state classes for validation state propagation.
   *
   * Pattern: body.dlg-invalid-{fieldname} / body.dlg-valid-{fieldname}
   *
   * Uses the DLG namespace prefix (not gov-) to match the project's
   * branding and avoid collisions with other governance tools.
   */
  private updateBodyClasses(results: RuleEvaluationResult[]): void {
    // Remove existing governance classes (both old gov- and new dlg- prefixes)
    const existingClasses = Array.from(document.body.classList).filter(
      (c) => c.startsWith('dlg-valid-') || c.startsWith('dlg-invalid-') || c.startsWith('dlg-unknown-') ||
             c.startsWith('gov-valid-') || c.startsWith('gov-invalid-') || c.startsWith('gov-unknown-'),
    );
    for (const cls of existingClasses) {
      document.body.classList.remove(cls);
    }

    // Add new classes based on results using dlg- prefix
    for (const result of results) {
      const rule = this.rules.find((r) => r.id === result.ruleId);
      if (!rule?.condition.field) continue;

      const fieldSlug = rule.condition.field.replace(/\./g, '-');
      const prefix = result.status === 'unknown'
        ? 'dlg-unknown'
        : result.passed ? 'dlg-valid' : 'dlg-invalid';
      document.body.classList.add(`${prefix}-${fieldSlug}`);
    }
  }

  // ── Creation Interception with Validation ──────────────────────────────

  /**
   * Set up publish button interception with full validation checking.
   *
   * When the user clicks Publish/Next:
   * 1. Check for blocking violations -> show CreationBlocker
   * 2. Check for comment-required violations -> show CommentModal
   * 3. If all clear, allow the creation to proceed
   */
  private setupValidationInterception(): void {
    // Intercept Meta's native dialogs (e.g. "Additional business info") that
    // may appear BEFORE our capture-phase click listener fires.
    this.publishDialogObserver = new MutationObserver((mutations) => {
      // Only act when creation is blocked
      if (!document.body.classList.contains('governance-creation-blocked')) return;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          // Detect Meta's publish confirmation / info dialogs
          const isPublishDialog = node.querySelector?.(
            '[data-surface*="publish"], [data-surface*="completion"], [aria-label*="Publish"], [aria-label*="Additional"]'
          );
          if (isPublishDialog) {
            // Close Meta's dialog and show DLG blocker instead
            const closeBtn = node.querySelector<HTMLElement>('[aria-label="Close"], [aria-label="close"]');
            if (closeBtn) closeBtn.click();

            const blockingViolations = this.evaluationResults.filter(
              (r) => !r.passed && r.enforcement === EnforcementMode.BLOCKING,
            );
            if (blockingViolations.length > 0 && this.creationBlocker) {
              this.creationBlocker.show(blockingViolations);
            }
          }
        }
      }
    });
    this.publishDialogObserver.observe(document.body, { childList: true, subtree: true });

    this.cleanupCallbacks.push(() => {
      if (this.publishDialogObserver) {
        this.publishDialogObserver.disconnect();
        this.publishDialogObserver = null;
      }
    });

    this.interceptCreation((_allow: boolean) => {
      // The callback is called with `true` when the user clicks
      // Publish/Next. We inspect current violations and take action.

      // Check for blocking violations
      const blockingViolations = this.evaluationResults.filter(
        (r) => !r.passed && r.enforcement === EnforcementMode.BLOCKING,
      );

      if (blockingViolations.length > 0) {
        // Mark creation as blocked; the capture-phase handler will
        // call preventDefault() when it sees this class.
        document.body.classList.add('governance-creation-blocked');
        if (this.creationBlocker) {
          this.creationBlocker.show(blockingViolations);
        }
        return;
      }

      // Check for SECOND_APPROVER violations
      const secondApprover = this.evaluationResults.filter(
        (r) => !r.passed && r.enforcement === EnforcementMode.SECOND_APPROVER,
      );

      if (secondApprover.length > 0) {
        document.body.classList.add('governance-creation-blocked');
        // Request approval for the first SECOND_APPROVER violation
        this.handleApprovalRequest(secondApprover[0]);
        return;
      }

      // Check for comment-required violations
      const commentRequired = this.evaluationResults.filter(
        (r) => !r.passed && r.enforcement === EnforcementMode.COMMENT_REQUIRED,
      );

      if (commentRequired.length > 0) {
        document.body.classList.add('governance-creation-blocked');
        // Show comment modal for the first comment-required violation
        const firstViolation = commentRequired[0];
        const entityName =
          (this.fieldValues['campaign.name'] as string) ??
          (this.fieldValues['ad_set.name'] as string) ??
          'Unknown';
        if (this.commentModal) {
          this.commentModal.show(
            firstViolation,
            entityName,
            async (ruleId: string, _entityName: string, comment: string) => {
              logger.info(`Comment submitted for rule ${ruleId}: ${comment.substring(0, 50)}...`);
              // Post the comment to the compliance API
              await this.postComplianceComment(ruleId, comment);
              // Remove the blocked class so next click proceeds
              document.body.classList.remove('governance-creation-blocked');
            },
            () => {
              logger.info('Comment modal cancelled');
              document.body.classList.remove('governance-creation-blocked');
            },
          );
        }
        return;
      }

      // All clear, ensure the blocked class is removed
      document.body.classList.remove('governance-creation-blocked');
    });
  }

  // ── Compliance Event Reporting ─────────────────────────────────────────

  /**
   * Queue compliance events for debounced batch POST.
   *
   * Events are accumulated in `pendingComplianceEvents` and flushed to
   * `/api/v1/compliance/events` at most once every 5 seconds.
   *
   * @param results - Current rule evaluation results
   * @param fieldValues - Current field values
   */
  private queueComplianceEvents(
    results: RuleEvaluationResult[],
    fieldValues: Record<string, unknown>,
  ): void {
    const context = this.detectContext();
    if (!context) return;

    // Build compliance events from evaluation results
    const events: Omit<ComplianceEvent, 'id' | 'createdAt'>[] = results.map((result) => {
      return {
        organizationId: '', // Populated by the backend from auth token
        buyerId: '', // Populated by the backend from auth token
        adAccountId: context.accountId,
        platform: Platform.META,
        entityLevel: context.entityLevel,
        entityName: (fieldValues['campaign.name'] as string) ?? 'Unknown',
        ruleId: result.ruleId,
        status: result.passed ? 'passed' : 'violated',
        fieldValue: result.fieldValue !== undefined ? String(result.fieldValue) : undefined,
        expectedValue: result.expectedValue !== undefined ? String(result.expectedValue) : undefined,
      } as Omit<ComplianceEvent, 'id' | 'createdAt'>;
    });

    // Replace pending events with latest snapshot (not accumulate)
    this.pendingComplianceEvents = events;

    // Trigger the debounced flush
    if (this.debouncedPostComplianceEvents) {
      this.debouncedPostComplianceEvents();
    }
  }

  /**
   * Flush pending compliance events to the API.
   *
   * POST /api/v1/compliance/events with the batched events.
   * Uses the extension token for authentication.
   */
  private async flushComplianceEvents(): Promise<void> {
    if (this.pendingComplianceEvents.length === 0) return;

    const eventsToPost = [...this.pendingComplianceEvents];
    this.pendingComplianceEvents = [];

    // Try chrome.runtime messaging first (service worker handles the fetch)
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        await chrome.runtime.sendMessage({
          type: 'reportCompliance',
          events: eventsToPost,
        });
        logger.debug(`Reported ${eventsToPost.length} compliance events via service worker`);
        return;
      }
    } catch {
      // Fallback to direct fetch below
    }

    // Direct fetch fallback (for test environments without service worker)
    if (!this.apiBaseUrl) return;

    // Track retry attempt (assume 0 for first attempt, could be enhanced to track actual retry count)
    const retryAttempt = 0;

    try {
      const payload: PostComplianceEventsRequest = {
        events: eventsToPost,
      };

      const response = await fetch(`${this.apiBaseUrl}/api/v1/compliance/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.extensionToken
            ? { Authorization: `Bearer ${this.extensionToken}` }
            : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        logger.warn(`Compliance event POST failed: ${response.status} ${response.statusText}`);

        // Log telemetry: failure
        await logComplianceEvent({
          timestamp: Date.now(),
          success: false,
          eventCount: eventsToPost.length,
          statusCode: response.status,
          error: `${response.status} ${response.statusText}`,
          retryAttempt,
        });

        // Re-queue the events for retry on next cycle
        this.pendingComplianceEvents = [...eventsToPost, ...this.pendingComplianceEvents];
      } else {
        logger.debug(`Posted ${eventsToPost.length} compliance events to API`);

        // Log telemetry: success
        await logComplianceEvent({
          timestamp: Date.now(),
          success: true,
          eventCount: eventsToPost.length,
          statusCode: response.status,
          retryAttempt,
        });
      }
    } catch (error) {
      logger.warn('Failed to POST compliance events:', error);

      // Log telemetry: error
      await logComplianceEvent({
        timestamp: Date.now(),
        success: false,
        eventCount: eventsToPost.length,
        error: error instanceof Error ? error.message : String(error),
        retryAttempt,
      });

      // Re-queue the events for retry on next cycle
      this.pendingComplianceEvents = [...eventsToPost, ...this.pendingComplianceEvents];
    }
  }

  /**
   * Post a buyer comment for a comment-required rule violation.
   *
   * @param ruleId - The rule ID the comment applies to
   * @param comment - The buyer's justification comment
   */
  private async postComplianceComment(ruleId: string, comment: string): Promise<void> {
    const entityName =
      (this.fieldValues['campaign.name'] as string) ??
      (this.fieldValues['ad_set.name'] as string) ??
      'Unknown';

    // Try chrome.runtime messaging first
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        await chrome.runtime.sendMessage({
          type: 'postComment',
          ruleId,
          entityName,
          comment,
        });
        return;
      }
    } catch {
      // Fallback to direct fetch
    }

    if (!this.apiBaseUrl) return;

    try {
      await fetch(`${this.apiBaseUrl}/api/v1/compliance/comment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.extensionToken
            ? { Authorization: `Bearer ${this.extensionToken}` }
            : {}),
        },
        body: JSON.stringify({ ruleId, entityName, comment }),
      });
    } catch (error) {
      logger.error('Failed to post compliance comment:', error);
    }
  }

  /**
   * Handle approval request for SECOND_APPROVER violations.
   *
   * Creates an approval request, shows the approval pending modal,
   * and handles approved/rejected/cancelled outcomes.
   *
   * @param violation - The rule evaluation result that requires approval
   */
  private async handleApprovalRequest(violation: RuleEvaluationResult): Promise<void> {
    // Find the rule to get approver info
    const rule = this.rules.find((r) => r.id === violation.ruleId);
    if (!rule) {
      logger.error('Cannot find rule for approval request:', violation.ruleId);
      document.body.classList.remove('governance-creation-blocked');
      return;
    }

    // Get approver ID from rule metadata
    // Note: Backend Task #33 adds approverId to rule schema
    const approverId = (rule as unknown as { approverId?: string }).approverId;
    if (!approverId) {
      logger.error('Rule missing approverId for SECOND_APPROVER enforcement:', rule.id);
      document.body.classList.remove('governance-creation-blocked');
      return;
    }

    // Get context for campaign snapshot
    const context = this.detectContext();
    if (!context) {
      logger.error('Cannot detect context for approval request');
      document.body.classList.remove('governance-creation-blocked');
      return;
    }

    // Create campaign snapshot
    const campaignSnapshot = {
      ...this.fieldValues,
      timestamp: new Date().toISOString(),
      platform: 'meta',
      entityLevel: context.entityLevel,
      accountId: context.accountId,
    };

    try {
      // Create approval request via API
      const approval = await createApprovalRequest({
        ruleId: rule.id,
        approverId,
        campaignSnapshot,
      });

      logger.info('Approval request created:', approval.id);

      // Store pending approval in chrome.storage.local for persistence
      await chrome.storage.local.set({
        [`approval_${approval.id}`]: {
          id: approval.id,
          ruleId: rule.id,
          status: 'pending',
          createdAt: Date.now(),
        },
      });

      // Show approval pending modal
      this.approvalModal = new ApprovalPendingModal({
        approverName: approval.approverName,
        approverEmail: approval.approverEmail,
        requestId: approval.id,
        onApproved: () => {
          logger.info('Approval granted');
          // Remove approval from storage
          chrome.storage.local.remove(`approval_${approval.id}`);
          // Remove blocked class so next publish click proceeds
          document.body.classList.remove('governance-creation-blocked');
          // Show success notification
          this.showNotification('Approval granted. You can now publish.', 'success');
        },
        onRejected: (reason) => {
          logger.info('Approval rejected:', reason);
          // Remove approval from storage
          chrome.storage.local.remove(`approval_${approval.id}`);
          // Show rejection notification
          this.showNotification(`Approval rejected: ${reason}`, 'error');
          document.body.classList.remove('governance-creation-blocked');
        },
        onCancel: () => {
          logger.info('Approval request cancelled');
          // Remove approval from storage
          chrome.storage.local.remove(`approval_${approval.id}`);
          // Show cancellation notification
          this.showNotification('Approval request cancelled', 'info');
          document.body.classList.remove('governance-creation-blocked');
        },
      });
    } catch (error) {
      logger.error('Failed to create approval request:', error);
      this.showNotification('Failed to request approval. Please try again.', 'error');
      document.body.classList.remove('governance-creation-blocked');
    }
  }

  /**
   * Show a simple notification to the user.
   *
   * Uses browser console for now. Could be enhanced with a toast component.
   *
   * @param message - Notification message
   * @param type - Notification type (success, error, info)
   */
  private showNotification(message: string, type: 'success' | 'error' | 'info'): void {
    // Simple console notification for now
    // TODO: Implement a toast notification component
    const prefix = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
    logger.info(`${prefix} ${message}`);
  }

  // ── Multi-Entity Flow ──────────────────────────────────────────────────

  /**
   * Detect entity-level transitions in the multi-entity creation flow.
   *
   * When the user clicks "Next" to go from campaign -> ad set -> ad,
   * this method detects the transition and:
   * 1. Updates the current entity level
   * 2. Re-evaluates rules scoped to the new entity level
   * 3. Clears previous entity-level validation UI
   */
  private detectEntityTransition(): void {
    if (!this.validationLoopActive) return;

    const newEntityLevel = detectEntityLevelFromDOM();
    if (!newEntityLevel || newEntityLevel === this.currentEntityLevel) return;

    const previousLevel = this.currentEntityLevel;
    this.currentEntityLevel = newEntityLevel;

    logger.info(`Entity level transition: ${previousLevel} -> ${newEntityLevel}`);

    // Clear previous validation UI
    removeValidationBanners();

    // Re-run validation for the new entity level
    this.runValidationLoop();

    // Dispatch custom event for other components to react
    window.dispatchEvent(
      new CustomEvent('governance:entity-transition', {
        detail: { from: previousLevel, to: newEntityLevel },
      }),
    );
  }

  /**
   * Get the current entity level.
   */
  getCurrentEntityLevel(): EntityLevel {
    return this.currentEntityLevel;
  }

  // ── cleanup ────────────────────────────────────────────────────────────

  /**
   * Clean up all injections, observers, event listeners, and UI components.
   */
  cleanup(): void {
    this.validationLoopActive = false;

    // Run all registered cleanup callbacks
    for (const cleanupFn of this.cleanupCallbacks) {
      try {
        cleanupFn();
      } catch (error) {
        console.warn('[Governance] Error during cleanup:', error);
      }
    }
    this.cleanupCallbacks = [];

    // Disconnect observers
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.publishDialogObserver) {
      this.publishDialogObserver.disconnect();
      this.publishDialogObserver = null;
    }

    // Cancel debounced compliance event poster
    if (this.debouncedPostComplianceEvents) {
      this.debouncedPostComplianceEvents.cancel();
      this.debouncedPostComplianceEvents = null;
    }

    // Flush any remaining compliance events
    if (this.pendingComplianceEvents.length > 0) {
      this.flushComplianceEvents();
    }

    // Destroy UI components
    if (this.sidebar) {
      this.sidebar.destroy();
      this.sidebar = null;
    }
    if (this.creationBlocker) {
      this.creationBlocker.destroy();
      this.creationBlocker = null;
    }
    if (this.commentModal) {
      this.commentModal.destroy();
      this.commentModal = null;
    }
    if (this.approvalModal) {
      this.approvalModal.destroy();
      this.approvalModal = null;
    }

    removeValidationBanners();
    removeCampaignScore();

    // Remove injected elements
    for (const el of this.injectedElements) {
      try {
        el.remove();
      } catch {
        // Element may already be removed
      }
    }
    this.injectedElements.clear();

    // Clear cached state
    this.fieldValues = {};
    this.evaluationResults = [];
    this.rules = [];
    this.namingTemplates = [];
    this.interceptedButtons = new WeakSet();
    this.pendingComplianceEvents = [];

    // Destroy the remoteEval batcher
    destroyRemoteEvalBatcher();

    // Remove body-level state classes (both old gov-/gg- and new dlg- prefixes)
    const bodyClasses = document.body.classList;
    const governanceClasses: string[] = [];
    for (const cls of bodyClasses) {
      if (
        cls.startsWith('dlg-') ||
        cls.startsWith('gg-') ||
        cls.startsWith('governance-') ||
        cls.startsWith('gov-valid-') ||
        cls.startsWith('gov-invalid-')
      ) {
        governanceClasses.push(cls);
      }
    }
    for (const cls of governanceClasses) {
      bodyClasses.remove(cls);
    }

    // Remove loaded attribute
    document.body.removeAttribute(LOADED_ATTRIBUTE);
  }

  // ── Public Helpers ─────────────────────────────────────────────────────

  /**
   * Register an injected DOM element for tracking.
   *
   * @param element - The injected DOM element
   */
  trackInjectedElement(element: HTMLElement): void {
    this.injectedElements.add(element);
  }

  /**
   * Check if the adapter has been loaded on this page.
   *
   * @returns true if already loaded
   */
  isLoaded(): boolean {
    return document.body.hasAttribute(LOADED_ATTRIBUTE);
  }

  /**
   * Mark this adapter as loaded on the current page.
   */
  markLoaded(): void {
    document.body.setAttribute(LOADED_ATTRIBUTE, 'true');
  }

  // ── Private Methods ────────────────────────────────────────────────────

  /**
   * Scroll to and highlight the field associated with a rule.
   *
   * Used by the sidebar's "click to go to field" and the creation
   * blocker's violation row click handlers.
   *
   * @param ruleId - The ID of the rule whose field to scroll to
   */
  private scrollToRuleField(ruleId: string): void {
    console.log(`[SCROLL-TO-FIELD] 🎯 Click detected for rule: ${ruleId}`);

    const rule = this.rules.find((r) => r.id === ruleId);
    if (!rule) {
      console.error(`[SCROLL-TO-FIELD] ❌ Rule not found: ${ruleId}. Available rules:`, this.rules.map(r => r.id));
      return;
    }

    const fieldPath = rule.condition.field ?? '';
    const ruleType = rule.ruleType;
    console.log(`[SCROLL-TO-FIELD] 📍 Looking for field: ${fieldPath}, ruleType: ${ruleType}, entityLevel: ${this.currentEntityLevel}`);

    const injectionPoint = getInjectionPointForField(ruleType, fieldPath);
    console.log(`[SCROLL-TO-FIELD] 🔍 Injection point result:`, {
      found: !!injectionPoint?.element,
      element: injectionPoint?.element,
      position: injectionPoint?.position,
      elementTag: injectionPoint?.element?.tagName,
      elementId: injectionPoint?.element?.id,
      elementClasses: injectionPoint?.element?.className
    });

    if (injectionPoint?.element) {
      console.log(`[SCROLL-TO-FIELD] ✅ Scrolling to element:`, injectionPoint.element);
      injectionPoint.element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Flash highlight effect
      const el = injectionPoint.element;
      el.style.outline = '3px solid #4F46E5';
      el.style.outlineOffset = '4px';
      el.style.transition = 'outline 200ms ease, outline-offset 200ms ease';
      setTimeout(() => {
        el.style.outline = '';
        el.style.outlineOffset = '';
      }, 2000);
      console.log(`[SCROLL-TO-FIELD] 🎨 Applied highlight to ${fieldPath}`);
      return;
    }

    // Fallback: try to find the field's section by well-known selectors
    const sectionSelectors: Record<string, string> = {
      'campaign.name': '[aria-label*="Campaign name"], input[aria-label*="Campaign name"]',
      'campaign.budget_value': '[aria-label*="Budget"], [data-testid*="budget"]',
      'campaign.budget_type': '[aria-label*="Budget type"], [data-testid*="budget"]',
      'campaign.objective': '[data-testid*="objective"], [role="radiogroup"]',
      'ad_set.targeting.geo_locations': '[aria-label*="Location"], [data-testid*="location"]',
      'ad_set.name': 'input[aria-label*="Ad set name"]',
      'ad.name': 'input[aria-label*="Ad name"]',
      'ad.creative.destination_url': 'input[aria-label*="Website URL"]',
    };

    const selector = sectionSelectors[fieldPath];
    if (selector) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  /**
   * Check if any injected elements have been removed from the DOM
   * by React reconciliation. Emits a custom event so the injection
   * orchestrator can re-inject them.
   */
  private checkInjectedElements(): void {
    for (const el of this.injectedElements) {
      if (!document.body.contains(el)) {
        this.injectedElements.delete(el);

        window.dispatchEvent(
          new CustomEvent('governance:injection-removed', {
            detail: { element: el },
          }),
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Infer entity level from URL path segments when the `tool=` parameter
 * is not available.
 *
 * @param url - The full URL string
 * @returns Inferred EntityLevel or null
 */
function inferEntityLevelFromUrl(url: URL): EntityLevel | null {
  const pathname = url.pathname.toLowerCase();
  const params = url.searchParams;
  const currentStep = params.get('current_step');

  // Strongest signals: explicit editor paths and entity IDs in query params.
  if (
    params.has('selected_ad_ids') ||
    pathname.includes('/ads/edit') ||
    pathname.includes('/ads/create')
  ) {
    return EntityLevel.AD;
  }

  if (
    params.has('selected_adset_ids') ||
    pathname.includes('/adsets/edit') ||
    pathname.includes('/ad_sets/edit') ||
    pathname.includes('/adgroups/edit') ||
    pathname.includes('/adsets/create') ||
    pathname.includes('/ad_sets/create') ||
    pathname.includes('/adgroups/create')
  ) {
    return EntityLevel.AD_SET;
  }

  // Multi-step creation flows often stay on /campaigns while the step changes.
  if (currentStep === '2') {
    return EntityLevel.AD;
  }
  if (currentStep === '1') {
    return EntityLevel.AD_SET;
  }
  if (currentStep === '0') {
    return EntityLevel.CAMPAIGN;
  }

  if (pathname.includes('/campaigns')) {
    return EntityLevel.CAMPAIGN;
  }

  return null;
}

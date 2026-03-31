/**
 * Google Ads Platform Adapter
 *
 * Implements the PlatformAdapter interface for Google Ads. Responsible for:
 *  - Detecting the current context (account, entity level, view) from URL/DOM
 *  - Extracting field values from Material Design components
 *  - Resolving injection points for governance UI
 *  - Observing field changes via MutationObserver (including Shadow DOM)
 *  - Intercepting campaign creation to enforce blocking rules
 *  - Full validation loop: field change -> evaluate -> update UI -> POST events
 *  - Multi-step wizard navigation and step-scoped validation
 *
 * Google Ads specifics:
 *  - Angular-based SPA with Material Design components
 *  - Multi-step campaign creation wizard
 *  - Some components use Shadow DOM
 *  - Customer ID in URL param `__u` (format: `123-456-7890`)
 */

import type {
  PlatformAdapter,
  ExtensionContext,
  InjectionPoint,
  Rule,
  NamingTemplate,
  RuleEvaluationResult,
  ComplianceScore,
} from '@media-buying-governance/shared';
import {
  Platform,
  EntityLevel,
  ExtensionView,
  EnforcementMode,
} from '@media-buying-governance/shared';
import {
  extractAllFieldValues,
  extractFieldValuesViaRemoteEval,
} from './google-fields.js';
import {
  GOOGLE_INJECTION_SELECTORS,
  KNOWN_SHADOW_HOSTS,
  queryByChain,
  queryWithShadowDom,
  findButtonByText,
} from './google-selectors.js';
import { evaluateRules, computeScore } from '../../rules/evaluator.js';
import {
  renderValidationBanner,
  removeValidationBanners,
} from '../../components/validation-banner.js';
import { GuidelinesSidebar } from '../../components/guidelines-sidebar.js';
import {
  renderCampaignScore,
  removeCampaignScore,
} from '../../components/campaign-score.js';
import { CreationBlocker } from '../../components/creation-blocker.js';
import { CommentModal } from '../../components/comment-modal.js';
import { ApprovalPendingModal } from '../../components/approval-pending-modal.js';
import { createApprovalRequest } from '../../api/client.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Debounce delay for MutationObserver callbacks (ms). */
const OBSERVER_DEBOUNCE_MS = 300;

/** Debounce delay for compliance event POST (ms). */
const COMPLIANCE_POST_DEBOUNCE_MS = 2000;

/** Google Ads base URL patterns */
const GOOGLE_ADS_HOSTNAME = 'ads.google.com';

/** Compliance events API endpoint */
const COMPLIANCE_EVENTS_ENDPOINT = '/api/v1/compliance/events';

/**
 * Check whether the given URL is a localhost test-mode page that
 * should be treated as Google Ads. Convention: the path
 * contains "google-" (e.g. `/google-campaign-wizard.html`).
 */
function isLocalhostGoogleFixture(url: URL): boolean {
  return (
    url.hostname === 'localhost' &&
    url.protocol === 'http:' &&
    /\/.*google-/.test(url.pathname)
  );
}

/** URL path patterns for view detection */
const URL_PATTERNS = {
  campaignCreate: /\/aw\/campaigns\/(?:new|create)/i,
  campaignEdit: /\/aw\/campaigns\/(\d+)\/edit/i,
  adGroupCreate: /\/aw\/adgroups\/(?:new|create)/i,
  adGroupEdit: /\/aw\/adgroups\/(\d+)\/edit/i,
  adCreate: /\/aw\/ads\/(?:new|create)/i,
  adEdit: /\/aw\/ads\/(\d+)\/edit/i,
  campaignWizard: /\/aw\/campaigns\/wizard/i,
  overview: /\/aw\/overview/i,
} as const;

/** Regex to extract customer ID from `__u` query param. */
const CUSTOMER_ID_PARAM_REGEX = /^(\d{3}-?\d{3}-?\d{4})$/;

/**
 * Wizard step names in order. Mapped from stepper DOM or URL hash.
 */
export enum WizardStep {
  GOAL = 'goal',
  CAMPAIGN_TYPE = 'campaign_type',
  CAMPAIGN_SETTINGS = 'campaign_settings',
  AD_GROUPS = 'ad_groups',
  ADS = 'ads',
  REVIEW = 'review',
}

/**
 * Maps wizard step to the field path prefixes relevant to that step.
 */
const STEP_FIELD_PREFIXES: Record<WizardStep, readonly string[]> = {
  [WizardStep.GOAL]: ['campaign.type'],
  [WizardStep.CAMPAIGN_TYPE]: ['campaign.type'],
  [WizardStep.CAMPAIGN_SETTINGS]: [
    'campaign.name',
    'campaign.budget_value',
    'campaign.bidding_strategy',
    'campaign.geo_targets',
    'campaign.languages',
    'campaign.brand_safety',
    'campaign.start_date',
    'campaign.end_date',
  ],
  [WizardStep.AD_GROUPS]: ['ad_group.name', 'ad_group.cpc_bid'],
  [WizardStep.ADS]: [
    'ad.headlines',
    'ad.descriptions',
    'ad.final_url',
    'ad.display_path',
  ],
  [WizardStep.REVIEW]: [],
};

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Simple debounce that collapses rapid calls into one trailing invocation.
 */
function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  };
}

/**
 * Deep-equal comparison for primitive values and shallow arrays.
 * Used to detect field value changes without triggering on identical values.
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a === undefined || b === undefined) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => val === b[i]);
  }

  return false;
}

// ---------------------------------------------------------------------------
// GoogleAdsAdapter
// ---------------------------------------------------------------------------

/**
 * Platform adapter for Google Ads.
 *
 * Implements the full end-to-end validation loop:
 *   Field change -> MutationObserver fires -> extractFieldValues()
 *   -> run rule evaluation -> update ValidationBanners
 *   -> update GuidelinesSidebar -> update CampaignScore
 *   -> debounced POST to /api/v1/compliance/events
 *
 * Usage:
 * ```ts
 * const adapter = new GoogleAdsAdapter();
 * const ctx = adapter.detectContext();
 * if (ctx) {
 *   await adapter.initializeValidationLoop(rules, namingTemplates);
 * }
 * ```
 */
export class GoogleAdsAdapter implements PlatformAdapter {
  /** Platform identifier */
  readonly platform = Platform.GOOGLE_ADS;

  /** Main body MutationObserver */
  private observer: MutationObserver | null = null;

  /** Shadow DOM MutationObservers */
  private shadowObservers: MutationObserver[] = [];

  /** Tracks shadow host elements we have already attached observers to.
   *  Uses WeakSet so entries are garbage-collected when elements are removed. */
  private observedShadowHosts = new WeakSet<HTMLElement>();

  /** Cached field values for change detection */
  private fieldValues: Record<string, unknown> = {};

  /** Reference to the creation interception listener for cleanup */
  private creationInterceptHandler: ((event: Event) => void) | null = null;

  /** The element we attached the creation intercept to */
  private creationInterceptTarget: HTMLElement | null = null;

  // -- Validation loop state --

  /** Active rules for this account/context */
  private rules: Rule[] = [];

  /** Active naming templates */
  private namingTemplates: NamingTemplate[] = [];

  /** Most recent evaluation results */
  private evaluationResults: RuleEvaluationResult[] = [];

  /** Guidelines sidebar instance */
  private sidebar: GuidelinesSidebar | null = null;

  /** Creation blocker instance */
  private creationBlocker: CreationBlocker | null = null;

  /** Comment modal instance */
  private commentModal: CommentModal | null = null;

  /** Approval pending modal instance */
  private approvalModal: ApprovalPendingModal | null = null;

  /** Current wizard step */
  private currentStep: WizardStep = WizardStep.CAMPAIGN_SETTINGS;

  /** Previous step (for detecting transitions) */
  private previousStep: WizardStep | null = null;

  /** Timer for debounced compliance event POST */
  private compliancePostTimer: ReturnType<typeof setTimeout> | null = null;

  /** API base URL (configurable for testing) */
  private apiBaseUrl: string = '';

  /** Extension token for API calls */
  private extensionToken: string = '';

  // -----------------------------------------------------------------------
  // detectContext()
  // -----------------------------------------------------------------------

  /**
   * Detect the current Google Ads context from URL and DOM.
   *
   * Extracts:
   *  - accountId: customer ID from `__u` URL param or DOM breadcrumb
   *  - entityLevel: campaign / ad_set (ad_group) / ad based on URL path
   *  - view: create / edit / review based on URL pattern
   *
   * @returns Context object or null if not on a recognizable Google Ads page.
   */
  detectContext(): ExtensionContext | null {
    const url = new URL(window.location.href);

    // Must be on Google Ads (or a localhost fixture)
    if (url.hostname !== GOOGLE_ADS_HOSTNAME && !isLocalhostGoogleFixture(url)) {
      return null;
    }

    const accountId = this.extractAccountId(url);
    if (!accountId) return null;

    const entityLevel = this.detectEntityLevel(url);
    const view = this.detectView(url);

    return {
      accountId,
      entityLevel,
      view,
    };
  }

  /**
   * Extract the Google Ads customer ID from the URL or DOM.
   *
   * Priority:
   *  1. `__u` query parameter
   *  2. `ocid` query parameter
   *  3. URL path segment (e.g. `/aw/campaigns?ocid=123-456-7890`)
   *  4. DOM breadcrumb / header containing the customer ID
   */
  private extractAccountId(url: URL): string | null {
    // Try __u param
    const uParam = url.searchParams.get('__u');
    if (uParam) {
      const match = uParam.match(CUSTOMER_ID_PARAM_REGEX);
      if (match) return this.formatCustomerId(match[1]);
    }

    // Try ocid param
    const ocidParam = url.searchParams.get('ocid');
    if (ocidParam) {
      const match = ocidParam.match(CUSTOMER_ID_PARAM_REGEX);
      if (match) return this.formatCustomerId(match[1]);
    }

    // Try extracting from URL path (some URLs embed the customer ID in the path)
    const pathMatch = url.pathname.match(/\/(\d{3}-?\d{3}-?\d{4})\//);
    if (pathMatch) return this.formatCustomerId(pathMatch[1]);

    // Fallback: try to read from DOM (breadcrumb or header)
    return this.extractAccountIdFromDom();
  }

  /**
   * Try to extract the customer ID from the page DOM.
   */
  private extractAccountIdFromDom(): string | null {
    // Try breadcrumb
    const breadcrumb = document.querySelector<HTMLElement>(
      '.breadcrumb-customer-id, [data-customer-id], .customer-id',
    );
    if (breadcrumb?.textContent) {
      const match = breadcrumb.textContent.match(/(\d{3}-?\d{3}-?\d{4})/);
      if (match) return this.formatCustomerId(match[1]);
    }

    // Try header area
    const header = document.querySelector<HTMLElement>(
      'awsm-app-bar, .app-bar, header',
    );
    if (header?.textContent) {
      const match = header.textContent.match(/(\d{3}-?\d{3}-?\d{4})/);
      if (match) return this.formatCustomerId(match[1]);
    }

    return null;
  }

  /**
   * Normalize customer ID to `XXX-XXX-XXXX` format.
   */
  private formatCustomerId(raw: string): string {
    const digits = raw.replace(/-/g, '');
    if (digits.length !== 10) return raw;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }

  /**
   * Detect the entity level from the URL path.
   */
  private detectEntityLevel(url: URL): EntityLevel {
    const path = url.pathname + url.hash;

    if (
      URL_PATTERNS.adCreate.test(path) ||
      URL_PATTERNS.adEdit.test(path)
    ) {
      return EntityLevel.AD;
    }

    if (
      URL_PATTERNS.adGroupCreate.test(path) ||
      URL_PATTERNS.adGroupEdit.test(path)
    ) {
      // Google Ads uses "ad_group" not "ad_set", but our enum maps
      // ad_group to AD_SET for consistency across platforms
      return EntityLevel.AD_SET;
    }

    // Default: campaign (including wizard, overview, and campaign create/edit)
    return EntityLevel.CAMPAIGN;
  }

  /**
   * Detect whether we're in create, edit, or review mode.
   */
  private detectView(url: URL): ExtensionView {
    const path = url.pathname + url.hash;

    if (
      URL_PATTERNS.campaignCreate.test(path) ||
      URL_PATTERNS.adGroupCreate.test(path) ||
      URL_PATTERNS.adCreate.test(path) ||
      URL_PATTERNS.campaignWizard.test(path)
    ) {
      return ExtensionView.CREATE;
    }

    if (
      URL_PATTERNS.campaignEdit.test(path) ||
      URL_PATTERNS.adGroupEdit.test(path) ||
      URL_PATTERNS.adEdit.test(path)
    ) {
      return ExtensionView.EDIT;
    }

    // Overview and other pages treated as review
    return ExtensionView.REVIEW;
  }

  // -----------------------------------------------------------------------
  // Wizard Step Detection
  // -----------------------------------------------------------------------

  /**
   * Detect the current wizard step from the DOM stepper breadcrumb.
   *
   * Google Ads uses a multi-step wizard with a stepper component
   * showing completed/active/pending steps. We detect the active
   * step by looking for `.stepper__step--active` or similar markers.
   *
   * @returns The detected wizard step
   */
  detectWizardStep(): WizardStep {
    // Strategy 1: Look for active stepper step in DOM
    const activeStep = document.querySelector('.stepper__step--active');
    if (activeStep) {
      const stepText = activeStep.textContent?.trim().toLowerCase() ?? '';
      if (stepText.includes('goal')) return WizardStep.GOAL;
      if (stepText.includes('campaign type')) return WizardStep.CAMPAIGN_TYPE;
      if (stepText.includes('campaign settings') || stepText.includes('settings'))
        return WizardStep.CAMPAIGN_SETTINGS;
      if (stepText.includes('ad group') || stepText.includes('ad groups'))
        return WizardStep.AD_GROUPS;
      if (stepText.includes('ads')) return WizardStep.ADS;
      if (stepText.includes('review')) return WizardStep.REVIEW;
    }

    // Strategy 2: URL hash
    const hash = window.location.hash.toLowerCase();
    if (hash.includes('goal')) return WizardStep.GOAL;
    if (hash.includes('type')) return WizardStep.CAMPAIGN_TYPE;
    if (hash.includes('settings')) return WizardStep.CAMPAIGN_SETTINGS;
    if (hash.includes('adgroup') || hash.includes('ad-group'))
      return WizardStep.AD_GROUPS;
    if (hash.includes('ads') || hash.includes('creative')) return WizardStep.ADS;
    if (hash.includes('review')) return WizardStep.REVIEW;

    // Strategy 3: Count completed steps to infer position
    const completedSteps = document.querySelectorAll(
      '.stepper__step--completed',
    );
    const completedCount = completedSteps.length;
    const steps = Object.values(WizardStep);
    if (completedCount < steps.length) {
      return steps[completedCount] ?? WizardStep.CAMPAIGN_SETTINGS;
    }

    // Default to campaign settings (most common active step)
    return WizardStep.CAMPAIGN_SETTINGS;
  }

  /**
   * Get the field path prefixes relevant to the current wizard step.
   */
  getStepFieldPrefixes(): readonly string[] {
    return STEP_FIELD_PREFIXES[this.currentStep] ?? [];
  }

  /**
   * Filter rules to only those relevant to the current wizard step.
   * If on the review step, all rules are included.
   */
  private filterRulesForCurrentStep(rules: Rule[]): Rule[] {
    if (this.currentStep === WizardStep.REVIEW) return rules;

    const prefixes = this.getStepFieldPrefixes();
    if (prefixes.length === 0) return rules;

    return rules.filter((rule) => {
      const field = rule.condition.field;
      if (!field) return false;
      return prefixes.some((prefix) => field.startsWith(prefix));
    });
  }

  // -----------------------------------------------------------------------
  // extractFieldValues()
  // -----------------------------------------------------------------------

  /**
   * Extract all current field values from the Google Ads DOM.
   *
   * Attempts to use the remoteEval bridge first (for Angular component state),
   * falling back to direct DOM reads. Fields that cannot be found are omitted.
   */
  async extractFieldValues(): Promise<Record<string, unknown>> {
    try {
      return await extractFieldValuesViaRemoteEval();
    } catch {
      // If remoteEval fails entirely, fall back to synchronous DOM reads
      return extractAllFieldValues();
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

  // -----------------------------------------------------------------------
  // getInjectionPoint()
  // -----------------------------------------------------------------------

  /**
   * Find the DOM element where governance UI should be injected for a given
   * rule type and field path.
   *
   * @param _ruleType  - The rule type (e.g. 'targeting_constraint')
   * @param fieldPath - The field path (e.g. 'campaign.geo_targets')
   * @returns Injection point with element and position, or null if not found.
   */
  getInjectionPoint(_ruleType: string, fieldPath: string): InjectionPoint | null {
    // Look up injection selectors for this field path
    const entry = GOOGLE_INJECTION_SELECTORS[fieldPath];
    if (!entry) {
      // Fall back to publish button overlay for unknown field paths
      return this.resolvePublishButtonInjection();
    }

    const element = entry.shadowDom
      ? queryWithShadowDom(entry.selectors)
      : queryByChain(document, entry.selectors);

    if (!element) return null;

    return {
      element,
      position: entry.position,
    };
  }

  /**
   * Resolve the publish/create button injection point.
   */
  private resolvePublishButtonInjection(): InjectionPoint | null {
    const entry = GOOGLE_INJECTION_SELECTORS['publish_button'];
    if (!entry) return null;

    // Try structured selectors first
    let button = queryByChain(document, entry.selectors);

    // Try text-based fallbacks
    if (!button) {
      button =
        findButtonByText('Create campaign') ??
        findButtonByText('Save') ??
        findButtonByText('Publish') ??
        findButtonByText('Continue');
    }

    if (!button) return null;

    return {
      element: button,
      position: entry.position,
    };
  }

  // -----------------------------------------------------------------------
  // interceptCreation()
  // -----------------------------------------------------------------------

  /**
   * Hook into the "Create campaign" / "Save" button to intercept creation.
   *
   * Attaches a capture-phase click listener. When the user clicks the button,
   * the callback is invoked with `true` to signal an attempted creation.
   * The extension core (injector) then decides whether to block (via the
   * CreationBlocker overlay) or allow the action.
   *
   * @param callback - Called with `true` when the user attempts to create/publish.
   */
  interceptCreation(callback: (allow: boolean) => void): void {
    // Clean up previous interception if any
    this.removeCreationIntercept();

    const findCreateButton = (): HTMLElement | null => {
      // Try structured selectors
      const candidates = [
        'button[type="submit"]',
        '[data-test="create-button"]',
        '.bottom-section button.primary',
        'awsm-app-bar button.primary',
      ];

      for (const sel of candidates) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) return el;
      }

      // Text-based fallbacks
      return (
        findButtonByText('Create campaign') ??
        findButtonByText('Save') ??
        findButtonByText('Publish')
      );
    };

    const createButton = findCreateButton();
    if (!createButton) {
      logger.warn('Could not find create/save button for interception');
      return;
    }

    this.creationInterceptHandler = (_event: Event) => {
      // Notify the extension core that the user is attempting creation
      callback(true);
    };

    this.creationInterceptTarget = createButton;
    createButton.addEventListener('click', this.creationInterceptHandler, {
      capture: true,
    });
  }

  /**
   * Remove the creation interception listener.
   */
  private removeCreationIntercept(): void {
    if (this.creationInterceptHandler && this.creationInterceptTarget) {
      this.creationInterceptTarget.removeEventListener(
        'click',
        this.creationInterceptHandler,
        { capture: true },
      );
      this.creationInterceptHandler = null;
      this.creationInterceptTarget = null;
    }
  }

  // -----------------------------------------------------------------------
  // observeFieldChanges()
  // -----------------------------------------------------------------------

  /**
   * Set up MutationObservers to detect field changes in the Google Ads DOM.
   *
   * Strategy:
   *  1. Main observer on `document.body` with `{ childList: true, subtree: true }`
   *     to catch Angular re-renders and wizard step transitions.
   *  2. Additional observers on discovered Shadow DOM roots.
   *  3. All callbacks are debounced to max 1 invocation per 300ms.
   *  4. On mutation, re-extract all fields and diff against cached values.
   *
   * @param callback - Called for each field whose value has changed.
   */
  observeFieldChanges(callback: (fieldPath: string, value: unknown) => void): void {
    // Initialize cached values
    this.fieldValues = extractAllFieldValues();

    const debouncedCheck = debounce(async () => {
      try {
        // Detect wizard step transitions
        const newStep = this.detectWizardStep();
        if (newStep !== this.currentStep) {
          this.previousStep = this.currentStep;
          this.currentStep = newStep;
          logger.info(`Wizard step transition: ${this.previousStep} -> ${this.currentStep}`);

          // On step transition, clear previous step validations and re-evaluate
          removeValidationBanners();
          await this.runValidationLoop();
        }

        const newValues = await this.extractFieldValues();
        let hasChanges = false;

        for (const [field, value] of Object.entries(newValues)) {
          if (!valuesEqual(value, this.fieldValues[field])) {
            callback(field, value);
            this.fieldValues[field] = value;
            hasChanges = true;
          }
        }

        // Check for fields that were removed (value became undefined)
        for (const field of Object.keys(this.fieldValues)) {
          if (!(field in newValues)) {
            callback(field, undefined);
            delete this.fieldValues[field];
            hasChanges = true;
          }
        }

        // Re-run validation if any field changed
        if (hasChanges) {
          await this.runValidationLoop();
        }
      } catch (err) {
        logger.error('Error during field change detection:', err);
      }
    }, OBSERVER_DEBOUNCE_MS);

    // Main body observer -- also detects newly added shadow hosts
    this.observer = new MutationObserver((mutations) => {
      // Check added nodes for new shadow hosts (lazy-loaded components)
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLElement) {
              this.attachShadowObserversForSubtree(node, debouncedCheck);
            }
          }
        }
      }
      debouncedCheck();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['value', 'class', 'aria-selected', 'aria-checked'],
      characterData: true,
    });

    // Shadow DOM observers for initially present hosts
    this.observeShadowRoots(debouncedCheck);

    // Also watch for "Next" / "Back" button clicks to detect step navigation
    this.observeStepNavigation(debouncedCheck);
  }

  /**
   * Find elements with shadow roots and attach MutationObservers to them.
   * Uses the KNOWN_SHADOW_HOSTS list for efficient discovery.
   */
  private observeShadowRoots(onMutation: () => void): void {
    const selector = KNOWN_SHADOW_HOSTS.join(', ');

    try {
      const hosts = document.querySelectorAll<HTMLElement>(selector);
      for (const host of hosts) {
        this.attachShadowObserver(host, onMutation);
      }
    } catch {
      // Fallback: if the combined selector is invalid, skip
      logger.warn('Failed to query shadow host selectors');
    }
  }

  /**
   * Attach a MutationObserver to a single shadow host if it has
   * a shadowRoot and has not already been observed.
   */
  private attachShadowObserver(host: HTMLElement, onMutation: () => void): void {
    if (!host.shadowRoot) return;
    if (this.observedShadowHosts.has(host)) return;

    this.observedShadowHosts.add(host);

    const shadowObserver = new MutationObserver(() => {
      onMutation();
    });

    shadowObserver.observe(host.shadowRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    this.shadowObservers.push(shadowObserver);
  }

  /**
   * Scan a subtree for new shadow host elements and attach observers.
   *
   * Called when the main MutationObserver detects newly added nodes.
   * This handles lazy-loaded Material components that were not present
   * at initial observer setup time (e.g. wizard step transitions,
   * dynamically loaded targeting panels).
   *
   * @param root - The root element of the newly added subtree
   * @param onMutation - Callback to invoke when shadow content mutates
   */
  private attachShadowObserversForSubtree(root: HTMLElement, onMutation: () => void): void {
    // Check the root element itself
    if (root.shadowRoot) {
      this.attachShadowObserver(root, onMutation);
    }

    // Check descendants matching known shadow host selectors
    const selector = KNOWN_SHADOW_HOSTS.join(', ');
    try {
      const hosts = root.querySelectorAll<HTMLElement>(selector);
      for (const host of hosts) {
        this.attachShadowObserver(host, onMutation);
      }
    } catch {
      // Skip if selector is invalid
    }
  }

  /**
   * Watch for wizard navigation button clicks (Next/Back) to trigger
   * immediate step re-detection and re-evaluation.
   */
  private observeStepNavigation(onMutation: () => void): void {
    const bottomSection = document.querySelector('.bottom-section');
    if (bottomSection) {
      bottomSection.addEventListener('click', () => {
        // Small delay to let the DOM update after clicking Next/Back
        setTimeout(() => {
          onMutation();
        }, 150);
      });
    }
  }

  // -----------------------------------------------------------------------
  // Full Validation Loop
  // -----------------------------------------------------------------------

  /**
   * Initialize the full validation loop with a set of rules and templates.
   *
   * This is the entry point for the validation integration. It:
   *  1. Stores rules and naming templates
   *  2. Creates UI components (sidebar, creation blocker, comment modal)
   *  3. Sets up creation interception
   *  4. Runs the initial evaluation
   *  5. Sets up field change observation with the validation callback
   *
   * @param rules - Active rules for this account
   * @param namingTemplates - Naming templates for template matching
   * @param apiBaseUrl - Base URL for compliance event API
   * @param extensionToken - Auth token for API calls
   */
  async initializeValidationLoop(
    rules: Rule[],
    namingTemplates: NamingTemplate[] = [],
    apiBaseUrl = '',
    extensionToken = '',
  ): Promise<void> {
    this.rules = rules;
    this.namingTemplates = namingTemplates;
    this.apiBaseUrl = apiBaseUrl;
    this.extensionToken = extensionToken;

    // Detect initial wizard step
    this.currentStep = this.detectWizardStep();
    logger.info(`Initial wizard step: ${this.currentStep}`);

    // Create UI components
    this.sidebar = new GuidelinesSidebar();
    this.creationBlocker = new CreationBlocker();
    this.commentModal = new CommentModal();

    // Set up creation interception
    this.setupCreationInterception();

    // Set up field observation (which triggers runValidationLoop on changes)
    this.observeFieldChanges((_fieldPath, _value) => {
      // Callback is handled inside observeFieldChanges via runValidationLoop
    });

    // Run the initial evaluation
    await this.runValidationLoop();

    logger.info(
      `Validation loop initialized with ${rules.length} rules, ` +
      `${namingTemplates.length} naming templates`,
    );
  }

  /**
   * Core validation loop. Called on every field change and step transition.
   *
   * Flow:
   *  1. Extract field values from DOM
   *  2. Filter rules for current wizard step
   *  3. Run rule evaluation engine
   *  4. Compute compliance score
   *  5. Update all UI components
   *  6. Update body CSS state classes
   *  7. Debounced POST to /api/v1/compliance/events
   */
  async runValidationLoop(): Promise<void> {
    if (this.rules.length === 0) return;

    try {
      // 1. Extract field values
      const fieldValues = await this.extractFieldValues();

      // 2. Filter rules for current wizard step
      const stepRules = this.filterRulesForCurrentStep(this.rules);

      // 3. Run rule evaluation
      this.evaluationResults = evaluateRules(
        fieldValues,
        stepRules,
        this.namingTemplates,
      );

      // 4. Compute compliance score
      const score = computeScore(this.evaluationResults);

      // 5. Update all UI components
      this.updateUIComponents(this.evaluationResults, score);

      // 6. Update body CSS state classes
      this.updateBodyClasses(this.evaluationResults);

      // 7. Debounced POST compliance events
      this.debouncedPostComplianceEvents(this.evaluationResults);
    } catch (err) {
      logger.error('Validation loop error:', err);
    }
  }

  /**
   * Update all governance UI components with the latest evaluation results.
   */
  private updateUIComponents(
    results: RuleEvaluationResult[],
    score: ComplianceScore,
  ): void {
    // -- Validation Banners --
    removeValidationBanners();
    for (const result of results) {
      const rule = this.rules.find((r) => r.id === result.ruleId);
      if (!rule) continue;

      const fieldPath = rule.condition.field ?? '';
      const injectionPoint = this.getInjectionPoint(rule.ruleType, fieldPath);

      if (injectionPoint) {
        renderValidationBanner({
          message: result.message,
          status: result.passed ? 'success' : 'error',
          fieldPath,
          injectionPoint,
        });
      }
    }

    // -- Guidelines Sidebar --
    if (this.sidebar) {
      this.sidebar.update(results);
    }

    // -- Campaign Score --
    renderCampaignScore({
      score: score.overall,
      passedCount: score.passedCount,
      totalCount: score.totalCount,
    });

    // -- Creation Blocker (blocking violations) --
    const blockingViolations = results.filter(
      (r) => !r.passed && r.enforcement === EnforcementMode.BLOCKING,
    );

    if (blockingViolations.length > 0) {
      // Don't auto-show the blocker; it's shown on creation attempt
    } else if (this.creationBlocker) {
      this.creationBlocker.hide();
    }
  }

  /**
   * Update body-level CSS classes to reflect validation state.
   * Pattern: `gov-valid-campaign-name`, `gov-invalid-campaign-budget_value`
   */
  private updateBodyClasses(results: RuleEvaluationResult[]): void {
    // Remove existing governance state classes
    const existingClasses = Array.from(document.body.classList).filter(
      (c) => c.startsWith('gov-valid-') || c.startsWith('gov-invalid-'),
    );
    for (const cls of existingClasses) {
      document.body.classList.remove(cls);
    }

    // Add classes based on current results
    for (const result of results) {
      const rule = this.rules.find((r) => r.id === result.ruleId);
      if (!rule?.condition.field) continue;

      const fieldSlug = rule.condition.field.replace(/\./g, '-');
      const prefix = result.passed ? 'gov-valid' : 'gov-invalid';
      document.body.classList.add(`${prefix}-${fieldSlug}`);
    }

    // Add overall state class
    document.body.classList.toggle(
      'gov-google-active',
      results.length > 0,
    );
  }

  /**
   * Set up creation button interception with the full enforcement logic.
   */
  private setupCreationInterception(): void {
    this.interceptCreation((attemptingCreation) => {
      if (!attemptingCreation) return;

      // Check for blocking violations
      const blockingViolations = this.evaluationResults.filter(
        (r) => !r.passed && r.enforcement === EnforcementMode.BLOCKING,
      );

      if (blockingViolations.length > 0 && this.creationBlocker) {
        this.creationBlocker.show(blockingViolations);
        return;
      }

      // Check for SECOND_APPROVER violations
      const secondApprover = this.evaluationResults.filter(
        (r) => !r.passed && r.enforcement === EnforcementMode.SECOND_APPROVER,
      );

      if (secondApprover.length > 0) {
        // Request approval for the first SECOND_APPROVER violation
        this.handleApprovalRequest(secondApprover[0]);
        return;
      }

      // Check for comment-required violations
      const commentRequired = this.evaluationResults.filter(
        (r) =>
          !r.passed && r.enforcement === EnforcementMode.COMMENT_REQUIRED,
      );

      if (commentRequired.length > 0 && this.commentModal) {
        // Show comment modal for the first comment-required violation
        const firstViolation = commentRequired[0];
        const entityName = String(
              this.fieldValues['campaign.name'] ?? 'Unknown',
            );
            this.commentModal.show(
              firstViolation,
              entityName,
              async (ruleId: string, _entityName: string, comment: string) => {
                logger.info(
                  `Comment submitted for rule ${ruleId}: ${comment.substring(0, 50)}...`,
                );
                // POST the comment to the compliance API
                await this.postComplianceComment(ruleId, comment);
              },
              () => {
                // Cancel callback - do nothing
                logger.info('Comment submission cancelled');
              },
            );
      }
    });
  }

  // -----------------------------------------------------------------------
  // Compliance Event Posting
  // -----------------------------------------------------------------------

  /**
   * Debounced POST of compliance events to the backend API.
   * Waits for 2 seconds after the last change before sending.
   */
  private debouncedPostComplianceEvents(
    results: RuleEvaluationResult[],
  ): void {
    if (this.compliancePostTimer !== null) {
      clearTimeout(this.compliancePostTimer);
    }

    this.compliancePostTimer = setTimeout(() => {
      this.compliancePostTimer = null;
      this.postComplianceEvents(results).catch((err) => {
        logger.error('Failed to POST compliance events:', err);
      });
    }, COMPLIANCE_POST_DEBOUNCE_MS);
  }

  /**
   * POST compliance events to the backend API.
   *
   * @param results - Current rule evaluation results
   */
  private async postComplianceEvents(
    results: RuleEvaluationResult[],
  ): Promise<void> {
    if (!this.apiBaseUrl) {
      logger.debug('No API base URL configured, skipping compliance POST');
      return;
    }

    const context = this.detectContext();
    if (!context) return;

    const events = results.map((r) => ({
      organizationId: '', // Filled by backend from token
      buyerId: '', // Filled by backend from token
      adAccountId: context.accountId,
      platform: Platform.GOOGLE_ADS,
      entityLevel: context.entityLevel,
      entityName: String(this.fieldValues['campaign.name'] ?? 'Unknown'),
      ruleId: r.ruleId,
      status: r.passed ? 'passed' : 'violated',
      fieldValue: r.fieldValue !== undefined ? String(r.fieldValue) : undefined,
      expectedValue:
        r.expectedValue !== undefined ? String(r.expectedValue) : undefined,
    }));

    try {
      const response = await fetch(
        `${this.apiBaseUrl}${COMPLIANCE_EVENTS_ENDPOINT}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.extensionToken
              ? { Authorization: `Bearer ${this.extensionToken}` }
              : {}),
          },
          body: JSON.stringify({ events }),
        },
      );

      if (!response.ok) {
        logger.warn(
          `Compliance POST failed: ${response.status} ${response.statusText}`,
        );
      } else {
        logger.debug(
          `Compliance events posted: ${events.length} events`,
        );
      }
    } catch (err) {
      logger.error('Network error posting compliance events:', err);
    }
  }

  /**
   * POST a compliance comment for a specific rule.
   */
  private async postComplianceComment(
    ruleId: string,
    comment: string,
  ): Promise<void> {
    if (!this.apiBaseUrl) {
      logger.debug('No API base URL configured, skipping comment POST');
      return;
    }

    const entityName = String(
      this.fieldValues['campaign.name'] ?? 'Unknown',
    );

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/api/v1/compliance/comment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.extensionToken
              ? { Authorization: `Bearer ${this.extensionToken}` }
              : {}),
          },
          body: JSON.stringify({
            ruleId,
            entityName,
            comment,
          }),
        },
      );

      if (!response.ok) {
        logger.warn(
          `Compliance comment POST failed: ${response.status}`,
        );
      }
    } catch (err) {
      logger.error('Network error posting compliance comment:', err);
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
      return;
    }

    // Get approver ID from rule metadata
    const approverId = (rule as unknown as { approverId?: string }).approverId;
    if (!approverId) {
      logger.error('Rule missing approverId for SECOND_APPROVER enforcement:', rule.id);
      return;
    }

    // Get context for campaign snapshot
    const context = this.detectContext();
    if (!context) {
      logger.error('Cannot detect context for approval request');
      return;
    }

    // Create campaign snapshot
    const campaignSnapshot = {
      ...this.fieldValues,
      timestamp: new Date().toISOString(),
      platform: 'google',
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
          // Show success notification
          this.showNotification('Approval granted. You can now publish.', 'success');
        },
        onRejected: (reason) => {
          logger.info('Approval rejected:', reason);
          // Remove approval from storage
          chrome.storage.local.remove(`approval_${approval.id}`);
          // Show rejection notification
          this.showNotification(`Approval rejected: ${reason}`, 'error');
        },
        onCancel: () => {
          logger.info('Approval request cancelled');
          // Remove approval from storage
          chrome.storage.local.remove(`approval_${approval.id}`);
          // Show cancellation notification
          this.showNotification('Approval request cancelled', 'info');
        },
      });
    } catch (error) {
      logger.error('Failed to create approval request:', error);
      this.showNotification('Failed to request approval. Please try again.', 'error');
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

  // -----------------------------------------------------------------------
  // Public accessors for testing / external consumption
  // -----------------------------------------------------------------------

  /**
   * Get the current evaluation results (useful for testing and external consumers).
   */
  getEvaluationResults(): RuleEvaluationResult[] {
    return [...this.evaluationResults];
  }

  /**
   * Get the current wizard step.
   */
  getCurrentStep(): WizardStep {
    return this.currentStep;
  }

  /**
   * Get the current cached field values.
   */
  getFieldValues(): Record<string, unknown> {
    return { ...this.fieldValues };
  }

  /**
   * Force a re-evaluation (useful for external triggers such as rule updates).
   */
  async forceReEvaluation(
    newRules?: Rule[],
    newNamingTemplates?: NamingTemplate[],
  ): Promise<void> {
    if (newRules) this.rules = newRules;
    if (newNamingTemplates) this.namingTemplates = newNamingTemplates;
    await this.runValidationLoop();
  }

  // -----------------------------------------------------------------------
  // cleanup()
  // -----------------------------------------------------------------------

  /**
   * Clean up all observers, event listeners, UI components, and cached state.
   * Called when navigating away or when the adapter is deactivated.
   */
  cleanup(): void {
    // Disconnect main observer
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Disconnect all shadow observers
    for (const obs of this.shadowObservers) {
      obs.disconnect();
    }
    this.shadowObservers = [];
    this.observedShadowHosts = new WeakSet<HTMLElement>();

    // Remove creation interception
    this.removeCreationIntercept();

    // Cancel pending compliance POST
    if (this.compliancePostTimer !== null) {
      clearTimeout(this.compliancePostTimer);
      this.compliancePostTimer = null;
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

    // Remove validation banners and campaign score
    removeValidationBanners();
    removeCampaignScore();

    // Remove body state classes
    const govClasses = Array.from(document.body.classList).filter(
      (c) =>
        c.startsWith('gov-valid-') ||
        c.startsWith('gov-invalid-') ||
        c === 'gov-google-active',
    );
    for (const cls of govClasses) {
      document.body.classList.remove(cls);
    }

    // Clear cached values and state
    this.fieldValues = {};
    this.evaluationResults = [];
    this.rules = [];
    this.namingTemplates = [];
    this.currentStep = WizardStep.CAMPAIGN_SETTINGS;
    this.previousStep = null;
  }
}

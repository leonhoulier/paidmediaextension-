/**
 * Meta Ads Manager DOM Selectors (2026 rewrite)
 *
 * Central registry of DOM selectors for every Meta Ads Manager field.
 * Each field has multiple selector strategies tried in priority order:
 *   1. placeholder attribute (most reliable for text inputs)
 *   2. role attribute + section proximity
 *   3. Section heading proximity (for collapsed targeting fields)
 *
 * In 2026 Meta Ads Manager:
 *   - NO aria-label on text inputs (use placeholder instead)
 *   - NO data-testid on form fields
 *   - NO role="radiogroup" (objectives use [role="row"] with input[type="radio"])
 *   - NO native select (all dropdowns are div[role="combobox"])
 *
 * @module meta-selectors
 */

import { InjectionPoint, InjectionPosition } from '@media-buying-governance/shared';
import { recordSelectorLookup } from '../../utils/selector-telemetry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Methods used to locate an element in the DOM */
export type SelectorMethod =
  | 'aria-label'
  | 'data-testid'
  | 'text-content'
  | 'heuristic'
  | 'role'
  | 'composite'
  | 'placeholder';

/**
 * A single selector strategy for locating a DOM element.
 */
export interface SelectorStrategy {
  /** Human-readable description of this strategy (for logging / telemetry) */
  description: string;
  /** The approach used to locate the element */
  method: SelectorMethod;
  /** CSS selector string (for aria-label, data-testid, role methods) */
  selector?: string;
  /** Text to match against element textContent (for text-content method) */
  textMatch?: string;
  /** Tag name constraint for text-content searches */
  tagName?: string;
  /** Label text to search nearby (for heuristic method) */
  labelText?: string;
  /** Target element tag for heuristic proximity */
  targetTag?: string;
}

/**
 * Complete selector configuration for a single field path.
 */
export interface FieldSelectorConfig {
  /** The field path (e.g. 'campaign.name') */
  fieldPath: string;
  /** Ordered list of selector strategies (tried first to last) */
  strategies: SelectorStrategy[];
  /**
   * Optional container selector -- when resolved, the injection point
   * targets this ancestor rather than the element itself.
   */
  containerSelector?: string;
  /** Where to inject relative to the resolved element / container */
  injectionPosition: InjectionPosition;
}

// ---------------------------------------------------------------------------
// Selector Registry
// ---------------------------------------------------------------------------

/**
 * Complete map of Meta Ads Manager field paths to their selector configs.
 *
 * Field paths follow Appendix B of the specification.
 * Updated for 2026 Meta Ads Manager DOM (placeholder-first, no aria-label/data-testid on inputs).
 */
export const META_FIELD_SELECTORS: FieldSelectorConfig[] = [
  // ── Campaign Level ──────────────────────────────────────────────────────

  {
    fieldPath: 'campaign.name',
    strategies: [
      {
        description: 'Placeholder "campaign name" (2026 verified)',
        method: 'placeholder',
        selector: 'input[placeholder*="campaign name" i]',
      },
      {
        description: 'Placeholder "Enter your campaign" (2026 verified)',
        method: 'placeholder',
        selector: 'input[placeholder*="Enter your campaign" i]',
      },
      {
        description: 'Heuristic: input near "Campaign name" heading',
        method: 'heuristic',
        labelText: 'Campaign name',
        targetTag: 'input',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'campaign.objective',
    strategies: [
      {
        description: 'Checked radio row heading (2026 verified)',
        method: 'role',
        selector: '[role="row"]:has(input[type="radio"]:checked)',
      },
      {
        description: 'Heuristic: radio near "Campaign objective" heading',
        method: 'heuristic',
        labelText: 'Campaign objective',
        targetTag: '[role="row"]',
      },
      {
        description: 'Text match: "Objective" section header',
        method: 'text-content',
        textMatch: 'Objective',
        tagName: 'span',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'campaign.budget_type',
    strategies: [
      {
        description: 'Combobox near "Budget" heading (2026 verified)',
        method: 'heuristic',
        labelText: 'Budget',
        targetTag: '[role="combobox"]',
      },
      {
        description: 'Text match: "Daily budget" or "Lifetime budget"',
        method: 'text-content',
        textMatch: 'Daily budget|Lifetime budget',
        tagName: 'div',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'campaign.budget_value',
    strategies: [
      {
        description: 'Placeholder "enter amount" (2026 verified)',
        method: 'placeholder',
        selector: 'input[placeholder*="enter amount" i]',
      },
      {
        description: 'Placeholder "Please enter amount" (2026 verified)',
        method: 'placeholder',
        selector: 'input[placeholder*="Please enter amount" i]',
      },
      {
        description: 'Heuristic: text input near "Budget" heading',
        method: 'heuristic',
        labelText: 'Budget',
        targetTag: 'input[type="text"]',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'campaign.cbo_enabled',
    strategies: [
      {
        description: 'Switch near "Advantage campaign budget" heading (2026)',
        method: 'heuristic',
        labelText: 'Advantage campaign budget',
        targetTag: '[role="switch"]',
      },
      {
        description: 'Switch near "Campaign budget optimization" heading',
        method: 'heuristic',
        labelText: 'Campaign budget optimization',
        targetTag: '[role="switch"]',
      },
      {
        description: 'Switch with budget-related aria-label',
        method: 'role',
        selector: '[role="switch"][aria-label*="budget" i]',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'campaign.buying_type',
    strategies: [
      {
        description: 'Combobox near "Campaign details" heading (2026)',
        method: 'heuristic',
        labelText: 'Campaign details',
        targetTag: '[role="combobox"]',
      },
      {
        description: 'Text match: "Auction" or "Reach and frequency"',
        method: 'text-content',
        textMatch: 'Auction|Reach and frequency',
        tagName: 'div',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'campaign.special_ad_categories',
    strategies: [
      {
        description: 'Combobox near "Special Ad Categories" heading (2026)',
        method: 'heuristic',
        labelText: 'Special Ad Categories',
        targetTag: '[role="combobox"]',
      },
      {
        description: 'Combobox with "Declare category" text',
        method: 'text-content',
        textMatch: 'Declare category',
        tagName: 'div',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'campaign.a_b_test',
    strategies: [
      {
        description: 'Switch near "A/B test" heading (2026)',
        method: 'heuristic',
        labelText: 'A/B test',
        targetTag: '[role="switch"]',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  // ── Ad Set Level ────────────────────────────────────────────────────────

  {
    fieldPath: 'ad_set.name',
    strategies: [
      {
        description: 'Placeholder "ad set name" (2026 verified)',
        method: 'placeholder',
        selector: 'input[placeholder*="ad set name" i]',
      },
      {
        description: 'Placeholder "Enter your ad set" (2026 verified)',
        method: 'placeholder',
        selector: 'input[placeholder*="Enter your ad set" i]',
      },
      {
        description: 'Heuristic: input near "Ad set name" heading',
        method: 'heuristic',
        labelText: 'Ad set name',
        targetTag: 'input',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'ad_set.conversion_location',
    strategies: [
      {
        description: 'Checked radio label in Conversion section (2026)',
        method: 'heuristic',
        labelText: 'Conversion location',
        targetTag: 'label:has(input[type="radio"]:checked)',
      },
      {
        description: 'Heuristic: radio near "Conversion" heading',
        method: 'heuristic',
        labelText: 'Conversion',
        targetTag: 'input[type="radio"]',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'ad_set.performance_goal',
    strategies: [
      {
        description: 'Combobox near "Performance goal" heading (2026)',
        method: 'heuristic',
        labelText: 'Performance goal',
        targetTag: '[role="combobox"]',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'ad_set.bid_amount',
    strategies: [
      {
        description: 'Placeholder "X.XXX" for bid amount (2026)',
        method: 'placeholder',
        selector: 'input[placeholder="X.XXX"]',
      },
      {
        description: 'Heuristic: input near "Bid" heading',
        method: 'heuristic',
        labelText: 'Bid',
        targetTag: 'input[type="text"]',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'ad_set.targeting.geo_locations',
    strategies: [
      {
        description: 'Heuristic: value text near "Locations" heading (2026)',
        method: 'heuristic',
        labelText: 'Locations',
        targetTag: 'span',
      },
      {
        description: 'Text match: "Locations" section heading',
        method: 'text-content',
        textMatch: 'Locations',
        tagName: 'span',
      },
    ],
    injectionPosition: InjectionPosition.INSIDE,
  },

  {
    fieldPath: 'ad_set.targeting.age_range',
    strategies: [
      {
        description: 'Heuristic: value near "Age" heading (2026 summary text)',
        method: 'heuristic',
        labelText: 'Age',
        targetTag: 'span',
      },
      {
        description: 'Text match: "Age" label',
        method: 'text-content',
        textMatch: 'Age',
        tagName: 'span',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'ad_set.targeting.genders',
    strategies: [
      {
        description: 'Heuristic: value near "Gender" heading (2026 summary text)',
        method: 'heuristic',
        labelText: 'Gender',
        targetTag: 'span',
      },
      {
        description: 'Text match: "Gender" section',
        method: 'text-content',
        textMatch: 'Gender',
        tagName: 'span',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'ad_set.targeting.languages',
    strategies: [
      {
        description: 'Heuristic: value near "Languages" heading (2026 summary text)',
        method: 'heuristic',
        labelText: 'Languages',
        targetTag: 'span',
      },
      {
        description: 'Text match: "Languages" section',
        method: 'text-content',
        textMatch: 'Languages',
        tagName: 'span',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'ad_set.targeting.custom_audiences',
    strategies: [
      {
        description: 'Placeholder "Search existing audiences" (2026)',
        method: 'placeholder',
        selector: 'input[placeholder*="Search existing audiences" i]',
      },
      {
        description: 'Heuristic: input near "Audience" heading',
        method: 'heuristic',
        labelText: 'Audience',
        targetTag: 'input[role="combobox"]',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'ad_set.placements',
    strategies: [
      {
        description: 'Heuristic: radio near "Placements" heading (2026)',
        method: 'heuristic',
        labelText: 'Placements',
        targetTag: 'input[type="radio"]',
      },
      {
        description: 'Text match: "Placements" section heading',
        method: 'text-content',
        textMatch: 'Placements',
        tagName: 'span',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'ad_set.schedule.start_date',
    strategies: [
      {
        description: 'Placeholder "mm/dd/yyyy" near "Start date" heading (2026)',
        method: 'heuristic',
        labelText: 'Start date',
        targetTag: 'input[placeholder="mm/dd/yyyy"]',
      },
      {
        description: 'Heuristic: input near "Start date" label',
        method: 'heuristic',
        labelText: 'Start date',
        targetTag: 'input',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'ad_set.schedule.end_date',
    strategies: [
      {
        description: 'Placeholder "mm/dd/yyyy" near "End date" heading (2026)',
        method: 'heuristic',
        labelText: 'End date',
        targetTag: 'input[placeholder="mm/dd/yyyy"]',
      },
      {
        description: 'Heuristic: input near "End date" label',
        method: 'heuristic',
        labelText: 'End date',
        targetTag: 'input',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'ad_set.beneficiary_payer',
    strategies: [
      {
        description: 'Combobox near "Beneficiary and payer" heading (2026)',
        method: 'heuristic',
        labelText: 'Beneficiary and payer',
        targetTag: '[role="combobox"]',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  // ── Ad Level ────────────────────────────────────────────────────────────

  {
    fieldPath: 'ad.name',
    strategies: [
      {
        description: 'Placeholder "ad name" (2026 verified)',
        method: 'placeholder',
        selector: 'input[placeholder*="ad name" i]',
      },
      {
        description: 'Placeholder "Enter your ad name" (2026 verified)',
        method: 'placeholder',
        selector: 'input[placeholder*="Enter your ad name" i]',
      },
      {
        description: 'Heuristic: input near "Ad name" heading',
        method: 'heuristic',
        labelText: 'Ad name',
        targetTag: 'input',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'ad.partnership_ad',
    strategies: [
      {
        description: 'Switch near "Partnership ad" heading (2026)',
        method: 'heuristic',
        labelText: 'Partnership ad',
        targetTag: '[role="switch"]',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'ad.creative.page_id',
    strategies: [
      {
        description: 'First combobox near "Identity" heading (2026)',
        method: 'heuristic',
        labelText: 'Identity',
        targetTag: '[role="combobox"]',
      },
      {
        description: 'Text match: "Facebook Page" label (legacy)',
        method: 'text-content',
        textMatch: 'Facebook Page',
        tagName: 'span',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'ad.creative.instagram_account',
    strategies: [
      {
        description: 'Combobox with aria-label "Instagram account" (2026 verified)',
        method: 'aria-label',
        selector: '[role="combobox"][aria-label="Instagram account"]',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'ad.creative.destination_url',
    strategies: [
      {
        description: 'Placeholder "Enter the URL" (2026 verified)',
        method: 'placeholder',
        selector: 'input[placeholder*="Enter the URL" i]',
      },
      {
        description: 'Placeholder "URL you want to promote" (2026)',
        method: 'placeholder',
        selector: 'input[placeholder*="URL you want to promote" i]',
      },
      {
        description: 'Heuristic: input near "Website URL" heading',
        method: 'heuristic',
        labelText: 'Website URL',
        targetTag: 'input',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'ad.creative.cta_type',
    strategies: [
      {
        description: 'Combobox near "Call to action" heading (2026)',
        method: 'heuristic',
        labelText: 'Call to action',
        targetTag: '[role="combobox"]',
      },
      {
        description: 'Text match: "Call to action" label',
        method: 'text-content',
        textMatch: 'Call to action',
        tagName: 'span',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  {
    fieldPath: 'ad.tracking.url_parameters',
    strategies: [
      {
        description: 'Placeholder "key1=value1" (2026)',
        method: 'placeholder',
        selector: 'input[placeholder*="key1=value1"]',
      },
      {
        description: 'Heuristic: input near "URL parameters" heading',
        method: 'heuristic',
        labelText: 'URL parameters',
        targetTag: 'input',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },
];

/**
 * Publish button selector configuration (special case -- not a field).
 * 2026: Publish is a div[role="button"] with text "Publish", not a native button.
 */
export const PUBLISH_BUTTON_SELECTORS: SelectorStrategy[] = [
  {
    description: 'Text match: "Publish" role=button (2026)',
    method: 'text-content',
    textMatch: 'Publish',
    tagName: '[role="button"]',
  },
  {
    description: 'Text match: "Publish" button',
    method: 'text-content',
    textMatch: 'Publish',
    tagName: 'button',
  },
  {
    description: 'Text match: "Next" button',
    method: 'text-content',
    textMatch: 'Next',
    tagName: 'button',
  },
];

// ---------------------------------------------------------------------------
// Section Proximity Helper (2026)
// ---------------------------------------------------------------------------

/**
 * Find a DOM element near a section heading.
 *
 * In 2026 Meta Ads Manager, most fields lack aria-label/data-testid and can
 * only be located by proximity to their section heading text.
 *
 * @param sectionText - Text to search for in heading elements (case-insensitive)
 * @param selector - CSS selector to find within the heading's ancestor containers
 * @returns The first matching element, or null
 */
export function findNearSection(sectionText: string, selector: string): HTMLElement | null {
  const headings = document.querySelectorAll('h2, h3, h4, [role="heading"]');
  for (const heading of headings) {
    if (heading.textContent?.toLowerCase().includes(sectionText.toLowerCase())) {
      let container = heading.closest('div') || heading.parentElement;
      for (let i = 0; i < 5 && container; i++) {
        const el = container.querySelector(selector);
        if (el && el !== heading) return el as HTMLElement;
        container = container.parentElement;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// DOM Query Helpers
// ---------------------------------------------------------------------------

/**
 * Find a DOM element by trying a list of selector strategies in order.
 *
 * Each strategy is attempted from first to last. The first successful
 * match is returned. If all strategies fail, returns null.
 *
 * @param strategies - Ordered list of selector strategies
 * @returns The first matching HTMLElement, or null
 */
export function findElement(strategies: SelectorStrategy[]): HTMLElement | null {
  for (const strategy of strategies) {
    const element = resolveStrategy(strategy);
    if (element) {
      return element;
    }
  }
  return null;
}

/**
 * Find a DOM element for a given field path.
 *
 * @param fieldPath - The field path (e.g. 'campaign.name')
 * @returns The matching HTMLElement, or null
 */
export function findFieldElement(fieldPath: string): HTMLElement | null {
  const config = META_FIELD_SELECTORS.find((c) => c.fieldPath === fieldPath);
  if (!config) {
    return null;
  }

  const element = findElement(config.strategies);

  // Record telemetry for selector health monitoring
  const strategyDescription = config.strategies
    .map((s) => s.selector ?? s.textMatch ?? s.labelText ?? s.method)
    .join(' | ');

  recordSelectorLookup({
    selector: strategyDescription,
    platform: 'meta',
    fieldPath,
    timestamp: new Date().toISOString(),
    found: element !== null,
    strategy: element !== null ? 'resolved' : 'all_failed',
  });

  return element;
}

/**
 * Resolve a field selector without recording telemetry.
 *
 * This is useful for on-demand diagnostics where we want to inspect
 * selector coverage without polluting the normal selector health metrics.
 *
 * @param fieldPath - The field path (e.g. 'campaign.name')
 * @returns The matching HTMLElement, or null
 */
export function peekFieldElement(fieldPath: string): HTMLElement | null {
  const config = META_FIELD_SELECTORS.find((c) => c.fieldPath === fieldPath);
  if (!config) {
    return null;
  }

  return findElement(config.strategies);
}

/**
 * Resolve a single selector strategy to an HTMLElement.
 *
 * @param strategy - The strategy to resolve
 * @returns The matching HTMLElement, or null
 */
function resolveStrategy(strategy: SelectorStrategy): HTMLElement | null {
  switch (strategy.method) {
    case 'aria-label':
    case 'data-testid':
    case 'role':
    case 'placeholder':
      return resolveCSSSelector(strategy.selector);

    case 'text-content':
      return findElementByTextContent(
        document.body,
        strategy.textMatch ?? '',
        strategy.tagName,
      );

    case 'heuristic':
      return findElementByProximity(
        strategy.labelText ?? '',
        strategy.targetTag ?? 'input',
      );

    case 'composite':
      return resolveCSSSelector(strategy.selector);

    default:
      return null;
  }
}

/**
 * Try a CSS selector (which may contain commas for OR-matching).
 *
 * @param selector - CSS selector string
 * @returns The first matching HTMLElement, or null
 */
function resolveCSSSelector(selector: string | undefined): HTMLElement | null {
  if (!selector) {
    return null;
  }
  try {
    return document.querySelector<HTMLElement>(selector);
  } catch {
    // Invalid selector -- fail gracefully
    return null;
  }
}

/**
 * Find an element whose textContent matches (or includes) the target text.
 *
 * Searches all elements of the given tagName (or all elements if not specified)
 * and returns the first match. Uses case-insensitive matching.
 *
 * @param parent - The parent element to search within
 * @param text - The text to match (supports '|' for OR)
 * @param tagName - Optional tag name filter (e.g. 'span', 'button')
 * @returns The first matching HTMLElement, or null
 */
export function findElementByTextContent(
  parent: Element,
  text: string,
  tagName?: string,
): HTMLElement | null {
  if (!text) {
    return null;
  }

  const patterns = text.split('|').map((t) => t.trim().toLowerCase());
  const elements = tagName
    ? parent.querySelectorAll<HTMLElement>(tagName)
    : parent.querySelectorAll<HTMLElement>('*');

  for (const el of elements) {
    const content = el.textContent?.trim().toLowerCase() ?? '';
    for (const pattern of patterns) {
      if (content.includes(pattern)) {
        return el;
      }
    }
  }

  return null;
}

/**
 * Find an element using heuristic proximity -- locate a label containing
 * the target text, then find the nearest matching element.
 *
 * Strategy:
 *   1. Find all elements whose text content contains the label text
 *   2. For each, walk up to the nearest common ancestor (max 5 levels)
 *   3. Within that ancestor, find the first matching target element
 *
 * @param labelText - The label text to search for
 * @param targetTag - The tag name of the target element (e.g. 'input')
 * @returns The best-matching HTMLElement, or null
 */
export function findElementByProximity(
  labelText: string,
  targetTag: string,
): HTMLElement | null {
  if (!labelText) {
    return null;
  }

  const normalised = labelText.toLowerCase();

  // Find candidate label elements
  const allElements = document.querySelectorAll<HTMLElement>(
    'label, span, div, h1, h2, h3, h4, h5, h6, p',
  );

  for (const el of allElements) {
    const content = el.textContent?.trim().toLowerCase() ?? '';
    if (!content.includes(normalised)) {
      continue;
    }

    // Walk up to find a common ancestor, then look for the target element
    let ancestor: HTMLElement | null = el;
    for (let depth = 0; depth < 5 && ancestor; depth++) {
      ancestor = ancestor.parentElement;
      if (!ancestor) break;

      const target = ancestor.querySelector<HTMLElement>(targetTag);
      if (target) {
        return target;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Injection Point Resolution
// ---------------------------------------------------------------------------

/**
 * Get the DOM injection point for a given rule type and field path.
 *
 * This function resolves the target element using the selector registry
 * and returns the appropriate injection point (element + position).
 *
 * @param ruleType - The type of rule being injected (e.g. 'naming_convention')
 * @param fieldPath - The field path this rule validates (e.g. 'campaign.name')
 * @returns Injection point information, or null if the target element cannot be found
 */
export function getInjectionPointForField(
  _ruleType: string,
  fieldPath: string,
): InjectionPoint | null {
  // Special case: publish button overlay
  if (fieldPath === 'publish_button' || fieldPath === 'creation_intercept') {
    const button = findElement(PUBLISH_BUTTON_SELECTORS);
    if (!button) {
      return null;
    }
    return {
      element: button,
      position: InjectionPosition.OVERLAY,
    };
  }

  const config = META_FIELD_SELECTORS.find((c) => c.fieldPath === fieldPath);
  if (!config) {
    // No config found -- try fallback selectors before giving up
    return resolveFieldFallback(fieldPath);
  }

  let element = findElement(config.strategies);
  if (!element) {
    // Primary strategies all failed -- try broader fallback selectors
    const fallback = resolveFieldFallback(fieldPath);
    if (fallback) {
      return fallback;
    }
    console.debug(`[DLG] No injection point found for ${fieldPath} (${_ruleType}) - all selectors failed`);
    return null;
  }

  // If a containerSelector is specified, try to resolve to an ancestor
  let targetElement = element;
  if (config.containerSelector) {
    const container = element.closest<HTMLElement>(config.containerSelector);
    if (container) {
      targetElement = container;
    }
  }

  // For AFTER / BEFORE positions, prefer the parent container for cleaner layout
  if (
    config.injectionPosition === InjectionPosition.AFTER ||
    config.injectionPosition === InjectionPosition.BEFORE
  ) {
    const parent = targetElement.parentElement;
    if (parent) {
      targetElement = parent;
    }
  }

  return {
    element: targetElement,
    position: config.injectionPosition,
  };
}

/**
 * Broader fallback selectors for when primary strategies fail.
 *
 * These use data-surface attributes, generic aria-labels, and
 * placeholder-based matching which are less precise but provide
 * coverage on real Meta Ads Manager when CSS class names are
 * obfuscated or data-testid attributes are stripped in production.
 */
const FIELD_FALLBACK_SELECTORS: Record<string, string[]> = {
  'campaign.name': [
    'input[placeholder*="campaign name" i]',
    'input[placeholder*="name" i]',
  ],
  'campaign.budget_value': [
    'input[placeholder*="enter amount" i]',
    'input[inputmode="decimal"]',
  ],
  'campaign.budget_type': [
    '[role="combobox"]',
  ],
  'campaign.objective': [
    '[role="row"]:has(input[type="radio"]:checked)',
  ],
  'ad_set.targeting.geo_locations': [
    '[data-surface*="geo"]',
  ],
  'ad_set.name': [
    'input[placeholder*="ad set name" i]',
  ],
  'ad_set.targeting.age_range': [
    '[data-surface*="age"]',
  ],
  'ad.name': [
    'input[placeholder*="ad name" i]',
  ],
  'ad.creative.destination_url': [
    'input[placeholder*="URL" i]',
    'input[placeholder*="Enter the URL" i]',
  ],
};

/**
 * Attempt to resolve an injection point using broader fallback selectors.
 *
 * Called when all primary strategies for a field path have failed.
 * Returns an injection point with AFTER positioning, or null if
 * no fallback matches.
 *
 * @param fieldPath - The field path to resolve
 * @returns Injection point or null
 */
function resolveFieldFallback(fieldPath: string): InjectionPoint | null {
  const fallbacks = FIELD_FALLBACK_SELECTORS[fieldPath];
  if (!fallbacks) return null;

  for (const selector of fallbacks) {
    try {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        return { element: el, position: InjectionPosition.AFTER };
      }
    } catch {
      // Invalid selector -- skip
    }
  }

  return null;
}

/**
 * Retrieve the FieldSelectorConfig for a given field path.
 *
 * Useful for telemetry and debugging.
 *
 * @param fieldPath - The field path to look up
 * @returns The selector config, or undefined
 */
export function getSelectorConfig(fieldPath: string): FieldSelectorConfig | undefined {
  return META_FIELD_SELECTORS.find((c) => c.fieldPath === fieldPath);
}

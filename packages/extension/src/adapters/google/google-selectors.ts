/**
 * Google Ads DOM Selectors and Injection Point Resolution
 *
 * This module defines all CSS selectors used to locate fields and injection
 * points in the Google Ads UI. Each field has multiple fallback selectors
 * ordered from most specific to most generic, providing resilience against
 * Google Ads DOM changes.
 *
 * Google Ads uses Angular with Material Design components. Key patterns:
 * - `material-input[debugid=...]` for named inputs
 * - `mat-*` prefixed components (Material Design)
 * - Shadow DOM in some components (requires shadowRoot traversal)
 * - Multi-step wizard with URL hash or breadcrumb step indicators
 */

import { InjectionPosition } from '@media-buying-governance/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A prioritized list of CSS selectors to try in order. */
export type SelectorChain = readonly string[];

/** Maps a field path to its extraction selectors. */
export interface FieldSelectorEntry {
  /** Selectors targeting the visible input / display element */
  readonly selectors: SelectorChain;
  /** If true the element may live inside a Shadow DOM host */
  readonly shadowDom?: boolean;
  /** Optional attribute to read instead of value / textContent */
  readonly attribute?: string;
  /** Whether this field yields an array of values (e.g. headlines, geo targets) */
  readonly isArray?: boolean;
}

/** Describes where to inject governance UI relative to a rule type. */
export interface InjectionSelectorEntry {
  readonly selectors: SelectorChain;
  readonly position: InjectionPosition;
  readonly shadowDom?: boolean;
}

// ---------------------------------------------------------------------------
// Field selector map (Appendix B -- Google Ads fields)
// ---------------------------------------------------------------------------

/**
 * Selector map for all Google Ads field paths listed in the spec (Appendix B).
 *
 * For every field we list multiple selectors from most reliable (e.g. a
 * `debugid` attribute) down to generic heuristics (class-based, text-based).
 */
export const GOOGLE_FIELD_SELECTORS: Readonly<Record<string, FieldSelectorEntry>> = {
  // -----------------------------------------------------------------------
  // Campaign-level fields
  // -----------------------------------------------------------------------

  // Campaign Name
  // Strategy: debugid is a Google Ads-internal attribute that is the most
  //   reliable selector for Material components. It is set at build time and
  //   is generally stable across releases.
  // Fallback 1: debugid="ad-name" -- alternate debugid used in some wizard flows.
  // Fallback 2: name="campaign-name" -- standard HTML name attribute.
  // Fallback 3-4: aria-label with "Campaign name" (case-insensitive) -- widely supported.
  //   NOTE: Selectors 4 and 5 are redundant since both use the 'i' flag.
  // Fallback 5: Class-based heuristic (.campaign-name-section input).
  // Risk: LOW -- debugid is the most stable attribute in Google Ads.
  'campaign.name': {
    selectors: [
      'material-input[debugid="campaign-name"] input',
      'material-input[debugid="ad-name"] input',
      'input[name="campaign-name"]',
      'input[aria-label*="Campaign name" i]',
      'input[aria-label*="campaign name" i]',
      '.campaign-name-section input',
    ],
  },

  // Campaign Type (Search, Display, Video, etc.)
  // Strategy: debugid on the campaign type selector container.
  // Fallback 1-2: Class-based with role="listbox" or role="radiogroup".
  // Fallback 3: data-campaigntype attribute on individual type cards -- very specific
  //   to the card-selection UI. The getter (getCampaignType) has special handling to
  //   read data-campaigntype from the [aria-checked="true"] card.
  // Fallback 4: .campaign-subtype-selector for sub-type selection.
  // Known limitation: Smart campaigns vs Standard campaigns use completely different
  //   wizard flows. Smart campaign wizard may not show a campaign type selector at all.
  // Risk: MEDIUM -- wizard flow varies by account type and campaign mode.
  'campaign.type': {
    selectors: [
      '[debugid="campaign-type-selector"]',
      '.campaign-type-selector [role="listbox"]',
      '.campaign-type-section [role="radiogroup"]',
      '[data-campaigntype]',
      '.campaign-subtype-selector',
    ],
  },

  // Campaign Budget Value
  // Strategy: debugid="budget-input" on the material-input component.
  // Fallback 1-2: aria-label with "Budget" (case-insensitive). Redundant pair.
  // Fallback 3-4: Class-based targeting .budget-section with both type="number"
  //   and type="text" to handle either input type.
  // Fallback 5: .budget-input class heuristic.
  // The getter (getBudgetValue) strips currency symbols and parses to float.
  // Risk: LOW -- well-covered by multiple strategies.
  'campaign.budget_value': {
    selectors: [
      'material-input[debugid="budget-input"] input',
      'input[aria-label*="Budget" i]',
      'input[aria-label*="budget" i]',
      '.budget-section input[type="number"]',
      '.budget-section input[type="text"]',
      '.budget-input input',
    ],
  },

  // Bidding Strategy
  // Strategy: debugid on the bidding strategy selector.
  // Fallback 1: Class + role="listbox" for the dropdown.
  // Fallback 2: .selected-strategy class on the currently selected option.
  // Fallback 3: data-biddingstrategy attribute on strategy options.
  // The getter (getBiddingStrategy) has special handling to read
  //   data-biddingstrategy from the [aria-selected="true"] option.
  // Known limitation: Available bidding strategies vary by campaign type
  //   (Search: manual CPC, maximize conversions; Display: tCPA, tROAS; etc.).
  // Risk: MEDIUM -- strategy selection UI varies by campaign type.
  'campaign.bidding_strategy': {
    selectors: [
      '[debugid="bidding-strategy-selector"]',
      '.bidding-strategy-section [role="listbox"]',
      '.bidding-section .selected-strategy',
      '[data-biddingstrategy]',
      '.bidding-type-selector',
    ],
  },

  // Geo Targets (Location Targeting)
  // Strategy 1-2: debugid-based selectors (most stable in Google Ads).
  // Strategy 3: aria-label on a listbox (ARIA-based, resilient to class renaming).
  // Strategy 4-6: Class-based fallbacks (less reliable but provide coverage).
  // shadowDom: true -- Google Ads location targeting may use Material
  //   autocomplete components that render inside Shadow DOM. The
  //   readArrayValueWithShadowPiercing() function handles this case.
  // Known limitation: The location targeting panel uses a search autocomplete +
  //   selected items list. Class names are based on Google Ads DOM inspection.
  // Risk: MEDIUM (reduced from HIGH) -- debugid and ARIA selectors added.
  'campaign.geo_targets': {
    selectors: [
      // Strategy 1: debugid (most stable in Google Ads)
      '[debugid="location-targeting"] .selected-location',
      '[debugid="location-targeting"] .location-item',
      '[debugid="location-targeting"] .location-row',
      // Strategy 2: ARIA role-based (resilient to class renaming)
      '[role="listbox"][aria-label*="Location" i] [role="option"]',
      // Strategy 3: Material component + aria-label
      'material-input[aria-label*="Location" i]',
      // Strategy 4: Class-based fallbacks (legacy)
      '.location-targeting-panel .selected-location',
      '.location-targeting .location-item',
      '.geo-targets-section .target-item',
      '.locations-section .selected-item',
    ],
    isArray: true,
    shadowDom: true,
  },

  // Languages
  // Strategy: Class-based selectors targeting language targeting section.
  // Fallback 3: debugid-based selector for the language container.
  // Fallback 4-5: Generic .chip and .mat-chip selectors for Material chips.
  // Risk: MEDIUM -- class names are speculative.
  'campaign.languages': {
    selectors: [
      '.language-targeting-section .selected-language',
      '.language-section .language-item',
      '[debugid="language-selector"] .selected-item',
      '.languages-section .chip',
      '.language-targeting .mat-chip',
    ],
    isArray: true,
  },

  // Brand Safety / Content Exclusions
  // Strategy 1-2: Class-based selectors targeting content exclusion categories.
  // Strategy 3: debugid-based selector (most stable in Google Ads).
  // Strategy 4-5: ARIA-based selectors (resilient to class renaming).
  //   Uses role="list" with aria-label for the exclusion list container,
  //   and role="listitem" for individual exclusion items.
  // Strategy 6-7: Class-based fallbacks.
  // Known limitation: This section is often hidden under "Additional settings"
  //   and requires user interaction to expand before elements exist in the DOM.
  // Risk: MEDIUM (reduced from MEDIUM-HIGH) -- ARIA and debugid selectors added.
  'campaign.brand_safety': {
    selectors: [
      '.content-exclusion-section .excluded-category',
      '.brand-safety-section .excluded-item',
      '[debugid="content-exclusions"] .exclusion-item',
      // ARIA-based selectors (resilient to class renaming)
      '[role="list"][aria-label*="Content exclusion" i] [role="listitem"]',
      '[role="list"][aria-label*="Brand safety" i] [role="listitem"]',
      '[aria-label*="Excluded content" i] .mat-chip',
      '.content-exclusions .selected-exclusion',
      '.brand-safety .mat-chip',
    ],
    isArray: true,
  },

  // Campaign Start Date
  // Strategy: debugid on material-input, aria-label fallback, class heuristics.
  // Fallback 4: data-type="start" attribute on input.
  // Fallback 5: First input in date range picker (positional -- fragile).
  // Risk: LOW-MEDIUM.
  'campaign.start_date': {
    selectors: [
      'material-input[debugid="start-date"] input',
      'input[aria-label*="Start date" i]',
      '.start-date-section input',
      '.schedule-section input[data-type="start"]',
      '.date-range-picker input:first-of-type',
    ],
  },

  // Campaign End Date
  // Strategy: Same pattern as start_date.
  // Fallback 5: Last input in date range picker (positional -- fragile).
  // Risk: LOW-MEDIUM.
  'campaign.end_date': {
    selectors: [
      'material-input[debugid="end-date"] input',
      'input[aria-label*="End date" i]',
      '.end-date-section input',
      '.schedule-section input[data-type="end"]',
      '.date-range-picker input:last-of-type',
    ],
  },

  // -----------------------------------------------------------------------
  // Ad Group-level fields
  // NOTE: No mock fixture covers the ad group wizard step. These fields
  // are untested against any fixture.
  // -----------------------------------------------------------------------

  // Ad Group Name
  // Strategy: debugid primary, aria-label fallback.
  // NOTE: Untested in mock fixtures (wizard step 4 is not simulated).
  // Risk: LOW -- standard input pattern.
  'ad_group.name': {
    selectors: [
      'material-input[debugid="ad-group-name"] input',
      'input[aria-label*="Ad group name" i]',
      'input[name="ad-group-name"]',
      '.ad-group-name-section input',
    ],
  },

  // Default CPC Bid
  // Strategy: debugid for default bid, aria-label fallbacks for "Default bid"
  //   and "Max CPC" (different labels used depending on bidding strategy).
  // NOTE: Untested in mock fixtures.
  // Risk: LOW-MEDIUM -- label varies by bidding strategy.
  'ad_group.cpc_bid': {
    selectors: [
      'material-input[debugid="default-bid"] input',
      'input[aria-label*="Default bid" i]',
      'input[aria-label*="Max CPC" i]',
      '.bid-section input[type="number"]',
      '.bid-section input[type="text"]',
      '.default-bid input',
    ],
  },

  // -----------------------------------------------------------------------
  // Ad-level fields
  // NOTE: No mock fixture covers the ad creation wizard step (step 5).
  // All ad-level fields are untested against any fixture.
  // -----------------------------------------------------------------------

  // RSA Headlines (Responsive Search Ad)
  // Strategy 1: debugid wildcard (*="headline") to match "headline-1", "headline-2", etc.
  //   This is the most stable selector in Google Ads.
  // Strategy 2: aria-label with "Headline" (ARIA-based, resilient to class renaming).
  // Strategy 3-4: ARIA role-based selectors -- role="textbox" with headline label,
  //   and role="group" containing headline inputs.
  // Strategy 5-7: Class-based fallbacks.
  // isArray: true -- collects all matching headline inputs.
  // NOTE: Untested in mock fixtures.
  // Risk: LOW-MEDIUM (reduced from MEDIUM) -- ARIA selectors added.
  'ad.headlines': {
    selectors: [
      'material-input[debugid*="headline"] input',
      'input[aria-label*="Headline" i]',
      // ARIA role-based selectors (resilient to class renaming)
      '[role="textbox"][aria-label*="Headline" i]',
      '[role="group"][aria-label*="Headlines" i] input',
      '[aria-label*="Headline" i] [role="textbox"]',
      '.headline-input input',
      '.ad-creative-section .headline input',
      '.rsa-headline input',
    ],
    isArray: true,
  },

  // RSA Descriptions
  // Strategy: debugid wildcard for descriptions, with both input and textarea fallbacks.
  // NOTE: Google Ads may use <textarea> for descriptions (multi-line) instead of <input>.
  //   Selectors 2 and 6 handle this with textarea targeting.
  // NOTE: Untested in mock fixtures.
  // Risk: MEDIUM -- may use textarea vs input.
  'ad.descriptions': {
    selectors: [
      'material-input[debugid*="description"] input',
      'textarea[aria-label*="Description" i]',
      'input[aria-label*="Description" i]',
      '.description-input input',
      '.ad-creative-section .description input',
      '.rsa-description textarea',
    ],
    isArray: true,
  },

  // Final URL
  // Strategy: debugid="final-url" primary, aria-label and name attribute fallbacks.
  // NOTE: Untested in mock fixtures.
  // Risk: LOW-MEDIUM -- standard URL input.
  'ad.final_url': {
    selectors: [
      'material-input[debugid="final-url"] input',
      'input[aria-label*="Final URL" i]',
      'input[name="final-url"]',
      '.final-url-section input',
      '.url-section input[type="url"]',
      '.url-section input[type="text"]',
    ],
  },

  // Display Path (path1/path2)
  // Strategy 1: debugid wildcard for display path inputs (most stable).
  // Strategy 2: aria-label with "Display path" (specific, reliable).
  // Strategy 3: FIXED -- was `input[aria-label*="Path" i]` (dangerously broad).
  //   Now uses numbered display path labels and scoped class-based selectors.
  // isArray: true -- typically 2 path segments.
  // Risk: LOW-MEDIUM (reduced from MEDIUM) -- broad selector removed.
  'ad.display_path': {
    selectors: [
      // Strategy 1: debugid (most stable)
      'material-input[debugid*="display-path"] input',
      // Strategy 2: Specific aria-label
      'input[aria-label*="Display path" i]',
      // Strategy 3: Numbered display path labels (replaces dangerous broad match)
      'input[aria-label*="Display path 1" i]',
      'input[aria-label*="Display path 2" i]',
      // Strategy 4: Class-scoped fallbacks (only match within display path sections)
      '.display-path-section input',
      '.path-section input[aria-label*="path" i]',
    ],
    isArray: true,
  },
};

// ---------------------------------------------------------------------------
// Injection point selector map (Section 12.2)
// ---------------------------------------------------------------------------

/**
 * Maps field paths (and rule-type hints) to DOM locations where governance
 * UI components (banners, overlays) should be injected.
 */
export const GOOGLE_INJECTION_SELECTORS: Readonly<Record<string, InjectionSelectorEntry>> = {
  // Location targeting
  'campaign.geo_targets': {
    selectors: [
      '.location-targeting-panel',
      '.locations-section',
      '[debugid="location-targeting"]',
      '.geo-targets-section',
    ],
    position: InjectionPosition.AFTER,
    shadowDom: true,
  },

  // Language targeting
  'campaign.languages': {
    selectors: [
      '.language-targeting-section',
      '.language-section',
      '[debugid="language-selector"]',
      '.languages-section',
    ],
    position: InjectionPosition.AFTER,
  },

  // Brand safety / content exclusions
  'campaign.brand_safety': {
    selectors: [
      '.content-exclusion-section',
      '.brand-safety-section',
      '[debugid="content-exclusions"]',
      '.content-exclusions',
    ],
    position: InjectionPosition.AFTER,
  },

  // Budget
  'campaign.budget_value': {
    selectors: [
      '.budget-section',
      '[data-test="budget-input"]',
      '[debugid="budget-input"]',
      '.budget-input',
    ],
    position: InjectionPosition.AFTER,
  },

  // Bidding strategy
  'campaign.bidding_strategy': {
    selectors: [
      '.bidding-strategy-section',
      '.bidding-section',
      '[debugid="bidding-strategy-selector"]',
      '.bidding-type-selector',
    ],
    position: InjectionPosition.AFTER,
  },

  // Campaign name
  'campaign.name': {
    selectors: [
      'material-input[debugid="campaign-name"]',
      'material-input[debugid="ad-name"]',
      '.campaign-name-section',
    ],
    position: InjectionPosition.AFTER,
  },

  // Campaign type
  'campaign.type': {
    selectors: [
      '.campaign-type-selector',
      '.campaign-type-section',
    ],
    position: InjectionPosition.AFTER,
  },

  // Schedule / dates
  'campaign.start_date': {
    selectors: [
      '.schedule-section',
      '.start-date-section',
      '.date-range-picker',
    ],
    position: InjectionPosition.AFTER,
  },

  'campaign.end_date': {
    selectors: [
      '.schedule-section',
      '.end-date-section',
      '.date-range-picker',
    ],
    position: InjectionPosition.AFTER,
  },

  // Ad group fields
  'ad_group.name': {
    selectors: [
      'material-input[debugid="ad-group-name"]',
      '.ad-group-name-section',
    ],
    position: InjectionPosition.AFTER,
  },

  'ad_group.cpc_bid': {
    selectors: [
      '.bid-section',
      '.default-bid',
      '[debugid="default-bid"]',
    ],
    position: InjectionPosition.AFTER,
  },

  // Ad-level fields
  'ad.headlines': {
    selectors: [
      '.headline-input',
      '.ad-creative-section .headlines',
      '.rsa-headline',
    ],
    position: InjectionPosition.AFTER,
  },

  'ad.descriptions': {
    selectors: [
      '.description-input',
      '.ad-creative-section .descriptions',
      '.rsa-description',
    ],
    position: InjectionPosition.AFTER,
  },

  'ad.final_url': {
    selectors: [
      '.final-url-section',
      '.url-section',
      '[debugid="final-url"]',
    ],
    position: InjectionPosition.AFTER,
  },

  'ad.display_path': {
    selectors: [
      '.display-path-section',
      '.path-section',
    ],
    position: InjectionPosition.AFTER,
  },

  // Publish / Create button -- overlay position
  'publish_button': {
    selectors: [
      'button[type="submit"]',
      '[data-test="create-button"]',
      '.bottom-section button.primary',
      'awsm-app-bar button.primary',
    ],
    position: InjectionPosition.OVERLAY,
  },
};

// ---------------------------------------------------------------------------
// Known Shadow DOM Host Selectors
// ---------------------------------------------------------------------------

/**
 * CSS selectors for elements in Google Ads that are known to host Shadow DOM.
 *
 * Google Ads uses Angular Material Design components, many of which render
 * child content inside Shadow DOM boundaries. Instead of iterating every
 * DOM element with `document.querySelectorAll('*')` (O(all DOM nodes)),
 * we target only these known Material component tag names and classes,
 * reducing the search space to O(Material components).
 *
 * This list should be kept in sync with any new Material components that
 * Google Ads introduces. The dynamic shadow host discovery in
 * google-adapter.ts handles lazy-loaded components not in this list.
 */
export const KNOWN_SHADOW_HOSTS: readonly string[] = [
  // Material Design Web Components (Angular Material)
  'material-input',
  'material-select',
  'material-checkbox',
  'material-radio',
  'material-button',
  'material-toggle',
  'material-slider',
  'material-datepicker',
  // Angular Material (mat-* prefix)
  'mat-select',
  'mat-checkbox',
  'mat-radio-button',
  'mat-radio-group',
  'mat-slide-toggle',
  'mat-slider',
  'mat-datepicker',
  'mat-autocomplete',
  'mat-chip-list',
  'mat-chip-grid',
  'mat-expansion-panel',
  'mat-menu',
  'mat-dialog-container',
  'mat-tooltip-component',
  // Google Ads specific components
  'awsm-app-bar',
  'campaign-type-card',
  // Class-based shadow hosts (Google Ads panels)
  '.location-targeting-panel',
  '.bidding-strategy-section',
  '.content-exclusion-section',
  '.brand-safety-section',
];

/**
 * Combined selector string for querying all known shadow hosts in one call.
 * Cached as a module-level constant to avoid repeated string joining.
 */
const KNOWN_SHADOW_HOSTS_SELECTOR = KNOWN_SHADOW_HOSTS.join(', ');

/**
 * Query all known shadow host elements in the document.
 * Returns only elements that actually have an open shadowRoot.
 *
 * Performance: O(Material components) instead of O(all DOM nodes).
 */
function getShadowHosts(root: ParentNode = document): HTMLElement[] {
  try {
    const candidates = root.querySelectorAll<HTMLElement>(KNOWN_SHADOW_HOSTS_SELECTOR);
    const hosts: HTMLElement[] = [];
    for (const el of candidates) {
      if (el.shadowRoot) {
        hosts.push(el);
      }
    }
    return hosts;
  } catch {
    // Fallback: if the combined selector is somehow invalid, return empty
    return [];
  }
}

// ---------------------------------------------------------------------------
// DOM utility functions
// ---------------------------------------------------------------------------

/**
 * Try each selector in order and return the first matching element, or null.
 */
export function queryByChain(
  root: ParentNode,
  selectors: SelectorChain,
): HTMLElement | null {
  for (const selector of selectors) {
    try {
      const el = root.querySelector<HTMLElement>(selector);
      if (el) return el;
    } catch {
      // Invalid selector -- skip
    }
  }
  return null;
}

/**
 * Try each selector in order and return **all** matching elements (deduplicated).
 */
export function queryAllByChain(
  root: ParentNode,
  selectors: SelectorChain,
): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const results: HTMLElement[] = [];

  for (const selector of selectors) {
    try {
      const els = root.querySelectorAll<HTMLElement>(selector);
      els.forEach((el) => {
        if (!seen.has(el)) {
          seen.add(el);
          results.push(el);
        }
      });
    } catch {
      // Invalid selector -- skip
    }
  }

  return results;
}

/**
 * Search inside a Shadow DOM host for an element matching the selector chain.
 * Tries the main document first, then iterates known shadow hosts.
 *
 * Performance: Uses KNOWN_SHADOW_HOSTS to target only Material components
 * instead of scanning every DOM element.
 */
export function queryWithShadowDom(
  selectors: SelectorChain,
): HTMLElement | null {
  // First try the normal DOM
  const direct = queryByChain(document, selectors);
  if (direct) return direct;

  // Walk known shadow hosts (O(Material components) instead of O(all DOM nodes))
  const hosts = getShadowHosts(document);
  for (const host of hosts) {
    const found = queryByChain(host.shadowRoot!, selectors);
    if (found) return found;
  }
  return null;
}

/**
 * Search inside Shadow DOM hosts for all elements matching the selector chain.
 *
 * Performance: Uses KNOWN_SHADOW_HOSTS to target only Material components
 * instead of scanning every DOM element.
 */
export function queryAllWithShadowDom(
  selectors: SelectorChain,
): HTMLElement[] {
  const results: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  // Main DOM
  for (const el of queryAllByChain(document, selectors)) {
    if (!seen.has(el)) {
      seen.add(el);
      results.push(el);
    }
  }

  // Shadow roots (O(Material components) instead of O(all DOM nodes))
  const hosts = getShadowHosts(document);
  for (const host of hosts) {
    for (const el of queryAllByChain(host.shadowRoot!, selectors)) {
      if (!seen.has(el)) {
        seen.add(el);
        results.push(el);
      }
    }
  }
  return results;
}

/**
 * Find an element by its visible text content. Useful as a last-resort
 * heuristic when no structured selectors match.
 *
 * @param text   - Text to search for (case-insensitive substring match)
 * @param tag    - Optional tag name filter (e.g. 'button', 'label')
 */
export function findElementByText(
  text: string,
  tag?: string,
): HTMLElement | null {
  const searchText = text.toLowerCase();
  const candidates = document.querySelectorAll<HTMLElement>(tag ?? '*');

  for (const el of candidates) {
    const content = el.textContent?.trim().toLowerCase();
    if (content && content.includes(searchText)) {
      return el;
    }
  }
  return null;
}

/**
 * Find a button by its visible label text.
 */
export function findButtonByText(text: string): HTMLElement | null {
  return findElementByText(text, 'button');
}

/**
 * Find the nearest ancestor matching a selector, starting from `el`.
 */
export function closestAncestor(
  el: HTMLElement,
  selector: string,
): HTMLElement | null {
  return el.closest<HTMLElement>(selector);
}

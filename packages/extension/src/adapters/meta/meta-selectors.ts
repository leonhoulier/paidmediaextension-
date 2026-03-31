/**
 * Meta Ads Manager DOM Selectors
 *
 * Central registry of DOM selectors for every Meta Ads Manager field.
 * Each field has multiple selector strategies tried in priority order:
 *   1. aria-label selector (most stable across React re-renders)
 *   2. data-testid selector
 *   3. Text-content matching
 *   4. Heuristic proximity (find input near label containing target text)
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
 */
export const META_FIELD_SELECTORS: FieldSelectorConfig[] = [
  // ── Campaign Level ──────────────────────────────────────────────────────

  // Campaign Name
  // Strategy: aria-label is the most stable attribute in Meta's React UI;
  // it persists across CSS obfuscation and React re-renders.
  // Fallback 1: data-testid -- Meta sometimes adds testid attributes (not guaranteed in prod).
  // Fallback 2: Heuristic proximity -- find any <input> within 5 ancestor levels of a
  //   label/span containing "Campaign name". Most fragile but broadest coverage.
  // Known limitation: All strategies assume English UI. Non-English locales will
  //   have translated aria-label text (e.g., "Nom de la campagne" in French).
  // Risk: LOW -- campaign name is a fundamental field with stable aria-label.
  {
    fieldPath: 'campaign.name',
    strategies: [
      {
        description: 'Placeholder matching "campaign name" (2026 Meta DOM)',
        method: 'placeholder',
        selector: 'input[placeholder*="campaign name" i]',
      },
      {
        description: 'Placeholder matching "Enter your campaign" (2026 Meta DOM)',
        method: 'placeholder',
        selector: 'input[placeholder*="Enter your campaign" i]',
      },
      {
        description: 'aria-label containing "Campaign name"',
        method: 'aria-label',
        selector: 'input[aria-label*="Campaign name"]',
      },
      {
        description: 'data-testid for campaign name',
        method: 'data-testid',
        selector: '[data-testid*="campaign-name"] input, [data-testid*="campaign_name"] input',
      },
      {
        description: 'Heuristic: input near "Campaign name" label',
        method: 'heuristic',
        labelText: 'Campaign name',
        targetTag: 'input',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  // Campaign Objective
  // Strategy: data-testid is primary because the objective selector is a custom
  // component (cards or radiogroup) without a simple aria-label.
  // Fallback 1: role="radiogroup" -- generic but objective cards use this role.
  //   WARNING: This selector is very broad and may match other radiogroups on the page.
  // Fallback 2: Text content match on "Objective" span -- finds the section header,
  //   not the selection container itself. The getter code (getCampaignObjective) then
  //   looks within for [aria-selected="true"] or [aria-checked="true"].
  // Known limitation: Meta frequently A/B tests the objective selection UI.
  //   The layout may change from cards to a list or dropdown without notice.
  // Risk: MEDIUM -- A/B test variations may change DOM structure.
  {
    fieldPath: 'campaign.objective',
    strategies: [
      {
        description: 'data-testid for objective selection',
        method: 'data-testid',
        selector: '[data-testid*="objective"]',
      },
      {
        description: 'role radiogroup for objective cards',
        method: 'role',
        selector: '[role="radiogroup"]',
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

  // Campaign Budget Type (Daily / Lifetime)
  // Strategy: aria-label is primary for the dropdown/combobox container.
  // Fallback 1: data-testid for budget type section.
  // Fallback 2: Text content match on "Daily budget" or "Lifetime budget" display text.
  // Fallback 3: Heuristic -- find a <select> near a "Budget" label.
  //   WARNING: Strategy 4 targets <select> but Meta uses a custom dropdown (div with
  //   role="combobox"), not a native <select>. This fallback will likely fail on real UI.
  // Known limitation: Budget type may be hidden when CBO/Advantage+ is enabled
  //   (budget is set at campaign level, not ad set level).
  // Risk: MEDIUM -- custom dropdown, heuristic fallback targets wrong element type.
  {
    fieldPath: 'campaign.budget_type',
    strategies: [
      {
        description: 'Text match: "Daily budget" or "Lifetime budget" in div (2026 Meta DOM)',
        method: 'text-content',
        textMatch: 'Daily budget|Lifetime budget',
        tagName: 'div',
      },
      {
        description: 'Heuristic: div near "Budget mode" label (2026 Meta DOM)',
        method: 'heuristic',
        labelText: 'Budget mode',
        targetTag: 'div',
      },
      {
        description: 'aria-checked within radiogroup near Budget text (2026 Meta DOM)',
        method: 'composite',
        selector: '[aria-checked="true"]',
      },
      {
        description: 'aria-label containing "Budget type" or "budget" dropdown',
        method: 'aria-label',
        selector: '[aria-label*="Budget type"], [aria-label*="budget type"]',
      },
      {
        description: 'data-testid for budget type',
        method: 'data-testid',
        selector: '[data-testid*="budget-type"], [data-testid*="budget_type"]',
      },
      {
        description: 'Text match: "Daily" or "Lifetime" in span',
        method: 'text-content',
        textMatch: 'Daily budget|Lifetime budget',
        tagName: 'span',
      },
      {
        description: 'Heuristic: dropdown near "Budget" label',
        method: 'heuristic',
        labelText: 'Budget',
        targetTag: 'select',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  // Campaign Budget Value (numeric amount)
  // Strategy: aria-label on input with type="text" constraint.
  //   WARNING: The type="text" constraint may fail if Meta uses type="number" or
  //   inputmode="decimal" without type="text". The remoteEval fallback selector
  //   (input[aria-label*="Budget"]) does NOT have this type constraint -- inconsistency.
  // Fallback 1: data-testid for budget value wrapper.
  // Fallback 2: Heuristic -- find any <input> near "Budget" label.
  //   WARNING: May match the budget TYPE section input instead of the value input.
  // Container selector resolves to .budget-section or any element with "budget" in class.
  // Known limitation: Currency formatting (e.g., "$5,000.00") must be stripped by getter.
  // Risk: MEDIUM-HIGH -- type="text" constraint may not match real DOM.
  {
    fieldPath: 'campaign.budget_value',
    strategies: [
      {
        description: 'Placeholder matching "enter amount" (2026 Meta DOM)',
        method: 'placeholder',
        selector: 'input[placeholder*="enter amount" i]',
      },
      {
        description: 'Placeholder matching "Please enter amount" (2026 Meta DOM)',
        method: 'placeholder',
        selector: 'input[placeholder*="Please enter amount" i]',
      },
      {
        description: 'aria-label containing "Budget" (input type)',
        method: 'aria-label',
        selector: 'input[aria-label*="Budget"][type="text"], input[aria-label*="budget"][type="text"]',
      },
      {
        description: 'data-testid for budget value input',
        method: 'data-testid',
        selector: '[data-testid*="budget-value"] input, [data-testid*="budget_value"] input',
      },
      {
        description: 'Heuristic: numeric input near "Budget" label',
        method: 'heuristic',
        labelText: 'Budget',
        targetTag: 'input',
      },
    ],
    containerSelector: '.budget-section, [class*="budget"]',
    injectionPosition: InjectionPosition.AFTER,
  },

  // CBO / Advantage+ Campaign Budget toggle
  // Strategy: Compound aria-label match requiring BOTH "Advantage" AND "campaign budget"
  //   in the label. Also matches legacy "Campaign budget optimization" label.
  // Fallback 1: role="switch" with budget-related aria-label -- more generic.
  // Fallback 2: data-testid for CBO toggle.
  // Fallback 3: Heuristic -- find <input> near "Advantage+ campaign budget" text.
  //   WARNING: The heuristic targets <input> but the toggle is a <div role="switch">,
  //   not an <input>. This fallback will likely fail.
  // Known limitation: Meta rebranded "CBO" to "Advantage+ campaign budget". If they
  //   rebrand again, strategy 1 will break. Strategy 2 (role="switch" + "budget")
  //   provides some resilience.
  // Risk: MEDIUM -- branding changes may invalidate aria-label text.
  {
    fieldPath: 'campaign.cbo_enabled',
    strategies: [
      {
        description: 'aria-label for Advantage+ campaign budget toggle',
        method: 'aria-label',
        selector: '[aria-label*="Advantage"][aria-label*="campaign budget"], [aria-label*="Campaign budget optimization"]',
      },
      {
        description: 'role switch for CBO toggle',
        method: 'role',
        selector: '[role="switch"][aria-label*="budget"], [role="switch"][aria-label*="Budget"]',
      },
      {
        description: 'data-testid for CBO toggle',
        method: 'data-testid',
        selector: '[data-testid*="cbo"], [data-testid*="campaign-budget-optimization"]',
      },
      {
        description: 'Heuristic: toggle near "Advantage+" text',
        method: 'heuristic',
        labelText: 'Advantage+ campaign budget',
        targetTag: 'input',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  // ── Ad Set Level ────────────────────────────────────────────────────────

  // Ad Set Name
  // Strategy: Same pattern as campaign.name -- aria-label primary, data-testid
  //   fallback, heuristic proximity as last resort.
  // Risk: LOW -- standard text input.
  {
    fieldPath: 'ad_set.name',
    strategies: [
      {
        description: 'aria-label containing "Ad set name"',
        method: 'aria-label',
        selector: 'input[aria-label*="Ad set name"]',
      },
      {
        description: 'data-testid for ad set name',
        method: 'data-testid',
        selector: '[data-testid*="adset-name"] input, [data-testid*="ad_set_name"] input',
      },
      {
        description: 'Heuristic: input near "Ad set name" label',
        method: 'heuristic',
        labelText: 'Ad set name',
        targetTag: 'input',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  // Geo Locations (targeting)
  // Strategy: aria-label on the location targeting container section.
  //   WARNING: [aria-label*="Location"] is very broad -- may match elements unrelated
  //   to targeting (e.g., a "Location" link in the sidebar).
  // Fallback 1: data-testid containing "location" or "geo".
  //   WARNING: Also broad; may match multiple elements.
  // Fallback 2: Text content match for "Locations" section heading.
  // Injection is INSIDE the container (not AFTER) for inline validation display.
  // The getter (getGeoLocations) looks for .chip, .tag, [role="listitem"] elements
  //   inside the resolved container, then falls back to React Fiber traversal.
  // Known limitation: Meta's location picker uses an autocomplete search + chip pattern.
  //   Selected locations appear as removable tags/chips. The exact class names are
  //   likely obfuscated in production.
  // Risk: MEDIUM-HIGH -- broad selectors, complex DOM structure.
  {
    fieldPath: 'ad_set.targeting.geo_locations',
    strategies: [
      {
        description: 'aria-label for location targeting',
        method: 'aria-label',
        selector: '[aria-label*="Location"], [aria-label*="location"]',
      },
      {
        description: 'data-testid for locations section',
        method: 'data-testid',
        selector: '[data-testid*="location"], [data-testid*="geo"]',
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

  // Age Range (targeting)
  // Strategy: aria-label with "Age" substring match.
  //   WARNING: [aria-label*="Age"] is very broad -- may match unrelated elements.
  // Fallback 1: data-testid with "age-range" or "age_range".
  // Fallback 2: Text content "Age" in <span> -- extremely broad, will match many elements.
  // The getter (getAgeRange) looks for two <input> or <select> elements inside the
  //   container and parses them as min/max integers.
  // Known limitation: Meta typically uses custom dropdown selects (not native <input>
  //   or <select>) for age range. The mock uses <input type="number"> which may
  //   not reflect the real DOM.
  // Risk: MEDIUM -- broad selectors, potential DOM mismatch.
  {
    fieldPath: 'ad_set.targeting.age_range',
    strategies: [
      {
        description: 'aria-label for age range',
        method: 'aria-label',
        selector: '[aria-label*="Age"], [aria-label*="age"]',
      },
      {
        description: 'data-testid for age range',
        method: 'data-testid',
        selector: '[data-testid*="age-range"], [data-testid*="age_range"]',
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

  // Gender (targeting)
  // Strategy: aria-label with "Gender" match. Straightforward section.
  // Fallback 1: data-testid with "gender".
  // Fallback 2: Text content "Gender" in <span>.
  // The getter (getGenders) looks for checked checkboxes/radios or [aria-checked="true"]
  //   and reads the associated label text.
  // Risk: LOW-MEDIUM -- simple selection UI.
  {
    fieldPath: 'ad_set.targeting.genders',
    strategies: [
      {
        description: 'aria-label for gender selection',
        method: 'aria-label',
        selector: '[aria-label*="Gender"], [aria-label*="gender"]',
      },
      {
        description: 'data-testid for gender selection',
        method: 'data-testid',
        selector: '[data-testid*="gender"]',
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

  // Languages (targeting)
  // Strategy: aria-label with "Language" match.
  // The getter (getLanguages) looks for .tag, .chip, [role="listitem"] inside
  //   the container, then falls back to React Fiber for LanguageSelector/LocaleSelector.
  // Risk: LOW-MEDIUM -- chip-based multi-select pattern.
  {
    fieldPath: 'ad_set.targeting.languages',
    strategies: [
      {
        description: 'aria-label for language multi-select',
        method: 'aria-label',
        selector: '[aria-label*="Language"], [aria-label*="language"]',
      },
      {
        description: 'data-testid for language selection',
        method: 'data-testid',
        selector: '[data-testid*="language"]',
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

  // Custom Audiences (targeting)
  // Strategy: data-testid containing "custom-audience" or "custom_audience".
  // Fallback 1: aria-label with "Custom audience" (case-insensitive).
  // Fallback 2: aria-label with "Audience" (broader, scoped to audience picker context).
  // Fallback 3: Text content match for "Custom Audiences" section heading.
  // The getter (getCustomAudiences) looks for .chip, .tag, [role="listitem"]
  //   inside the resolved container, then falls back to React Fiber for
  //   CustomAudience/AudienceSelector/AudiencePicker components.
  // Known limitation: Custom audiences are managed via a separate dialog/picker
  //   component. The selected audiences may appear as removable chips.
  // Risk: HIGH -- no prior registry entry, getter relied on speculative direct query.
  {
    fieldPath: 'ad_set.targeting.custom_audiences',
    strategies: [
      {
        description: 'data-testid for custom audience picker',
        method: 'data-testid',
        selector: '[data-testid*="custom-audience"], [data-testid*="custom_audience"]',
      },
      {
        description: 'aria-label for Custom Audiences',
        method: 'aria-label',
        selector: '[aria-label*="Custom audience" i], [aria-label*="Custom Audience" i]',
      },
      {
        description: 'aria-label for audience picker (broader)',
        method: 'aria-label',
        selector: '[aria-label*="audience-picker" i], [aria-label*="Audience picker" i]',
      },
      {
        description: 'Text match: "Custom Audiences" section heading',
        method: 'text-content',
        textMatch: 'Custom Audiences',
        tagName: 'span',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  // Placements (Advantage+ vs Manual)
  // Strategy: aria-label with "Placement" match.
  // The getter (getPlacements) checks for checked checkboxes, [aria-checked="true"],
  //   then reads label text. Falls back to React Fiber for PlacementSelector/
  //   PlacementPicker/PlacementConfig component, checking for .placementType,
  //   .selectedPlacements, .isAdvantagePlus, .isAutomaticPlacements props.
  // Known limitation: Meta's placement UI has been redesigned multiple times.
  //   "Advantage+ placements" (automatic) vs "Manual placements" is the current
  //   binary, but the full manual placement tree is deeply nested.
  // Risk: MEDIUM -- UI redesigns are frequent for this section.
  {
    fieldPath: 'ad_set.placements',
    strategies: [
      {
        description: 'aria-label for placements section',
        method: 'aria-label',
        selector: '[aria-label*="Placement"], [aria-label*="placement"]',
      },
      {
        description: 'data-testid for placements',
        method: 'data-testid',
        selector: '[data-testid*="placement"]',
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

  // Schedule Start Date
  // Strategy: aria-label for "Start date", data-testid fallback, heuristic proximity.
  // Known limitation: Meta uses a custom date picker component. The actual <input>
  //   may be hidden, with a formatted date display shown instead.
  // Risk: LOW-MEDIUM.
  {
    fieldPath: 'ad_set.schedule.start_date',
    strategies: [
      {
        description: 'aria-label for start date',
        method: 'aria-label',
        selector: '[aria-label*="Start date"], [aria-label*="start date"]',
      },
      {
        description: 'data-testid for start date',
        method: 'data-testid',
        selector: '[data-testid*="start-date"], [data-testid*="start_date"]',
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

  // Schedule End Date
  // Strategy: Same pattern as start_date.
  // Risk: LOW-MEDIUM.
  {
    fieldPath: 'ad_set.schedule.end_date',
    strategies: [
      {
        description: 'aria-label for end date',
        method: 'aria-label',
        selector: '[aria-label*="End date"], [aria-label*="end date"]',
      },
      {
        description: 'data-testid for end date',
        method: 'data-testid',
        selector: '[data-testid*="end-date"], [data-testid*="end_date"]',
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

  // ── Ad Level ────────────────────────────────────────────────────────────

  // Ad Name
  // Strategy: Same pattern as campaign.name and ad_set.name.
  // NOTE: No dedicated mock fixture covers ad-level fields. These are untested.
  // Risk: LOW -- standard text input pattern.
  {
    fieldPath: 'ad.name',
    strategies: [
      {
        description: 'aria-label containing "Ad name"',
        method: 'aria-label',
        selector: 'input[aria-label*="Ad name"]',
      },
      {
        description: 'data-testid for ad name',
        method: 'data-testid',
        selector: '[data-testid*="ad-name"] input, [data-testid*="ad_name"] input',
      },
      {
        description: 'Heuristic: input near "Ad name" label',
        method: 'heuristic',
        labelText: 'Ad name',
        targetTag: 'input',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  // Destination URL
  // Strategy: aria-label with "Website URL". Meta's label may vary between
  //   "Website URL", "Destination", or "URL" depending on the ad format.
  // NOTE: Untested in mock fixtures.
  // Risk: LOW-MEDIUM -- label text may vary by ad format.
  {
    fieldPath: 'ad.creative.destination_url',
    strategies: [
      {
        description: 'aria-label for Website URL input',
        method: 'aria-label',
        selector: 'input[aria-label*="Website URL"], input[aria-label*="website URL"]',
      },
      {
        description: 'data-testid for destination URL',
        method: 'data-testid',
        selector: '[data-testid*="destination-url"] input, [data-testid*="website-url"] input',
      },
      {
        description: 'Heuristic: input near "Website URL" label',
        method: 'heuristic',
        labelText: 'Website URL',
        targetTag: 'input',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },

  // CTA (Call to Action) Type
  // Strategy: aria-label with "Call to action" match.
  // The getter (getCTAType) reads from HTMLSelectElement.value, or
  //   [aria-selected="true"] option text, or element textContent.
  // NOTE: Untested in mock fixtures. CTA is a custom dropdown in Meta's UI.
  // Risk: MEDIUM.
  {
    fieldPath: 'ad.creative.cta_type',
    strategies: [
      {
        description: 'aria-label for CTA dropdown',
        method: 'aria-label',
        selector: '[aria-label*="Call to action"], [aria-label*="call to action"]',
      },
      {
        description: 'data-testid for CTA type',
        method: 'data-testid',
        selector: '[data-testid*="cta"], [data-testid*="call-to-action"]',
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

  // Facebook Page ID (Identity)
  // Strategy: aria-label with "Facebook Page" match.
  // Known limitation: Meta may label this section "Identity" or "Page" without
  //   the "Facebook Page" prefix. The getter (getPageId) also checks for
  //   data-page-id and data-id attributes, and falls back to React Fiber
  //   for PageSelector/PagePicker/FacebookPage components.
  // NOTE: Untested in mock fixtures.
  // Risk: MEDIUM -- label may not include "Facebook Page" text.
  {
    fieldPath: 'ad.creative.page_id',
    strategies: [
      {
        description: 'aria-label for Facebook Page selector',
        method: 'aria-label',
        selector: '[aria-label*="Facebook Page"], [aria-label*="facebook page"]',
      },
      {
        description: 'data-testid for page selector',
        method: 'data-testid',
        selector: '[data-testid*="page-selector"], [data-testid*="facebook-page"]',
      },
      {
        description: 'Text match: "Facebook Page" label',
        method: 'text-content',
        textMatch: 'Facebook Page',
        tagName: 'span',
      },
    ],
    injectionPosition: InjectionPosition.AFTER,
  },
];

/**
 * Publish button selector configuration (special case -- not a field).
 */
export const PUBLISH_BUTTON_SELECTORS: SelectorStrategy[] = [
  {
    description: 'Submit button type',
    method: 'aria-label',
    selector: 'button[type="submit"]',
  },
  {
    description: 'data-testid for publish button',
    method: 'data-testid',
    selector: '[data-testid*="publish"] button, [data-testid*="submit"] button',
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
    '[data-surface*="name"]',
    '[aria-label*="Campaign name"]',
    'input[placeholder*="name" i]',
  ],
  'campaign.budget_value': [
    '[data-surface*="budget"]',
    '[aria-label*="Budget"]',
    'input[inputmode="decimal"]',
  ],
  'campaign.budget_type': [
    '[data-surface*="budget"]',
    '[aria-label*="Budget"]',
  ],
  'campaign.objective': [
    '[data-surface*="objective"]',
    '[aria-label*="Objective"]',
  ],
  'ad_set.targeting.geo_locations': [
    '[data-surface*="geo"]',
    '[aria-label*="Location"]',
    '[data-surface*="targeting"]',
  ],
  'ad_set.name': [
    '[data-surface*="adset"]',
    'input[placeholder*="Ad set name" i]',
  ],
  'ad_set.targeting.age_range': [
    '[data-surface*="age"]',
    '[data-surface*="targeting"]',
  ],
  'ad.name': [
    '[data-surface*="ad-name"]',
    'input[placeholder*="Ad name" i]',
  ],
  'ad.creative.destination_url': [
    '[data-surface*="url"]',
    '[data-surface*="destination"]',
    'input[placeholder*="URL" i]',
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

/**
 * Google Ads Field Extraction
 *
 * Implements named getter functions for every Google Ads field path listed in
 * Appendix B of the specification. Fields are extracted either directly from
 * the DOM or via the remoteEval postMessage bridge when Angular component
 * internal state is needed.
 *
 * Key challenges handled here:
 *  - Material Design components (`mat-*`, `material-input[debugid=...]`)
 *  - Shadow DOM (some Material components render inside shadow roots)
 *  - Multi-step wizard (fields only exist when their wizard step is active)
 *  - Pierce shadow boundaries for campaign name, budget, bidding, location
 */

import type { RemoteEvalQuery, RemoteEvalResult } from '@media-buying-governance/shared';
import {
  GOOGLE_FIELD_SELECTORS,
  KNOWN_SHADOW_HOSTS,
  queryByChain,
  queryAllByChain,
  type FieldSelectorEntry,
} from './google-selectors.js';
import { recordSelectorLookup } from '../../utils/selector-telemetry.js';

// ---------------------------------------------------------------------------
// remoteEval bridge helpers
// ---------------------------------------------------------------------------

/** Counter for unique query IDs */
let queryCounter = 0;

/**
 * Generate a unique query ID for remoteEval messages.
 */
function generateQueryId(): string {
  queryCounter += 1;
  return `governance-google-${Date.now()}-${queryCounter}`;
}

/**
 * Send a remoteEval query via postMessage and wait for the response.
 * Times out after `timeoutMs` to avoid hanging.
 *
 * @param query   - The evaluation query to send
 * @param timeoutMs - Maximum wait time in ms (default: 2000)
 * @returns The results map from the eval bridge
 */
export function sendRemoteEvalQuery(
  query: RemoteEvalQuery,
  timeoutMs = 2000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      if (
        event.data &&
        typeof event.data === 'object' &&
        (event.data as RemoteEvalResult).type === 'evalResult.governance' &&
        (event.data as RemoteEvalResult).queryId === query.queryId
      ) {
        window.removeEventListener('message', handler);
        resolve((event.data as RemoteEvalResult).results);
      }
    };

    window.addEventListener('message', handler);
    window.postMessage(query, '*');

    // Timeout fallback -- return empty results rather than hanging
    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve({});
    }, timeoutMs);
  });
}

// ---------------------------------------------------------------------------
// Shadow DOM host discovery
// ---------------------------------------------------------------------------

/**
 * Combined selector string for querying all known shadow hosts.
 * Matches the KNOWN_SHADOW_HOSTS array from google-selectors.ts.
 */
const SHADOW_HOST_SELECTOR = KNOWN_SHADOW_HOSTS.join(', ');

/**
 * Query all known shadow host elements that actually have an open shadowRoot.
 * Uses the KNOWN_SHADOW_HOSTS list for O(Material components) performance
 * instead of scanning all DOM nodes.
 */
function getFieldShadowHosts(): HTMLElement[] {
  try {
    const candidates = document.querySelectorAll<HTMLElement>(SHADOW_HOST_SELECTOR);
    const hosts: HTMLElement[] = [];
    for (const el of candidates) {
      if (el.shadowRoot) {
        hosts.push(el);
      }
    }
    return hosts;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Shadow DOM piercing helpers
// ---------------------------------------------------------------------------

/**
 * Pierce a shadow boundary to find an input element inside a shadow root.
 *
 * Google Ads Material Web Components sometimes render <input> elements
 * inside Shadow DOM. This function checks if the host element has a
 * shadowRoot and queries inside it.
 *
 * @param host - The custom element that might have a shadow root
 * @param innerSelector - CSS selector to find inside the shadow root (default: 'input')
 * @returns The found element or null
 */
function pierceShadowForInput(
  host: HTMLElement,
  innerSelector = 'input',
): HTMLInputElement | null {
  // First check if the input is directly inside the host (no shadow DOM)
  const directInput = host.querySelector<HTMLInputElement>(innerSelector);
  if (directInput) return directInput;

  // Then check shadow root
  if (host.shadowRoot) {
    const shadowInput = host.shadowRoot.querySelector<HTMLInputElement>(innerSelector);
    if (shadowInput) return shadowInput;
  }

  return null;
}

/**
 * Read a value from a Material component, piercing shadow DOM if needed.
 *
 * Tries multiple strategies:
 *  1. Direct querySelector on the element
 *  2. Shadow root querySelector
 *  3. Parent element shadow root querySelector
 *
 * @param entry - The field selector entry
 * @returns The extracted value string or null
 */
function readValueWithShadowPiercing(entry: FieldSelectorEntry): string | null {
  // Try standard selector chain first (works for most components)
  for (const selector of entry.selectors) {
    try {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        // If the element itself is an input, read its value
        if ('value' in el && typeof (el as HTMLInputElement).value === 'string') {
          const val = (el as HTMLInputElement).value.trim();
          if (val.length > 0) return val;
        }

        // Check text content
        const text = el.textContent?.trim();
        if (text && text.length > 0) return text;
      }
    } catch {
      // Invalid selector, skip
    }
  }

  // If shadowDom flag is set, also try piercing shadow boundaries
  if (entry.shadowDom) {
    // Walk known shadow hosts (O(Material components) instead of O(all DOM nodes))
    const shadowHosts = getFieldShadowHosts();
    for (const host of shadowHosts) {
      for (const selector of entry.selectors) {
        try {
          const el = host.shadowRoot!.querySelector<HTMLElement>(selector);
          if (el) {
            if ('value' in el && typeof (el as HTMLInputElement).value === 'string') {
              const val = (el as HTMLInputElement).value.trim();
              if (val.length > 0) return val;
            }

            const text = el.textContent?.trim();
            if (text && text.length > 0) return text;
          }
        } catch {
          // skip
        }
      }
    }
  }

  return null;
}

/**
 * Read an array value with shadow DOM piercing.
 */
function readArrayValueWithShadowPiercing(entry: FieldSelectorEntry): string[] {
  const values: string[] = [];
  const seen = new Set<string>();

  // Standard DOM search
  for (const selector of entry.selectors) {
    try {
      const els = document.querySelectorAll<HTMLElement>(selector);
      for (const el of els) {
        const text = el.textContent?.trim();
        if (text && text.length > 0 && !seen.has(text)) {
          seen.add(text);
          values.push(text);
        }
      }
    } catch {
      // skip
    }
  }

  // Shadow DOM search if flagged (O(Material components) instead of O(all DOM nodes))
  if (entry.shadowDom && values.length === 0) {
    const shadowHosts = getFieldShadowHosts();
    for (const host of shadowHosts) {
      for (const selector of entry.selectors) {
        try {
          const els = host.shadowRoot!.querySelectorAll<HTMLElement>(selector);
          for (const el of els) {
            const text = el.textContent?.trim();
            if (text && text.length > 0 && !seen.has(text)) {
              seen.add(text);
              values.push(text);
            }
          }
        } catch {
          // skip
        }
      }
    }
  }

  return values;
}

// ---------------------------------------------------------------------------
// Direct DOM extraction helpers
// ---------------------------------------------------------------------------

/**
 * Read the value of a single-value field from the DOM.
 * Tries `(el as HTMLInputElement).value` first, then `textContent`.
 * Supports Shadow DOM piercing when the field entry has shadowDom: true.
 */
function readSingleValue(entry: FieldSelectorEntry): string | null {
  // Use shadow-piercing read for fields flagged with shadowDom
  if (entry.shadowDom) {
    return readValueWithShadowPiercing(entry);
  }

  const el = queryByChain(document, entry.selectors);

  if (!el) return null;

  if (entry.attribute) {
    return el.getAttribute(entry.attribute);
  }

  // For material-input components, try to find the inner input via shadow piercing
  if (el.tagName?.toLowerCase() === 'material-input' || el.tagName?.toLowerCase().startsWith('mat-')) {
    const input = pierceShadowForInput(el);
    if (input) {
      const val = input.value.trim();
      if (val.length > 0) return val;
    }
  }

  // Prefer .value for input / textarea elements
  if ('value' in el && typeof (el as HTMLInputElement).value === 'string') {
    const val = (el as HTMLInputElement).value.trim();
    if (val.length > 0) return val;
  }

  const text = el.textContent?.trim();
  return text && text.length > 0 ? text : null;
}

/**
 * Read an array-value field from the DOM.
 * Collects textContent from every matching element.
 * Supports Shadow DOM piercing when the field entry has shadowDom: true.
 */
function readArrayValue(entry: FieldSelectorEntry): string[] {
  // Use shadow-piercing read for fields flagged with shadowDom
  if (entry.shadowDom) {
    return readArrayValueWithShadowPiercing(entry);
  }

  const elements = queryAllByChain(document, entry.selectors);

  const values: string[] = [];

  for (const el of elements) {
    if (entry.attribute) {
      const attr = el.getAttribute(entry.attribute);
      if (attr) values.push(attr.trim());
      continue;
    }

    // For material-input, check inner input via shadow piercing
    if (el.tagName?.toLowerCase() === 'material-input' || el.tagName?.toLowerCase().startsWith('mat-')) {
      const input = pierceShadowForInput(el);
      if (input) {
        const val = input.value.trim();
        if (val.length > 0) {
          values.push(val);
          continue;
        }
      }
    }

    // Prefer .value for inputs
    if ('value' in el && typeof (el as HTMLInputElement).value === 'string') {
      const val = (el as HTMLInputElement).value.trim();
      if (val.length > 0) {
        values.push(val);
        continue;
      }
    }

    const text = el.textContent?.trim();
    if (text && text.length > 0) {
      values.push(text);
    }
  }

  return values;
}

// ---------------------------------------------------------------------------
// Named field getters
// ---------------------------------------------------------------------------

/**
 * Get the campaign name from the DOM.
 * Pierces shadow DOM on material-input[debugid="campaign-name"].
 */
export function getCampaignName(): string | null {
  return readSingleValue(GOOGLE_FIELD_SELECTORS['campaign.name']);
}

/**
 * Get the campaign type (Search, Display, Video, etc.) from the DOM.
 */
export function getCampaignType(): string | null {
  // First try the standard read
  const standard = readSingleValue(GOOGLE_FIELD_SELECTORS['campaign.type']);
  if (standard) return standard;

  // Special handling: find the selected radio option
  const selectedRadio = document.querySelector<HTMLElement>(
    '[data-campaigntype][aria-checked="true"]',
  );
  if (selectedRadio) {
    // Try the data attribute first
    const typeAttr = selectedRadio.getAttribute('data-campaigntype');
    if (typeAttr) return typeAttr;

    // Fall back to text content
    const text = selectedRadio.textContent?.trim();
    if (text) return text;
  }

  return null;
}

/**
 * Get the budget value. Returns a number if parseable, otherwise the raw string.
 * Pierces shadow DOM on material-input[debugid="budget-input"].
 */
export function getBudgetValue(): number | string | null {
  const raw = readSingleValue(GOOGLE_FIELD_SELECTORS['campaign.budget_value']);
  if (raw === null) return null;

  // Strip currency symbols and commas
  const cleaned = raw.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? raw : parsed;
}

/**
 * Get the selected bidding strategy.
 * Pierces shadow DOM on bidding strategy selector.
 */
export function getBiddingStrategy(): string | null {
  // First try the standard read
  const standard = readSingleValue(GOOGLE_FIELD_SELECTORS['campaign.bidding_strategy']);
  if (standard) return standard;

  // Special handling: find the selected option within the bidding selector
  const selectedOption = document.querySelector<HTMLElement>(
    '[debugid="bidding-strategy-selector"] [aria-selected="true"], ' +
    '.bidding-strategy-section .selected-strategy',
  );
  if (selectedOption) {
    // Try data attribute
    const strategyAttr = selectedOption.getAttribute('data-biddingstrategy');
    if (strategyAttr) return strategyAttr;

    const text = selectedOption.textContent?.trim();
    if (text) return text;
  }

  return null;
}

/**
 * Get the selected geo targets (location targeting).
 * Pierces shadow DOM on location targeting panel (Material autocomplete).
 */
export function getGeoTargets(): string[] {
  return readArrayValue(GOOGLE_FIELD_SELECTORS['campaign.geo_targets']);
}

/**
 * Get the selected languages.
 */
export function getLanguages(): string[] {
  return readArrayValue(GOOGLE_FIELD_SELECTORS['campaign.languages']);
}

/**
 * Get the excluded brand safety categories.
 */
export function getBrandSafety(): string[] {
  return readArrayValue(GOOGLE_FIELD_SELECTORS['campaign.brand_safety']);
}

/**
 * Get the campaign start date.
 */
export function getStartDate(): string | null {
  return readSingleValue(GOOGLE_FIELD_SELECTORS['campaign.start_date']);
}

/**
 * Get the campaign end date.
 */
export function getEndDate(): string | null {
  return readSingleValue(GOOGLE_FIELD_SELECTORS['campaign.end_date']);
}

/**
 * Get the ad group name.
 */
export function getAdGroupName(): string | null {
  return readSingleValue(GOOGLE_FIELD_SELECTORS['ad_group.name']);
}

/**
 * Get the default CPC bid. Returns a number if parseable.
 */
export function getCpcBid(): number | string | null {
  const raw = readSingleValue(GOOGLE_FIELD_SELECTORS['ad_group.cpc_bid']);
  if (raw === null) return null;

  const cleaned = raw.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? raw : parsed;
}

/**
 * Get all headline values from the ad creative form.
 */
export function getHeadlines(): string[] {
  return readArrayValue(GOOGLE_FIELD_SELECTORS['ad.headlines']);
}

/**
 * Get all description values from the ad creative form.
 */
export function getDescriptions(): string[] {
  return readArrayValue(GOOGLE_FIELD_SELECTORS['ad.descriptions']);
}

/**
 * Get the final URL.
 */
export function getFinalUrl(): string | null {
  return readSingleValue(GOOGLE_FIELD_SELECTORS['ad.final_url']);
}

/**
 * Get the display path components.
 */
export function getDisplayPath(): string[] {
  return readArrayValue(GOOGLE_FIELD_SELECTORS['ad.display_path']);
}

// ---------------------------------------------------------------------------
// Batch extraction via remoteEval bridge
// ---------------------------------------------------------------------------

/**
 * Build a RemoteEvalQuery that requests all known Google Ads fields at once.
 * This is used when the page-context eval bridge is available.
 */
export function buildBatchEvalQuery(): RemoteEvalQuery {
  const getters: RemoteEvalQuery['getters'] = [];

  for (const [field, entry] of Object.entries(GOOGLE_FIELD_SELECTORS)) {
    // Use the first selector from the chain as primary
    const primarySelector = entry.selectors[0];
    getters.push({
      field,
      method: 'elementValue',
      selector: primarySelector,
    });
  }

  return {
    type: 'evalQuery.governance',
    queryId: generateQueryId(),
    getters,
  };
}

// ---------------------------------------------------------------------------
// Aggregate extractor
// ---------------------------------------------------------------------------

/** All named getter functions keyed by field path. */
const FIELD_GETTERS: Readonly<Record<string, () => unknown>> = {
  'campaign.name': getCampaignName,
  'campaign.type': getCampaignType,
  'campaign.budget_value': getBudgetValue,
  'campaign.bidding_strategy': getBiddingStrategy,
  'campaign.geo_targets': getGeoTargets,
  'campaign.languages': getLanguages,
  'campaign.brand_safety': getBrandSafety,
  'campaign.start_date': getStartDate,
  'campaign.end_date': getEndDate,
  'ad_group.name': getAdGroupName,
  'ad_group.cpc_bid': getCpcBid,
  'ad.headlines': getHeadlines,
  'ad.descriptions': getDescriptions,
  'ad.final_url': getFinalUrl,
  'ad.display_path': getDisplayPath,
};

/**
 * Extract all field values using direct DOM reads.
 * Fields that cannot be found are omitted from the result.
 *
 * This is the primary extraction path. The remoteEval bridge path
 * (`extractFieldValuesViaRemoteEval`) can be used as an alternative when
 * direct DOM access is insufficient (e.g. Angular component internal state).
 */
export function extractAllFieldValues(): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [field, getter] of Object.entries(FIELD_GETTERS)) {
    try {
      const value = getter();
      // Only include non-null, non-empty values
      const found = value !== null && value !== undefined &&
        !(Array.isArray(value) && value.length === 0);

      if (found) {
        result[field] = value;
      }

      // Record telemetry for selector health monitoring
      const selectorEntry = GOOGLE_FIELD_SELECTORS[field];
      recordSelectorLookup({
        selector: selectorEntry
          ? selectorEntry.selectors.join(' | ')
          : field,
        platform: 'google_ads',
        fieldPath: field,
        timestamp: new Date().toISOString(),
        found,
        strategy: selectorEntry?.shadowDom ? 'shadow-dom' : 'query-chain',
      });
    } catch {
      // Graceful degradation -- skip fields that throw
      recordSelectorLookup({
        selector: field,
        platform: 'google_ads',
        fieldPath: field,
        timestamp: new Date().toISOString(),
        found: false,
        strategy: 'error',
      });
    }
  }

  return result;
}

/**
 * Extract all field values via the remoteEval postMessage bridge.
 * Falls back to direct DOM reads for any fields the bridge doesn't return.
 */
export async function extractFieldValuesViaRemoteEval(): Promise<Record<string, unknown>> {
  const query = buildBatchEvalQuery();

  let bridgeResults: Record<string, unknown>;
  try {
    bridgeResults = await sendRemoteEvalQuery(query);
  } catch {
    // Bridge unavailable, fall back entirely to DOM reads
    return extractAllFieldValues();
  }

  // Start with DOM reads as baseline
  const domResults = extractAllFieldValues();

  // Merge: bridge results take precedence when they're non-null
  const merged: Record<string, unknown> = { ...domResults };
  for (const [field, value] of Object.entries(bridgeResults)) {
    if (value !== null && value !== undefined) {
      merged[field] = value;
    }
  }

  return merged;
}

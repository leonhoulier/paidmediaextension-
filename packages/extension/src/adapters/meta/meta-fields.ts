/**
 * Meta Ads Manager Field Extraction
 *
 * Provides named getter functions for every Meta Ads Manager field defined
 * in Appendix B of the specification. Field values are extracted through:
 *
 *   1. Direct DOM value reading (input.value, aria-checked, etc.)
 *   2. React Fiber traversal for framework-internal state
 *   3. remoteEval postMessage bridge for cross-world access
 *
 * React Fiber Deep Extraction:
 *   For complex fields (targeting audiences, custom audiences, Advantage+
 *   toggles), the value may not be in a simple input element. This module
 *   walks the React Fiber tree to extract from component state via
 *   `fiber.memoizedState` and `fiber.memoizedProps`.
 *
 * @module meta-fields
 */

import { RemoteEvalQuery, RemoteEvalResult } from '@media-buying-governance/shared';
import { findFieldElement } from './meta-selectors.js';
import { logFieldExtraction } from '../../utils/telemetry.js';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Generate a short unique identifier for query correlation.
 * Uses crypto.randomUUID when available, falls back to a timestamp-based ID.
 */
function generateQueryId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// RemoteEval Bridge
// ---------------------------------------------------------------------------

/** Default timeout for remoteEval responses (milliseconds) */
const REMOTE_EVAL_TIMEOUT_MS = 5_000;

/**
 * RemoteEvalBatcher collects field evaluation requests and batches them
 * into a single postMessage round-trip for performance.
 *
 * Communication protocol:
 *   Content Script (ISOLATED) ---> postMessage('evalQuery.governance') ---> eval.js (MAIN)
 *   Content Script (ISOLATED) <--- postMessage('evalResult.governance') <--- eval.js (MAIN)
 */
export class RemoteEvalBatcher {
  private pendingQueries: Map<string, {
    resolve: (results: Record<string, unknown>) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();

  private listening = false;

  /**
   * Execute a remote eval query and wait for results.
   *
   * @param query - The eval query to send to the MAIN world
   * @param timeoutMs - Timeout in milliseconds (default 5000)
   * @returns Record of field paths to extracted values
   */
  async execute(
    query: RemoteEvalQuery,
    timeoutMs: number = REMOTE_EVAL_TIMEOUT_MS,
  ): Promise<Record<string, unknown>> {
    this.ensureListening();

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingQueries.delete(query.queryId);
        reject(new Error(`[Governance] remoteEval timeout for query ${query.queryId}`));
      }, timeoutMs);

      this.pendingQueries.set(query.queryId, { resolve, reject, timer });

      // Send query via CustomEvent (primary) with postMessage fallback
      try {
        window.dispatchEvent(new CustomEvent('evalQuery.governance', {
          detail: {
            queryId: query.queryId,
            getters: query.getters,
            expression: query.expression,
            params: query.params,
          },
        }));
      } catch {
        // Fallback to postMessage if CustomEvent fails
        window.postMessage(query, '*');
      }
    });
  }

  /**
   * Start listening for evalResult messages if not already.
   *
   * The eval bridge responds via postMessage (with optional Transferable
   * ArrayBuffer), so we listen on `message` events.
   */
  private ensureListening(): void {
    if (this.listening) return;
    this.listening = true;

    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== null && event.source !== window) return;
      const data = event.data as RemoteEvalResult | undefined;
      if (!data || data.type !== 'evalResult.governance') return;

      const pending = this.pendingQueries.get(data.queryId);
      if (!pending) return;

      clearTimeout(pending.timer);
      this.pendingQueries.delete(data.queryId);

      // If a Transferable ArrayBuffer was included, decode it.
      // Use duck typing (byteLength check) because `instanceof ArrayBuffer`
      // can fail across execution contexts / realms.
      if (data.buffer && typeof (data.buffer as ArrayBuffer).byteLength === 'number') {
        try {
          const decoder = new TextDecoder();
          const decoded = decoder.decode(data.buffer);
          const parsed = JSON.parse(decoded) as Record<string, unknown>;
          pending.resolve(parsed);
          return;
        } catch {
          // Fall through to regular results
        }
      }

      pending.resolve(data.results);
    });
  }

  /**
   * Clean up all pending queries and stop listening.
   */
  destroy(): void {
    for (const [, pending] of this.pendingQueries) {
      clearTimeout(pending.timer);
      pending.reject(new Error('[Governance] RemoteEvalBatcher destroyed'));
    }
    this.pendingQueries.clear();
  }
}

/** Module-level batcher instance */
let batcher: RemoteEvalBatcher | null = null;

/**
 * Get (or create) the module-level RemoteEvalBatcher instance.
 */
export function getRemoteEvalBatcher(): RemoteEvalBatcher {
  if (!batcher) {
    batcher = new RemoteEvalBatcher();
  }
  return batcher;
}

/**
 * Destroy the module-level batcher (for cleanup).
 */
export function destroyRemoteEvalBatcher(): void {
  if (batcher) {
    batcher.destroy();
    batcher = null;
  }
}

// ---------------------------------------------------------------------------
// React Fiber Traversal (Deep Extraction)
// ---------------------------------------------------------------------------

/**
 * Find the React Fiber key on a DOM element.
 *
 * React 16+ attaches a `__reactFiber$xxx` property to every DOM element
 * it manages. The suffix varies per React instance but the prefix is stable.
 * Older React versions use `__reactInternalInstance$xxx`.
 *
 * @param element - The DOM element to inspect
 * @returns The fiber key name, or null if not found
 */
function findFiberKey(element: HTMLElement): string | null {
  const keys = Object.keys(element);
  return (
    keys.find((key) => key.startsWith('__reactFiber$')) ??
    keys.find((key) => key.startsWith('__reactInternalInstance$')) ??
    null
  );
}

/**
 * Get the React Fiber node from a DOM element.
 *
 * @param element - The DOM element
 * @returns The fiber node, or null
 */
function getFiber(element: HTMLElement): Record<string, unknown> | null {
  const key = findFiberKey(element);
  if (!key) return null;
  try {
    return (element as unknown as Record<string, unknown>)[key] as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

/**
 * Attempt to read React Fiber internal state from a DOM element.
 *
 * React attaches a `__reactFiber$xxx` key to DOM elements. By walking the
 * fiber tree we can access component props and state without relying on
 * fragile DOM selectors.
 *
 * @param element - The DOM element to inspect
 * @returns The memoizedProps from the fiber, or null
 */
export function getReactFiberProps(element: HTMLElement): Record<string, unknown> | null {
  const fiber = getFiber(element);
  if (!fiber) return null;

  try {
    if (typeof fiber === 'object' && 'memoizedProps' in fiber) {
      return fiber.memoizedProps as Record<string, unknown>;
    }
  } catch {
    // Graceful degradation: React Fiber access can fail if structure changes
  }

  return null;
}

/**
 * Walk up the React Fiber tree from a DOM element to find a component
 * whose name or type matches the given pattern.
 *
 * @param element - Starting DOM element
 * @param componentNamePattern - Regex pattern to match component displayName or name
 * @param maxDepth - Maximum fiber tree levels to traverse (default 20)
 * @returns The matching fiber's memoizedProps, or null
 */
export function findReactComponentProps(
  element: HTMLElement,
  componentNamePattern: RegExp,
  maxDepth: number = 20,
): Record<string, unknown> | null {
  const fiber = getFiber(element);
  if (!fiber) return null;

  try {
    let current: Record<string, unknown> | null = fiber;
    let depth = 0;

    while (current && depth < maxDepth) {
      const type = current.type as Record<string, unknown> | string | null;
      let name: string | null = null;

      if (typeof type === 'function') {
        name = (type as Record<string, unknown>).displayName as string ??
               (type as Record<string, unknown>).name as string ??
               null;
      } else if (typeof type === 'object' && type !== null) {
        name = (type as Record<string, unknown>).displayName as string ??
               (type as Record<string, unknown>).name as string ??
               null;
      }

      if (name && componentNamePattern.test(name)) {
        return current.memoizedProps as Record<string, unknown> | null;
      }

      current = current.return as Record<string, unknown> | null;
      depth++;
    }
  } catch {
    // Graceful degradation
  }

  return null;
}

/**
 * Walk the React Fiber tree to extract memoizedState from a component.
 *
 * This is used for complex fields where the value lives in component state
 * rather than props (e.g. targeting audience selections stored in local state).
 *
 * @param element - Starting DOM element
 * @param componentNamePattern - Regex to match the component name
 * @param maxDepth - Maximum fiber tree levels to traverse
 * @returns The memoizedState or null
 */
export function findReactComponentState(
  element: HTMLElement,
  componentNamePattern: RegExp,
  maxDepth: number = 20,
): unknown | null {
  const fiber = getFiber(element);
  if (!fiber) return null;

  try {
    let current: Record<string, unknown> | null = fiber;
    let depth = 0;

    while (current && depth < maxDepth) {
      const type = current.type as Record<string, unknown> | string | null;
      let name: string | null = null;

      if (typeof type === 'function') {
        name = (type as Record<string, unknown>).displayName as string ??
               (type as Record<string, unknown>).name as string ??
               null;
      } else if (typeof type === 'object' && type !== null) {
        name = (type as Record<string, unknown>).displayName as string ??
               (type as Record<string, unknown>).name as string ??
               null;
      }

      if (name && componentNamePattern.test(name)) {
        return current.memoizedState as unknown;
      }

      current = current.return as Record<string, unknown> | null;
      depth++;
    }
  } catch {
    // Graceful degradation
  }

  return null;
}

/**
 * Extract a deeply nested value from React Fiber memoizedProps by walking
 * both up (parent fibers) and across (child / sibling fibers).
 *
 * This is needed for fields like placement selections where the value
 * might be several levels deep in the component tree.
 *
 * @param element - Starting DOM element
 * @param propPath - Dot-separated path into memoizedProps
 * @param maxDepth - Max levels to walk up
 * @returns The extracted value or null
 */
export function extractFiberPropByPath(
  element: HTMLElement,
  propPath: string,
  maxDepth: number = 15,
): unknown | null {
  const fiber = getFiber(element);
  if (!fiber) return null;

  const pathParts = propPath.split('.');

  try {
    let current: Record<string, unknown> | null = fiber;
    let depth = 0;

    while (current && depth < maxDepth) {
      const props = current.memoizedProps as Record<string, unknown> | null;
      if (props) {
        const value = getNestedProp(props, pathParts);
        if (value !== undefined && value !== null) {
          return value;
        }
      }

      current = current.return as Record<string, unknown> | null;
      depth++;
    }
  } catch {
    // Graceful degradation
  }

  return null;
}

/**
 * Get a nested property value from an object using an array of keys.
 */
function getNestedProp(obj: Record<string, unknown>, keys: string[]): unknown {
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

// ---------------------------------------------------------------------------
// Individual Field Getters
// ---------------------------------------------------------------------------

/**
 * Extract the campaign name from the DOM.
 */
export function getCampaignName(): string | null {
  const el = findFieldElement('campaign.name');
  if (el && el.tagName === 'INPUT') {
    return (el as HTMLInputElement).value || null;
  }
  // React Fiber fallback
  if (el) {
    const props = getReactFiberProps(el);
    if (props && typeof props.value === 'string') {
      return props.value;
    }
  }
  return null;
}

/**
 * Extract the selected campaign objective.
 *
 * The objective is typically a card or radio button selection.
 * We look for aria-selected="true" or a selected/active CSS class.
 * Falls back to React Fiber for the component's value prop.
 */
export function getCampaignObjective(): string | null {
  const container = findFieldElement('campaign.objective');
  if (!container) return null;

  // Look for selected card / radio button
  const selected =
    container.querySelector<HTMLElement>('[aria-selected="true"]') ??
    container.querySelector<HTMLElement>('[aria-checked="true"]') ??
    container.querySelector<HTMLElement>('.selected, .active, [data-selected="true"]');

  if (selected) {
    return selected.textContent?.trim() || null;
  }

  // React Fiber fallback: walk the fiber tree to find ObjectiveSelector
  const fiberProps = findReactComponentProps(container, /Objective|ObjectiveSelector/i);
  if (fiberProps && typeof fiberProps.value === 'string') {
    return fiberProps.value;
  }

  // Direct fiber props fallback
  const props = getReactFiberProps(container);
  if (props && typeof props.value === 'string') {
    return props.value;
  }

  return null;
}

/**
 * Extract the budget type (Daily / Lifetime).
 */
export function getCampaignBudgetType(): string | null {
  const el = findFieldElement('campaign.budget_type');
  if (!el) return null;

  // Dropdown value (legacy native select)
  if (el instanceof HTMLSelectElement) {
    return el.value || null;
  }

  // Check the element's own text content first (2026 Meta DOM: plain text in div)
  const ownText = el.textContent?.trim().toLowerCase() ?? '';
  if (ownText.includes('daily')) return 'daily';
  if (ownText.includes('lifetime')) return 'lifetime';

  // Read text content of the selected option (custom dropdown)
  const selectedOption =
    el.querySelector<HTMLElement>('[aria-selected="true"]') ??
    el.querySelector<HTMLElement>('[aria-checked="true"]') ??
    el.querySelector<HTMLElement>('.selected');
  if (selectedOption) {
    const text = selectedOption.textContent?.trim().toLowerCase() ?? '';
    if (text.includes('daily')) return 'daily';
    if (text.includes('lifetime')) return 'lifetime';
    return text || null;
  }

  // React Fiber fallback
  const props = getReactFiberProps(el);
  if (props && typeof props.value === 'string') {
    return props.value;
  }

  return null;
}

/**
 * Extract the budget value (numeric).
 *
 * Handles currency formatting (commas, dollar signs, etc.).
 */
export function getCampaignBudgetValue(): number | null {
  const el = findFieldElement('campaign.budget_value');
  console.log('[BUDGET-DEBUG] findFieldElement result:', el?.tagName, el?.className?.substring(0, 30), 'value:', (el as HTMLInputElement)?.value);
  if (!el) return null;

  let rawValue: string | null = null;

  if (el.tagName === 'INPUT') {
    rawValue = (el as HTMLInputElement).value;
    console.log('[BUDGET-DEBUG] INPUT value:', rawValue);
  } else {
    const props = getReactFiberProps(el);
    if (props && (typeof props.value === 'string' || typeof props.value === 'number')) {
      rawValue = String(props.value);
    }
  }

  if (!rawValue) return null;

  // Strip currency symbols and formatting
  const cleaned = rawValue.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Extract the CBO (Campaign Budget Optimization / Advantage+) toggle state.
 *
 * Uses a multi-strategy approach:
 * 1. aria-checked attribute on the toggle element
 * 2. Checkbox input state
 * 3. React Fiber traversal for the CBOToggle component
 */
export function getCampaignCBOEnabled(): boolean | null {
  const el = findFieldElement('campaign.cbo_enabled');
  if (!el) return null;

  // Check aria-checked attribute (standard for toggle switches)
  const ariaChecked = el.getAttribute('aria-checked');
  if (ariaChecked !== null) {
    return ariaChecked === 'true';
  }

  // Check for checkbox input
  if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'checkbox') {
    return (el as HTMLInputElement).checked;
  }

  // Look for a child switch/checkbox
  const toggle =
    el.querySelector<HTMLElement>('[role="switch"]') ??
    el.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (toggle) {
    const checked = toggle.getAttribute('aria-checked');
    if (checked !== null) return checked === 'true';
    if (toggle.tagName === 'INPUT') return (toggle as HTMLInputElement).checked;
  }

  // React Fiber deep extraction: walk tree to find CBOToggle/AdvantageToggle
  const fiberProps = findReactComponentProps(el, /CBO|Advantage|BudgetOptimization/i);
  if (fiberProps) {
    if (typeof fiberProps.checked === 'boolean') return fiberProps.checked;
    if (typeof fiberProps.value === 'boolean') return fiberProps.value;
    if (typeof fiberProps.isEnabled === 'boolean') return fiberProps.isEnabled;
  }

  // Direct fiber props fallback
  const props = getReactFiberProps(el);
  if (props && typeof props.checked === 'boolean') {
    return props.checked;
  }
  if (props && typeof props.value === 'boolean') {
    return props.value;
  }

  return null;
}

/**
 * Extract the ad set name.
 */
export function getAdSetName(): string | null {
  const el = findFieldElement('ad_set.name');
  if ((el.tagName === 'INPUT')) {
    return el.value || null;
  }
  if (el) {
    const props = getReactFiberProps(el);
    if (props && typeof props.value === 'string') {
      return props.value;
    }
  }
  return null;
}

/**
 * Extract selected geo locations (array of location names/IDs).
 *
 * Uses React Fiber deep extraction for the location component tree,
 * with DOM tag/chip fallback.
 */
export function getGeoLocations(): string[] | null {
  const container = findFieldElement('ad_set.targeting.geo_locations');
  if (!container) return null;

  // Strategy 1: Look for selected location tags/chips in DOM
  const locationElements = container.querySelectorAll<HTMLElement>(
    '[data-testid*="location-tag"], .selected-location, [role="listitem"], .tag, .chip',
  );

  if (locationElements.length > 0) {
    const locations: string[] = [];
    for (const el of locationElements) {
      const text = el.textContent?.trim();
      if (text) locations.push(text);
    }
    if (locations.length > 0) return locations;
  }

  // Strategy 2: Walk the React Fiber tree for targeting data
  const fiberProps = findReactComponentProps(container, /Location|GeoTarget|TargetingLocations/i);
  if (fiberProps) {
    // Try common prop patterns
    if (Array.isArray(fiberProps.selectedLocations)) {
      return fiberProps.selectedLocations.map((loc: unknown) => {
        if (typeof loc === 'string') return loc;
        if (typeof loc === 'object' && loc !== null) {
          const locObj = loc as Record<string, unknown>;
          return (locObj.name as string) ?? (locObj.label as string) ?? String(locObj.key ?? loc);
        }
        return String(loc);
      });
    }
    if (Array.isArray(fiberProps.locations)) {
      return fiberProps.locations.map((loc: unknown) =>
        typeof loc === 'string' ? loc : String(loc),
      );
    }
    if (Array.isArray(fiberProps.value)) {
      return fiberProps.value.map((v: unknown) => String(v));
    }
  }

  // Strategy 3: React Fiber state extraction
  const fiberState = findReactComponentState(container, /Location|GeoTarget/i);
  if (fiberState && typeof fiberState === 'object') {
    const stateObj = fiberState as Record<string, unknown>;
    if (Array.isArray(stateObj.selectedLocations)) {
      return stateObj.selectedLocations.map((loc: unknown) => String(loc));
    }
  }

  // Strategy 4: Search within parent container
  const parent = container.closest<HTMLElement>('[class*="location"], [class*="geo"]');
  if (parent) {
    const tags = parent.querySelectorAll<HTMLElement>('.tag, .chip, [role="listitem"]');
    const locations: string[] = [];
    for (const el of tags) {
      const text = el.textContent?.trim();
      if (text) locations.push(text);
    }
    if (locations.length > 0) return locations;
  }

  // Strategy 5: DOM text search fallback — find "Included location:" text and extract country names
  const allText = document.body.innerText;
  const locMatch = allText.match(/Included location[s]?:\s*\n?\s*([^\n]+)/i);
  if (locMatch) {
    const locText = locMatch[1].trim();
    // Split by bullet/comma and clean up
    const locs = locText.split(/[•,]/).map((s: string) => s.trim()).filter((s: string) => s.length > 1);
    if (locs.length > 0) return locs;
  }

  return null;
}

/**
 * Common country name to ISO code mapping for rule evaluation.
 */
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  'france': 'FR', 'united states': 'US', 'united kingdom': 'UK', 'germany': 'DE',
  'japan': 'JP', 'australia': 'AU', 'brazil': 'BR', 'canada': 'CA', 'spain': 'ES',
  'italy': 'IT', 'netherlands': 'NL', 'belgium': 'BE', 'switzerland': 'CH',
  'mexico': 'MX', 'india': 'IN', 'china': 'CN', 'south korea': 'KR',
};

/**
 * Get targeting countries as ISO codes for rule evaluation.
 * Rules check ad_set.targeting.geo_locations.countries against codes like ["FR", "US"].
 */
export function getGeoLocationCountries(): string[] | null {
  // Strategy 1: Try getGeoLocations() (uses findFieldElement container)
  const locations = getGeoLocations();
  if (locations && locations.length > 0) {
    // Filter out navigation/UI garbage (must be real country names)
    const validLocations = locations.filter((loc: string) => {
      const lower = loc.toLowerCase().trim();
      return lower in COUNTRY_NAME_TO_CODE || /^[A-Z]{2}$/.test(loc.trim());
    });
    if (validLocations.length > 0) {
      return validLocations.map((loc: string) => {
        const lower = loc.toLowerCase().trim();
        return COUNTRY_NAME_TO_CODE[lower] ?? loc;
      });
    }
  }

  // Strategy 2: Search innerHTML (includes off-screen content in scrollable containers)
  // Meta renders the full form but innerText only returns visible text
  const htmlContent = document.body.innerHTML;
  const knownCountries = Object.keys(COUNTRY_NAME_TO_CODE);
  const foundInHtml: string[] = [];

  // Look for "Included location" section in HTML, then find country names nearby
  const inclIdx = htmlContent.indexOf('Included location');
  if (inclIdx > -1) {
    // Search in a window around the "Included location" text
    const searchWindow = htmlContent.substring(inclIdx, inclIdx + 2000);
    for (const country of knownCountries) {
      const capitalized = country.charAt(0).toUpperCase() + country.slice(1);
      if (searchWindow.includes(capitalized)) {
        foundInHtml.push(COUNTRY_NAME_TO_CODE[country]);
      }
    }
    if (foundInHtml.length > 0) return foundInHtml;
  }

  // Strategy 3: Broad search — find country names anywhere in page HTML
  // Use textContent (includes all text regardless of viewport visibility)
  const fullText = document.body.textContent ?? '';
  const foundBroad: string[] = [];
  for (const country of knownCountries) {
    const capitalized = country.charAt(0).toUpperCase() + country.slice(1);
    // Look for country name near location-related context
    const countryIdx = fullText.indexOf(capitalized);
    if (countryIdx > -1) {
      // Verify it's in a location context (not just random text)
      const context = fullText.substring(Math.max(0, countryIdx - 200), countryIdx + 100);
      if (context.includes('location') || context.includes('Location') || context.includes('targeting') ||
          context.includes('country') || context.includes('Included')) {
        foundBroad.push(COUNTRY_NAME_TO_CODE[country]);
      }
    }
  }
  if (foundBroad.length > 0 && foundBroad.length <= 5) return foundBroad;

  return null;
}

/**
 * Extract the age range (min, max).
 *
 * Tries DOM inputs/selects first, then React Fiber for the
 * AgeRange/AgeSelector component.
 */
export function getAgeRange(): { min: number; max: number } | null {
  const container = findFieldElement('ad_set.targeting.age_range');
  if (!container) return null;

  // Look for min/max inputs
  const inputs = container.querySelectorAll<HTMLInputElement>('input');
  if (inputs.length >= 2) {
    const min = parseInt(inputs[0].value, 10);
    const max = parseInt(inputs[1].value, 10);
    if (!isNaN(min) && !isNaN(max)) {
      return { min, max };
    }
  }

  // Look for select elements
  const selects = container.querySelectorAll<HTMLSelectElement>('select');
  if (selects.length >= 2) {
    const min = parseInt(selects[0].value, 10);
    const max = parseInt(selects[1].value, 10);
    if (!isNaN(min) && !isNaN(max)) {
      return { min, max };
    }
  }

  // React Fiber deep extraction: walk tree for AgeRange component
  const fiberProps = findReactComponentProps(container, /AgeRange|AgeSelector|AgePicker/i);
  if (fiberProps) {
    if (typeof fiberProps.minAge === 'number' && typeof fiberProps.maxAge === 'number') {
      return { min: fiberProps.minAge, max: fiberProps.maxAge };
    }
    if (typeof fiberProps.min === 'number' && typeof fiberProps.max === 'number') {
      return { min: fiberProps.min, max: fiberProps.max };
    }
    if (fiberProps.value && typeof fiberProps.value === 'object') {
      const v = fiberProps.value as Record<string, unknown>;
      if (typeof v.min === 'number' && typeof v.max === 'number') {
        return { min: v.min, max: v.max };
      }
    }
  }

  // Direct props fallback
  const props = getReactFiberProps(container);
  if (props && typeof props.minAge === 'number' && typeof props.maxAge === 'number') {
    return { min: props.minAge, max: props.maxAge };
  }

  return null;
}

/**
 * Extract selected genders (array).
 *
 * Tries DOM checkboxes/radio buttons first, then React Fiber.
 */
export function getGenders(): string[] | null {
  const container = findFieldElement('ad_set.targeting.genders');
  if (!container) return null;

  // Look for checked checkboxes or radio buttons
  const checked = container.querySelectorAll<HTMLElement>(
    'input[type="checkbox"]:checked, input[type="radio"]:checked, [aria-checked="true"]',
  );

  if (checked.length > 0) {
    const genders: string[] = [];
    for (const el of checked) {
      const label = el.closest('label')?.textContent?.trim();
      if (label) {
        genders.push(label);
      } else {
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) genders.push(ariaLabel);
      }
    }
    if (genders.length > 0) return genders;
  }

  // Look for selected options
  const selected = container.querySelectorAll<HTMLElement>(
    '.selected, [aria-selected="true"], [data-selected="true"]',
  );
  if (selected.length > 0) {
    const genders: string[] = [];
    for (const el of selected) {
      const text = el.textContent?.trim();
      if (text) genders.push(text);
    }
    if (genders.length > 0) return genders;
  }

  // React Fiber deep extraction: GenderSelector component
  const fiberProps = findReactComponentProps(container, /Gender|GenderSelector/i);
  if (fiberProps) {
    if (Array.isArray(fiberProps.selectedGenders)) {
      return fiberProps.selectedGenders.map((g: unknown) => String(g));
    }
    if (Array.isArray(fiberProps.value)) {
      return fiberProps.value.map((g: unknown) => String(g));
    }
    if (typeof fiberProps.gender === 'string') {
      return [fiberProps.gender];
    }
  }

  return null;
}

/**
 * Extract selected languages (array).
 *
 * Uses DOM chip/tag elements first, then React Fiber for
 * the LanguageSelector component.
 */
export function getLanguages(): string[] | null {
  const container = findFieldElement('ad_set.targeting.languages');
  if (!container) return null;

  // Look for language tags/chips
  const tags = container.querySelectorAll<HTMLElement>(
    '.tag, .chip, [role="listitem"], [data-testid*="language-tag"]',
  );

  if (tags.length > 0) {
    const languages: string[] = [];
    for (const el of tags) {
      const text = el.textContent?.trim();
      if (text) languages.push(text);
    }
    if (languages.length > 0) return languages;
  }

  // React Fiber deep extraction: LanguageSelector component
  const fiberProps = findReactComponentProps(container, /Language|LanguageSelector|LocaleSelector/i);
  if (fiberProps) {
    if (Array.isArray(fiberProps.selectedLanguages)) {
      return fiberProps.selectedLanguages.map((l: unknown) => {
        if (typeof l === 'string') return l;
        if (typeof l === 'object' && l !== null) {
          const lObj = l as Record<string, unknown>;
          return (lObj.name as string) ?? (lObj.label as string) ?? String(l);
        }
        return String(l);
      });
    }
    if (Array.isArray(fiberProps.value)) {
      return fiberProps.value.map((l: unknown) => String(l));
    }
  }

  return null;
}

/**
 * Extract selected placements (array).
 *
 * This is one of the most complex fields: Meta's placement selector
 * uses deeply nested React components. We use Fiber deep extraction
 * to walk to the PlacementSelector/PlacementPicker component.
 */
export function getPlacements(): string[] | null {
  const container = findFieldElement('ad_set.placements');
  if (!container) return null;

  // Check if "Manual placements" or "Advantage+ placements" is selected
  const selectedElements = container.querySelectorAll<HTMLElement>(
    '[aria-checked="true"], input:checked, .selected',
  );

  if (selectedElements.length > 0) {
    const placements: string[] = [];
    for (const el of selectedElements) {
      const label = el.closest('label')?.textContent?.trim();
      if (label) {
        placements.push(label);
      } else {
        const text = el.textContent?.trim();
        if (text) placements.push(text);
      }
    }
    if (placements.length > 0) return placements;
  }

  // React Fiber deep extraction: PlacementSelector component
  const fiberProps = findReactComponentProps(
    container,
    /Placement|PlacementSelector|PlacementPicker|PlacementConfig/i,
  );
  if (fiberProps) {
    // Check for Advantage+ vs Manual
    if (typeof fiberProps.placementType === 'string') {
      return [fiberProps.placementType];
    }
    if (Array.isArray(fiberProps.selectedPlacements)) {
      return fiberProps.selectedPlacements.map((p: unknown) => String(p));
    }
    if (Array.isArray(fiberProps.placements)) {
      return fiberProps.placements.map((p: unknown) => String(p));
    }
    if (fiberProps.isAdvantagePlus === true || fiberProps.isAutomaticPlacements === true) {
      return ['Advantage+ placements'];
    }
  }

  // Fiber prop path extraction: try common nested structures
  const placementValue = extractFiberPropByPath(container, 'placements');
  if (Array.isArray(placementValue)) {
    return placementValue.map((p: unknown) => String(p));
  }

  return null;
}

/**
 * Extract custom audiences (array of audience IDs/names).
 *
 * Custom audiences are managed via React state in a dialog/picker component.
 * Uses the selector registry (META_FIELD_SELECTORS) to locate the container,
 * then looks for audience chips/tags or falls back to React Fiber.
 */
export function getCustomAudiences(): string[] | null {
  // Use the selector registry -- no more speculative direct query fallback
  const container = findFieldElement('ad_set.targeting.custom_audiences');
  if (!container) return null;

  // DOM approach: look for audience chips/tags
  const tags = container.querySelectorAll<HTMLElement>(
    '.tag, .chip, [role="listitem"], [data-testid*="audience-tag"]',
  );
  if (tags.length > 0) {
    const audiences: string[] = [];
    for (const el of tags) {
      const text = el.textContent?.trim();
      if (text) audiences.push(text);
    }
    if (audiences.length > 0) return audiences;
  }

  // React Fiber deep extraction
  const fiberProps = findReactComponentProps(
    container,
    /CustomAudience|AudienceSelector|AudiencePicker/i,
  );
  if (fiberProps) {
    if (Array.isArray(fiberProps.selectedAudiences)) {
      return fiberProps.selectedAudiences.map((a: unknown) => {
        if (typeof a === 'string') return a;
        if (typeof a === 'object' && a !== null) {
          const aObj = a as Record<string, unknown>;
          return (aObj.name as string) ?? (aObj.id as string) ?? String(a);
        }
        return String(a);
      });
    }
    if (Array.isArray(fiberProps.audiences)) {
      return fiberProps.audiences.map((a: unknown) => String(a));
    }
  }

  return null;
}

/**
 * Extract schedule start date.
 */
export function getScheduleStartDate(): string | null {
  const el = findFieldElement('ad_set.schedule.start_date');
  if ((el.tagName === 'INPUT')) {
    return el.value || null;
  }
  if (el) {
    const props = getReactFiberProps(el);
    if (props && typeof props.value === 'string') {
      return props.value;
    }
  }
  return null;
}

/**
 * Extract schedule end date.
 */
export function getScheduleEndDate(): string | null {
  const el = findFieldElement('ad_set.schedule.end_date');
  if ((el.tagName === 'INPUT')) {
    return el.value || null;
  }
  if (el) {
    const props = getReactFiberProps(el);
    if (props && typeof props.value === 'string') {
      return props.value;
    }
  }
  return null;
}

/**
 * Extract the ad name.
 */
export function getAdName(): string | null {
  const el = findFieldElement('ad.name');
  if ((el.tagName === 'INPUT')) {
    return el.value || null;
  }
  if (el) {
    const props = getReactFiberProps(el);
    if (props && typeof props.value === 'string') {
      return props.value;
    }
  }
  return null;
}

/**
 * Extract the destination URL.
 */
export function getDestinationUrl(): string | null {
  const el = findFieldElement('ad.creative.destination_url');
  if ((el.tagName === 'INPUT')) {
    return el.value || null;
  }
  if (el) {
    const props = getReactFiberProps(el);
    if (props && typeof props.value === 'string') {
      return props.value;
    }
  }
  return null;
}

/**
 * Extract the CTA (Call to Action) type.
 */
export function getCTAType(): string | null {
  const el = findFieldElement('ad.creative.cta_type');
  if (!el) return null;

  // Dropdown value
  if (el instanceof HTMLSelectElement) {
    return el.value || null;
  }

  // Read the visible selected text
  const selectedOption =
    el.querySelector<HTMLElement>('[aria-selected="true"]') ??
    el.querySelector<HTMLElement>('.selected');
  if (selectedOption) {
    return selectedOption.textContent?.trim() || null;
  }

  // Check element's own text
  const text = el.textContent?.trim();
  if (text) return text;

  // React Fiber fallback
  const props = getReactFiberProps(el);
  if (props && typeof props.value === 'string') {
    return props.value;
  }

  return null;
}

/**
 * Extract the Facebook Page ID.
 */
export function getPageId(): string | null {
  const el = findFieldElement('ad.creative.page_id');
  if (!el) return null;

  // Check for a data attribute containing the page ID
  const pageId = el.getAttribute('data-page-id') ?? el.getAttribute('data-id');
  if (pageId) return pageId;

  // If it is a select element
  if (el instanceof HTMLSelectElement) {
    return el.value || null;
  }

  // Check visible selected text
  const selectedOption =
    el.querySelector<HTMLElement>('[aria-selected="true"]') ??
    el.querySelector<HTMLElement>('.selected');
  if (selectedOption) {
    return selectedOption.textContent?.trim() || null;
  }

  // React Fiber fallback -- walk to PageSelector component
  const fiberProps = findReactComponentProps(el, /PageSelector|PagePicker|FacebookPage/i);
  if (fiberProps) {
    if (typeof fiberProps.pageId === 'string') return fiberProps.pageId;
    if (typeof fiberProps.selectedPageId === 'string') return fiberProps.selectedPageId;
  }

  const props = getReactFiberProps(el);
  if (props && (typeof props.pageId === 'string' || typeof props.value === 'string')) {
    return (props.pageId as string) ?? (props.value as string);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Aggregated Extraction
// ---------------------------------------------------------------------------

/** All DOM getter functions mapped by their field path */
const FIELD_GETTERS: Record<string, () => unknown> = {
  'campaign.name': getCampaignName,
  'campaign.objective': getCampaignObjective,
  'campaign.budget_type': getCampaignBudgetType,
  'campaign.budget_value': getCampaignBudgetValue,
  'campaign.cbo_enabled': getCampaignCBOEnabled,
  'ad_set.name': getAdSetName,
  'ad_set.targeting.geo_locations': getGeoLocations,
  'ad_set.targeting.age_range': getAgeRange,
  'ad_set.targeting.genders': getGenders,
  'ad_set.targeting.languages': getLanguages,
  'ad_set.targeting.custom_audiences': getCustomAudiences,
  'ad_set.placements': getPlacements,
  'ad_set.schedule.start_date': getScheduleStartDate,
  'ad_set.schedule.end_date': getScheduleEndDate,
  'ad.name': getAdName,
  'ad.creative.destination_url': getDestinationUrl,
  'ad.creative.cta_type': getCTAType,
  'ad.creative.page_id': getPageId,
  // Aliases: backend rules use these field paths, map to the extraction functions above
  'ad.facebook_page_id': getPageId,
  'ad.destination_url': getDestinationUrl,
  'ad_set.targeting.geo_locations.countries': getGeoLocationCountries,
};

// ---------------------------------------------------------------------------
// Feature Flag
// ---------------------------------------------------------------------------

/**
 * Check whether the require()-based extraction is enabled.
 *
 * The feature flag `enable-require-extraction` is stored in
 * chrome.storage.local. Defaults to TRUE (enabled) for best accuracy.
 * Can be disabled by setting the flag to false.
 */
let requireExtractionEnabled: boolean | null = null;

export async function isRequireExtractionEnabled(): Promise<boolean> {
  if (requireExtractionEnabled !== null) {
    console.log('[EXTRACTION] Using cached require flag:', requireExtractionEnabled);
    return requireExtractionEnabled;
  }
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const result = await chrome.storage.local.get('enable-require-extraction');
      console.log('[EXTRACTION] chrome.storage.local result:', result);
      // Default to FALSE — require() extraction is unreliable in Chrome for Testing
      // and causes the extraction pipeline to stall. DOM fallback (Strategy 5) is more reliable.
      requireExtractionEnabled = result['enable-require-extraction'] === true;
      console.log('[EXTRACTION] Parsed require flag:', requireExtractionEnabled);
    } else {
      console.log('[EXTRACTION] chrome.storage not available, defaulting to true');
      requireExtractionEnabled = true;
    }
  } catch (err) {
    console.log('[EXTRACTION] Error reading chrome.storage:', err);
    requireExtractionEnabled = true;
  }
  return requireExtractionEnabled;
}

/**
 * Override the feature flag at runtime (useful for tests).
 */
export function setRequireExtractionEnabled(value: boolean): void {
  requireExtractionEnabled = value;
}

// ---------------------------------------------------------------------------
// require() Tree -> Field Path Mapping (88 fields)
// ---------------------------------------------------------------------------

/**
 * Map from our canonical field paths to the expected keys in the
 * Facebook editor tree returned by `facebookEditorTree`.
 *
 * Each entry maps `fieldPath` -> `{ store, path }` where:
 *   - `store` is the module name in the tree
 *   - `path` is the dot-separated property path within that store's state
 *
 * This mapping covers the 88 fields defined in Appendix B of the spec.
 */
const REQUIRE_FIELD_MAP: Record<string, { store: string; path: string }> = {
  // Campaign fields
  'campaign.name': { store: 'AdsCampaignDataStore', path: 'name' },
  'campaign.objective': { store: 'AdsCampaignDataStore', path: 'objective' },
  'campaign.budget_type': { store: 'AdsCampaignDataStore', path: 'budgetType' },
  'campaign.budget_value': { store: 'AdsCampaignDataStore', path: 'budgetValue' },
  'campaign.cbo_enabled': { store: 'AdsCampaignDataStore', path: 'cboEnabled' },
  'campaign.buying_type': { store: 'AdsCampaignDataStore', path: 'buyingType' },
  'campaign.special_ad_categories': { store: 'AdsCampaignDataStore', path: 'specialAdCategories' },
  'campaign.spending_limit': { store: 'AdsCampaignDataStore', path: 'spendingLimit' },
  'campaign.bid_strategy': { store: 'AdsCampaignDataStore', path: 'bidStrategy' },
  'campaign.a_b_test': { store: 'AdsCampaignDataStore', path: 'abTest' },

  // Ad Set fields
  'ad_set.name': { store: 'AdsEditorDataStore', path: 'adSetName' },
  'ad_set.targeting.geo_locations': { store: 'AdsTargetingDataStore', path: 'geoLocations' },
  'ad_set.targeting.age_range': { store: 'AdsTargetingDataStore', path: 'ageRange' },
  'ad_set.targeting.genders': { store: 'AdsTargetingDataStore', path: 'genders' },
  'ad_set.targeting.languages': { store: 'AdsTargetingDataStore', path: 'languages' },
  'ad_set.targeting.custom_audiences': { store: 'AdsTargetingDataStore', path: 'customAudiences' },
  'ad_set.targeting.excluded_audiences': { store: 'AdsTargetingDataStore', path: 'excludedAudiences' },
  'ad_set.targeting.lookalike_audiences': { store: 'AdsTargetingDataStore', path: 'lookalikeAudiences' },
  'ad_set.targeting.detailed_targeting': { store: 'AdsTargetingDataStore', path: 'detailedTargeting' },
  'ad_set.targeting.connections': { store: 'AdsTargetingDataStore', path: 'connections' },
  'ad_set.placements': { store: 'AdsEditorDataStore', path: 'placements' },
  'ad_set.placements.type': { store: 'AdsEditorDataStore', path: 'placementType' },
  'ad_set.placements.platforms': { store: 'AdsEditorDataStore', path: 'placementPlatforms' },
  'ad_set.placements.positions': { store: 'AdsEditorDataStore', path: 'placementPositions' },
  'ad_set.schedule.start_date': { store: 'AdsEditorDataStore', path: 'startDate' },
  'ad_set.schedule.end_date': { store: 'AdsEditorDataStore', path: 'endDate' },
  'ad_set.schedule.day_parting': { store: 'AdsEditorDataStore', path: 'dayParting' },
  'ad_set.optimization_goal': { store: 'AdsEditorDataStore', path: 'optimizationGoal' },
  'ad_set.billing_event': { store: 'AdsEditorDataStore', path: 'billingEvent' },
  'ad_set.bid_amount': { store: 'AdsEditorDataStore', path: 'bidAmount' },
  'ad_set.bid_strategy': { store: 'AdsEditorDataStore', path: 'bidStrategy' },
  'ad_set.daily_budget': { store: 'AdsEditorDataStore', path: 'dailyBudget' },
  'ad_set.lifetime_budget': { store: 'AdsEditorDataStore', path: 'lifetimeBudget' },
  'ad_set.frequency_cap': { store: 'AdsEditorDataStore', path: 'frequencyCap' },
  'ad_set.pixel_id': { store: 'AdsEditorDataStore', path: 'pixelId' },
  'ad_set.conversion_event': { store: 'AdsEditorDataStore', path: 'conversionEvent' },
  'ad_set.attribution_setting': { store: 'AdsEditorDataStore', path: 'attributionSetting' },
  'ad_set.advantage_targeting': { store: 'AdsTargetingDataStore', path: 'advantageTargeting' },
  'ad_set.advantage_placements': { store: 'AdsEditorDataStore', path: 'advantagePlacements' },

  // Ad / Creative fields
  'ad.name': { store: 'AdsCreativeEditorDataStore', path: 'adName' },
  'ad.creative.destination_url': { store: 'AdsCreativeEditorDataStore', path: 'destinationUrl' },
  'ad.creative.cta_type': { store: 'AdsCreativeEditorDataStore', path: 'ctaType' },
  'ad.creative.page_id': { store: 'AdsCreativeEditorDataStore', path: 'pageId' },
  'ad.creative.instagram_account_id': { store: 'AdsCreativeEditorDataStore', path: 'instagramAccountId' },
  'ad.creative.headline': { store: 'AdsCreativeEditorDataStore', path: 'headline' },
  'ad.creative.primary_text': { store: 'AdsCreativeEditorDataStore', path: 'primaryText' },
  'ad.creative.description': { store: 'AdsCreativeEditorDataStore', path: 'description' },
  'ad.creative.display_link': { store: 'AdsCreativeEditorDataStore', path: 'displayLink' },
  'ad.creative.image_hash': { store: 'AdsCreativeEditorDataStore', path: 'imageHash' },
  'ad.creative.video_id': { store: 'AdsCreativeEditorDataStore', path: 'videoId' },
  'ad.creative.carousel_cards': { store: 'AdsCreativeEditorDataStore', path: 'carouselCards' },
  'ad.creative.format': { store: 'AdsCreativeEditorDataStore', path: 'format' },
  'ad.creative.dynamic_creative': { store: 'AdsCreativeEditorDataStore', path: 'dynamicCreative' },
  'ad.creative.url_parameters': { store: 'AdsCreativeEditorDataStore', path: 'urlParameters' },
  'ad.creative.url_tags': { store: 'AdsCreativeEditorDataStore', path: 'urlTags' },
  'ad.creative.deep_link': { store: 'AdsCreativeEditorDataStore', path: 'deepLink' },
  'ad.creative.app_link': { store: 'AdsCreativeEditorDataStore', path: 'appLink' },
  'ad.creative.pixel_id': { store: 'AdsCreativeEditorDataStore', path: 'pixelId' },
  'ad.creative.event_type': { store: 'AdsCreativeEditorDataStore', path: 'eventType' },
  'ad.creative.offer_id': { store: 'AdsCreativeEditorDataStore', path: 'offerId' },
  'ad.creative.lead_form_id': { store: 'AdsCreativeEditorDataStore', path: 'leadFormId' },
  'ad.creative.canvas_id': { store: 'AdsCreativeEditorDataStore', path: 'canvasId' },
  'ad.creative.collection_id': { store: 'AdsCreativeEditorDataStore', path: 'collectionId' },
  'ad.creative.product_catalog_id': { store: 'AdsCreativeEditorDataStore', path: 'productCatalogId' },
  'ad.creative.product_set_id': { store: 'AdsCreativeEditorDataStore', path: 'productSetId' },
  'ad.creative.instant_experience_id': { store: 'AdsCreativeEditorDataStore', path: 'instantExperienceId' },
  'ad.creative.branded_content_sponsor_id': { store: 'AdsCreativeEditorDataStore', path: 'brandedContentSponsorId' },
  'ad.creative.advantage_creative_enhancements': { store: 'AdsCreativeEditorDataStore', path: 'advantageCreativeEnhancements' },

  // Tracking / Measurement fields
  'ad.tracking.pixel_id': { store: 'AdsCreativeEditorDataStore', path: 'trackingPixelId' },
  'ad.tracking.app_events': { store: 'AdsCreativeEditorDataStore', path: 'appEvents' },
  'ad.tracking.offline_event_set_id': { store: 'AdsCreativeEditorDataStore', path: 'offlineEventSetId' },
  'ad.tracking.url_params': { store: 'AdsCreativeEditorDataStore', path: 'trackingUrlParams' },

  // Advanced / Advantage+ fields
  'campaign.advantage_plus_shopping': { store: 'AdsCampaignDataStore', path: 'advantagePlusShopping' },
  'campaign.advantage_plus_app': { store: 'AdsCampaignDataStore', path: 'advantagePlusApp' },
  'campaign.advantage_plus_creative': { store: 'AdsCampaignDataStore', path: 'advantagePlusCreative' },
  'ad_set.targeting.advantage_audience': { store: 'AdsTargetingDataStore', path: 'advantageAudience' },
  'ad_set.targeting.audience_network': { store: 'AdsTargetingDataStore', path: 'audienceNetwork' },
  'ad_set.targeting.device_targeting': { store: 'AdsTargetingDataStore', path: 'deviceTargeting' },
  'ad_set.targeting.publisher_platforms': { store: 'AdsTargetingDataStore', path: 'publisherPlatforms' },
  'ad_set.targeting.mobile_os': { store: 'AdsTargetingDataStore', path: 'mobileOs' },
  'ad_set.targeting.device_platforms': { store: 'AdsTargetingDataStore', path: 'devicePlatforms' },
  'ad_set.targeting.brand_safety': { store: 'AdsTargetingDataStore', path: 'brandSafety' },
  'ad_set.targeting.inventory_filter': { store: 'AdsTargetingDataStore', path: 'inventoryFilter' },
  'ad_set.targeting.exclude_content_types': { store: 'AdsTargetingDataStore', path: 'excludeContentTypes' },
  'ad_set.targeting.block_lists': { store: 'AdsTargetingDataStore', path: 'blockLists' },
  'ad.creative.media_type': { store: 'AdsCreativeEditorDataStore', path: 'mediaType' },
  'ad.creative.aspect_ratio': { store: 'AdsCreativeEditorDataStore', path: 'aspectRatio' },
  'ad.creative.thumbnail_url': { store: 'AdsCreativeEditorDataStore', path: 'thumbnailUrl' },
};

/**
 * Extract a nested value from a store state using a dot-separated path.
 */
function getStoreValue(storeState: unknown, path: string): unknown {
  if (storeState === null || storeState === undefined) return undefined;

  const parts = path.split('.');
  let current: unknown = storeState;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// ---------------------------------------------------------------------------
// require() Primary Extraction
// ---------------------------------------------------------------------------

/**
 * Extract field values via Facebook's require() module system.
 *
 * This is the PRIMARY extraction strategy. It calls the `facebookEditorTree`
 * getter in the eval bridge to retrieve the full editor state from Facebook's
 * internal Flux stores, then maps the structured data to our field paths.
 *
 * @returns Record of field paths to extracted values, or null if require()
 *          is unavailable or the tree is empty
 */
export async function extractViaRequire(): Promise<Record<string, unknown> | null> {
  const evalBatcher = getRemoteEvalBatcher();

  const query: RemoteEvalQuery = {
    type: 'evalQuery.governance',
    queryId: generateQueryId(),
    getters: [{
      field: '_editorTree',
      method: 'facebookEditorTree',
    }],
  };

  try {
    const response = await evalBatcher.execute(query, 3000);
    const tree = response['_editorTree'] as Record<string, unknown> | null;

    if (!tree || typeof tree !== 'object') {
      return null;
    }

    // Map the tree data to our field paths
    const results: Record<string, unknown> = {};

    for (const [fieldPath, mapping] of Object.entries(REQUIRE_FIELD_MAP)) {
      const storeState = tree[mapping.store];
      if (storeState === undefined) continue;

      const value = getStoreValue(storeState, mapping.path);
      if (value !== undefined) {
        results[fieldPath] = value;
      }
    }

    // Add body CSS classes DURING extraction (not after)
    updateExtractionBodyClasses(results);

    return Object.keys(results).length > 0 ? results : null;
  } catch {
    return null;
  }
}

/**
 * Update body CSS classes during the extraction phase to reflect which
 * fields have been successfully extracted. Uses dlg- namespace.
 */
function updateExtractionBodyClasses(results: Record<string, unknown>): void {
  for (const [fieldPath, value] of Object.entries(results)) {
    const fieldSlug = fieldPath.replace(/\./g, '-');
    if (value !== null && value !== undefined) {
      document.body.classList.add(`dlg-extracted-${fieldSlug}`);
    } else {
      document.body.classList.remove(`dlg-extracted-${fieldSlug}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Fallback Chain Extraction
// ---------------------------------------------------------------------------

/**
 * Extract all field values from the Meta Ads Manager using a multi-strategy
 * fallback chain.
 *
 * Extraction order:
 *   1. **require()** - Facebook internal module system (fastest, most reliable)
 *   2. **React Context** - Context providers in the fiber tree
 *   3. **React Fiber** - Walk fiber tree for memoizedProps/memoizedState
 *   4. **Multi-framework** - Vue/jQuery fallback (for edge cases)
 *   5. **DOM** - Traditional DOM selectors (last resort)
 *
 * The require() strategy is gated behind the `enable-require-extraction`
 * feature flag. When disabled, the chain starts at step 5 (DOM).
 *
 * @returns Record mapping field paths to their current values
 */
export async function extractAllFieldValues(): Promise<Record<string, unknown>> {
  const extractionStartTime = performance.now();
  const results: Record<string, unknown> = {};
  const strategyUsed: Record<string, 'require' | 'remoteEval' | 'fiber' | 'dom' | 'failed'> = {};

  // Initialize all fields to null
  for (const fieldPath of Object.keys(FIELD_GETTERS)) {
    results[fieldPath] = null;
  }
  // Also include fields from the require map that aren't in DOM getters
  for (const fieldPath of Object.keys(REQUIRE_FIELD_MAP)) {
    if (!(fieldPath in results)) {
      results[fieldPath] = null;
    }
  }

  // ── Strategy 1: require() extraction (PRIMARY, gated by feature flag) ──
  const useRequire = await isRequireExtractionEnabled();
  console.log('[EXTRACTION] Strategy 1 - require() enabled:', useRequire);
  if (useRequire) {
    try {
      const requireResults = await extractViaRequire();
      if (requireResults) {
        console.log('[EXTRACTION] require() returned', Object.keys(requireResults).length, 'fields');
        console.log('[EXTRACTION] require() campaign.name:', requireResults['campaign.name']);
        console.log('[EXTRACTION] require() campaign.objective:', requireResults['campaign.objective']);
        console.log('[EXTRACTION] require() sample:', Object.fromEntries(Object.entries(requireResults).slice(0, 5)));
        for (const [field, value] of Object.entries(requireResults)) {
          if (value !== null && value !== undefined) {
            results[field] = value;
            strategyUsed[field] = 'require';
          }
        }
      } else {
        console.log('[EXTRACTION] require() returned null/undefined');
      }
    } catch (err) {
      console.log('[EXTRACTION] require() threw error:', err);
      // require() unavailable; continue to fallback strategies
    }
  }

  // ── Strategy 2-4: remoteEval (React Context, Fiber, multi-framework) ──
  const nullFields = Object.entries(results)
    .filter(([, value]) => value === null)
    .map(([field]) => field)
    .filter((field) => field in FIELD_GETTERS || field in getRemoteEvalSelectorMap());

  console.log('[EXTRACTION] Strategy 2-4 - remoteEval for', nullFields.length, 'null fields');
  if (nullFields.length > 0) {
    try {
      const remoteResults = await extractViaRemoteEval(nullFields);
      console.log('[EXTRACTION] remoteEval returned', Object.keys(remoteResults).length, 'fields');
      console.log('[EXTRACTION] remoteEval campaign.name:', remoteResults['campaign.name']);
      console.log('[EXTRACTION] remoteEval campaign.objective:', remoteResults['campaign.objective']);
      console.log('[EXTRACTION] remoteEval sample:', Object.fromEntries(Object.entries(remoteResults).slice(0, 5)));
      for (const [field, value] of Object.entries(remoteResults)) {
        if (value !== null && value !== undefined) {
          results[field] = value;
          // Only mark as remoteEval if not already extracted by require
          if (!strategyUsed[field]) {
            strategyUsed[field] = 'remoteEval';
          }
        }
      }
    } catch (err) {
      console.log('[EXTRACTION] remoteEval threw error:', err);
      // remoteEval failed -- continue to DOM fallback
    }
  }

  // ── Strategy 5: DOM extraction (last resort) ──────────────────────────
  const stillNullFields = Object.entries(results)
    .filter(([, value]) => value === null)
    .map(([field]) => field);
  console.log('[EXTRACTION] Strategy 5 - DOM extraction for', stillNullFields.length, 'still-null fields');

  let domExtractedCount = 0;
  for (const [fieldPath, getter] of Object.entries(FIELD_GETTERS)) {
    if (results[fieldPath] !== null) continue; // Already extracted

    try {
      const domValue = getter();
      if (domValue !== null && domValue !== undefined) {
        results[fieldPath] = domValue;
        domExtractedCount++;
        // Only mark as dom if not already extracted by require or remoteEval
        if (!strategyUsed[fieldPath]) {
          strategyUsed[fieldPath] = 'dom';
        }
        if (fieldPath === 'campaign.name' || fieldPath === 'campaign.objective') {
          console.log('[EXTRACTION] DOM extracted', fieldPath, ':', domValue);
        }
      }
    } catch (err) {
      // Graceful degradation -- field stays null
      if (fieldPath === 'campaign.name' || fieldPath === 'campaign.objective') {
        console.log('[EXTRACTION] DOM extraction failed for', fieldPath, ':', err);
      }
    }
  }
  console.log('[EXTRACTION] DOM extracted', domExtractedCount, 'fields');

  // Final results summary
  console.log('[EXTRACTION] FINAL campaign.name:', results['campaign.name']);
  console.log('[EXTRACTION] FINAL campaign.objective:', results['campaign.objective']);
  console.log('[EXTRACTION] FINAL total fields:', Object.keys(results).length);
  console.log('[EXTRACTION] FINAL non-null fields:', Object.values(results).filter(v => v !== null).length);

  // Update extraction body classes for all results
  updateExtractionBodyClasses(results);

  // Log telemetry for each field
  const extractionEndTime = performance.now();
  const totalDurationMs = extractionEndTime - extractionStartTime;

  // Log telemetry asynchronously (don't block return)
  Promise.all(
    Object.keys(results).map((fieldPath) => {
      const value = results[fieldPath];
      const strategy = strategyUsed[fieldPath] || (value !== null ? 'dom' : 'failed');

      return logFieldExtraction({
        timestamp: Date.now(),
        field: fieldPath,
        strategyUsed: strategy,
        durationMs: totalDurationMs / Object.keys(results).length, // Approximate per-field duration
        error: strategy === 'failed' ? 'No extraction strategy succeeded' : undefined,
      });
    }),
  ).catch((err) => {
    console.error('[TELEMETRY] Failed to log field extraction telemetry:', err);
  });

  return results;
}

/**
 * Attempt to extract field values via the remoteEval bridge.
 *
 * This sends a batched query to the MAIN world eval bridge for
 * React Context, React Fiber, and multi-framework extraction.
 *
 * Uses CustomEvent('evalQuery.governance') for communication.
 *
 * @param fieldPaths - Array of field paths to query
 * @returns Record of field paths to extracted values
 */
async function extractViaRemoteEval(
  fieldPaths: string[],
): Promise<Record<string, unknown>> {
  const evalBatcher = getRemoteEvalBatcher();

  const queryGetters = fieldPaths.map((field) => {
    const method = getRemoteEvalMethod(field);
    const selector = getRemoteEvalSelector(field);

    return {
      field,
      method,
      selector,
    };
  });

  const query: RemoteEvalQuery = {
    type: 'evalQuery.governance',
    queryId: generateQueryId(),
    getters: queryGetters.map(({ field, method, selector }) => ({
      field,
      method,
      selector,
    })),
  };

  const rawResults = await evalBatcher.execute(query);

  // Post-process: transform raw React objects into evaluator-compatible types
  const processed: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(rawResults)) {
    processed[field] = normalizeExtractedValue(field, value);
  }
  return processed;
}

/**
 * Normalize a raw extracted value into the type the rule evaluator expects.
 * remoteEval returns React props/state objects — we need strings, numbers, booleans, and arrays.
 */
function normalizeExtractedValue(field: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        // Extract the most likely string value from the object
        return (obj.name ?? obj.label ?? obj.value ?? obj.key ?? obj.id ?? JSON.stringify(obj)) as string;
      }
      return String(item);
    });
  }

  // Handle objects — extract the most useful value based on field type
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    // Geo locations: extract countries array
    if (field.includes('geo_locations')) {
      if (Array.isArray(obj.countries)) return obj.countries;
      if (Array.isArray(obj.selectedLocations)) {
        return (obj.selectedLocations as Array<Record<string, unknown>>).map(
          (loc) => (loc.name ?? loc.country_code ?? loc.key ?? String(loc)) as string,
        );
      }
      if (Array.isArray(obj.locations)) return obj.locations;
      // Try to find any array property
      for (const v of Object.values(obj)) {
        if (Array.isArray(v) && v.length > 0) return v;
      }
    }

    // Objective: extract string value
    if (field.includes('objective')) {
      return (obj.objective ?? obj.value ?? obj.name ?? obj.type ?? null) as string | null;
    }

    // Budget: extract numeric value
    if (field.includes('budget')) {
      const numVal = obj.value ?? obj.amount ?? obj.budget;
      if (typeof numVal === 'number') return numVal;
      if (typeof numVal === 'string') return parseFloat(numVal) || null;
    }

    // Generic: try common value properties
    if ('value' in obj) return obj.value;
    if ('name' in obj) return obj.name;
    if ('label' in obj) return obj.label;
    if ('id' in obj) return obj.id;

    // Last resort: JSON stringify for debugging
    console.log(`[EXTRACTION] normalizeExtractedValue: unhandled object for ${field}:`, JSON.stringify(obj).substring(0, 200));
    return null;
  }

  return String(value);
}

/**
 * Get the remoteEval selector map (for filtering which fields to query).
 */
function getRemoteEvalSelectorMap(): Record<string, string> {
  return {
    // Discovered selectors from comprehensive field discovery (2026-02-08)
    // Campaign fields
    'campaign.name': 'input[placeholder*="campaign name" i]',
    'campaign.objective': 'input[type="radio"][checked]',
    'campaign.budget_type': '[role="radiogroup"]',
    'campaign.budget_value': 'input[placeholder*="enter amount" i]',
    'campaign.cbo_enabled': 'input[aria-label*="On"][type="checkbox"]',

    // Ad set fields
    'ad_set.name': 'input[placeholder*="ad set name" i]',
    'ad_set.budget_type': '[role="radiogroup"] [aria-checked="true"]',
    'ad_set.budget_value': 'input[placeholder*="enter amount" i]',
    'ad_set.targeting.geo_locations': '[aria-label*="Location"]',
    'ad_set.targeting.age_range': '[aria-label*="Age"]',
    'ad_set.targeting.genders': '[aria-label*="Gender"]',
    'ad_set.targeting.languages': '[aria-label*="Language"]',
    'ad_set.targeting.custom_audiences': '[aria-label*="Custom audience"]',
    'ad_set.placements': '[aria-label*="Placement"]',
    'ad_set.schedule.start_date': '[aria-label*="Start date"]',
    'ad_set.schedule.end_date': '[aria-label*="End date"]',

    // Ad/Creative fields
    'ad.name': 'input[placeholder*="ad name" i]',
    'ad.identity.page_id': 'input[placeholder*="page" i]',
    'ad.creative.destination_url': 'input[aria-label*="Website URL"]',
    'ad.creative.cta_type': '[aria-label*="Call to action"]',
    'ad.preview': '[aria-label*="preview" i]',
  };
}

/**
 * Determine the appropriate remoteEval method for a field path.
 */
function getRemoteEvalMethod(
  fieldPath: string,
): RemoteEvalQuery['getters'][number]['method'] {
  // Fields that need React Fiber traversal
  const reactFiberFields = [
    'campaign.objective',
    'campaign.cbo_enabled',
    'ad_set.targeting.geo_locations',
    'ad_set.targeting.age_range',
    'ad_set.targeting.genders',
    'ad_set.targeting.languages',
    'ad_set.targeting.custom_audiences',
    'ad_set.placements',
    'ad.creative.page_id',
  ];

  if (reactFiberFields.includes(fieldPath)) {
    return 'FindReact';
  }

  // Fields that are simple input values
  const inputValueFields = [
    'campaign.name',
    'campaign.budget_value',
    'ad_set.name',
    'ad.name',
    'ad.creative.destination_url',
  ];

  if (inputValueFields.includes(fieldPath)) {
    return 'elementValue';
  }

  // Default to elementText for dropdowns and text-based fields
  return 'elementText';
}

/**
 * Get the selector to use in a remoteEval query for a given field path.
 */
function getRemoteEvalSelector(fieldPath: string): string {
  return getRemoteEvalSelectorMap()[fieldPath] ?? '';
}

/**
 * Get the list of all supported field paths (including require() fields).
 */
export function getSupportedFieldPaths(): string[] {
  const domFields = Object.keys(FIELD_GETTERS);
  const requireFields = Object.keys(REQUIRE_FIELD_MAP);
  const uniqueSet = new Set([...domFields, ...requireFields]);
  return Array.from(uniqueSet);
}

/**
 * Get the list of DOM-only field paths (original 18 fields).
 */
export function getDomFieldPaths(): string[] {
  return Object.keys(FIELD_GETTERS);
}

/**
 * Get the require() field mapping for testing/inspection.
 */
export function getRequireFieldMap(): Record<string, { store: string; path: string }> {
  return { ...REQUIRE_FIELD_MAP };
}

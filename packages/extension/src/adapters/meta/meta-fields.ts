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

import { EntityLevel, RemoteEvalQuery, RemoteEvalResult } from '@media-buying-governance/shared';
// findFieldElement no longer used by 2026 getters (direct selectors used instead)
// but kept as comment for reference: import { findFieldElement } from './meta-selectors.js';
import {
  getMetaDomFieldPaths,
  getMetaFieldPaths,
  getMetaFieldPathsForEntityLevel,
  getMetaRemoteEvalConfig,
  getMetaRequireFieldMap,
} from './meta-field-specs.js';
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
// Direct DOM Selector Utilities (2026 Meta Ads Manager)
// ---------------------------------------------------------------------------

/**
 * Find a DOM element near a section heading by walking up the tree.
 *
 * @param headingText - Text to match in heading elements (case-insensitive substring)
 * @param childSelector - CSS selector to find within the heading's container
 * @param maxAncestorLevels - How many parent levels to walk up (default 8)
 * @returns The first matching child element, or null
 */
function findElementNearHeading(
  headingText: string,
  childSelector: string,
  maxAncestorLevels: number = 8,
): HTMLElement | null {
  const headings = document.querySelectorAll<HTMLElement>('[role="heading"], h1, h2, h3, h4, h5, h6');
  for (const h of headings) {
    if (!h.textContent?.toLowerCase().includes(headingText.toLowerCase())) continue;
    let container: HTMLElement | null = h.closest('div');
    for (let i = 0; i < maxAncestorLevels && container; i++) {
      const match = container.querySelector<HTMLElement>(childSelector);
      if (match) return match;
      container = container.parentElement;
    }
  }
  return null;
}

/**
 * Find ALL DOM elements near a section heading.
 */
function findAllElementsNearHeading(
  headingText: string,
  childSelector: string,
  maxAncestorLevels: number = 8,
): HTMLElement[] {
  const headings = document.querySelectorAll<HTMLElement>('[role="heading"], h1, h2, h3, h4, h5, h6');
  for (const h of headings) {
    if (!h.textContent?.toLowerCase().includes(headingText.toLowerCase())) continue;
    let container: HTMLElement | null = h.closest('div');
    for (let i = 0; i < maxAncestorLevels && container; i++) {
      const matches = container.querySelectorAll<HTMLElement>(childSelector);
      if (matches.length > 0) return Array.from(matches);
      container = container.parentElement;
    }
  }
  return [];
}

/**
 * Read summary/value text near a section heading.
 *
 * In 2026 Meta, targeting fields (age, gender, languages, geo) display
 * summary text near their heading with an "Edit" button. This reads that text.
 */
function readSummaryTextNearHeading(headingText: string): string | null {
  const headings = document.querySelectorAll<HTMLElement>('[role="heading"], h1, h2, h3, h4, h5, h6');
  for (const h of headings) {
    if (!h.textContent?.toLowerCase().includes(headingText.toLowerCase())) continue;
    let container: HTMLElement | null = h.parentElement;
    for (let i = 0; i < 5 && container; i++) {
      const children = container.children;
      for (const child of children) {
        if (child === h) continue;
        const text = (child as HTMLElement).textContent?.trim();
        if (text && text !== 'Edit' && text !== headingText && text.length < 200) {
          return text;
        }
      }
      container = container.parentElement;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Individual Field Getters (2026 Meta Ads Manager — direct selectors)
// ---------------------------------------------------------------------------

/**
 * Extract the campaign name from the DOM.
 * 2026 DOM: `<input placeholder="Enter your campaign name here...">`
 */
export function getCampaignName(): string | null {
  const el = document.querySelector<HTMLInputElement>('input[placeholder*="campaign name" i]');
  if (el?.value) return el.value;

  const nearHeading = findElementNearHeading('Campaign name', 'input[type="text"], input[role="combobox"]');
  if (nearHeading && (nearHeading as HTMLInputElement).value) {
    return (nearHeading as HTMLInputElement).value;
  }
  return null;
}

/**
 * Extract the selected campaign objective.
 * 2026 DOM: `[role="row"]:has(input[type="radio"]:checked)` with heading text.
 */
export function getCampaignObjective(): string | null {
  const checkedRow = document.querySelector<HTMLElement>(
    '[role="row"]:has(input[type="radio"]:checked)',
  );
  if (checkedRow) {
    const heading = checkedRow.querySelector<HTMLElement>('[role="heading"], h4');
    if (heading?.textContent?.trim()) return heading.textContent.trim();
  }

  const rows = findAllElementsNearHeading('Campaign objective', '[role="row"]');
  for (const row of rows) {
    const radio = row.querySelector<HTMLInputElement>('input[type="radio"]');
    if (radio?.checked) {
      const heading = row.querySelector<HTMLElement>('[role="heading"], h4');
      if (heading?.textContent?.trim()) return heading.textContent.trim();
    }
  }
  return null;
}

/**
 * Extract the budget type (Daily / Lifetime).
 * 2026 DOM: `<div role="combobox">` near "Budget" heading.
 */
export function getCampaignBudgetType(): string | null {
  const combo = findElementNearHeading('Budget', '[role="combobox"]');
  if (combo) {
    const text = combo.textContent?.trim().toLowerCase() ?? '';
    if (text.includes('daily')) return 'daily';
    if (text.includes('lifetime')) return 'lifetime';
  }
  return null;
}

/**
 * Extract the budget value (numeric).
 * 2026 DOM: `<input placeholder="Please enter amount">` with value "5.00".
 */
export function getCampaignBudgetValue(): number | null {
  const el = document.querySelector<HTMLInputElement>('input[placeholder*="enter amount" i]');
  if (el?.value) {
    const cleaned = el.value.replace(/[^0-9.]/g, '');
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed)) return parsed;
  }

  const nearHeading = findElementNearHeading('Budget', 'input[type="text"]:not([role="combobox"])');
  if (nearHeading && (nearHeading as HTMLInputElement).value) {
    const cleaned = (nearHeading as HTMLInputElement).value.replace(/[^0-9.]/g, '');
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed)) return parsed;
  }
  return null;
}

/**
 * Extract the CBO / Advantage+ Campaign Budget toggle state.
 * 2026 DOM: `[role="switch"]` near heading containing "Advantage campaign budget".
 */
export function getCampaignCBOEnabled(): boolean | null {
  const sw = findElementNearHeading('Advantage campaign budget', '[role="switch"]')
    ?? findElementNearHeading('Campaign budget optimization', '[role="switch"]');
  if (!sw) return null;
  return sw.getAttribute('aria-checked') === 'true';
}

/**
 * Extract the buying type (Auction / Reach and frequency).
 * 2026 DOM: `[role="combobox"]` near "Campaign details" heading.
 */
export function getCampaignBuyingType(): string | null {
  const combo = findElementNearHeading('Campaign details', '[role="combobox"]');
  return combo?.textContent?.trim() || null;
}

/**
 * Extract the special ad categories.
 * 2026 DOM: `[role="combobox"]` near "Special Ad Categories" heading.
 */
export function getCampaignSpecialAdCategories(): string | null {
  const combo = findElementNearHeading('Special Ad Categories', '[role="combobox"]');
  const text = combo?.textContent?.trim();
  if (text && !text.toLowerCase().includes('declare category')) return text;
  return null;
}

/**
 * Extract A/B test toggle state.
 * 2026 DOM: `[role="switch"]` near "A/B test" heading.
 */
export function getCampaignABTest(): boolean | null {
  const sw = findElementNearHeading('A/B test', '[role="switch"]');
  if (!sw) return null;
  return sw.getAttribute('aria-checked') === 'true';
}

/**
 * Extract the campaign status (On/Off toggle at top of campaign panel).
 * 2026 DOM: first `[role="switch"][aria-label="On/off"]`.
 */
export function getCampaignStatus(): boolean | null {
  const sw = document.querySelector<HTMLElement>('[role="switch"][aria-label="On/off"]');
  if (sw) return sw.getAttribute('aria-checked') === 'true';
  return null;
}

/**
 * Extract the ad scheduling setting.
 * 2026 DOM: text near "Ad scheduling" heading, e.g. "Run ads all the time".
 */
export function getAdScheduling(): string | null {
  return readSummaryTextNearHeading('Ad scheduling');
}

/**
 * Extract the ad set name.
 * 2026 DOM: `<input placeholder="Enter your ad set name here...">`
 */
export function getAdSetName(): string | null {
  const el = document.querySelector<HTMLInputElement>('input[placeholder*="ad set name" i]');
  if (el?.value) return el.value;

  const nearHeading = findElementNearHeading('Ad set name', 'input[type="text"], input[role="combobox"]');
  if (nearHeading && (nearHeading as HTMLInputElement).value) {
    return (nearHeading as HTMLInputElement).value;
  }
  return null;
}

/**
 * Extract the conversion location.
 * 2026 DOM: checked radio within "Conversion location" section.
 */
export function getConversionLocation(): string | null {
  const label = findElementNearHeading('Conversion location', 'label:has(input[type="radio"]:checked)');
  return label?.textContent?.trim() || null;
}

/**
 * Extract the message destination.
 * 2026 DOM: checked radio within "Message destination" section
 * (e.g. "automatic destination", "manual destination").
 */
export function getMessageDestination(): string | null {
  const label = findElementNearHeading('Message destination', 'label:has(input[type="radio"]:checked)');
  return label?.textContent?.trim() || null;
}

/**
 * Extract the performance goal.
 * 2026 DOM: `[role="combobox"]` near performance goal section.
 */
export function getPerformanceGoal(): string | null {
  const combo = findElementNearHeading('Performance goal', '[role="combobox"]');
  return combo?.textContent?.trim() || null;
}

/**
 * Extract the bid amount.
 * 2026 DOM: `<input placeholder="X.XXX">` below performance goal.
 */
export function getBidAmount(): number | null {
  const el = document.querySelector<HTMLInputElement>('input[placeholder="X.XXX"]');
  if (el?.value) {
    const parsed = parseFloat(el.value.replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed)) return parsed;
  }
  return null;
}

/**
 * Extract selected geo locations.
 * 2026 DOM: summary text near "Locations" heading (e.g. "France" or "None added").
 */
export function getGeoLocations(): string[] | null {
  const headings = document.querySelectorAll<HTMLElement>('[role="heading"], h3, h4');
  for (const h of headings) {
    if (h.textContent?.toLowerCase().includes('location')) {
      const parent = h.parentElement;
      const valueText = parent?.querySelector('span, div:not([role="heading"])')?.textContent?.trim();
      if (valueText && valueText !== 'Edit' && valueText.toLowerCase() !== 'locations') {
        return [valueText];
      }
    }
  }

  // Fallback: readSummaryTextNearHeading
  const summary = readSummaryTextNearHeading('Locations');
  if (summary && summary.toLowerCase() !== 'none added') return [summary];

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
 */
export function getGeoLocationCountries(): string[] | null {
  const locations = getGeoLocations();
  if (locations && locations.length > 0) {
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
  return null;
}

/**
 * Extract the age range as summary text, parsed into min/max.
 * 2026 DOM: summary text "18 - 65+" near "Age" heading.
 */
export function getAgeRange(): { min: number; max: number } | null {
  const summary = readSummaryTextNearHeading('Age');
  if (summary) {
    const match = summary.match(/(\d+)\s*-\s*(\d+)/);
    if (match) {
      return { min: parseInt(match[1], 10), max: parseInt(match[2], 10) };
    }
  }
  return null;
}

/**
 * Extract selected genders.
 * 2026 DOM: summary text "All genders" / "Men" / "Women" near "Gender" heading.
 */
export function getGenders(): string[] | null {
  const summary = readSummaryTextNearHeading('Gender');
  if (summary) {
    if (summary.toLowerCase().includes('all')) return ['All genders'];
    return [summary];
  }
  return null;
}

/**
 * Extract selected languages.
 * 2026 DOM: summary text "All languages" near "Languages" heading.
 */
export function getLanguages(): string[] | null {
  const summary = readSummaryTextNearHeading('Languages');
  if (summary) {
    if (summary.toLowerCase().includes('all')) return ['All languages'];
    return summary.split(',').map((s: string) => s.trim()).filter(Boolean);
  }
  return null;
}

/**
 * Extract selected placements.
 * 2026 DOM: radios under "Placements" heading (manual vs advantage+).
 */
export function getPlacements(): string[] | null {
  const rows = findAllElementsNearHeading('Placements', 'input[type="radio"]');
  for (const radio of rows) {
    if ((radio as HTMLInputElement).checked) {
      const label = radio.closest('label')?.textContent?.trim() ?? null;
      const normalized = normalizePlacementLabel(label);
      if (normalized) return [normalized];
    }
  }

  // Fallback: summary text
  const summary = readSummaryTextNearHeading('Placements');
  if (summary) return [summary];
  return null;
}

/**
 * Extract custom audiences.
 * 2026 DOM: `input[placeholder="Search existing audiences"]`.
 */
export function getCustomAudiences(): string[] | null {
  const el = document.querySelector<HTMLInputElement>('input[placeholder*="Search existing audiences" i]');
  if (el?.value) return [el.value];

  // Look for chips/tags near Audience heading
  const tags = findAllElementsNearHeading('Audience', '.tag, .chip, [role="listitem"]');
  if (tags.length > 0) {
    const audiences = tags.map((t: HTMLElement) => t.textContent?.trim()).filter(Boolean) as string[];
    if (audiences.length > 0) return audiences;
  }
  return null;
}

/**
 * Extract schedule start date.
 * 2026 DOM: first `input[placeholder="mm/dd/yyyy"]` near "Start date".
 */
export function getScheduleStartDate(): string | null {
  const el = findElementNearHeading('Start date', 'input[placeholder="mm/dd/yyyy"]')
    ?? findElementNearHeading('Start date', 'input');
  if (el && (el as HTMLInputElement).value) {
    return normalizeDateLikeValue((el as HTMLInputElement).value);
  }
  return null;
}

/**
 * Extract schedule end date.
 * 2026 DOM: `input[placeholder="mm/dd/yyyy"]` near "End date".
 */
export function getScheduleEndDate(): string | null {
  const el = findElementNearHeading('End date', 'input[placeholder="mm/dd/yyyy"]')
    ?? findElementNearHeading('End date', 'input');
  if (el && (el as HTMLInputElement).value) {
    return normalizeDateLikeValue((el as HTMLInputElement).value);
  }
  return null;
}

/**
 * Extract schedule start time (hours:minutes meridiem).
 * 2026 DOM: spinbutton inputs with aria-label "hours"/"minutes"/"meridiem".
 */
export function getScheduleStartTime(): string | null {
  const hours = document.querySelector<HTMLInputElement>('input[aria-label="hours"]');
  const minutes = document.querySelector<HTMLInputElement>('input[aria-label="minutes"]');
  const meridiem = document.querySelector<HTMLInputElement>('input[aria-label="meridiem"]');
  if (hours?.value && minutes?.value) {
    return `${hours.value}:${minutes.value}${meridiem?.value ? ' ' + meridiem.value : ''}`;
  }
  return null;
}

/**
 * Extract messaging platforms checkboxes (Messenger, Instagram, WhatsApp).
 * 2026 DOM: checkboxes near "Messaging platforms" or "messaging apps" labels.
 * Only appears when conversion location is "Message destinations".
 */
export function getMessagingPlatforms(): string[] | null {
  const platforms: string[] = [];
  const labels = ['Messenger', 'Instagram', 'WhatsApp'];
  for (const label of labels) {
    const cbs = document.querySelectorAll('input[type="checkbox"]');
    for (const cb of cbs) {
      const parentText = cb.closest('label')?.textContent?.trim() ?? '';
      if (parentText.includes(label) && (cb as HTMLInputElement).checked) {
        platforms.push(label);
      }
    }
  }
  return platforms.length > 0 ? platforms : null;
}

/**
 * Extract excluded placements text.
 * 2026 DOM: text near "Excluded placements" heading, e.g. "None".
 */
export function getExcludedPlacements(): string | null {
  return readSummaryTextNearHeading('Excluded placements');
}

/**
 * Extract the ad name.
 * 2026 DOM: `<input placeholder="Enter your ad name here...">`
 */
export function getAdName(): string | null {
  const el = document.querySelector<HTMLInputElement>('input[placeholder*="ad name" i]');
  if (el?.value) return el.value;

  const nearHeading = findElementNearHeading('Ad name', 'input[type="text"], input[role="combobox"]');
  if (nearHeading && (nearHeading as HTMLInputElement).value) {
    return (nearHeading as HTMLInputElement).value;
  }
  return null;
}

/**
 * Extract the partnership ad toggle state.
 * 2026 DOM: `[role="switch"]` near "Partnership ad" heading.
 */
export function getPartnershipAd(): boolean | null {
  const sw = findElementNearHeading('Partnership ad', '[role="switch"]');
  if (!sw) return null;
  return sw.getAttribute('aria-checked') === 'true';
}

/**
 * Extract the destination URL.
 * 2026 DOM: `<input placeholder="http://www.example.com/page">` or
 *           `<input placeholder="Enter the URL you want to promote">`
 */
export function getDestinationUrl(): string | null {
  // Primary: placeholder with example.com (current 2026 DOM)
  const el = document.querySelector<HTMLInputElement>('input[placeholder*="example.com" i]');
  if (el?.value) return el.value;

  // Fallback: older placeholder variant
  const el2 = document.querySelector<HTMLInputElement>('input[placeholder*="Enter the URL" i]');
  if (el2?.value) return el2.value;

  const nearHeading = findElementNearHeading('Website URL', 'input');
  if (nearHeading && (nearHeading as HTMLInputElement).value) {
    return (nearHeading as HTMLInputElement).value;
  }
  return null;
}

/**
 * Extract the CTA (Call to Action) type.
 * 2026 DOM: `[role="combobox"]` near "Call to action" heading.
 */
export function getCTAType(): string | null {
  const combo = findElementNearHeading('Call to action', '[role="combobox"]');
  return combo?.textContent?.trim() || null;
}

/**
 * Extract the Facebook Page ID / name.
 * 2026 DOM: first `[role="combobox"]` in "Identity" section.
 */
export function getPageId(): string | null {
  const combo = findElementNearHeading('Identity', '[role="combobox"]');
  if (combo) {
    const text = combo.textContent?.trim();
    return normalizePageSelectionText(text);
  }
  return null;
}

/**
 * Extract the Instagram account.
 * 2026 DOM: `[role="combobox"][aria-label="Instagram account"]` (rare aria-label).
 */
export function getInstagramAccount(): string | null {
  const combo = document.querySelector<HTMLElement>('[role="combobox"][aria-label="Instagram account"]');
  return combo?.textContent?.trim() || null;
}

/**
 * Extract URL parameters (tracking).
 * 2026 DOM: `<input placeholder="key1=value1&key2=value2">`.
 */
export function getUrlParameters(): string | null {
  const el = document.querySelector<HTMLInputElement>('input[placeholder*="key1=value1"]');
  return el?.value || null;
}

/**
 * Extract the chat greeting text (Messenger campaigns).
 * 2026 DOM: text near "Greeting" heading.
 */
export function getChatGreeting(): string | null {
  return readSummaryTextNearHeading('Greeting');
}

/**
 * Extract beneficiary and payer (EU DSA compliance).
 * 2026 DOM: switch with aria-label "The advertiser and payer are different"
 * near "Beneficiary and payer" heading. Falls back to combobox.
 */
export function getBeneficiaryPayer(): boolean | string | null {
  // Primary: switch element
  const sw = findElementNearHeading('Beneficiary and payer', '[role="switch"]')
    ?? document.querySelector<HTMLElement>('[role="switch"][aria-label*="advertiser and payer" i]');
  if (sw) {
    return sw.getAttribute('aria-checked') === 'true';
  }
  // Fallback: combobox
  const combo = findElementNearHeading('Beneficiary and payer', '[role="combobox"]');
  const text = combo?.textContent?.trim();
  if (text && !text.toLowerCase().includes('select a person')) return text;
  return null;
}

/**
 * Extract the Facebook Page in ad set level.
 * 2026 DOM: input near "Facebook Page" heading with page name value.
 */
export function getAdSetFacebookPage(): string | null {
  const input = findElementNearHeading('Facebook Page', 'input');
  if (input && (input as HTMLInputElement).value) {
    return (input as HTMLInputElement).value;
  }
  // Fallback: combobox near "Facebook Page" heading
  const combo = findElementNearHeading('Facebook Page', '[role="combobox"]');
  if (combo) {
    const text = combo.textContent?.trim();
    if (text && text.length < 80) return text;
  }
  return null;
}

/**
 * Extract the campaign bid strategy.
 * 2026 DOM: text near "Campaign bid strategy" heading (e.g. "Highest volume").
 */
export function getCampaignBidStrategy(): string | null {
  const headings = document.querySelectorAll<HTMLElement>('[role="heading"], h2, h3, h4');
  for (const h of headings) {
    if (h.textContent?.toLowerCase().includes('bid strategy')) {
      const sibling = h.nextElementSibling || h.parentElement?.nextElementSibling;
      if (sibling) {
        const text = (sibling as HTMLElement).textContent?.trim();
        if (text && text.length < 100) return text;
      }
    }
  }
  // Fallback: combobox near bid strategy heading
  const combo = findElementNearHeading('Campaign bid strategy', '[role="combobox"]');
  if (combo) return combo.textContent?.trim() || null;
  // Broader fallback
  const combo2 = findElementNearHeading('Bid strategy', '[role="combobox"]');
  if (combo2) return combo2.textContent?.trim() || null;
  return null;
}

/**
 * Extract the ad creative format.
 * 2026 DOM: combobox with "Create ad" text near "Ad setup" heading.
 */
export function getAdCreativeFormat(): string | null {
  const combo = findElementNearHeading('Ad setup', '[role="combobox"]');
  if (combo) return combo.textContent?.trim() || null;
  // Fallback: combobox near "Format" heading
  const combo2 = findElementNearHeading('Format', '[role="combobox"]');
  if (combo2) return combo2.textContent?.trim() || null;
  return null;
}

// ---------------------------------------------------------------------------
// Ad Creative Field Getters (2026 Meta Ads Manager — Ad panel)
// ---------------------------------------------------------------------------

/**
 * Extract the primary text (ad copy).
 * 2026 DOM: first `<textarea>` on the page.
 */
export function getAdPrimaryText(): string | null {
  const textareas = document.querySelectorAll('textarea');
  return textareas[0]?.value || null;
}

/**
 * Extract the headline (ad copy).
 * 2026 DOM: second `<textarea>` on the page.
 */
export function getAdHeadline(): string | null {
  const textareas = document.querySelectorAll('textarea');
  return textareas[1]?.value || null;
}

/**
 * Extract the description (ad copy).
 * 2026 DOM: third `<textarea>` on the page.
 */
export function getAdDescription(): string | null {
  const textareas = document.querySelectorAll('textarea');
  return textareas[2]?.value || null;
}

/**
 * Extract the ad-level destination URL (creative section).
 * 2026 DOM: `<input placeholder="http://www.example.com/page">`.
 * This delegates to `getDestinationUrl()` which already uses the same selector.
 */
export function getAdDestinationUrl(): string | null {
  const el = document.querySelector<HTMLInputElement>('input[placeholder*="example.com" i]');
  return el?.value || null;
}

/**
 * Extract the display link.
 * 2026 DOM: `<input placeholder="...link you want to show...">`.
 */
export function getAdDisplayLink(): string | null {
  const el = document.querySelector<HTMLInputElement>('input[placeholder*="link you want to show" i]');
  return el?.value || null;
}

/**
 * Known CTA label values in Meta Ads Manager.
 */
const KNOWN_CTA_LABELS = [
  'Learn more', 'Shop now', 'Sign up', 'Download', 'Apply now',
  'Book now', 'Contact us', 'Get quote', 'Subscribe', 'Watch more',
  'Send message', 'Get offer', 'See menu', 'No button',
];

/**
 * Extract the CTA (Call to Action) type from the combobox.
 * 2026 DOM: `[role="combobox"]` whose text matches a known CTA label,
 * or the combobox nearest the "Call to action" heading.
 */
export function getAdCTAType(): string | null {
  // Strategy 1: scan all comboboxes for known CTA text
  const combos = document.querySelectorAll<HTMLElement>('[role="combobox"]');
  for (const combo of combos) {
    const text = combo.textContent?.trim();
    if (text && KNOWN_CTA_LABELS.some(cta => text.includes(cta))) {
      return text;
    }
  }
  // Strategy 2: find combobox near "Call to action" heading
  return findElementNearHeading('call to action', '[role="combobox"]')?.textContent?.trim() || null;
}

/**
 * Extract the ad creative format via radio buttons.
 * 2026 DOM: radio group with options SINGLE / MULTIPLE / COLLECTIONS.
 */
export function getAdFormat(): string | null {
  const radios = document.querySelectorAll<HTMLInputElement>('input[type="radio"]');
  for (const radio of radios) {
    if (radio.checked) {
      const val = radio.value?.toUpperCase();
      if (['SINGLE', 'MULTIPLE', 'COLLECTIONS'].includes(val)) {
        return val;
      }
      // Fallback: check label text
      const label = radio.closest('label')?.textContent?.trim().toUpperCase();
      if (label && ['SINGLE', 'MULTIPLE', 'COLLECTIONS'].some(f => label.includes(f))) {
        return label;
      }
    }
  }
  return null;
}

/**
 * Extract the destination type via radio buttons.
 * 2026 DOM: radio group with options like "external" / "instant_experience".
 */
export function getAdDestinationType(): string | null {
  const radios = document.querySelectorAll<HTMLInputElement>('input[type="radio"]');
  for (const radio of radios) {
    if (radio.checked) {
      const val = radio.value?.toLowerCase();
      if (['external', 'instant_experience'].includes(val)) {
        return val;
      }
    }
  }
  // Fallback: near "Destination" heading
  const label = findElementNearHeading('Destination', 'label:has(input[type="radio"]:checked)');
  return label?.textContent?.trim().toLowerCase() || null;
}

/**
 * Extract the flexible media toggle state.
 * 2026 DOM: `[role="switch"]` near "Flexible media" heading.
 */
export function getAdFlexibleMedia(): boolean | null {
  const sw = findElementNearHeading('flexible media', '[role="switch"]');
  if (!sw) return null;
  return sw.getAttribute('aria-checked') === 'true';
}

/**
 * Extract the "Add music" checkbox state.
 * 2026 DOM: `input[type="checkbox"]` near "Add music" text.
 */
export function getAdAddMusic(): boolean | null {
  const cb = findElementNearHeading('add music', 'input[type="checkbox"]') as HTMLInputElement | null;
  if (!cb) {
    // Fallback: look for a role="checkbox" element
    const roleCb = findElementNearHeading('add music', '[role="checkbox"]');
    if (roleCb) return roleCb.getAttribute('aria-checked') === 'true';
    return null;
  }
  return cb.checked;
}

// ---------------------------------------------------------------------------
// Ad-Level Additional Getters
// ---------------------------------------------------------------------------

/**
 * Find a nearby interactive element using a span/div label (not a heading).
 * 2026 DOM: some labels are `<span>` not `[role="heading"]`.
 */
function findElementNearLabel(
  labelText: string,
  childSelector: string,
  maxLevels: number = 8,
): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>('span, div');
  for (const el of all) {
    // Match own text only
    if (el.children.length > 2) continue;
    if (!el.textContent?.trim().toLowerCase().includes(labelText.toLowerCase())) continue;
    if (el.textContent.trim().length > labelText.length + 20) continue;
    let container: HTMLElement | null = el.parentElement;
    for (let i = 0; i < maxLevels && container; i++) {
      const match = container.querySelector<HTMLElement>(childSelector);
      if (match) return match;
      container = container.parentElement;
    }
  }
  return null;
}

/**
 * Extract the Threads profile selection.
 * 2026 DOM: combobox near "Threads profile" span.
 */
export function getThreadsProfile(): string | null {
  const combo = findElementNearLabel('Threads profile', '[role="combobox"]');
  const text = combo?.textContent?.trim() || null;
  if (!text || text === 'Select a Threads profile') return null;
  return text;
}

/**
 * Extract the multi-advertiser ads checkbox state.
 * 2026 DOM: checkbox near "Multi-advertiser ads" span.
 */
export function getMultiAdvertiserAds(): boolean | null {
  const cb = findElementNearLabel('Multi-advertiser ads', 'input[type="checkbox"]') as HTMLInputElement | null;
  if (cb) return cb.checked;
  const roleCb = findElementNearLabel('Multi-advertiser ads', '[role="checkbox"]');
  if (roleCb) return roleCb.getAttribute('aria-checked') === 'true';
  return null;
}

/**
 * Extract the app events tracking checkbox state.
 * 2026 DOM: checkbox near "App events" div.
 */
export function getAppEvents(): boolean | null {
  const cb = findElementNearLabel('App events', 'input[type="checkbox"]') as HTMLInputElement | null;
  if (cb) return cb.checked;
  return null;
}

/**
 * Extract the ad languages switch state.
 * 2026 DOM: switch near "Languages" heading.
 */
export function getAdLanguages(): boolean | null {
  const sw = findElementNearHeading('Languages', '[role="switch"]');
  if (sw) return sw.getAttribute('aria-checked') === 'true';
  return null;
}

// ---------------------------------------------------------------------------
// Objective-Specific Field Getters (Engagement, Sales, Leads)
// ---------------------------------------------------------------------------

/**
 * Extract the engagement type from the ad set panel.
 * 2026 DOM: `[role="combobox"]` near "Engagement type" heading (e.g. "Video views").
 */
export function getEngagementType(): string | null {
  return findElementNearHeading('engagement type', '[role="combobox"]')?.textContent?.trim() || null;
}

/**
 * Extract the frequency control checkbox state.
 * 2026 DOM: `input[type="checkbox"]` near heading containing "frequency".
 */
export function getFrequencyControl(): boolean | null {
  const headings = document.querySelectorAll('[role="heading"], h3, h4');
  for (const h of headings) {
    if (h.textContent?.toLowerCase().includes('frequency')) {
      const checkbox = h.parentElement?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (checkbox) return checkbox.checked;
    }
  }
  return null;
}

/**
 * Extract the cost per result goal (bid textbox).
 * 2026 DOM: `input[aria-label="Bid"]` or textbox with aria-label "Bid".
 */
export function getCostPerResultGoal(): string | null {
  const el = document.querySelector<HTMLInputElement>('[role="textbox"][aria-label="Bid"], input[aria-label="Bid"]');
  return el?.value || null;
}

/**
 * Extract the Advantage+ sales or leads campaign toggle state.
 * 2026 DOM: button containing "Advantage+" and "sales"/"leads" with "On"/"Off" text.
 */
export function getAdvantagePlusCampaign(): boolean | null {
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    const text = btn.textContent?.trim();
    if (text?.includes('Advantage+') && (text?.includes('sales') || text?.includes('leads'))) {
      return text.includes('On');
    }
  }
  return null;
}

/**
 * Extract the Advantage+ catalog ads toggle state.
 * 2026 DOM: `[role="switch"]` near "catalog ads" heading.
 */
export function getAdvantagePlusCatalog(): boolean | null {
  const sw = findElementNearHeading('catalog ads', '[role="switch"]');
  if (!sw) return null;
  return sw.getAttribute('aria-checked') === 'true';
}

/**
 * Extract the dynamic creative toggle state.
 * 2026 DOM: `[role="switch"]` near "Dynamic creative" heading.
 */
export function getDynamicCreative(): boolean | null {
  const sw = findElementNearHeading('dynamic creative', '[role="switch"]');
  if (!sw) return null;
  return sw.getAttribute('aria-checked') === 'true';
}

/**
 * Extract the audience type text.
 * 2026 DOM: text near "Advantage+ audience" or "Audience controls" heading.
 */
export function getAudienceType(): string | null {
  const summary = readSummaryTextNearHeading('Advantage+ audience');
  if (summary) return summary;
  return readSummaryTextNearHeading('Audience controls');
}

/**
 * Extract the detailed targeting input value.
 * 2026 DOM: `input[placeholder*="demographics" i]`.
 */
export function getDetailedTargeting(): string | null {
  const el = document.querySelector<HTMLInputElement>('input[placeholder*="demographics" i]');
  return el?.value || null;
}

// ---------------------------------------------------------------------------
// Delivery / Attribution / Dataset Getters
// ---------------------------------------------------------------------------

/**
 * Extract the delivery type from the ad set panel.
 * 2026 DOM: combobox showing "Standard" near "Delivery" heading.
 * Only appears for Traffic, Leads, Sales objectives.
 */
export function getDeliveryType(): string | null {
  // The "Standard" combobox is typically the 4th combobox on the ad set panel
  // Look near a heading containing "Delivery" or by matching known values
  const combo = findElementNearHeading('Delivery', '[role="combobox"]');
  if (combo) return combo.textContent?.trim() || null;
  // Fallback: scan all comboboxes for known delivery type values
  const combos = document.querySelectorAll('[role="combobox"]');
  for (const c of combos) {
    const t = c.textContent?.trim();
    if (t === 'Standard' || t === 'Accelerated') return t;
  }
  return null;
}

/**
 * Extract the attribution model from the ad set panel.
 * 2026 DOM: near "Attribution model" heading, value like "Standard".
 * Only appears for Sales objective.
 */
export function getAttributionModel(): string | null {
  return readSummaryTextNearHeading('Attribution model');
}

/**
 * Extract the dataset (formerly Pixel) requirement status.
 * 2026 DOM: "* Dataset" heading — checks if a dataset is configured or still required.
 * Only appears for Sales objective.
 */
export function getDataset(): string | null {
  // Look for combobox near "Dataset" heading
  const combo = findElementNearHeading('Dataset', '[role="combobox"]');
  if (combo) return combo.textContent?.trim() || null;
  // Check if dataset section exists but is unconfigured
  const heading = readSummaryTextNearHeading('Dataset');
  if (heading) return heading;
  // Fallback: check for the info text
  const body = document.body.innerText;
  if (body.includes('dataset (formerly known as Pixel) is required')) return 'REQUIRED_NOT_SET';
  return null;
}

/**
 * Extract the campaign spending limit.
 * 2026 DOM: text near "Campaign spending limit" — "None added" or a value.
 * Appears for Leads and Sales objectives.
 */
export function getCampaignSpendingLimit(): string | null {
  return readValueNearLabel('Campaign spending limit');
}

// ---------------------------------------------------------------------------
// Brand Safety & Inventory Filter Getters
// ---------------------------------------------------------------------------

/**
 * Read a value next to a label span in the Brand Safety / Inventory section.
 * 2026 DOM: label is a `<span>` 4 levels deep inside a container div that also
 * holds the value text (e.g. "Expanded (ad set)" or "None selected").
 */
function readValueNearLabel(labelText: string): string | null {
  const spans = document.querySelectorAll<HTMLSpanElement>('span');
  for (const span of spans) {
    if (span.textContent?.trim() !== labelText || span.children.length > 0) continue;
    let container: HTMLElement | null = span.parentElement;
    for (let depth = 0; depth < 8 && container; depth++) {
      const full = container.textContent?.trim() ?? '';
      if (full.length > labelText.length + 3) {
        const value = full
          .replace(labelText, '')
          .replace(/Edit/g, '')
          .replace(/[​\u200B\s]+/g, ' ')
          .trim();
        return value || null;
      }
      container = container.parentElement;
    }
    break;
  }
  return null;
}

/**
 * Inventory filter — In-content ads level.
 * Values: "Expanded (ad set)" | "Standard" | "Limited"
 */
export function getInventoryInContentAds(): string | null {
  return readValueNearLabel('In-content ads');
}

/**
 * Inventory filter — Audience Network ads level.
 * Values: "Expanded (ad set)" | "Standard" | "Limited"
 */
export function getInventoryAudienceNetwork(): string | null {
  return readValueNearLabel('Audience Network ads');
}

/**
 * Publisher block lists selection.
 * Values: "None selected" or list names.
 */
export function getPublisherBlockLists(): string | null {
  return readValueNearLabel('Publisher block lists');
}

/**
 * Content type exclusions selection.
 * Values: "None selected" or exclusion names.
 */
export function getContentTypeExclusions(): string | null {
  return readValueNearLabel('Content type exclusions');
}

/**
 * Topic exclusions selection.
 * Values: "None selected" or topic names.
 */
export function getTopicExclusions(): string | null {
  return readValueNearLabel('Topic exclusions');
}

// ---------------------------------------------------------------------------
// Aggregated Extraction
// ---------------------------------------------------------------------------

/** All DOM getter functions mapped by their field path */
const FIELD_GETTERS: Record<string, () => unknown> = {
  // Campaign level
  'campaign.name': getCampaignName,
  'campaign.objective': getCampaignObjective,
  'campaign.budget_type': getCampaignBudgetType,
  'campaign.budget_value': getCampaignBudgetValue,
  'campaign.cbo_enabled': getCampaignCBOEnabled,
  'campaign.buying_type': getCampaignBuyingType,
  'campaign.special_ad_categories': getCampaignSpecialAdCategories,
  'campaign.a_b_test': getCampaignABTest,
  'campaign.bid_strategy': getCampaignBidStrategy,
  'campaign.status': getCampaignStatus,
  'campaign.ad_scheduling': getAdScheduling,
  'campaign.advantage_plus_sales': getAdvantagePlusCampaign,
  'campaign.advantage_plus_leads': getAdvantagePlusCampaign,
  'campaign.advantage_plus_catalog': getAdvantagePlusCatalog,
  // Ad set level
  'ad_set.name': getAdSetName,
  'ad_set.conversion_location': getConversionLocation,
  'ad_set.message_destination': getMessageDestination,
  'ad_set.performance_goal': getPerformanceGoal,
  'ad_set.bid_amount': getBidAmount,
  'ad_set.targeting.geo_locations': getGeoLocations,
  'ad_set.targeting.geo_locations.countries': getGeoLocationCountries,
  'ad_set.targeting.age_range': getAgeRange,
  'ad_set.targeting.genders': getGenders,
  'ad_set.targeting.languages': getLanguages,
  'ad_set.targeting.custom_audiences': getCustomAudiences,
  'ad_set.placements': getPlacements,
  'ad_set.schedule.start_date': getScheduleStartDate,
  'ad_set.schedule.end_date': getScheduleEndDate,
  'ad_set.schedule.start_time': getScheduleStartTime,
  'ad_set.messaging_platforms': getMessagingPlatforms,
  'ad_set.excluded_placements': getExcludedPlacements,
  'ad_set.beneficiary_payer': getBeneficiaryPayer,
  'ad_set.facebook_page': getAdSetFacebookPage,
  // Objective-specific ad set fields
  'ad_set.engagement_type': getEngagementType,
  'ad_set.frequency_control': getFrequencyControl,
  'ad_set.cost_per_result_goal': getCostPerResultGoal,
  'ad_set.dynamic_creative': getDynamicCreative,
  'ad_set.audience_type': getAudienceType,
  'ad_set.detailed_targeting': getDetailedTargeting,
  // Brand safety & inventory filters
  'ad_set.inventory_in_content_ads': getInventoryInContentAds,
  'ad_set.inventory_audience_network': getInventoryAudienceNetwork,
  'ad_set.publisher_block_lists': getPublisherBlockLists,
  'ad_set.content_type_exclusions': getContentTypeExclusions,
  'ad_set.topic_exclusions': getTopicExclusions,
  // Delivery / Attribution / Dataset
  'ad_set.delivery_type': getDeliveryType,
  'ad_set.attribution_model': getAttributionModel,
  'ad_set.dataset': getDataset,
  'campaign.spending_limit': getCampaignSpendingLimit,
  // Ad level
  'ad.name': getAdName,
  'ad.partnership_ad': getPartnershipAd,
  'ad.creative.destination_url': getDestinationUrl,
  'ad.creative.cta_type': getCTAType,
  'ad.creative.page_id': getPageId,
  'ad.creative.instagram_account': getInstagramAccount,
  'ad.creative.format': getAdCreativeFormat,
  'ad.tracking.url_parameters': getUrlParameters,
  // Ad creative text fields
  'ad.creative.primary_text': getAdPrimaryText,
  'ad.creative.headline': getAdHeadline,
  'ad.creative.description': getAdDescription,
  // Ad creative URL fields
  'ad.creative.display_link': getAdDisplayLink,
  // Ad creative CTA (matches known CTA labels)
  'ad.creative.cta_type_label': getAdCTAType,
  // Ad creative format (radio: SINGLE / MULTIPLE / COLLECTIONS)
  'ad.creative.format_radio': getAdFormat,
  // Ad destination type (radio: external / instant_experience)
  'ad.creative.destination_type': getAdDestinationType,
  // Ad creative toggles
  'ad.creative.flexible_media': getAdFlexibleMedia,
  'ad.creative.add_music': getAdAddMusic,
  // Ad-level additional fields
  'ad.creative.threads_profile': getThreadsProfile,
  'ad.creative.multi_advertiser_ads': getMultiAdvertiserAds,
  'ad.tracking.app_events': getAppEvents,
  'ad.languages': getAdLanguages,
  'ad.creative.chat_greeting': getChatGreeting,
  // Aliases: backend rules use these field paths
  'ad.facebook_page_id': getPageId,
  'ad.destination_url': getDestinationUrl,
  'campaign.daily_budget': getCampaignBudgetValue,
  'campaign.lifetime_budget': getCampaignBudgetValue,
  'campaign.geo_targets': getGeoLocations,
  'ad_set.daily_budget': getCampaignBudgetValue,
  'ad_set.lifetime_budget': getCampaignBudgetValue,
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
      console.log('[EXTRACTION] chrome.storage not available, defaulting to false');
      requireExtractionEnabled = false;
    }
  } catch (err) {
    console.log('[EXTRACTION] Error reading chrome.storage:', err);
    requireExtractionEnabled = false;
  }
  return requireExtractionEnabled;
}

/**
 * Override the feature flag at runtime (useful for tests).
 */
export function setRequireExtractionEnabled(value: boolean): void {
  requireExtractionEnabled = value;
}

// Field registry metadata lives in meta-field-specs.ts so extraction, debug,
// and future docs all read from the same source of truth.

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

    for (const [fieldPath, mapping] of Object.entries(getMetaRequireFieldMap())) {
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
export async function extractAllFieldValues(
  activeEntityLevel?: EntityLevel,
): Promise<Record<string, unknown>> {
  const extractionStartTime = performance.now();
  const allFieldPaths = getSupportedFieldPaths();
  const results: Record<string, unknown> = {};
  const strategyUsed: Record<string, 'require' | 'remoteEval' | 'fiber' | 'dom' | 'failed'> = {};
  const activeFieldPaths = new Set(allFieldPaths);

  // NOTE: Entity-level filtering disabled. Meta's standalone campaign editor
  // shows all entity levels (campaign + ad set + ad) simultaneously, so we
  // need to extract ALL fields regardless of which panel is focused.
  // The old filter was causing campaign fields to show "COULDN'T VERIFY"
  // when the ad set panel was active.

  // Initialize all fields to null
  for (const fieldPath of allFieldPaths) {
    results[fieldPath] = null;
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
          if (!activeFieldPaths.has(field)) continue;
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
    .filter(([field, value]) => activeFieldPaths.has(field) && value === null)
    .map(([field]) => field)
    .filter((field) => getMetaRemoteEvalConfig(field) !== null);

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
    if (!activeFieldPaths.has(fieldPath)) continue;
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
  const telemetryFieldPaths = Array.from(activeFieldPaths);
  if (telemetryFieldPaths.length > 0) {
    Promise.all(
      telemetryFieldPaths.map((fieldPath) => {
        const value = results[fieldPath];
        const strategy = strategyUsed[fieldPath] || (value !== null ? 'dom' : 'failed');

        return logFieldExtraction({
          timestamp: Date.now(),
          field: fieldPath,
          strategyUsed: strategy,
          durationMs: totalDurationMs / telemetryFieldPaths.length,
          error: strategy === 'failed' ? 'No extraction strategy succeeded' : undefined,
        });
      }),
    ).catch((err) => {
      console.error('[TELEMETRY] Failed to log field extraction telemetry:', err);
    });
  }

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

  const queryGetters = fieldPaths
    .map((field) => {
      const config = getMetaRemoteEvalConfig(field);
      if (!config) {
        return null;
      }

      return {
        field,
        method: config.method,
        selector: config.selector,
      };
    })
    .filter((
      getter,
    ): getter is {
      field: string;
      method: RemoteEvalQuery['getters'][number]['method'];
      selector: string;
    } => getter !== null);

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
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return normalizeStringValue(field, value);

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
      const objectiveValue =
        obj.objective ??
        obj.value ??
        obj.name ??
        obj.label ??
        obj.text ??
        obj.type ??
        getNestedProp(obj, ['selectedOption', 'label']) ??
        getNestedProp(obj, ['selectedOption', 'value']) ??
        getNestedProp(obj, ['selected', 'label']);
      return typeof objectiveValue === 'string'
        ? normalizeStringValue(field, objectiveValue)
        : null;
    }

    // Budget: extract numeric value
    if (field.includes('budget')) {
      const numVal = obj.value ?? obj.amount ?? obj.budget;
      if (typeof numVal === 'number') return numVal;
      if (typeof numVal === 'string') return parseFloat(numVal) || null;
    }

    if (field.includes('budget_type')) {
      const budgetTypeValue =
        obj.value ??
        obj.name ??
        obj.label ??
        obj.text ??
        getNestedProp(obj, ['selectedOption', 'label']) ??
        getNestedProp(obj, ['selectedOption', 'value']);
      return typeof budgetTypeValue === 'string'
        ? normalizeStringValue(field, budgetTypeValue)
        : null;
    }

    if (field.includes('cbo_enabled')) {
      const booleanValue =
        obj.checked ??
        obj.isEnabled ??
        obj.enabled ??
        obj.ariaChecked ??
        obj.value;
      return normalizeBooleanLike(booleanValue);
    }

    if (field.includes('page_id')) {
      const pageIdValue = obj.pageId ?? obj.value ?? obj.id ?? obj.name ?? obj.label;
      return typeof pageIdValue === 'string' ? pageIdValue : null;
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

function normalizeStringValue(field: string, value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (field.includes('budget_type')) {
    const lowered = trimmed.toLowerCase();
    if (lowered.includes('daily')) return 'daily';
    if (lowered.includes('lifetime')) return 'lifetime';
  }

  return trimmed;
}

function normalizeBooleanLike(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return null;

  const lowered = value.trim().toLowerCase();
  if (['true', '1', 'on', 'enabled', 'checked'].includes(lowered)) return true;
  if (['false', '0', 'off', 'disabled', 'unchecked'].includes(lowered)) return false;
  return null;
}

/**
 * Get the list of all supported field paths (including require() fields and aliases).
 */
export function getSupportedFieldPaths(): string[] {
  const specPaths = getMetaFieldPaths();
  const getterPaths = Object.keys(FIELD_GETTERS);
  // Merge both sources — FIELD_GETTERS may have aliases not in field specs
  return [...new Set([...specPaths, ...getterPaths])];
}

export function getFieldPathsForEntityLevel(entityLevel: EntityLevel): string[] {
  return getMetaFieldPathsForEntityLevel(entityLevel);
}

/**
 * Get the list of DOM-only field paths (original 18 fields).
 */
export function getDomFieldPaths(): string[] {
  return getMetaDomFieldPaths();
}

/**
 * Get the require() field mapping for testing/inspection.
 */
export function getRequireFieldMap(): Record<string, { store: string; path: string }> {
  return getMetaRequireFieldMap();
}

function normalizePlacementLabel(value: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 80) return null;
  if (trimmed.includes('\n')) return null;

  return trimmed;
}

function normalizeDateLikeValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const looksLikeDate =
    /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ||
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed) ||
    /^[A-Za-z]{3,9}\s+\d{1,2}(,\s*\d{4})?$/.test(trimmed);

  return looksLikeDate ? trimmed : null;
}

function normalizePageSelectionText(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 80) return null;

  const collapsed = trimmed.replace(/\s+/g, '');
  if (/^(edit)+$/i.test(collapsed)) {
    return null;
  }

  if (/^(edit|identity|select page|choose page)$/i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

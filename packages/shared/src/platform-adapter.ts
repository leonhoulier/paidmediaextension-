import { Platform } from './enums.js';
import { ExtensionContext, InjectionPoint } from './models.js';

/**
 * Platform Adapter Interface
 *
 * Every platform-specific implementation (Meta, Google Ads, etc.) must implement
 * this interface to provide consistent DOM interaction patterns.
 */
export interface PlatformAdapter {
  /**
   * Platform identifier
   */
  platform: Platform;

  /**
   * Detect the current context and entity level from URL and DOM
   *
   * @returns Context information or null if detection fails
   */
  detectContext(): ExtensionContext | null;

  /**
   * Extract current field values from the DOM
   *
   * This method uses the remoteEval bridge pattern to access framework-internal
   * state (React Fiber, Angular component state, etc.)
   *
   * @returns Record of field paths to their current values
   */
  extractFieldValues(): Promise<Record<string, unknown>>;

  /**
   * Get cached field values from the last successful extraction
   *
   * This returns the most recent extraction results without running a new
   * extraction. Use this in validation to avoid race conditions and timing issues.
   *
   * @returns Record of field paths to their cached values
   */
  getCachedFieldValues(): Record<string, unknown>;

  /**
   * Get the DOM element where a specific injection should be placed
   *
   * @param ruleType - The type of rule being injected
   * @param fieldPath - The field path this rule validates
   * @returns Injection point information or null if not found
   */
  getInjectionPoint(ruleType: string, fieldPath: string): InjectionPoint | null;

  /**
   * Hook into the platform's "Create" / "Publish" button to intercept creation
   *
   * @param callback - Called when user attempts to create/publish.
   *                   Call with true to allow, false to block.
   */
  interceptCreation(callback: (allow: boolean) => void): void;

  /**
   * Observe field changes in the DOM and trigger callback
   *
   * Uses MutationObserver and platform-specific change detection.
   *
   * @param callback - Called when a field value changes
   */
  observeFieldChanges(callback: (fieldPath: string, value: unknown) => void): void;

  /**
   * Clean up all injections and observers
   *
   * Called when navigating away or when adapter is deactivated
   */
  cleanup(): void;
}

/**
 * Remote eval query message for postMessage bridge.
 *
 * Supports two modes:
 *   1. **Getter mode** – classic named-getter batching via `getters` array.
 *   2. **Expression mode** – raw JavaScript expression sent via `expression`.
 *
 * The `id` field is an alias for `queryId` to simplify caller code.
 * When both are supplied, `queryId` takes precedence.
 */
export interface RemoteEvalQuery {
  type: 'evalQuery.governance';
  queryId: string;
  /** Optional alias for queryId (convenience) */
  id?: string;
  /** Optional parameters forwarded to expression evaluation */
  params?: Record<string, unknown>;
  /** Raw JS expression to eval in the MAIN world (expression mode) */
  expression?: string;
  getters: Array<{
    field: string;
    method:
      | 'elementText'
      | 'elementValue'
      | 'elementAttribute'
      | 'FindReact'
      | 'FindReactFiber_v17'
      | 'FindReactNodes'
      | 'GetCompFiber'
      | 'FindContexts'
      | 'FindFacebookContextSelector'
      | 'FindPath'
      | 'FacebookClearExtensionDetection'
      | 'FindVue'
      | 'FindJQuery'
      | 'FindContext_v0'
      | 'facebookEditorTree'
      | 'callSelector'
      | 'elementExists'
      | 'elementTextAll'
      | 'elementChecked'
      | 'elementStyle'
      | 'selectedOptionText';
    selector?: string;
    attribute?: string;
  }>;
}

/**
 * Remote eval result message from postMessage bridge.
 *
 * The optional `buffer` field carries a Transferable ArrayBuffer for large
 * payloads (e.g. full editor tree snapshots). When present, the postMessage
 * call uses the `transferList` parameter so the buffer is moved rather than
 * copied.
 */
export interface RemoteEvalResult {
  type: 'evalResult.governance';
  queryId: string;
  results: Record<string, unknown>;
  errors: Record<string, string>;
  /** Optional Transferable ArrayBuffer for large payloads */
  buffer?: ArrayBuffer;
}

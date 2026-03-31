/**
 * Eval Bridge - MAIN World Script
 *
 * This script is injected into the page's MAIN world execution context
 * via chrome.scripting.executeScript({ world: 'MAIN' }).
 *
 * It provides named getters that can access the page's JavaScript context,
 * including React Fiber trees, React Context providers, Facebook's internal
 * require() module system, Vue instances, and jQuery data.
 *
 * Communication protocol:
 *   Content Script -> Eval Bridge:  CustomEvent('evalQuery.governance')
 *   Eval Bridge -> Content Script:  postMessage('evalResult.governance') with Transferable ArrayBuffer
 *
 * The bridge also supports:
 *   - Raw eval() fallback via the `expression` field on queries
 *   - Facebook require() module access for direct state extraction
 *   - Transferable ArrayBuffer for large payloads (editor tree snapshots)
 *
 * @module eval-bridge
 */

(function governanceEvalBridge() {
  // Prevent duplicate injection
  if ((window as unknown as Record<string, unknown>).__governanceEvalBridge) {
    return;
  }
  (window as unknown as Record<string, unknown>).__governanceEvalBridge = true;

  // ─── Facebook require() Module Access ────────────────────────────────────

  /**
   * Access Facebook's internal require() function.
   *
   * Meta Ads Manager bundles modules via a custom require system.
   * By accessing `window.require` or `window.__d` we can call into
   * internal modules to extract editor state without DOM scraping.
   */
  function getFacebookRequire(): ((moduleId: string) => unknown) | null {
    const win = window as unknown as Record<string, unknown>;
    if (typeof win.require === 'function') {
      return win.require as (moduleId: string) => unknown;
    }
    // Fallback: some builds expose __d as the module registry
    if (typeof win.__d === 'function') {
      return win.__d as (moduleId: string) => unknown;
    }
    return null;
  }

  // ─── Named Getters ────────────────────────────────────────────────────────

  type GetterFunction = (selector: string, attribute?: string) => unknown;

  const getters: Record<string, GetterFunction> = {
    /**
     * Get the text content of an element
     */
    elementText: (selector: string) => {
      const el = document.querySelector(selector);
      return el?.textContent?.trim() ?? null;
    },

    /**
     * Get the value of an input/select element
     */
    elementValue: (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return null;

      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        return el.value;
      }

      // For contenteditable elements
      if (el.getAttribute('contenteditable') === 'true') {
        return el.textContent?.trim() ?? null;
      }

      return null;
    },

    /**
     * Get a specific attribute of an element
     */
    elementAttribute: (selector: string, attribute?: string) => {
      if (!attribute) return null;
      const el = document.querySelector(selector);
      return el?.getAttribute(attribute) ?? null;
    },

    /**
     * Check if an element exists in the DOM
     */
    elementExists: (selector: string) => {
      return document.querySelector(selector) !== null;
    },

    /**
     * Get all text values from matching elements (useful for multi-selects)
     */
    elementTextAll: (selector: string) => {
      const elements = document.querySelectorAll(selector);
      return Array.from(elements).map((el) => el.textContent?.trim() ?? '');
    },

    /**
     * Check if a checkbox/toggle is checked
     */
    elementChecked: (selector: string) => {
      const el = document.querySelector(selector);
      if (el instanceof HTMLInputElement) {
        return el.checked;
      }
      // For custom toggle elements, check aria-checked
      return el?.getAttribute('aria-checked') === 'true';
    },

    /**
     * Traverse React Fiber tree to extract component props/state (React 18+).
     *
     * Looks for `__reactFiber$` keys on the DOM element.
     */
    FindReact: (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return null;

      const fiberKey = Object.keys(el).find((k) =>
        k.startsWith('__reactFiber$')
      );
      if (!fiberKey) return null;

      try {
        const fiber = (el as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown>;
        return extractFiberData(fiber);
      } catch {
        return null;
      }
    },

    /**
     * React 17 Fiber traversal.
     *
     * Older React versions use `__reactInternalInstance$` rather than
     * `__reactFiber$`. This getter handles that prefix.
     */
    FindReactFiber_v17: (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return null;

      const fiberKey = Object.keys(el).find((k) =>
        k.startsWith('__reactInternalInstance$')
      );
      if (!fiberKey) return null;

      try {
        const fiber = (el as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown>;
        return extractFiberData(fiber);
      } catch {
        return null;
      }
    },

    /**
     * Find all React-managed DOM nodes under a container.
     *
     * Returns an array of objects with element tag, fiber type, and
     * serialisable memoizedProps.
     */
    FindReactNodes: (selector: string) => {
      const container = document.querySelector(selector);
      if (!container) return null;

      const nodes: Array<Record<string, unknown>> = [];
      const elements = container.querySelectorAll('*');

      for (const el of elements) {
        const fiberKey = Object.keys(el).find(
          (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
        );
        if (!fiberKey) continue;

        try {
          const fiber = (el as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown>;
          const typeName = getTypeName(fiber);
          if (typeName) {
            nodes.push({
              tag: (el as HTMLElement).tagName,
              type: typeName,
              props: extractSafeProps(fiber.memoizedProps as Record<string, unknown> | null),
            });
          }
        } catch {
          // Skip nodes that throw
        }
      }

      return nodes.length > 0 ? nodes : null;
    },

    /**
     * Get the closest class component fiber from a DOM element.
     *
     * Walks up the fiber tree until it finds a fiber whose type is a
     * class (has a prototype with render) or a function component.
     */
    GetCompFiber: (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return null;

      const fiberKey = Object.keys(el).find(
        (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
      );
      if (!fiberKey) return null;

      try {
        const fiber = (el as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown>;
        let current: Record<string, unknown> | null = fiber;
        let depth = 0;
        const maxDepth = 30;

        while (current && depth < maxDepth) {
          const type = current.type;
          if (typeof type === 'function') {
            const typeName = (type as Record<string, unknown>).displayName as string ??
              (type as Record<string, unknown>).name as string ?? null;
            return {
              name: typeName,
              props: extractSafeProps(current.memoizedProps as Record<string, unknown> | null),
              state: current.memoizedState,
            };
          }
          current = current.return as Record<string, unknown> | null;
          depth++;
        }
      } catch {
        return null;
      }

      return null;
    },

    /**
     * Find React context providers for a DOM element.
     *
     * Walks up the fiber tree collecting context values from providers.
     */
    FindContexts: (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return null;

      const fiberKey = Object.keys(el).find((k) =>
        k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
      );
      if (!fiberKey) return null;

      try {
        const fiber = (el as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown>;
        return extractContextData(fiber);
      } catch {
        return null;
      }
    },

    /**
     * Find a specific Facebook context value by searching for a
     * context whose _currentValue has a matching shape or displayName.
     *
     * @param selector - CSS selector for the root element
     * @param attribute - Optional context displayName pattern to match
     */
    FindFacebookContextSelector: (selector: string, attribute?: string) => {
      const el = document.querySelector(selector);
      if (!el) return null;

      const fiberKey = Object.keys(el).find(
        (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
      );
      if (!fiberKey) return null;

      const pattern = attribute ? new RegExp(attribute, 'i') : null;

      try {
        const fiber = (el as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown>;
        let current: Record<string, unknown> | null = fiber;
        let depth = 0;

        while (current && depth < 50) {
          const type = current.type as Record<string, unknown> | null;
          if (type && typeof type === 'object' && '_context' in type) {
            const context = type._context as Record<string, unknown>;
            const value = context._currentValue;
            if (!pattern) return value;

            const displayName = (context as Record<string, unknown>).displayName;
            if (typeof displayName === 'string' && pattern.test(displayName)) {
              return value;
            }
          }
          current = current.return as Record<string, unknown> | null;
          depth++;
        }
      } catch {
        return null;
      }

      return null;
    },

    /**
     * Find a deep property path in a React Fiber tree.
     *
     * @param selector - CSS selector for the starting element
     * @param attribute - Dot-separated path (e.g. 'store.campaign.name')
     */
    FindPath: (selector: string, attribute?: string) => {
      if (!attribute) return null;
      const el = document.querySelector(selector);
      if (!el) return null;

      const fiberKey = Object.keys(el).find(
        (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
      );
      if (!fiberKey) return null;

      const pathParts = attribute.split('.');

      try {
        const fiber = (el as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown>;
        let current: Record<string, unknown> | null = fiber;
        let depth = 0;

        while (current && depth < 20) {
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
        return null;
      }

      return null;
    },

    /**
     * Clear Facebook's extension detection markers.
     *
     * Meta's Ads Manager injects detection for browser extensions.
     * This clears known markers so our extension is not flagged.
     * Called early during injection (injectImmediately: true).
     *
     * Detection vectors cleared:
     *   1. React DevTools global markers
     *   2. data-extension-detected DOM attributes
     *   3. AdsBrowserExtensionErrorUtils module override
     *   4. Facebook's __d module registry interception
     */
    FacebookClearExtensionDetection: () => {
      try {
        const win = window as unknown as Record<string, unknown>;

        // 1. Clear known extension detection properties
        const detectionKeys = [
          '__REACT_DEVTOOLS_GLOBAL_HOOK__',
          '__REACT_DEVTOOLS_BROWSER_THEME__',
        ];
        for (const key of detectionKeys) {
          if (key in win && key === '__REACT_DEVTOOLS_BROWSER_THEME__') {
            delete win[key];
          }
        }

        // 2. Remove data attributes that signal extensions
        const markers = document.querySelectorAll('[data-extension-detected]');
        for (const marker of markers) {
          marker.removeAttribute('data-extension-detected');
        }

        // 3. Override Meta's AdsBrowserExtensionErrorUtils module if already loaded
        try {
          const fbRequire = (typeof win.require === 'function')
            ? win.require as (moduleId: string) => unknown
            : null;
          if (fbRequire) {
            try {
              const adsModule = fbRequire('AdsBrowserExtensionErrorUtils') as Record<string, unknown> | null;
              if (adsModule) {
                adsModule.isBrowserExtensionError = () => false;
                adsModule.maybeReportBrowserExtensionError = () => { /* no-op */ };
              }
            } catch {
              // Module not yet loaded -- handled by __d interception below
            }
          }
        } catch {
          // require not available
        }

        // 4. Intercept Facebook's __d module registry to override extension detection
        //    modules before they initialise. __d is Facebook's define() equivalent.
        try {
          const origDefine = win.__d;
          if (typeof origDefine === 'function') {
            const wrappedDefine = function (this: unknown, ...args: unknown[]) {
              // __d(factory, moduleId, deps) -- moduleId is typically args[1]
              const moduleId = args.length > 1 ? args[1] : undefined;
              if (typeof moduleId === 'string' && moduleId === 'AdsBrowserExtensionErrorUtils') {
                // Replace the factory with one that returns safe stubs
                args[0] = function (_globalRequire: unknown, module: Record<string, unknown>, _exports: unknown) {
                  module.exports = {
                    isBrowserExtensionError: () => false,
                    maybeReportBrowserExtensionError: () => { /* no-op */ },
                  };
                };
              }
              return (origDefine as (...a: unknown[]) => unknown).apply(this, args);
            };
            // Preserve any static properties on __d
            Object.assign(wrappedDefine, origDefine);
            win.__d = wrappedDefine;
          }
        } catch {
          // __d interception failed -- non-fatal
        }

        return true;
      } catch {
        return false;
      }
    },

    /**
     * Find Vue.js instance data from a DOM element.
     *
     * Useful for platforms that use Vue (not Meta, but keeps the
     * bridge generic for future adapters).
     */
    FindVue: (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return null;

      try {
        // Vue 3
        const vueKey = Object.keys(el).find((k) => k.startsWith('__vue'));
        if (vueKey) {
          const instance = (el as unknown as Record<string, unknown>)[vueKey];
          if (instance && typeof instance === 'object') {
            const inst = instance as Record<string, unknown>;
            // Return the reactive data
            return inst.$data ?? inst.setupState ?? inst;
          }
        }
        // Vue 2
        const vue2 = (el as unknown as Record<string, unknown>).__vue__;
        if (vue2 && typeof vue2 === 'object') {
          return (vue2 as Record<string, unknown>).$data ?? vue2;
        }
      } catch {
        return null;
      }

      return null;
    },

    /**
     * Find jQuery data attached to a DOM element.
     *
     * Extracts jQuery.data() or the element's internal jQuery store.
     */
    FindJQuery: (selector: string) => {
      const win = window as unknown as Record<string, unknown>;
      const $ = win.jQuery as ((sel: string) => Record<string, unknown>) | undefined;
      if (!$ || typeof $ !== 'function') return null;

      try {
        const $el = $(selector);
        if ($el && typeof ($el as Record<string, unknown>).data === 'function') {
          return ($el as { data: () => unknown }).data();
        }
      } catch {
        return null;
      }

      return null;
    },

    /**
     * Find React Context value using the v0 context API
     * (legacy React.childContextTypes).
     */
    FindContext_v0: (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return null;

      const fiberKey = Object.keys(el).find(
        (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
      );
      if (!fiberKey) return null;

      try {
        const fiber = (el as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown>;
        let current: Record<string, unknown> | null = fiber;
        let depth = 0;

        while (current && depth < 30) {
          // Legacy context is stored in stateNode.context
          const stateNode = current.stateNode as Record<string, unknown> | null;
          if (stateNode && typeof stateNode === 'object' && 'context' in stateNode) {
            const ctx = stateNode.context;
            if (ctx && typeof ctx === 'object' && Object.keys(ctx as Record<string, unknown>).length > 0) {
              return ctx;
            }
          }
          current = current.return as Record<string, unknown> | null;
          depth++;
        }
      } catch {
        return null;
      }

      return null;
    },

    /**
     * Extract the full Facebook editor tree via require().
     *
     * This is the PRIMARY extraction method for Meta Ads Manager. It calls
     * into Facebook's internal module system to get the current campaign/
     * ad set/ad editor state as a structured object.
     *
     * Returns the full editor state tree or null if require() is
     * unavailable.
     */
    facebookEditorTree: () => {
      try {
        const fbRequire = getFacebookRequire();
        if (!fbRequire) return null;

        // Try known module IDs for the ads editor state
        const moduleIds = [
          'AdsEditorDataStore',
          'AdsCampaignDataStore',
          'AdsCreativeEditorDataStore',
          'AdsTargetingDataStore',
        ];

        const tree: Record<string, unknown> = {};

        for (const moduleId of moduleIds) {
          try {
            const mod = fbRequire(moduleId);
            if (mod && typeof mod === 'object') {
              const modObj = mod as Record<string, unknown>;
              // Try getState() pattern (Flux stores)
              if (typeof modObj.getState === 'function') {
                tree[moduleId] = (modObj.getState as () => unknown)();
              } else if (typeof modObj.getData === 'function') {
                tree[moduleId] = (modObj.getData as () => unknown)();
              } else if (typeof modObj.getEditorData === 'function') {
                tree[moduleId] = (modObj.getEditorData as () => unknown)();
              } else {
                tree[moduleId] = mod;
              }
            }
          } catch {
            // Module not available in this build, skip
          }
        }

        return Object.keys(tree).length > 0 ? tree : null;
      } catch {
        return null;
      }
    },

    /**
     * Call a CSS selector and return the matching element's
     * serialisable representation (tag, classes, attributes, text).
     *
     * This is a generic "just read the DOM" getter for custom selectors.
     */
    callSelector: (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return null;

      const htmlEl = el as HTMLElement;
      const attrs: Record<string, string> = {};
      for (const attr of htmlEl.attributes) {
        attrs[attr.name] = attr.value;
      }

      return {
        tag: htmlEl.tagName.toLowerCase(),
        classes: Array.from(htmlEl.classList),
        attributes: attrs,
        text: htmlEl.textContent?.trim() ?? null,
        value: (htmlEl as HTMLInputElement).value ?? null,
      };
    },

    /**
     * Get computed style value of an element
     */
    elementStyle: (selector: string, attribute?: string) => {
      if (!attribute) return null;
      const el = document.querySelector(selector);
      if (!el) return null;
      return window.getComputedStyle(el).getPropertyValue(attribute);
    },

    /**
     * Get the selected option text from a dropdown/select
     */
    selectedOptionText: (selector: string) => {
      const el = document.querySelector(selector);
      if (el instanceof HTMLSelectElement) {
        return el.options[el.selectedIndex]?.text ?? null;
      }
      // For custom dropdowns, look for aria-selected
      const selected = el?.querySelector('[aria-selected="true"]');
      return selected?.textContent?.trim() ?? null;
    },
  };

  // ─── React Fiber Traversal Helpers ──────────────────────────────────────────

  /**
   * Get a human-readable type name from a fiber node.
   */
  function getTypeName(fiber: Record<string, unknown>): string | null {
    const type = fiber.type;
    if (typeof type === 'string') return type;
    if (typeof type === 'function') {
      return (type as Record<string, unknown>).displayName as string ??
        (type as Record<string, unknown>).name as string ?? null;
    }
    if (typeof type === 'object' && type !== null) {
      return (type as Record<string, unknown>).displayName as string ??
        (type as Record<string, unknown>).name as string ?? null;
    }
    return null;
  }

  /**
   * Extract serialisable props from a fiber, stripping functions and
   * React internals to avoid circular references.
   */
  function extractSafeProps(props: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!props || typeof props !== 'object') return null;
    const safe: Record<string, unknown> = {};
    for (const key of Object.keys(props)) {
      const value = props[key];
      if (typeof value === 'function') continue;
      if (key.startsWith('__')) continue;
      if (key === 'children') continue;
      try {
        // Test serialisability
        JSON.stringify(value);
        safe[key] = value;
      } catch {
        // Skip non-serialisable values
      }
    }
    return Object.keys(safe).length > 0 ? safe : null;
  }

  /**
   * Extract relevant data from a React Fiber node.
   * Walks up the fiber tree to collect props and state.
   */
  function extractFiberData(
    fiber: Record<string, unknown>,
    maxDepth = 10
  ): Record<string, unknown> | null {
    const data: Record<string, unknown> = {};
    let current: Record<string, unknown> | null = fiber;
    let depth = 0;

    while (current && depth < maxDepth) {
      // Extract memoizedProps
      const props = current.memoizedProps;
      if (props && typeof props === 'object') {
        const propsObj = props as Record<string, unknown>;
        // Copy relevant props (skip React internals and callbacks)
        for (const key of Object.keys(propsObj)) {
          if (
            typeof propsObj[key] !== 'function' &&
            !key.startsWith('__') &&
            key !== 'children'
          ) {
            data[key] = propsObj[key];
          }
        }
      }

      // Extract memoizedState
      const state = current.memoizedState;
      if (state && typeof state === 'object') {
        const stateObj = state as Record<string, unknown>;
        if ('memoizedState' in stateObj) {
          data._state = stateObj.memoizedState;
        }
      }

      // Move up the fiber tree
      current = current.return as Record<string, unknown> | null;
      depth++;
    }

    return Object.keys(data).length > 0 ? data : null;
  }

  /**
   * Extract React context data from a fiber tree.
   */
  function extractContextData(
    fiber: Record<string, unknown>,
    maxDepth = 20
  ): Record<string, unknown> | null {
    const contexts: Record<string, unknown> = {};
    let current: Record<string, unknown> | null = fiber;
    let depth = 0;

    while (current && depth < maxDepth) {
      // Check for context provider
      const type = current.type as Record<string, unknown> | null;
      if (type && typeof type === 'object' && '_context' in type) {
        const context = type._context as Record<string, unknown>;
        const displayName = (context._currentValue as Record<string, unknown>)?.displayName;
        const key = (displayName as string) || `context_${depth}`;
        contexts[key] = context._currentValue;
      }

      current = current.return as Record<string, unknown> | null;
      depth++;
    }

    return Object.keys(contexts).length > 0 ? contexts : null;
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

  // ─── Message Handler (CustomEvent inbound) ──────────────────────────────────

  /**
   * Listen for CustomEvent('evalQuery.governance') dispatched from the
   * ISOLATED world content script.
   *
   * This replaces the previous `window.addEventListener('message', ...)`
   * approach. CustomEvents are same-origin only, reducing noise from
   * third-party postMessage traffic.
   */
  window.addEventListener('evalQuery.governance', ((event: CustomEvent) => {
    const detail = event.detail as {
      queryId: string;
      getters?: Array<{
        field: string;
        method: string;
        selector?: string;
        attribute?: string;
      }>;
      expression?: string;
      params?: Record<string, unknown>;
    } | undefined;

    if (!detail || !detail.queryId) return;

    const { queryId, expression } = detail;
    const results: Record<string, unknown> = {};
    const errors: Record<string, string> = {};

    // ── Expression mode: raw eval() ──────────────────────────────────
    if (expression) {
      try {
        // eslint-disable-next-line no-eval
        results._expression = eval(expression);
      } catch (e) {
        errors._expression = e instanceof Error ? e.message : String(e);
      }
    }

    // ── Getter mode: named getters ───────────────────────────────────
    if (detail.getters) {
      for (const query of detail.getters) {
        try {
          const getter = getters[query.method];
          if (!getter) {
            errors[query.field] = `Unknown getter method: ${query.method}`;
            continue;
          }

          results[query.field] = getter(
            query.selector ?? '',
            query.attribute
          );
        } catch (e) {
          errors[query.field] = e instanceof Error ? e.message : String(e);
        }
      }
    }

    // ── Send results back via postMessage with Transferable ArrayBuffer ─

    // Sanitize results to remove non-serializable values (Symbols, functions, circular refs, etc.)
    function sanitizeForPostMessage(obj: unknown, visited = new WeakSet()): unknown {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') return obj;
      if (typeof obj === 'function' || typeof obj === 'symbol') return undefined;

      // Check for circular reference
      if (typeof obj === 'object') {
        if (visited.has(obj as Record<string, unknown>)) {
          return undefined; // Break circular reference
        }
        visited.add(obj as Record<string, unknown>);
      }

      if (Array.isArray(obj)) {
        return obj.map(v => sanitizeForPostMessage(v, visited)).filter(v => v !== undefined);
      }

      if (typeof obj === 'object') {
        const sanitized: Record<string, unknown> = {};
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            // Skip Symbol keys
            if (typeof key === 'symbol') continue;
            // Skip keys that start with $$ or __ (React internals)
            if (typeof key === 'string' && (key.startsWith('$$') || key.startsWith('__'))) continue;

            const value = (obj as Record<string, unknown>)[key];
            const sanitizedValue = sanitizeForPostMessage(value, visited);
            if (sanitizedValue !== undefined) {
              sanitized[key] = sanitizedValue;
            }
          }
        }
        return sanitized;
      }

      return obj;
    }

    const sanitizedResults = sanitizeForPostMessage(results) as Record<string, unknown>;

    const payload: {
      type: string;
      queryId: string;
      results: Record<string, unknown>;
      errors: Record<string, string>;
      buffer?: ArrayBuffer;
    } = {
      type: 'evalResult.governance',
      queryId,
      results: sanitizedResults,
      errors,
    };

    // For large payloads, encode as ArrayBuffer and transfer
    const resultStr = JSON.stringify(sanitizedResults);
    if (resultStr.length > 4096) {
      const encoder = new TextEncoder();
      const encoded = encoder.encode(resultStr);
      payload.buffer = encoded.buffer as ArrayBuffer;

      // Use transferList for zero-copy transfer
      window.postMessage(payload, '*', [payload.buffer]);
    } else {
      window.postMessage(payload, '*');
    }
  }) as EventListener);

  // ── Legacy postMessage handler (backward compatibility) ──────────────────

  window.addEventListener('message', (event: MessageEvent) => {
    // Only accept messages from this window
    if (event.source !== window) return;

    // Only process governance eval queries
    if (!event.data || event.data.type !== 'evalQuery.governance') return;

    const { queryId, getters: queries, expression } = event.data as {
      queryId: string;
      getters?: Array<{
        field: string;
        method: string;
        selector?: string;
        attribute?: string;
      }>;
      expression?: string;
    };

    const results: Record<string, unknown> = {};
    const errors: Record<string, string> = {};

    // Expression mode
    if (expression) {
      try {
        // eslint-disable-next-line no-eval
        results._expression = eval(expression);
      } catch (e) {
        errors._expression = e instanceof Error ? e.message : String(e);
      }
    }

    // Getter mode
    if (queries) {
      for (const query of queries) {
        try {
          const getter = getters[query.method];
          if (!getter) {
            errors[query.field] = `Unknown getter method: ${query.method}`;
            continue;
          }

          results[query.field] = getter(
            query.selector ?? '',
            query.attribute
          );
        } catch (e) {
          errors[query.field] = e instanceof Error ? e.message : String(e);
        }
      }
    }

    // Sanitize results to remove non-serializable values (Symbols, functions, circular refs, etc.)
    function sanitizeForPostMessage(obj: unknown, visited = new WeakSet()): unknown {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') return obj;
      if (typeof obj === 'function' || typeof obj === 'symbol') return undefined;

      // Check for circular reference
      if (typeof obj === 'object') {
        if (visited.has(obj as Record<string, unknown>)) {
          return undefined; // Break circular reference
        }
        visited.add(obj as Record<string, unknown>);
      }

      if (Array.isArray(obj)) {
        return obj.map(v => sanitizeForPostMessage(v, visited)).filter(v => v !== undefined);
      }

      if (typeof obj === 'object') {
        const sanitized: Record<string, unknown> = {};
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (typeof key === 'symbol') continue;
            if (typeof key === 'string' && (key.startsWith('$$') || key.startsWith('__'))) continue;

            const value = (obj as Record<string, unknown>)[key];
            const sanitizedValue = sanitizeForPostMessage(value, visited);
            if (sanitizedValue !== undefined) {
              sanitized[key] = sanitizedValue;
            }
          }
        }
        return sanitized;
      }

      return obj;
    }

    const sanitizedResults = sanitizeForPostMessage(results) as Record<string, unknown>;

    const payload: {
      type: string;
      queryId: string;
      results: Record<string, unknown>;
      errors: Record<string, string>;
      buffer?: ArrayBuffer;
    } = {
      type: 'evalResult.governance',
      queryId,
      results: sanitizedResults,
      errors,
    };

    const resultStr = JSON.stringify(sanitizedResults);
    if (resultStr.length > 4096) {
      const encoder = new TextEncoder();
      const encoded = encoder.encode(resultStr);
      payload.buffer = encoded.buffer as ArrayBuffer;
      window.postMessage(payload, '*', [payload.buffer]);
    } else {
      window.postMessage(payload, '*');
    }
  });

  // ── Run FacebookClearExtensionDetection on injection ──────────────────────

  getters.FacebookClearExtensionDetection('');
})();

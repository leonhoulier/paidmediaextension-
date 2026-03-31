/**
 * DOM Utility Functions
 *
 * Helper functions for creating elements, Shadow DOM containers,
 * and finding injection points in the ad platform DOM.
 * These utilities are used by all UI components.
 */

import type { InjectionPoint } from '@media-buying-governance/shared';
import { InjectionPosition } from '@media-buying-governance/shared';

/** Prefix for all governance-injected elements */
export const GOV_PREFIX = 'gov';

/** Maximum z-index for overlays (from Grasp reference) */
export const MAX_Z_INDEX = 2147483000;

/**
 * Create an HTML element with optional attributes and children
 *
 * @param tag - The HTML tag name
 * @param attrs - Optional attributes to set
 * @param children - Optional child elements or text content
 * @returns The created element
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: (HTMLElement | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, value);
    }
  }

  if (children) {
    for (const child of children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else {
        el.appendChild(child);
      }
    }
  }

  return el;
}

/**
 * Options for creating a Shadow DOM container.
 */
export interface ShadowContainerOptions {
  /**
   * Optional inline position style override.
   *
   * Defaults to `'position: fixed; z-index: 2147483647; pointer-events: none;'`
   * which makes the host a fixed-position overlay. Shadow DOM content should
   * set `pointer-events: auto` on interactive elements.
   *
   * Pass `'position: static;'` for inline-flow containers (e.g. validation banners).
   */
  positionStyle?: string;
}

/** Default position style for overlay containers (sidebar, score, blocker) */
const DEFAULT_OVERLAY_POSITION = 'position: fixed; z-index: 2147483647; pointer-events: none;';

/**
 * Create a Shadow DOM container for component isolation
 *
 * Components rendered inside Shadow DOM are isolated from the host
 * page's styles, preventing interference in both directions.
 *
 * IMPORTANT: Uses `all: initial` to reset inherited styles, then re-applies
 * positioning inline. Inline styles beat Shadow DOM `:host` rules in the CSS
 * cascade, so position MUST be set here rather than in `:host`.
 *
 * @param hostId - Unique ID for the host element
 * @param styles - Optional CSS string to inject into the shadow root
 * @param options - Optional configuration (e.g. custom position style)
 * @returns Object with the host element and shadow root
 */
export function createShadowContainer(
  hostId: string,
  styles?: string,
  options?: ShadowContainerOptions,
): { host: HTMLElement; shadow: ShadowRoot } {
  const positionStyle = options?.positionStyle ?? DEFAULT_OVERLAY_POSITION;

  const host = createElement('div', {
    id: `${GOV_PREFIX}-${hostId}`,
    'data-governance': 'true',
    style: `all: initial; ${positionStyle}`,
  });

  const shadow = host.attachShadow({ mode: 'open' });

  if (styles) {
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    shadow.appendChild(styleEl);
  }

  return { host, shadow };
}

/**
 * Insert an element at an injection point
 *
 * @param element - The element to insert
 * @param injectionPoint - Where to insert relative to the target
 */
export function insertAtInjectionPoint(
  element: HTMLElement,
  injectionPoint: InjectionPoint
): void {
  const { element: target, position } = injectionPoint;

  switch (position) {
    case InjectionPosition.BEFORE:
      target.parentElement?.insertBefore(element, target);
      break;

    case InjectionPosition.AFTER:
      target.insertAdjacentElement('afterend', element);
      break;

    case InjectionPosition.INSIDE:
      target.appendChild(element);
      break;

    case InjectionPosition.OVERLAY: {
      // Position the element as an overlay on top of the target
      const rect = target.getBoundingClientRect();
      element.style.position = 'absolute';
      element.style.top = `${rect.top + window.scrollY}px`;
      element.style.left = `${rect.left + window.scrollX}px`;
      element.style.width = `${rect.width}px`;
      element.style.height = `${rect.height}px`;
      element.style.zIndex = String(MAX_Z_INDEX);
      document.body.appendChild(element);
      break;
    }
  }
}

/**
 * Remove all governance-injected elements from the DOM
 */
export function removeAllGovernanceElements(): void {
  const elements = document.querySelectorAll('[data-governance="true"]');
  for (const el of elements) {
    el.remove();
  }
}

/**
 * Check if an element is still in the DOM
 *
 * Useful for detecting when React re-renders remove injected elements.
 */
export function isInDOM(element: HTMLElement): boolean {
  return document.body.contains(element);
}

/**
 * Wait for an element matching a selector to appear in the DOM
 *
 * @param selector - CSS selector to match
 * @param timeoutMs - Maximum wait time in milliseconds
 * @returns The matched element or null if timeout
 */
export function waitForElement(
  selector: string,
  timeoutMs = 5000
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    // Check if already exists
    const existing = document.querySelector<HTMLElement>(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Timeout
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

/**
 * Escape HTML entities to prevent XSS
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

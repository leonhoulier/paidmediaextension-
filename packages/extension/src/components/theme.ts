/**
 * Theme System
 *
 * CSS variable injection and platform-specific theming.
 * Components use these CSS variables for consistent styling
 * that adapts to each ad platform's design language.
 */

import { Platform } from '@media-buying-governance/shared';
import { MAX_Z_INDEX } from './dom-utils.js';

/**
 * Theme tokens shared across all platforms
 */
const BASE_THEME = {
  // Governance brand colors
  '--gov-primary': '#4F46E5',
  '--gov-primary-hover': '#4338CA',

  // Status colors
  '--gov-success': '#16A34A',
  '--gov-success-bg': '#DCFCE7',
  '--gov-success-border': '#86EFAC',
  '--gov-warning': '#CA8A04',
  '--gov-warning-bg': '#FEF9C3',
  '--gov-warning-border': '#FDE68A',
  '--gov-error': '#DC2626',
  '--gov-error-bg': '#FEE2E2',
  '--gov-error-border': '#FCA5A5',

  // Neutral colors
  '--gov-text': '#1F2937',
  '--gov-text-secondary': '#6B7280',
  '--gov-bg': '#FFFFFF',
  '--gov-bg-secondary': '#F9FAFB',
  '--gov-border': '#E5E7EB',

  // Layout
  '--gov-z-index': String(MAX_Z_INDEX),
  '--gov-z-index-overlay': String(MAX_Z_INDEX + 1),
  '--gov-z-index-modal': String(MAX_Z_INDEX + 2),

  // Typography
  '--gov-font-size-xs': '11px',
  '--gov-font-size-sm': '12px',
  '--gov-font-size-base': '14px',
  '--gov-font-size-lg': '16px',
  '--gov-font-size-xl': '20px',

  // Spacing
  '--gov-space-xs': '4px',
  '--gov-space-sm': '8px',
  '--gov-space-md': '12px',
  '--gov-space-lg': '16px',
  '--gov-space-xl': '24px',

  // Shadows
  '--gov-shadow-sm': '0 1px 2px rgba(0,0,0,0.05)',
  '--gov-shadow-md': '0 4px 6px -1px rgba(0,0,0,0.1)',
  '--gov-shadow-lg': '0 10px 15px -3px rgba(0,0,0,0.1)',

  // Transitions
  '--gov-transition': '150ms ease-in-out',
};

/**
 * Meta Ads Manager theme overrides
 * Matches Facebook/Meta design language (native validation box style)
 */
const META_THEME: Record<string, string> = {
  // Error styling (red boxes like Meta's native errors)
  '--gov-error-bg': '#FFEBE9',
  '--gov-error': '#CC0000',
  '--gov-error-border-width': '0',
  '--gov-error-border-style': 'none',
  '--gov-error-border-color': 'transparent',

  // Warning/info styling (blue boxes like Meta's native info messages)
  '--gov-warning-bg': '#E7F3FF',
  '--gov-warning': '#1877F2',
  '--gov-warning-border-width': '0',
  '--gov-warning-border-style': 'none',
  '--gov-warning-border-color': 'transparent',

  '--gov-border-radius': '8px',
  '--gov-font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  '--gov-font-size-sm': '13px',
};

/**
 * Google Ads theme overrides
 * Matches Material Design / Google Ads design language
 */
const GOOGLE_ADS_THEME: Record<string, string> = {
  '--gov-error-bg': '#FCE8E6',
  '--gov-error': '#C5221F',
  '--gov-error-border-width': '1px',
  '--gov-error-border-style': 'solid',
  '--gov-error-border-color': '#F28B82',
  '--gov-border-radius': '4px',
  '--gov-font-family': '"Google Sans", Roboto, Arial, sans-serif',
};

/**
 * Get the complete theme CSS variables for a given platform
 *
 * @param platform - The current ad platform
 * @returns Combined theme tokens
 */
export function getThemeVariables(
  platform: Platform = Platform.META
): Record<string, string> {
  const platformOverrides =
    platform === Platform.GOOGLE_ADS ? GOOGLE_ADS_THEME : META_THEME;

  return {
    ...BASE_THEME,
    ...platformOverrides,
  };
}

/**
 * Generate a CSS string from theme variables
 *
 * @param platform - The current ad platform
 * @returns CSS string with :host CSS variables
 */
export function getThemeCSS(platform?: Platform): string {
  const vars = getThemeVariables(platform);
  const declarations = Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');

  return `:host {\n${declarations}\n}`;
}

/**
 * Inject theme CSS variables into a shadow root
 *
 * @param shadow - The shadow root to inject into
 * @param platform - The current ad platform
 */
export function injectTheme(shadow: ShadowRoot, platform?: Platform): void {
  const style = document.createElement('style');
  style.textContent = getThemeCSS(platform);
  shadow.insertBefore(style, shadow.firstChild);
}

/**
 * Common component base styles shared across all governance components
 */
export const BASE_COMPONENT_STYLES = `
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  .gov-container {
    font-family: var(--gov-font-family);
    font-size: var(--gov-font-size-base);
    color: var(--gov-text);
    line-height: 1.5;
  }

  .gov-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: var(--gov-font-size-xs);
    font-weight: 500;
  }

  .gov-badge--success {
    background: var(--gov-success-bg);
    color: var(--gov-success);
  }

  .gov-badge--error {
    background: var(--gov-error-bg);
    color: var(--gov-error);
  }

  .gov-badge--warning {
    background: var(--gov-warning-bg);
    color: var(--gov-warning);
  }

  .gov-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
  }

  .gov-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: var(--gov-border-radius);
    border: 1px solid var(--gov-border);
    background: var(--gov-bg);
    color: var(--gov-text);
    font-size: var(--gov-font-size-sm);
    font-family: var(--gov-font-family);
    cursor: pointer;
    transition: background var(--gov-transition), border-color var(--gov-transition);
  }

  .gov-btn:hover {
    background: var(--gov-bg-secondary);
    border-color: var(--gov-text-secondary);
  }

  .gov-btn--primary {
    background: var(--gov-primary);
    color: white;
    border-color: var(--gov-primary);
  }

  .gov-btn--primary:hover {
    background: var(--gov-primary-hover);
    border-color: var(--gov-primary-hover);
  }

  .gov-btn--danger {
    background: var(--gov-error);
    color: white;
    border-color: var(--gov-error);
  }
`;

/**
 * SVG icon helpers (inline for Shadow DOM compatibility)
 */
export const ICONS = {
  check: `<svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>`,
  x: `<svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>`,
  warning: `<svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm9 3a1 1 0 11-2 0 1 1 0 012 0zm-.25-6.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z"/></svg>`,
  shield: `<svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M7.467.133a1.75 1.75 0 011.066 0l5.25 1.68A1.75 1.75 0 0115 3.48V7c0 1.566-.32 3.182-1.303 4.682-.983 1.498-2.585 2.813-5.032 3.855a1.7 1.7 0 01-1.33 0c-2.447-1.042-4.049-2.357-5.032-3.855C1.32 10.182 1 8.566 1 7V3.48a1.75 1.75 0 011.217-1.667l5.25-1.68zm.61 1.429a.25.25 0 00-.153 0l-5.25 1.68a.25.25 0 00-.174.238V7c0 1.358.275 2.666 1.057 3.86.784 1.194 2.121 2.34 4.366 3.297a.2.2 0 00.154 0c2.245-.956 3.582-2.104 4.366-3.298C13.225 9.666 13.5 8.36 13.5 7V3.48a.25.25 0 00-.174-.238l-5.25-1.68z"/></svg>`,
  chevronDown: `<svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M12.78 5.22a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06 0L3.22 6.28a.75.75 0 011.06-1.06L8 8.94l3.72-3.72a.75.75 0 011.06 0z"/></svg>`,
  chevronRight: `<svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"/></svg>`,
  refresh: `<svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M8 2.5a5.487 5.487 0 00-4.131 1.869l1.204 1.204A.25.25 0 014.896 6H1.25A.25.25 0 011 5.75V2.104a.25.25 0 01.427-.177l1.38 1.38A7.001 7.001 0 0115 8a.75.75 0 01-1.5 0A5.5 5.5 0 008 2.5zM2.5 8a.75.75 0 00-1.5 0 7.001 7.001 0 0012.193 4.693l1.38 1.38a.25.25 0 00.427-.177V10.25a.25.25 0 00-.25-.25h-3.646a.25.25 0 00-.177.427l1.204 1.204A5.487 5.487 0 018 13.5 5.5 5.5 0 012.5 8z"/></svg>`,
  close: `<svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>`,
  clock: `<svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/></svg>`,
  info: `<svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm6.5-.25A.75.75 0 017.25 7h1a.75.75 0 01.75.75v2.75h.25a.75.75 0 010 1.5h-2a.75.75 0 010-1.5h.25v-2h-.25a.75.75 0 01-.75-.75zM8 6a1 1 0 100-2 1 1 0 000 2z"/></svg>`,
};

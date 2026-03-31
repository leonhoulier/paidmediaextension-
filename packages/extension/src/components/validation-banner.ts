/**
 * Validation Banner Component
 *
 * Renders a red (error) or green (success) banner adjacent to form fields.
 * Used to display rule validation messages inline with the platform UI.
 *
 * Features:
 * - Shadow DOM isolation to avoid style conflicts
 * - Positioned adjacent to the target field
 * - Supports error and success states
 * - Tracks all rendered banners for bulk cleanup
 */

import type { InjectionPoint } from '@media-buying-governance/shared';
import { createShadowContainer, insertAtInjectionPoint, type ShadowContainerOptions } from './dom-utils.js';
import { BASE_COMPONENT_STYLES, ICONS, getThemeCSS } from './theme.js';
import { escapeHtml } from './dom-utils.js';

/** CSS class for identifying banner host elements */
const BANNER_SELECTOR = `[data-gov-component="validation-banner"]`;

/** All currently rendered banners */
const activeBanners: HTMLElement[] = [];

/**
 * Props for rendering a validation banner
 */
export interface ValidationBannerProps {
  /** The validation message to display */
  message: string;
  /** Visual status: 'error' (red), 'warning' (blue), or 'success' (green) */
  status: 'error' | 'warning' | 'success';
  /** The field path this banner validates (used for deduplication) */
  fieldPath: string;
  /** Where to inject the banner relative to the target element */
  injectionPoint: InjectionPoint;
}

/**
 * Styles specific to the validation banner
 */
const BANNER_STYLES = `
  ${BASE_COMPONENT_STYLES}

  .banner {
    display: flex;
    align-items: flex-start;
    gap: var(--gov-space-md);
    padding: 14px 16px;
    margin: 8px 0;
    border-radius: var(--gov-border-radius);
    font-family: var(--gov-font-family);
    font-size: var(--gov-font-size-sm);
    line-height: 1.5;
    font-weight: 500;
    animation: gov-slideIn 200ms ease-out;
  }

  .banner--error {
    background: var(--gov-error-bg);
    color: var(--gov-error);
    border: var(--gov-error-border-width, 0) var(--gov-error-border-style, none) var(--gov-error-border-color, transparent);
  }

  .banner--warning {
    background: var(--gov-warning-bg);
    color: var(--gov-warning);
    border: var(--gov-warning-border-width, 0) var(--gov-warning-border-style, none) var(--gov-warning-border-color, transparent);
  }

  .banner--success {
    background: var(--gov-success-bg);
    color: var(--gov-success);
    border: 1px solid var(--gov-success-border);
  }

  .banner__icon {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .banner__content {
    flex: 1;
    min-width: 0;
  }

  .banner__message {
    word-wrap: break-word;
    font-weight: 400;
  }

  .banner__shield {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--gov-font-size-xs);
    opacity: 0.6;
    margin-top: 4px;
    font-weight: 400;
  }

  @keyframes gov-slideIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

/**
 * Render a validation banner at the specified injection point
 *
 * @param props - Banner properties
 * @returns The created host element (for cleanup tracking)
 */
export function renderValidationBanner(props: ValidationBannerProps): HTMLElement {
  const { message, status, fieldPath, injectionPoint } = props;

  // Remove existing banner for this field (avoid duplicates)
  removeBannerForField(fieldPath);

  // Create Shadow DOM container (inline-flow, not fixed-position overlay)
  const bannerOptions: ShadowContainerOptions = {
    positionStyle: 'position: static;',
  };
  const { host, shadow } = createShadowContainer(`banner-${fieldPath}`, undefined, bannerOptions);
  host.setAttribute('data-gov-component', 'validation-banner');
  host.setAttribute('data-gov-field', fieldPath);

  // Inject theme + component styles
  const styleEl = document.createElement('style');
  styleEl.textContent = getThemeCSS() + BANNER_STYLES;
  shadow.appendChild(styleEl);

  // Build banner HTML
  const banner = document.createElement('div');
  banner.className = `banner banner--${status}`;

  const icon =
    status === 'error' ? ICONS.warning :
    status === 'warning' ? ICONS.info :
    ICONS.check;

  banner.innerHTML = `
    <span class="banner__icon">${icon}</span>
    <div class="banner__content">
      <div class="banner__message">${escapeHtml(message)}</div>
      <div class="banner__shield">${ICONS.shield} Governance</div>
    </div>
  `;

  shadow.appendChild(banner);

  // Insert at injection point
  insertAtInjectionPoint(host, injectionPoint);

  // Track for cleanup
  activeBanners.push(host);

  return host;
}

/**
 * Remove the banner for a specific field
 */
function removeBannerForField(fieldPath: string): void {
  const existing = document.querySelector(
    `${BANNER_SELECTOR}[data-gov-field="${fieldPath}"]`
  );
  if (existing) {
    existing.remove();
    const index = activeBanners.indexOf(existing as HTMLElement);
    if (index >= 0) activeBanners.splice(index, 1);
  }
}

/**
 * Remove all validation banners from the page
 */
export function removeValidationBanners(): void {
  for (const banner of activeBanners) {
    banner.remove();
  }
  activeBanners.length = 0;

  // Also clean up any orphaned banners
  const orphans = document.querySelectorAll(BANNER_SELECTOR);
  for (const orphan of orphans) {
    orphan.remove();
  }
}

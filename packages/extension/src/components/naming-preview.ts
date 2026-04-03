/**
 * Naming Preview Component
 *
 * Renders color-coded segment badges showing how a campaign/ad set/ad name
 * maps to a naming template. Each segment is displayed as a badge:
 * - Green with checkmark: segment is valid
 * - Red with X: segment is invalid or missing
 *
 * Features:
 * - Live preview as user types
 * - Color-coded validation per segment
 * - Shows expected format
 * - Shadow DOM isolation
 */

import type { NamingTemplate, InjectionPoint } from '@media-buying-governance/shared';
import { createShadowContainer, insertAtInjectionPoint, type ShadowContainerOptions } from './dom-utils.js';
import { BASE_COMPONENT_STYLES, ICONS, getThemeCSS } from './theme.js';
import { escapeHtml } from './dom-utils.js';
import { parseNamingSegments } from '../rules/evaluator.js';

/** All active naming preview elements */
const activePreviews: HTMLElement[] = [];

/**
 * Props for the naming preview component
 */
export interface NamingPreviewProps {
  /** The current name value to preview */
  name: string;
  /** The naming template to validate against */
  template: NamingTemplate;
  /** Where to inject the preview */
  injectionPoint: InjectionPoint;
}

/**
 * Styles for the naming preview
 */
const PREVIEW_STYLES = `
  ${BASE_COMPONENT_STYLES}

  .naming-preview {
    padding: var(--gov-space-md) var(--gov-space-lg);
    margin: var(--gov-space-sm) 0;
    border-radius: var(--gov-border-radius);
    border: 1px solid var(--gov-border);
    background: var(--gov-bg);
    font-family: var(--gov-font-family);
    animation: gov-slideIn 200ms ease-out;
  }

  .naming-preview__label {
    font-size: var(--gov-font-size-xs);
    color: var(--gov-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: var(--gov-space-sm);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .naming-preview__segments {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .naming-preview__segment {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 14px;
    font-size: var(--gov-font-size-xs);
    font-weight: 500;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .naming-preview__segment--valid {
    background: var(--gov-success-bg);
    color: var(--gov-success);
    border: 1px solid var(--gov-success-border);
  }

  .naming-preview__segment--invalid {
    background: var(--gov-error-bg);
    color: var(--gov-error);
    border: 1px solid var(--gov-error-border);
  }

  .naming-preview__segment--empty {
    background: var(--gov-bg-secondary);
    color: var(--gov-text-secondary);
    border: 1px dashed var(--gov-border);
    font-style: italic;
  }

  .naming-preview__segment-icon {
    flex-shrink: 0;
  }

  .naming-preview__separator {
    color: var(--gov-text-secondary);
    font-size: var(--gov-font-size-sm);
    font-weight: 300;
    padding: 0 2px;
  }

  .naming-preview__example {
    margin-top: var(--gov-space-sm);
    font-size: var(--gov-font-size-xs);
    color: var(--gov-text-secondary);
    font-family: var(--gov-font-family);
  }

  .naming-preview__example code {
    background: var(--gov-bg-secondary);
    padding: 2px 6px;
    border-radius: 3px;
    font-family: monospace;
    font-size: 11px;
  }

  .naming-preview__footer {
    margin-top: var(--gov-space-sm);
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--gov-font-size-xs);
    color: var(--gov-text-secondary);
  }

  @keyframes gov-slideIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

/**
 * Render a naming preview component
 *
 * @param props - Preview properties
 * @returns The host element
 */
export function renderNamingPreview(props: NamingPreviewProps): HTMLElement {
  const { name, template, injectionPoint } = props;

  // Remove existing preview
  removeNamingPreview();

  // Create Shadow DOM container (inline-flow, not fixed-position overlay)
  // pointer-events: none on host so it doesn't block clicks on the name input
  const inlineOptions: ShadowContainerOptions = {
    positionStyle: 'position: static; pointer-events: none;',
  };
  const { host, shadow } = createShadowContainer('naming-preview', undefined, inlineOptions);
  host.setAttribute('data-gov-component', 'naming-preview');

  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.textContent = getThemeCSS() + PREVIEW_STYLES;
  shadow.appendChild(styleEl);

  // Parse the name against the template
  const segments = parseNamingSegments(name, template);

  // Build preview HTML
  const container = document.createElement('div');
  container.className = 'naming-preview';

  const segmentHtml = segments
    .map((seg, index) => {
      const separator =
        index < segments.length - 1
          ? `<span class="naming-preview__separator">${escapeHtml(template.separator || '_')}</span>`
          : '';

      if (!seg.value && !seg.required) {
        return `
          <span class="naming-preview__segment naming-preview__segment--empty">
            ${escapeHtml(seg.label)}
          </span>
          ${separator}
        `;
      }

      const statusClass = seg.valid
        ? 'naming-preview__segment--valid'
        : 'naming-preview__segment--invalid';
      const icon = seg.valid ? ICONS.check : ICONS.x;
      const displayValue = seg.value || seg.label;

      return `
        <span class="naming-preview__segment ${statusClass}" title="${escapeHtml(seg.label)}: ${escapeHtml(seg.value)}">
          <span class="naming-preview__segment-icon">${icon}</span>
          ${escapeHtml(displayValue)}
        </span>
        ${separator}
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="naming-preview__label">
      ${ICONS.shield} Naming Convention Template
    </div>
    <div class="naming-preview__segments">
      ${segmentHtml}
    </div>
    ${
      template.example
        ? `<div class="naming-preview__example">
            Example: <code>${escapeHtml(template.example)}</code>
          </div>`
        : ''
    }
    <div class="naming-preview__footer">
      ${ICONS.shield} Governance
    </div>
  `;

  shadow.appendChild(container);

  // Insert at injection point
  insertAtInjectionPoint(host, injectionPoint);

  // Track for cleanup
  activePreviews.push(host);

  return host;
}

/**
 * Remove all naming preview elements from the DOM
 */
export function removeNamingPreview(): void {
  for (const preview of activePreviews) {
    preview.remove();
  }
  activePreviews.length = 0;

  // Clean up orphans
  const orphans = document.querySelectorAll(
    '[data-gov-component="naming-preview"]'
  );
  for (const orphan of orphans) {
    orphan.remove();
  }
}

/**
 * Creation Blocker Component
 *
 * Intercepts the platform's Publish/Create button click and shows a
 * modal overlay when blocking rules are violated.
 *
 * Modal specification:
 *   - Title: "Cannot Create Campaign"
 *   - Message: "You must fix the following issues before creating:"
 *   - Lists all unmet blocking rules with links to the relevant fields
 *   - "Close" button (does not allow creation)
 *
 * Implementation:
 *   - Capture-phase event listener on the Publish button
 *   - event.preventDefault() + event.stopPropagation() to block the action
 *   - Modal overlay injected with z-index 2147483000
 *   - Shadow DOM isolation
 *
 * @module creation-blocker
 */

import type { RuleEvaluationResult } from '@media-buying-governance/shared';
import { createShadowContainer, MAX_Z_INDEX, type ShadowContainerOptions } from './dom-utils.js';
import { BASE_COMPONENT_STYLES, ICONS, getThemeCSS } from './theme.js';
import { escapeHtml } from './dom-utils.js';

/**
 * Optional callback when the user clicks a violation to scroll to the field.
 */
export type ViolationClickCallback = (ruleId: string) => void;

/**
 * Styles for the creation blocker modal.
 */
const BLOCKER_STYLES = `
  ${BASE_COMPONENT_STYLES}

  .blocker-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(15, 23, 42, 0.65);
    z-index: ${MAX_Z_INDEX};
    display: flex;
    align-items: center;
    justify-content: center;
    animation: gov-fadeIn 200ms ease-out;
  }

  .blocker-modal {
    background: var(--gov-bg);
    border-radius: 12px;
    box-shadow: var(--gov-shadow-lg);
    max-width: 520px;
    width: 90%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: gov-scaleIn 200ms ease-out;
  }

  .blocker-modal__header {
    display: flex;
    align-items: center;
    gap: var(--gov-space-md);
    padding: var(--gov-space-xl);
    border-bottom: 1px solid var(--gov-border);
  }

  .blocker-modal__icon {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--gov-error-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gov-error);
    flex-shrink: 0;
  }

  .blocker-modal__icon svg {
    width: 24px;
    height: 24px;
  }

  .blocker-modal__title {
    font-size: var(--gov-font-size-lg);
    font-weight: 700;
    color: var(--gov-text);
    font-family: var(--gov-font-family);
  }

  .blocker-modal__subtitle {
    font-size: var(--gov-font-size-sm);
    color: var(--gov-text-secondary);
    font-family: var(--gov-font-family);
    margin-top: 2px;
  }

  .blocker-modal__body {
    flex: 1;
    overflow-y: auto;
    padding: var(--gov-space-lg) var(--gov-space-xl);
  }

  .violation-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--gov-space-sm);
  }

  .violation-item {
    display: flex;
    align-items: flex-start;
    gap: var(--gov-space-sm);
    padding: var(--gov-space-md);
    background: var(--gov-error-bg);
    border-radius: var(--gov-border-radius);
    border: 1px solid var(--gov-error-border);
    font-size: var(--gov-font-size-sm);
    font-family: var(--gov-font-family);
    color: var(--gov-error);
    cursor: pointer;
    transition: background 150ms ease, box-shadow 150ms ease;
  }

  .violation-item:hover {
    box-shadow: 0 0 0 2px var(--gov-error-border);
  }

  .violation-item__icon {
    flex-shrink: 0;
    margin-top: 1px;
  }

  .violation-item__text {
    flex: 1;
    min-width: 0;
  }

  .violation-item__name {
    font-weight: 600;
  }

  .violation-item__message {
    margin-top: 2px;
    opacity: 0.85;
  }

  .violation-item__link {
    font-size: var(--gov-font-size-xs);
    text-decoration: underline;
    opacity: 0.7;
    margin-top: 4px;
    display: inline-block;
  }

  .blocker-modal__footer {
    padding: var(--gov-space-lg) var(--gov-space-xl);
    border-top: 1px solid var(--gov-border);
    background: var(--gov-bg-secondary);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .blocker-modal__footer-info {
    font-size: var(--gov-font-size-xs);
    color: var(--gov-text-secondary);
    font-family: var(--gov-font-family);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .blocker-modal__close {
    padding: 8px 20px;
    border-radius: var(--gov-border-radius);
    border: 1px solid var(--gov-border);
    background: var(--gov-bg);
    color: var(--gov-text);
    font-size: var(--gov-font-size-sm);
    font-family: var(--gov-font-family);
    font-weight: 500;
    cursor: pointer;
    transition: background 150ms ease;
  }

  .blocker-modal__close:hover {
    background: var(--gov-bg-secondary);
  }

  @keyframes gov-fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes gov-scaleIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
`;

/**
 * Creation Blocker - prevents campaign creation when blocking rules fail.
 *
 * Usage:
 * ```ts
 * const blocker = new CreationBlocker();
 *
 * // Intercept the publish button
 * blocker.interceptButton(publishButton);
 *
 * // Update violations when rule evaluation changes
 * blocker.setViolations(blockingViolations);
 * ```
 */
export class CreationBlocker {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private isVisible = false;
  private violations: RuleEvaluationResult[] = [];
  private interceptedButtons: WeakSet<HTMLElement> = new WeakSet();
  private cleanupCallbacks: Array<() => void> = [];

  /**
   * Optional callback when a violation row is clicked.
   * Used to scroll to the relevant field.
   */
  onViolationClick: ViolationClickCallback | null = null;

  constructor() {
    const blockerOptions: ShadowContainerOptions = {
      positionStyle: 'position: fixed; z-index: 2147483647; top: 0; left: 0; right: 0; bottom: 0; pointer-events: auto;',
    };
    const container = createShadowContainer('creation-blocker', undefined, blockerOptions);
    this.host = container.host;
    this.shadow = container.shadow;
    this.host.setAttribute('data-gov-component', 'creation-blocker');
    this.host.style.display = 'none';

    // Inject styles
    const styleEl = document.createElement('style');
    styleEl.textContent = getThemeCSS() + BLOCKER_STYLES;
    this.shadow.appendChild(styleEl);

    document.body.appendChild(this.host);
  }

  /**
   * Update the current set of blocking violations.
   *
   * If violations exist, the blocker will intercept any publish attempt.
   * If empty, the blocker will allow creation to proceed.
   */
  setViolations(violations: RuleEvaluationResult[]): void {
    this.violations = violations;
  }

  /**
   * Install a capture-phase click listener on a publish/create button.
   *
   * When clicked:
   *   - If there are blocking violations: preventDefault + stopPropagation,
   *     show the modal overlay.
   *   - If no violations: allow the click through.
   *
   * @param button - The publish/create/next button element
   */
  interceptButton(button: HTMLElement): void {
    if (this.interceptedButtons.has(button)) return;
    this.interceptedButtons.add(button);

    const handler = (event: Event): void => {
      if (this.violations.length > 0) {
        // Block the creation
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        // Show the blocker modal
        this.show(this.violations);

        // Add body class for external styling hooks
        document.body.classList.add('governance-creation-blocked');
      }
    };

    // Capture phase: fires before React/platform event handlers
    button.addEventListener('click', handler, { capture: true });

    this.cleanupCallbacks.push(() => {
      button.removeEventListener('click', handler, { capture: true });
      document.body.classList.remove('governance-creation-blocked');
    });
  }

  /**
   * Update stored violations without showing the modal.
   * The modal will use these when the user clicks Publish.
   */
  updateViolations(violations: RuleEvaluationResult[]): void {
    this.violations = violations;
  }

  /**
   * Show the blocker modal with a list of violations.
   */
  show(violations: RuleEvaluationResult[]): void {
    this.violations = violations;
    this.isVisible = true;
    this.host.style.display = '';
    this.render(violations);
  }

  /**
   * Hide the blocker modal.
   */
  hide(): void {
    this.isVisible = false;
    this.host.style.display = 'none';
  }

  /**
   * Whether the blocker modal is currently visible.
   */
  get visible(): boolean {
    return this.isVisible;
  }

  /**
   * Remove the blocker from the DOM entirely and clean up listeners.
   */
  destroy(): void {
    for (const cleanup of this.cleanupCallbacks) {
      try { cleanup(); } catch { /* ignore */ }
    }
    this.cleanupCallbacks = [];
    this.host.remove();
  }

  /**
   * Render the modal overlay content.
   */
  private render(violations: RuleEvaluationResult[]): void {
    // Remove previous content (keep <style>)
    const existing = this.shadow.querySelector('.blocker-backdrop');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.className = 'blocker-backdrop';

    backdrop.innerHTML = `
      <div class="blocker-modal">
        <div class="blocker-modal__header">
          <div class="blocker-modal__icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
            </svg>
          </div>
          <div>
            <div class="blocker-modal__title">Cannot Create Campaign</div>
            <div class="blocker-modal__subtitle">
              You must fix the following issues before creating:
            </div>
          </div>
        </div>
        <div class="blocker-modal__body">
          <ul class="violation-list">
            ${violations.map((v) => this.renderViolation(v)).join('')}
          </ul>
        </div>
        <div class="blocker-modal__footer">
          <span class="blocker-modal__footer-info">
            ${ICONS.shield} ${violations.length} blocking violation${violations.length !== 1 ? 's' : ''}
          </span>
          <button class="blocker-modal__close">Close</button>
        </div>
      </div>
    `;

    this.shadow.appendChild(backdrop);

    // Close button
    const closeBtn = backdrop.querySelector('.blocker-modal__close');
    closeBtn?.addEventListener('click', () => this.hide());

    // Backdrop click also closes
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.hide();
    });

    // Escape key closes
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hide();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Violation item clicks (scroll to field)
    const violationItems = backdrop.querySelectorAll('.violation-item');
    violationItems.forEach((item) => {
      item.addEventListener('click', () => {
        const ruleId = item.getAttribute('data-rule-id');
        if (ruleId && this.onViolationClick) {
          this.hide();
          this.onViolationClick(ruleId);
        }
      });
    });
  }

  /**
   * Render a single violation list item.
   */
  private renderViolation(violation: RuleEvaluationResult): string {
    return `
      <li class="violation-item" data-rule-id="${escapeHtml(violation.ruleId)}">
        <span class="violation-item__icon">${ICONS.x}</span>
        <div class="violation-item__text">
          <div class="violation-item__name">${escapeHtml(violation.ruleName)}</div>
          <div class="violation-item__message">${escapeHtml(violation.message)}</div>
          <span class="violation-item__link">Click to go to field</span>
        </div>
      </li>
    `;
  }
}

/**
 * Budget Confirmation Field Component
 *
 * Injects a confirmation input below the budget field. The buyer must
 * re-type the budget value to confirm it matches before creation can
 * proceed.
 *
 * Features:
 *   - Label: "Re-type the budget to confirm"
 *   - Real-time validation: shows error if values don't match
 *   - Blocks creation until the confirmation matches
 *   - Shadow DOM isolation
 *   - Observes the budget field for changes and resets confirmation
 *
 * @module budget-confirmation
 */

import { createShadowContainer, type ShadowContainerOptions } from './dom-utils.js';
import { BASE_COMPONENT_STYLES, ICONS, getThemeCSS } from './theme.js';
import { logger } from '../utils/logger.js';

// ─── Styles ───────────────────────────────────────────────────────────────────

const BUDGET_CONFIRM_STYLES = `
  ${BASE_COMPONENT_STYLES}

  .budget-confirm {
    padding: var(--gov-space-md) var(--gov-space-lg);
    margin: var(--gov-space-sm) 0;
    border-radius: var(--gov-border-radius);
    border: 1px solid var(--gov-border);
    background: var(--gov-bg);
    font-family: var(--gov-font-family);
    animation: gov-slideIn 200ms ease-out;
  }

  .budget-confirm__header {
    display: flex;
    align-items: center;
    gap: var(--gov-space-sm);
    margin-bottom: var(--gov-space-sm);
  }

  .budget-confirm__label {
    font-size: var(--gov-font-size-sm);
    font-weight: 600;
    color: var(--gov-text);
  }

  .budget-confirm__required {
    color: var(--gov-error);
    font-weight: 700;
  }

  .budget-confirm__input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .budget-confirm__input {
    width: 100%;
    padding: 8px 36px 8px 12px;
    border: 1px solid var(--gov-border);
    border-radius: var(--gov-border-radius);
    font-family: var(--gov-font-family);
    font-size: var(--gov-font-size-sm);
    color: var(--gov-text);
    outline: none;
    transition: border-color 150ms ease, box-shadow 150ms ease;
    box-sizing: border-box;
  }

  .budget-confirm__input:focus {
    border-color: var(--gov-primary);
    box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
  }

  .budget-confirm__input--match {
    border-color: var(--gov-success);
  }

  .budget-confirm__input--match:focus {
    box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.1);
  }

  .budget-confirm__input--mismatch {
    border-color: var(--gov-error);
  }

  .budget-confirm__input--mismatch:focus {
    box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.1);
  }

  .budget-confirm__status-icon {
    position: absolute;
    right: 10px;
    display: flex;
    align-items: center;
    pointer-events: none;
  }

  .budget-confirm__status-icon--match {
    color: var(--gov-success);
  }

  .budget-confirm__status-icon--mismatch {
    color: var(--gov-error);
  }

  .budget-confirm__message {
    font-size: var(--gov-font-size-xs);
    margin-top: 6px;
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: var(--gov-font-family);
  }

  .budget-confirm__message--match {
    color: var(--gov-success);
  }

  .budget-confirm__message--mismatch {
    color: var(--gov-error);
  }

  .budget-confirm__message--empty {
    color: var(--gov-text-secondary);
  }

  .budget-confirm__shield {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--gov-font-size-xs);
    color: var(--gov-text-secondary);
    margin-top: var(--gov-space-sm);
    opacity: 0.6;
  }

  @keyframes gov-slideIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

// ─── BudgetConfirmation Class ─────────────────────────────────────────────────

/**
 * Budget Confirmation Field - injection component that requires
 * the buyer to re-type the budget amount.
 *
 * Usage:
 * ```ts
 * const confirmation = new BudgetConfirmation();
 * confirmation.inject(budgetFieldParent);
 * confirmation.setBudgetValue(5000);
 *
 * // Check before allowing creation
 * if (confirmation.isConfirmed) {
 *   // allow
 * }
 * ```
 */
export class BudgetConfirmation {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private currentBudget: string = '';
  private confirmValue: string = '';
  private inputEl: HTMLInputElement | null = null;
  private messageEl: HTMLElement | null = null;
  private statusIconEl: HTMLElement | null = null;

  constructor() {
    const inlineOptions: ShadowContainerOptions = {
      positionStyle: 'position: static;',
    };
    const container = createShadowContainer('budget-confirmation', undefined, inlineOptions);
    this.host = container.host;
    this.shadow = container.shadow;
    this.host.setAttribute('data-gov-component', 'budget-confirmation');

    // Inject styles
    const styleEl = document.createElement('style');
    styleEl.textContent = getThemeCSS() + BUDGET_CONFIRM_STYLES;
    this.shadow.appendChild(styleEl);

    this.render();
  }

  /**
   * Whether the confirmation input matches the budget value.
   */
  get isConfirmed(): boolean {
    if (!this.currentBudget) return false;
    return this.normalizeBudget(this.confirmValue) === this.normalizeBudget(this.currentBudget);
  }

  /**
   * Update the budget value that needs to be confirmed.
   * Resets the confirmation input if the budget has changed.
   *
   * @param budget - The budget value (can be a formatted string or number)
   */
  setBudgetValue(budget: string | number): void {
    const newBudget = String(budget);
    if (this.normalizeBudget(newBudget) !== this.normalizeBudget(this.currentBudget)) {
      this.currentBudget = newBudget;
      // Reset confirmation if budget changed
      if (this.inputEl) {
        this.inputEl.value = '';
        this.confirmValue = '';
      }
      this.updateVisualState();
    }
  }

  /**
   * Inject the confirmation field below a target element.
   *
   * @param target - The element to inject after (typically the budget field container)
   */
  inject(target: HTMLElement): void {
    target.insertAdjacentElement('afterend', this.host);
    logger.debug('Budget confirmation field injected');
  }

  /**
   * Remove the component from the DOM.
   */
  destroy(): void {
    this.host.remove();
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  /**
   * Render the confirmation field.
   */
  private render(): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'budget-confirm';

    wrapper.innerHTML = `
      <div class="budget-confirm__header">
        ${ICONS.shield}
        <span class="budget-confirm__label">
          Re-type the budget to confirm <span class="budget-confirm__required">*</span>
        </span>
      </div>
      <div class="budget-confirm__input-wrapper">
        <input
          class="budget-confirm__input"
          type="text"
          inputmode="decimal"
          placeholder="Enter budget value to confirm"
          autocomplete="off"
        />
        <span class="budget-confirm__status-icon"></span>
      </div>
      <div class="budget-confirm__message budget-confirm__message--empty">
        Enter the budget value above to confirm
      </div>
      <div class="budget-confirm__shield">${ICONS.shield} Governance</div>
    `;

    this.shadow.appendChild(wrapper);

    // Cache element references
    this.inputEl = wrapper.querySelector('.budget-confirm__input') as HTMLInputElement;
    this.messageEl = wrapper.querySelector('.budget-confirm__message') as HTMLElement;
    this.statusIconEl = wrapper.querySelector('.budget-confirm__status-icon') as HTMLElement;

    // Input event handler
    this.inputEl?.addEventListener('input', () => {
      this.confirmValue = this.inputEl?.value ?? '';
      this.updateVisualState();
    });
  }

  /**
   * Update the visual state based on current match status.
   */
  private updateVisualState(): void {
    if (!this.inputEl || !this.messageEl || !this.statusIconEl) return;

    // Remove previous state classes
    this.inputEl.classList.remove(
      'budget-confirm__input--match',
      'budget-confirm__input--mismatch',
    );
    this.statusIconEl.classList.remove(
      'budget-confirm__status-icon--match',
      'budget-confirm__status-icon--mismatch',
    );

    const confirmNorm = this.normalizeBudget(this.confirmValue);

    if (!confirmNorm) {
      // Empty state
      this.messageEl.className = 'budget-confirm__message budget-confirm__message--empty';
      this.messageEl.textContent = 'Enter the budget value above to confirm';
      this.statusIconEl.innerHTML = '';
      return;
    }

    const budgetNorm = this.normalizeBudget(this.currentBudget);

    if (confirmNorm === budgetNorm) {
      // Match
      this.inputEl.classList.add('budget-confirm__input--match');
      this.statusIconEl.classList.add('budget-confirm__status-icon--match');
      this.statusIconEl.innerHTML = ICONS.check;
      this.messageEl.className = 'budget-confirm__message budget-confirm__message--match';
      this.messageEl.innerHTML = `${ICONS.check} Budget confirmed`;
    } else {
      // Mismatch
      this.inputEl.classList.add('budget-confirm__input--mismatch');
      this.statusIconEl.classList.add('budget-confirm__status-icon--mismatch');
      this.statusIconEl.innerHTML = ICONS.x;
      this.messageEl.className = 'budget-confirm__message budget-confirm__message--mismatch';
      this.messageEl.innerHTML = `${ICONS.x} Values do not match. Expected: ${this.currentBudget}`;
    }
  }

  /**
   * Normalize a budget string for comparison.
   * Strips currency symbols, commas, and whitespace, keeping only digits and decimal point.
   */
  private normalizeBudget(value: string): string {
    return value.replace(/[^0-9.]/g, '');
  }
}

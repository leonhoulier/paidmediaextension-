/**
 * Comment Modal Component
 *
 * Inline form that appears when a comment-required rule is triggered.
 * The buyer must provide a justification comment before the entity
 * can be created.
 *
 * Modal specification:
 *   - Title: "Comment Required"
 *   - Textarea: "Explain your setup decisions"
 *   - "Submit" button
 *   - POST comment to POST /api/v1/compliance/comment with
 *     { rule_id, entity_name, comment }
 *   - Only allow creation after comment is submitted
 *
 * Shadow DOM isolation to prevent style leakage.
 *
 * @module comment-modal
 */

import type { RuleEvaluationResult } from '@media-buying-governance/shared';
import { createShadowContainer, MAX_Z_INDEX, type ShadowContainerOptions } from './dom-utils.js';
import { BASE_COMPONENT_STYLES, ICONS, getThemeCSS } from './theme.js';
import { escapeHtml } from './dom-utils.js';
import { logger } from '../utils/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Callback when a comment is submitted.
 *
 * @param ruleId - The rule that requires the comment
 * @param entityName - The name of the entity being created
 * @param comment - The buyer's justification text
 * @returns Resolves when the comment has been persisted
 */
export type CommentSubmitCallback = (
  ruleId: string,
  entityName: string,
  comment: string,
) => Promise<void>;

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum comment length */
const MIN_COMMENT_LENGTH = 10;

/** Maximum comment length */
const MAX_COMMENT_LENGTH = 1000;

// ─── Styles ───────────────────────────────────────────────────────────────────

const COMMENT_STYLES = `
  ${BASE_COMPONENT_STYLES}

  .comment-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(15, 23, 42, 0.65);
    z-index: ${MAX_Z_INDEX + 3};
    display: flex;
    align-items: center;
    justify-content: center;
    animation: gov-fadeIn 200ms ease-out;
  }

  .comment-modal {
    background: var(--gov-bg);
    border-radius: 12px;
    box-shadow: var(--gov-shadow-lg);
    max-width: 480px;
    width: 90%;
    overflow: hidden;
    animation: gov-scaleIn 200ms ease-out;
  }

  .comment-modal__header {
    display: flex;
    align-items: center;
    gap: var(--gov-space-md);
    padding: var(--gov-space-xl);
    border-bottom: 1px solid var(--gov-border);
  }

  .comment-modal__icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--gov-warning-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gov-warning);
    flex-shrink: 0;
  }

  .comment-modal__title {
    font-size: var(--gov-font-size-lg);
    font-weight: 700;
    color: var(--gov-text);
    font-family: var(--gov-font-family);
  }

  .comment-modal__subtitle {
    font-size: var(--gov-font-size-sm);
    color: var(--gov-text-secondary);
    font-family: var(--gov-font-family);
    margin-top: 2px;
  }

  .comment-modal__body {
    padding: var(--gov-space-xl);
  }

  .comment-modal__rule-info {
    display: flex;
    align-items: flex-start;
    gap: var(--gov-space-sm);
    padding: var(--gov-space-md);
    background: var(--gov-warning-bg);
    border-radius: var(--gov-border-radius);
    border: 1px solid var(--gov-warning-border);
    font-size: var(--gov-font-size-sm);
    font-family: var(--gov-font-family);
    color: var(--gov-warning);
    margin-bottom: var(--gov-space-lg);
  }

  .comment-modal__label {
    display: block;
    font-size: var(--gov-font-size-sm);
    font-weight: 600;
    color: var(--gov-text);
    margin-bottom: var(--gov-space-sm);
    font-family: var(--gov-font-family);
  }

  .comment-modal__textarea {
    width: 100%;
    min-height: 120px;
    padding: var(--gov-space-md);
    border: 1px solid var(--gov-border);
    border-radius: var(--gov-border-radius);
    font-family: var(--gov-font-family);
    font-size: var(--gov-font-size-sm);
    color: var(--gov-text);
    resize: vertical;
    outline: none;
    transition: border-color 150ms ease;
    box-sizing: border-box;
  }

  .comment-modal__textarea:focus {
    border-color: var(--gov-primary);
    box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
  }

  .comment-modal__textarea::placeholder {
    color: var(--gov-text-secondary);
  }

  .comment-modal__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 6px;
  }

  .comment-modal__char-count {
    font-size: var(--gov-font-size-xs);
    color: var(--gov-text-secondary);
    font-family: var(--gov-font-family);
  }

  .comment-modal__error {
    color: var(--gov-error);
    font-size: var(--gov-font-size-xs);
    font-family: var(--gov-font-family);
    visibility: hidden;
  }

  .comment-modal__error--visible {
    visibility: visible;
  }

  .comment-modal__footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--gov-space-sm);
    padding: var(--gov-space-lg) var(--gov-space-xl);
    border-top: 1px solid var(--gov-border);
    background: var(--gov-bg-secondary);
  }

  .comment-modal__btn {
    padding: 8px 20px;
    border-radius: var(--gov-border-radius);
    font-size: var(--gov-font-size-sm);
    font-family: var(--gov-font-family);
    font-weight: 500;
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease;
  }

  .comment-modal__btn--cancel {
    background: var(--gov-bg);
    color: var(--gov-text);
    border: 1px solid var(--gov-border);
  }

  .comment-modal__btn--cancel:hover {
    background: var(--gov-bg-secondary);
  }

  .comment-modal__btn--submit {
    background: var(--gov-primary);
    color: white;
    border: 1px solid var(--gov-primary);
  }

  .comment-modal__btn--submit:hover {
    background: var(--gov-primary-hover);
  }

  .comment-modal__btn--submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

// ─── CommentModal Class ───────────────────────────────────────────────────────

/**
 * Comment Modal - requires a justification comment before entity creation.
 *
 * Usage:
 * ```ts
 * const modal = new CommentModal();
 * modal.show(ruleResult, 'My Campaign', async (ruleId, entityName, comment) => {
 *   await api.post('/api/v1/compliance/comment', { rule_id: ruleId, entity_name: entityName, comment });
 * });
 * ```
 */
export class CommentModal {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private onSubmit: CommentSubmitCallback | null = null;
  private onCancel: (() => void) | null = null;
  private submitted = false;

  constructor() {
    const modalOptions: ShadowContainerOptions = {
      positionStyle: 'position: fixed; z-index: 2147483647; top: 0; left: 0; right: 0; bottom: 0; pointer-events: auto;',
    };
    const container = createShadowContainer('comment-modal', undefined, modalOptions);
    this.host = container.host;
    this.shadow = container.shadow;
    this.host.setAttribute('data-gov-component', 'comment-modal');
    this.host.style.display = 'none';

    // Inject styles
    const styleEl = document.createElement('style');
    styleEl.textContent = getThemeCSS() + COMMENT_STYLES;
    this.shadow.appendChild(styleEl);

    document.body.appendChild(this.host);
  }

  /**
   * Whether a comment has been successfully submitted in this session.
   * Used by the caller to decide whether to allow creation.
   */
  get wasSubmitted(): boolean {
    return this.submitted;
  }

  /**
   * Reset the submitted state (e.g., when the entity changes).
   */
  resetSubmitted(): void {
    this.submitted = false;
  }

  /**
   * Show the comment modal for a specific rule violation.
   *
   * @param rule       - The rule evaluation result requiring a comment
   * @param entityName - The name of the entity being created
   * @param onSubmit   - Called with (ruleId, entityName, comment) when submitted
   * @param onCancel   - Called when the user cancels
   */
  show(
    rule: RuleEvaluationResult,
    entityName: string,
    onSubmit: CommentSubmitCallback,
    onCancel?: () => void,
  ): void {
    this.onSubmit = onSubmit;
    this.onCancel = onCancel ?? null;
    this.host.style.display = '';
    this.render(rule, entityName);
  }

  /**
   * Hide the modal.
   */
  hide(): void {
    this.host.style.display = 'none';
  }

  /**
   * Remove the modal from the DOM.
   */
  destroy(): void {
    this.host.remove();
  }

  /**
   * Render the modal content.
   */
  private render(rule: RuleEvaluationResult, entityName: string): void {
    const existing = this.shadow.querySelector('.comment-backdrop');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.className = 'comment-backdrop';

    backdrop.innerHTML = `
      <div class="comment-modal">
        <div class="comment-modal__header">
          <div class="comment-modal__icon">
            ${ICONS.warning}
          </div>
          <div>
            <div class="comment-modal__title">Comment Required</div>
            <div class="comment-modal__subtitle">
              Explain your setup decisions before proceeding.
            </div>
          </div>
        </div>
        <div class="comment-modal__body">
          <div class="comment-modal__rule-info">
            ${ICONS.warning}
            <div>
              <strong>${escapeHtml(rule.ruleName)}</strong><br/>
              ${escapeHtml(rule.message)}
            </div>
          </div>
          <label class="comment-modal__label" for="gov-comment-textarea">
            Explain your setup decisions
          </label>
          <textarea
            id="gov-comment-textarea"
            class="comment-modal__textarea"
            placeholder="Explain why you are proceeding without meeting this guideline..."
            maxlength="${MAX_COMMENT_LENGTH}"
          ></textarea>
          <div class="comment-modal__meta">
            <span class="comment-modal__error">
              Comment must be at least ${MIN_COMMENT_LENGTH} characters.
            </span>
            <span class="comment-modal__char-count">0 / ${MAX_COMMENT_LENGTH}</span>
          </div>
        </div>
        <div class="comment-modal__footer">
          <button class="comment-modal__btn comment-modal__btn--cancel">Cancel</button>
          <button class="comment-modal__btn comment-modal__btn--submit" disabled>
            Submit
          </button>
        </div>
      </div>
    `;

    this.shadow.appendChild(backdrop);

    // ── Wire up event handlers ──────────────────────────────────────────

    const textarea = backdrop.querySelector('.comment-modal__textarea') as HTMLTextAreaElement;
    const charCount = backdrop.querySelector('.comment-modal__char-count') as HTMLElement;
    const errorEl = backdrop.querySelector('.comment-modal__error') as HTMLElement;
    const submitBtn = backdrop.querySelector('.comment-modal__btn--submit') as HTMLButtonElement;
    const cancelBtn = backdrop.querySelector('.comment-modal__btn--cancel') as HTMLButtonElement;

    // Character count and validation
    textarea?.addEventListener('input', () => {
      const len = textarea.value.length;
      charCount.textContent = `${len} / ${MAX_COMMENT_LENGTH}`;
      submitBtn.disabled = len < MIN_COMMENT_LENGTH;

      if (len > 0 && len < MIN_COMMENT_LENGTH) {
        errorEl.classList.add('comment-modal__error--visible');
      } else {
        errorEl.classList.remove('comment-modal__error--visible');
      }
    });

    // Submit handler
    submitBtn?.addEventListener('click', async () => {
      const comment = textarea.value.trim();
      if (comment.length < MIN_COMMENT_LENGTH) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      try {
        if (this.onSubmit) {
          await this.onSubmit(rule.ruleId, entityName, comment);
        }
        this.submitted = true;
        this.hide();
      } catch (err) {
        logger.error('Failed to submit comment:', err);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
        errorEl.textContent = 'Failed to submit. Please try again.';
        errorEl.classList.add('comment-modal__error--visible');
      }
    });

    // Cancel handler
    cancelBtn?.addEventListener('click', () => {
      this.hide();
      this.onCancel?.();
    });

    // Backdrop click closes (does not count as submission)
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        this.hide();
        this.onCancel?.();
      }
    });

    // Escape key closes
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hide();
        this.onCancel?.();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Auto-focus textarea
    textarea?.focus();
  }
}

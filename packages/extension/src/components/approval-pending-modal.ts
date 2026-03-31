/**
 * Approval Pending Modal Component
 *
 * Shows when a user tries to publish with SECOND_APPROVER violations.
 * Polls the backend for approval status and handles approved/rejected outcomes.
 *
 * Modal specification:
 *   - Title: "Approval Required"
 *   - Shows approver name and email
 *   - Displays spinner while waiting
 *   - Polls every 5 seconds
 *   - Allows user to cancel the request
 *
 * Implementation:
 *   - Shadow DOM isolation
 *   - Polling with setInterval
 *   - Auto-cleanup on destroy
 *
 * @module approval-pending-modal
 */

import { createShadowContainer, MAX_Z_INDEX, type ShadowContainerOptions } from './dom-utils.js';
import { BASE_COMPONENT_STYLES, ICONS, getThemeCSS } from './theme.js';
import { escapeHtml } from './dom-utils.js';
import { logger } from '../utils/logger.js';
import { getApprovalRequestStatus, cancelApprovalRequest } from '../api/client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Props for the ApprovalPendingModal component
 */
export interface ApprovalPendingModalProps {
  approverName: string;
  approverEmail?: string;
  requestId: string;
  onApproved: () => void;
  onRejected: (reason: string) => void;
  onCancel: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Polling interval for checking approval status (ms) */
const POLLING_INTERVAL_MS = 5000;

// ─── Styles ───────────────────────────────────────────────────────────────────

const APPROVAL_STYLES = `
  ${BASE_COMPONENT_STYLES}

  .approval-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(15, 23, 42, 0.65);
    z-index: ${MAX_Z_INDEX + 5};
    display: flex;
    align-items: center;
    justify-content: center;
    animation: gov-fadeIn 200ms ease-out;
  }

  .approval-modal {
    background: var(--gov-bg);
    border-radius: 12px;
    box-shadow: var(--gov-shadow-lg);
    max-width: 420px;
    width: 90%;
    overflow: hidden;
    animation: gov-scaleIn 200ms ease-out;
  }

  .approval-modal__header {
    display: flex;
    align-items: center;
    gap: var(--gov-space-md);
    padding: var(--gov-space-xl);
    border-bottom: 1px solid var(--gov-border);
  }

  .approval-modal__icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--gov-primary-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gov-primary);
    flex-shrink: 0;
  }

  .approval-modal__title {
    font-size: var(--gov-font-size-lg);
    font-weight: 700;
    color: var(--gov-text);
    font-family: var(--gov-font-family);
  }

  .approval-modal__subtitle {
    font-size: var(--gov-font-size-sm);
    color: var(--gov-text-secondary);
    font-family: var(--gov-font-family);
    margin-top: 2px;
  }

  .approval-modal__body {
    padding: var(--gov-space-xl);
  }

  .approval-modal__message {
    font-size: var(--gov-font-size-sm);
    color: var(--gov-text-secondary);
    font-family: var(--gov-font-family);
    margin-bottom: var(--gov-space-lg);
    line-height: 1.5;
  }

  .approval-modal__approver {
    background: var(--gov-bg-secondary);
    padding: var(--gov-space-md);
    border-radius: var(--gov-border-radius);
    margin-bottom: var(--gov-space-lg);
  }

  .approval-modal__approver-name {
    font-weight: 600;
    font-size: var(--gov-font-size-sm);
    color: var(--gov-text);
    font-family: var(--gov-font-family);
  }

  .approval-modal__approver-email {
    font-size: var(--gov-font-size-xs);
    color: var(--gov-text-secondary);
    font-family: var(--gov-font-family);
    margin-top: 2px;
  }

  .approval-modal__status {
    display: flex;
    align-items: center;
    gap: var(--gov-space-sm);
    margin-bottom: var(--gov-space-lg);
    font-size: var(--gov-font-size-sm);
    color: var(--gov-text-secondary);
    font-family: var(--gov-font-family);
  }

  .approval-modal__spinner {
    border: 2px solid var(--gov-border);
    border-top: 2px solid var(--gov-primary);
    border-radius: 50%;
    width: 16px;
    height: 16px;
    animation: gov-spin 1s linear infinite;
  }

  .approval-modal__footer {
    display: flex;
    gap: var(--gov-space-sm);
    justify-content: flex-end;
  }

  .approval-modal__btn {
    padding: 8px 20px;
    border-radius: var(--gov-border-radius);
    font-size: var(--gov-font-size-sm);
    font-family: var(--gov-font-family);
    font-weight: 500;
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease;
    border: none;
  }

  .approval-modal__btn--cancel {
    background: var(--gov-bg-secondary);
    color: var(--gov-text);
  }

  .approval-modal__btn--cancel:hover {
    background: var(--gov-border);
  }

  @keyframes gov-fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes gov-scaleIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }

  @keyframes gov-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

// ─── ApprovalPendingModal Class ───────────────────────────────────────────────

/**
 * Approval Pending Modal - shows while waiting for second approver.
 *
 * Usage:
 * ```ts
 * const modal = new ApprovalPendingModal({
 *   approverName: 'John Doe',
 *   approverEmail: 'john@example.com',
 *   requestId: 'req-123',
 *   onApproved: () => { console.log('Approved!'); },
 *   onRejected: (reason) => { console.log('Rejected:', reason); },
 *   onCancel: () => { console.log('Cancelled'); },
 * });
 * ```
 */
export class ApprovalPendingModal {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private pollingInterval: number | null = null;
  private props: ApprovalPendingModalProps;
  private isDestroyed = false;

  constructor(props: ApprovalPendingModalProps) {
    this.props = props;

    const modalOptions: ShadowContainerOptions = {
      positionStyle: 'position: fixed; z-index: 2147483647; top: 0; left: 0; right: 0; bottom: 0; pointer-events: auto;',
    };
    const container = createShadowContainer('approval-pending-modal', undefined, modalOptions);
    this.host = container.host;
    this.shadow = container.shadow;
    this.host.setAttribute('data-gov-component', 'approval-pending-modal');

    // Inject styles
    const styleEl = document.createElement('style');
    styleEl.textContent = getThemeCSS() + APPROVAL_STYLES;
    this.shadow.appendChild(styleEl);

    document.body.appendChild(this.host);

    this.render();
    this.startPolling();

    logger.info('Approval pending modal created', { requestId: props.requestId });
  }

  /**
   * Render the modal HTML
   */
  private render(): void {
    const content = document.createElement('div');
    content.className = 'approval-backdrop';

    content.innerHTML = `
      <div class="approval-modal">
        <div class="approval-modal__header">
          <div class="approval-modal__icon">
            ${ICONS.clock}
          </div>
          <div>
            <div class="approval-modal__title">Approval Required</div>
            <div class="approval-modal__subtitle">Waiting for approval</div>
          </div>
        </div>
        <div class="approval-modal__body">
          <div class="approval-modal__message">
            This campaign violates a rule that requires approval before publishing.
            Your request has been sent to:
          </div>
          <div class="approval-modal__approver">
            <div class="approval-modal__approver-name">${escapeHtml(this.props.approverName)}</div>
            ${this.props.approverEmail ? `<div class="approval-modal__approver-email">${escapeHtml(this.props.approverEmail)}</div>` : ''}
          </div>
          <div class="approval-modal__status">
            <div class="approval-modal__spinner"></div>
            <span>Waiting for approval...</span>
          </div>
          <div class="approval-modal__footer">
            <button class="approval-modal__btn approval-modal__btn--cancel" id="cancel-btn">
              Cancel Request
            </button>
          </div>
        </div>
      </div>
    `;

    this.shadow.appendChild(content);

    // Attach event listeners
    const cancelBtn = this.shadow.getElementById('cancel-btn');
    cancelBtn?.addEventListener('click', () => this.handleCancel());
  }

  /**
   * Start polling for approval status
   */
  private startPolling(): void {
    // Poll immediately once
    this.poll();

    // Then poll every 5 seconds
    this.pollingInterval = window.setInterval(() => {
      this.poll();
    }, POLLING_INTERVAL_MS);

    logger.debug('Started polling for approval status');
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      logger.debug('Stopped polling for approval status');
    }
  }

  /**
   * Poll the API for current approval status
   */
  private async poll(): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    try {
      const status = await getApprovalRequestStatus(this.props.requestId);

      if (status.status === 'approved') {
        logger.info('Approval request approved', { requestId: this.props.requestId });
        this.stopPolling();
        this.props.onApproved();
        this.destroy();
      } else if (status.status === 'rejected') {
        logger.info('Approval request rejected', {
          requestId: this.props.requestId,
          comment: status.comment,
        });
        this.stopPolling();
        this.props.onRejected(status.comment || 'Request rejected');
        this.destroy();
      }
      // If still pending, continue polling
    } catch (error) {
      logger.error('Failed to poll approval status:', error);
      // Continue polling even on error (might be transient network issue)
    }
  }

  /**
   * Handle cancel button click
   */
  private async handleCancel(): Promise<void> {
    this.stopPolling();

    try {
      await cancelApprovalRequest(this.props.requestId);
      logger.info('Approval request cancelled', { requestId: this.props.requestId });
      this.props.onCancel();
      this.destroy();
    } catch (error) {
      logger.error('Failed to cancel approval request:', error);
      // Still destroy the modal even if cancel fails
      this.destroy();
    }
  }

  /**
   * Destroy the modal and clean up resources
   */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    this.stopPolling();

    if (this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }

    logger.debug('Approval pending modal destroyed');
  }
}

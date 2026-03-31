/**
 * Guidelines Sidebar Component (Full-Featured)
 *
 * A floating panel showing all active guidelines grouped by category
 * with real-time pass/fail updates and click-to-scroll behaviour.
 *
 * This is the canonical sidebar implementation (replaces the earlier
 * guidelines-sidebar.ts stub). It is located at the path specified
 * in the task requirements: `src/components/sidebar.ts`.
 *
 * Features:
 * - Shadow DOM isolation to prevent style leakage
 * - Collapsible categories (e.g. "META - AD SET", "META - CAMPAIGN")
 * - Pass/fail badges that update in real time as fields change
 * - Click a guideline to scroll to the relevant field in the platform UI
 * - Overall score summary at the top (e.g. "15 Guidelines - 8 Passing, 7 Failing")
 * - Drag to reposition
 * - Keyboard accessible (Enter/Space to toggle categories)
 * - Responsive max-height with scrollable body
 *
 * Styling matches the platform design language via the theme system
 * (Section 12.3 of SPEC.md).
 *
 * @module sidebar
 */

import type { RuleEvaluationResult } from '@media-buying-governance/shared';
import { EnforcementMode } from '@media-buying-governance/shared';
import { createShadowContainer, MAX_Z_INDEX, type ShadowContainerOptions } from './dom-utils.js';
import { BASE_COMPONENT_STYLES, ICONS, getThemeCSS } from './theme.js';
import { escapeHtml } from './dom-utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A grouped category of guidelines with computed pass/fail counts.
 */
interface GuidelineCategory {
  /** Category display name (e.g. "META - AD SET") */
  name: string;
  /** Individual guideline results in this category */
  guidelines: RuleEvaluationResult[];
  /** Number of passing guidelines */
  passedCount: number;
  /** Total number of guidelines */
  totalCount: number;
  /** Whether this category is expanded (visible) */
  expanded: boolean;
}

/**
 * Optional callback invoked when the user clicks a guideline row.
 * The adapter can use this to scroll to the relevant field.
 */
export type ScrollToFieldCallback = (ruleId: string, fieldPath?: string) => void;

// ─── Styles ───────────────────────────────────────────────────────────────────

const SIDEBAR_STYLES = `
  ${BASE_COMPONENT_STYLES}

  :host {
    display: block;
    position: fixed;
    right: 20px;
    top: 80px;
    z-index: ${MAX_Z_INDEX};
    pointer-events: auto;
  }

  .sidebar {
    width: 340px;
    max-height: calc(100vh - 120px);
    background: var(--gov-bg);
    border-radius: 12px;
    box-shadow: var(--gov-shadow-lg);
    border: 1px solid var(--gov-border);
    display: flex;
    flex-direction: column;
    font-family: var(--gov-font-family);
    overflow: hidden;
    animation: gov-sidebarSlideIn 250ms ease-out;
    pointer-events: auto;
  }

  /* ── Summary / Score Header ──────────────────────────────────────────── */

  .sidebar__summary {
    padding: var(--gov-space-lg);
    background: linear-gradient(135deg, #4F46E5 0%, #6366F1 100%);
    color: white;
    display: flex;
    flex-direction: column;
    gap: var(--gov-space-sm);
  }

  .sidebar__summary-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .sidebar__summary-title {
    font-size: var(--gov-font-size-lg);
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: var(--gov-space-sm);
  }

  .sidebar__summary-close {
    background: rgba(255, 255, 255, 0.15);
    border: none;
    color: white;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 150ms ease;
  }

  .sidebar__summary-close:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .sidebar__summary-score {
    font-size: var(--gov-font-size-sm);
    opacity: 0.9;
    display: flex;
    align-items: center;
    gap: var(--gov-space-sm);
  }

  .sidebar__progress-bar {
    flex: 1;
    height: 6px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
    overflow: hidden;
  }

  .sidebar__progress-fill {
    height: 100%;
    border-radius: 3px;
    background: white;
    transition: width 300ms ease-out;
  }

  .sidebar__summary-detail {
    font-size: var(--gov-font-size-xs);
    opacity: 0.75;
  }

  /* ── Category Sections ───────────────────────────────────────────────── */

  .sidebar__body {
    flex: 1;
    overflow-y: auto;
    padding: var(--gov-space-xs) 0;
  }

  .sidebar__body::-webkit-scrollbar {
    width: 6px;
  }

  .sidebar__body::-webkit-scrollbar-track {
    background: transparent;
  }

  .sidebar__body::-webkit-scrollbar-thumb {
    background: var(--gov-border);
    border-radius: 3px;
  }

  .category {
    border-bottom: 1px solid var(--gov-border);
  }

  .category:last-child {
    border-bottom: none;
  }

  .category__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--gov-space-md) var(--gov-space-lg);
    cursor: pointer;
    user-select: none;
    transition: background 150ms ease;
  }

  .category__header:hover {
    background: var(--gov-bg-secondary);
  }

  .category__header:focus-visible {
    outline: 2px solid var(--gov-primary);
    outline-offset: -2px;
  }

  .category__left {
    display: flex;
    align-items: center;
    gap: var(--gov-space-sm);
    min-width: 0;
  }

  .category__chevron {
    color: var(--gov-text-secondary);
    transition: transform 200ms ease;
    flex-shrink: 0;
    display: flex;
  }

  .category__chevron--expanded {
    transform: rotate(90deg);
  }

  .category__name {
    font-size: var(--gov-font-size-sm);
    font-weight: 600;
    color: var(--gov-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .category__badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    white-space: nowrap;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .category__badge--all-pass {
    background: var(--gov-success-bg);
    color: var(--gov-success);
  }

  .category__badge--all-fail {
    background: var(--gov-error-bg);
    color: var(--gov-error);
  }

  .category__badge--mixed {
    background: var(--gov-warning-bg);
    color: var(--gov-warning);
  }

  /* ── Guideline Items ─────────────────────────────────────────────────── */

  .guideline-list {
    list-style: none;
    padding: 0;
    margin: 0;
    overflow: hidden;
    transition: max-height 250ms ease;
  }

  .guideline-list--collapsed {
    max-height: 0 !important;
  }

  .guideline {
    display: flex;
    align-items: flex-start;
    gap: var(--gov-space-sm);
    padding: 8px var(--gov-space-lg) 8px calc(var(--gov-space-lg) + 22px);
    cursor: pointer;
    transition: background 150ms ease;
    font-size: var(--gov-font-size-sm);
    color: var(--gov-text);
    border-left: 3px solid transparent;
  }

  .guideline:hover {
    background: var(--gov-bg-secondary);
  }

  .guideline--pass {
    border-left-color: var(--gov-success);
  }

  .guideline--fail {
    border-left-color: var(--gov-error);
  }

  .guideline--blocking {
    border-left-color: var(--gov-error);
    border-left-width: 4px;
  }

  .guideline__icon {
    flex-shrink: 0;
    margin-top: 2px;
    display: flex;
  }

  .guideline__icon--pass {
    color: var(--gov-success);
  }

  .guideline__icon--fail {
    color: var(--gov-error);
  }

  .guideline__content {
    flex: 1;
    min-width: 0;
  }

  .guideline__name {
    word-wrap: break-word;
    line-height: 1.4;
  }

  .guideline__enforcement {
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 2px;
    opacity: 0.65;
  }

  .guideline__link-icon {
    flex-shrink: 0;
    color: var(--gov-text-secondary);
    opacity: 0;
    transition: opacity 150ms ease;
    margin-top: 2px;
    display: flex;
  }

  .guideline:hover .guideline__link-icon {
    opacity: 1;
  }

  /* ── Footer ──────────────────────────────────────────────────────────── */

  .sidebar__footer {
    padding: var(--gov-space-sm) var(--gov-space-lg);
    border-top: 1px solid var(--gov-border);
    background: var(--gov-bg-secondary);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--gov-font-size-xs);
    color: var(--gov-text-secondary);
  }

  .sidebar__footer-logo {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .sidebar__footer-refresh {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--gov-text-secondary);
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    transition: color 150ms ease, background 150ms ease;
  }

  .sidebar__footer-refresh:hover {
    color: var(--gov-primary);
    background: rgba(79, 70, 229, 0.08);
  }

  /* ── Animations ──────────────────────────────────────────────────────── */

  @keyframes gov-sidebarSlideIn {
    from { opacity: 0; transform: translateX(20px); }
    to   { opacity: 1; transform: translateX(0); }
  }
`;

// ─── Link Icon SVG ────────────────────────────────────────────────────────────

const LINK_ICON = `<svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M3.75 2A1.75 1.75 0 002 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 12.25v-3.5a.75.75 0 00-1.5 0v3.5a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25v-8.5a.25.25 0 01.25-.25h3.5a.75.75 0 000-1.5h-3.5zm6.5 0a.75.75 0 000 1.5h1.94L8.22 7.47a.75.75 0 001.06 1.06L13.25 4.56V6.5a.75.75 0 001.5 0v-3.75A.75.75 0 0014 2h-3.75z"/></svg>`;

// ─── Sidebar Class ────────────────────────────────────────────────────────────

/**
 * Full-featured Guidelines Sidebar component.
 *
 * Usage:
 * ```ts
 * const sidebar = new Sidebar();
 * sidebar.update(evaluationResults);
 * sidebar.onScrollToField = (ruleId) => { adapter.scrollToField(ruleId); };
 * ```
 */
export class Sidebar {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private categories: GuidelineCategory[] = [];
  private visible = true;

  /**
   * Optional callback invoked when the user clicks a guideline to scroll
   * to its associated field. The adapter should implement the actual
   * scrolling logic.
   */
  onScrollToField: ScrollToFieldCallback | null = null;

  /**
   * Optional callback invoked when the user clicks the refresh button.
   */
  onRefresh: (() => void) | null = null;

  constructor() {
    const sidebarOptions: ShadowContainerOptions = {
      positionStyle: `position: fixed; z-index: ${MAX_Z_INDEX}; right: 20px; top: 80px; pointer-events: none;`,
    };
    const container = createShadowContainer('sidebar', undefined, sidebarOptions);
    this.host = container.host;
    this.shadow = container.shadow;
    this.host.setAttribute('data-gov-component', 'sidebar');

    // Inject styles
    const styleEl = document.createElement('style');
    styleEl.textContent = getThemeCSS() + SIDEBAR_STYLES;
    this.shadow.appendChild(styleEl);

    document.body.appendChild(this.host);
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Update the sidebar with fresh evaluation results.
   *
   * This re-groups by category, preserves collapsed/expanded state,
   * and re-renders the entire panel.
   *
   * @param results - Latest rule evaluation results
   */
  update(results: RuleEvaluationResult[]): void {
    this.categories = this.groupByCategory(results);
    this.render();
  }

  /**
   * Show the sidebar.
   */
  show(): void {
    this.visible = true;
    this.host.style.display = '';
  }

  /**
   * Hide the sidebar.
   */
  hide(): void {
    this.visible = false;
    this.host.style.display = 'none';
  }

  /**
   * Toggle visibility.
   */
  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Remove the sidebar from the DOM entirely.
   */
  destroy(): void {
    this.host.remove();
  }

  // ── Grouping ──────────────────────────────────────────────────────────

  /**
   * Group evaluation results by their `category` field.
   * Preserves expanded/collapsed state from the previous render.
   */
  private groupByCategory(results: RuleEvaluationResult[]): GuidelineCategory[] {
    const map = new Map<string, RuleEvaluationResult[]>();

    for (const r of results) {
      const cat = r.category || 'Uncategorized';
      const arr = map.get(cat) ?? [];
      arr.push(r);
      map.set(cat, arr);
    }

    // Sort categories alphabetically for consistency
    const sortedKeys = Array.from(map.keys()).sort();

    return sortedKeys.map((name) => {
      const guidelines = map.get(name)!;
      const passedCount = guidelines.filter((g) => g.passed).length;
      const prevCategory = this.categories.find((c) => c.name === name);

      return {
        name,
        guidelines,
        passedCount,
        totalCount: guidelines.length,
        expanded: prevCategory?.expanded ?? true,
      };
    });
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  /**
   * Render (or re-render) the full sidebar content.
   */
  private render(): void {
    // Remove previous content (keep <style>)
    const existing = this.shadow.querySelector('.sidebar');
    if (existing) existing.remove();

    const totalPassed = this.categories.reduce((s, c) => s + c.passedCount, 0);
    const totalCount = this.categories.reduce((s, c) => s + c.totalCount, 0);
    const totalFailing = totalCount - totalPassed;
    const pct = totalCount > 0 ? Math.round((totalPassed / totalCount) * 100) : 100;

    const sidebar = document.createElement('div');
    sidebar.className = 'sidebar';

    sidebar.innerHTML = `
      <div class="sidebar__summary">
        <div class="sidebar__summary-top">
          <div class="sidebar__summary-title">
            ${ICONS.shield}
            Guidelines
          </div>
          <button class="sidebar__summary-close" aria-label="Close sidebar" title="Close sidebar">
            ${ICONS.close}
          </button>
        </div>
        <div class="sidebar__summary-score">
          <span>${totalCount} Guidelines - ${totalPassed} Passing, ${totalFailing} Failing</span>
        </div>
        <div class="sidebar__progress-bar">
          <div class="sidebar__progress-fill" style="width: ${pct}%"></div>
        </div>
        <div class="sidebar__summary-detail">
          ${pct}% compliant
        </div>
      </div>
      <div class="sidebar__body">
        ${this.categories.map((cat) => this.renderCategory(cat)).join('')}
      </div>
      <div class="sidebar__footer">
        <span class="sidebar__footer-logo">${ICONS.shield} Governance</span>
        <button class="sidebar__footer-refresh" aria-label="Refresh guidelines" title="Refresh">
          ${ICONS.refresh}
        </button>
      </div>
    `;

    this.shadow.appendChild(sidebar);
    this.attachEventListeners(sidebar);
  }

  /**
   * Render a collapsible category section.
   */
  private renderCategory(category: GuidelineCategory): string {
    const { passedCount, totalCount, expanded } = category;
    const allPassed = passedCount === totalCount;
    const nonePassed = passedCount === 0;

    const badgeClass = allPassed
      ? 'category__badge--all-pass'
      : nonePassed
        ? 'category__badge--all-fail'
        : 'category__badge--mixed';

    const chevronClass = expanded
      ? 'category__chevron category__chevron--expanded'
      : 'category__chevron';

    const listClass = expanded
      ? 'guideline-list'
      : 'guideline-list guideline-list--collapsed';

    // Compute pixel height for smooth transition (approx 40px per guideline)
    const listMaxHeight = expanded ? category.guidelines.length * 60 : 0;

    return `
      <div class="category" data-category="${escapeHtml(category.name)}">
        <div class="category__header" role="button" tabindex="0" aria-expanded="${expanded}">
          <div class="category__left">
            <span class="${chevronClass}">${ICONS.chevronRight}</span>
            <span class="category__name">${escapeHtml(category.name)}</span>
          </div>
          <span class="category__badge ${badgeClass}">
            ${passedCount}/${totalCount}
          </span>
        </div>
        <ul class="${listClass}" style="max-height: ${listMaxHeight}px">
          ${category.guidelines.map((g) => this.renderGuideline(g)).join('')}
        </ul>
      </div>
    `;
  }

  /**
   * Render a single guideline row.
   */
  private renderGuideline(result: RuleEvaluationResult): string {
    const passClass = result.passed ? 'guideline--pass' : 'guideline--fail';
    const blockingClass = !result.passed && result.enforcement === EnforcementMode.BLOCKING
      ? 'guideline--blocking'
      : '';

    const iconClass = result.passed
      ? 'guideline__icon guideline__icon--pass'
      : 'guideline__icon guideline__icon--fail';

    const icon = result.passed ? ICONS.check : ICONS.x;

    const enforcementLabel = this.getEnforcementLabel(result.enforcement);

    return `
      <li class="guideline ${passClass} ${blockingClass}"
          data-rule-id="${escapeHtml(result.ruleId)}"
          role="button"
          tabindex="0"
          title="${escapeHtml(result.message)}">
        <span class="${iconClass}">${icon}</span>
        <div class="guideline__content">
          <div class="guideline__name">${escapeHtml(result.ruleName)}</div>
          ${!result.passed ? `<div class="guideline__enforcement">${enforcementLabel}</div>` : ''}
        </div>
        <span class="guideline__link-icon">${LINK_ICON}</span>
      </li>
    `;
  }

  /**
   * Return a human-readable label for an enforcement mode.
   */
  private getEnforcementLabel(enforcement: EnforcementMode): string {
    switch (enforcement) {
      case EnforcementMode.BLOCKING:
        return 'Blocking';
      case EnforcementMode.COMMENT_REQUIRED:
        return 'Comment Required';
      case EnforcementMode.SECOND_APPROVER:
        return 'Approval Required';
      case EnforcementMode.WARNING:
      default:
        return 'Warning';
    }
  }

  // ── Event Listeners ───────────────────────────────────────────────────

  /**
   * Attach click, keyboard, and drag listeners to the rendered sidebar.
   */
  private attachEventListeners(sidebar: HTMLElement): void {
    // Close button
    const closeBtn = sidebar.querySelector('.sidebar__summary-close');
    closeBtn?.addEventListener('click', () => this.hide());

    // Refresh button
    const refreshBtn = sidebar.querySelector('.sidebar__footer-refresh');
    refreshBtn?.addEventListener('click', () => {
      this.onRefresh?.();
    });

    // Category headers (toggle collapse)
    const categoryHeaders = sidebar.querySelectorAll('.category__header');
    categoryHeaders.forEach((header) => {
      // Click handler
      header.addEventListener('click', () => {
        const category = header.closest('.category');
        const categoryName = category?.getAttribute('data-category');
        if (categoryName) this.toggleCategory(categoryName);
      });

      // Keyboard handler (Enter/Space)
      header.addEventListener('keydown', (event) => {
        const keyEvent = event as KeyboardEvent;
        if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
          keyEvent.preventDefault();
          const category = header.closest('.category');
          const categoryName = category?.getAttribute('data-category');
          if (categoryName) this.toggleCategory(categoryName);
        }
      });
    });

    // Guideline items (scroll to field)
    const guidelines = sidebar.querySelectorAll('.guideline');
    guidelines.forEach((guideline) => {
      const handler = () => {
        const ruleId = guideline.getAttribute('data-rule-id');
        if (ruleId) {
          this.handleGuidelineClick(ruleId);
        }
      };

      guideline.addEventListener('click', handler);
      guideline.addEventListener('keydown', (event) => {
        const keyEvent = event as KeyboardEvent;
        if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
          keyEvent.preventDefault();
          handler();
        }
      });
    });

    // Drag-to-reposition on the summary header
    this.setupDrag(sidebar);
  }

  /**
   * Toggle a category's expanded/collapsed state and re-render.
   */
  private toggleCategory(categoryName: string): void {
    const category = this.categories.find((c) => c.name === categoryName);
    if (category) {
      category.expanded = !category.expanded;
      this.render();
    }
  }

  /**
   * Handle a guideline row click: delegate to the scroll callback or
   * fall back to a generic selector-based scroll.
   */
  private handleGuidelineClick(ruleId: string): void {
    if (this.onScrollToField) {
      this.onScrollToField(ruleId);
      return;
    }

    // Fallback: try to find a validation banner for this rule
    const banner = document.querySelector(
      `[data-gov-component="validation-banner"][data-gov-field]`,
    );
    if (banner) {
      banner.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Brief highlight effect
      const el = banner as HTMLElement;
      el.style.transition = 'outline 200ms ease';
      el.style.outline = '2px solid #4F46E5';
      setTimeout(() => {
        el.style.outline = '';
      }, 2000);
    }
  }

  /**
   * Enable drag-to-reposition on the sidebar header.
   */
  private setupDrag(sidebar: HTMLElement): void {
    const summary = sidebar.querySelector('.sidebar__summary') as HTMLElement | null;
    if (!summary) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startRight = 20;
    let startTop = 80;

    summary.style.cursor = 'move';

    summary.addEventListener('mousedown', (e: MouseEvent) => {
      // Only drag on left button, and not on the close button
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.sidebar__summary-close')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const hostStyle = getComputedStyle(this.host);
      startRight = parseInt(hostStyle.right, 10) || 20;
      startTop = parseInt(hostStyle.top, 10) || 80;

      e.preventDefault();
    });

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      this.host.style.right = `${Math.max(0, startRight - dx)}px`;
      this.host.style.top = `${Math.max(0, startTop + dy)}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
}

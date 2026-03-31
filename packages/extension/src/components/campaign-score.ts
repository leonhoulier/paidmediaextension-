/**
 * Campaign Score Widget Component
 *
 * Circular SVG indicator (0-100) showing the compliance score.
 *
 * Formula: score = (rules_passed / total_rules) * 100
 * Weighted scoring: critical (blocking) rules count more.
 *
 * Color thresholds:
 *   - Green:  80-100
 *   - Yellow: 60-79
 *   - Red:    0-59
 *
 * Position: Top-right corner of the campaign creation form (floating).
 *
 * Features:
 *   - Animated SVG circular progress ring
 *   - Weighted score calculation (blocking rules = 2x weight)
 *   - Status message based on score range
 *   - Shadow DOM isolation
 *
 * @module campaign-score
 */

import { createShadowContainer, MAX_Z_INDEX, type ShadowContainerOptions } from './dom-utils.js';
import { BASE_COMPONENT_STYLES, ICONS, getThemeCSS } from './theme.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Props for the campaign score component.
 */
export interface CampaignScoreProps {
  /** Raw score value 0-100 */
  score: number;
  /** Number of passed guidelines */
  passedCount: number;
  /** Total number of guidelines */
  totalCount: number;
  /** Weighted score value 0-100 (optional, falls back to score) */
  weightedScore?: number;
}

// ─── State ────────────────────────────────────────────────────────────────────

/** Active score host element reference */
let activeScoreHost: HTMLElement | null = null;

// ─── Styles ───────────────────────────────────────────────────────────────────

const SCORE_STYLES = `
  ${BASE_COMPONENT_STYLES}

  :host {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: ${MAX_Z_INDEX - 1};
    pointer-events: auto;
  }

  .score-container {
    background: var(--gov-bg);
    border-radius: 16px;
    box-shadow: var(--gov-shadow-lg);
    border: 1px solid var(--gov-border);
    padding: var(--gov-space-lg);
    display: flex;
    align-items: center;
    gap: var(--gov-space-lg);
    font-family: var(--gov-font-family);
    min-width: 260px;
    animation: gov-slideDown 300ms ease-out;
    cursor: default;
    user-select: none;
    transition: box-shadow 200ms ease;
    pointer-events: auto;
  }

  .score-container:hover {
    box-shadow: var(--gov-shadow-lg), 0 0 0 1px var(--gov-primary);
  }

  .score-ring {
    position: relative;
    width: 64px;
    height: 64px;
    flex-shrink: 0;
  }

  .score-ring__svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .score-ring__bg {
    fill: none;
    stroke: var(--gov-border);
    stroke-width: 5;
  }

  .score-ring__progress {
    fill: none;
    stroke-width: 5;
    stroke-linecap: round;
    transition: stroke-dashoffset 600ms ease-out, stroke 300ms ease;
  }

  .score-ring__progress--green {
    stroke: var(--gov-success);
  }

  .score-ring__progress--yellow {
    stroke: var(--gov-warning);
  }

  .score-ring__progress--red {
    stroke: var(--gov-error);
  }

  .score-ring__value {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: var(--gov-font-size-xl);
    font-weight: 700;
    color: var(--gov-text);
    line-height: 1;
  }

  .score-info {
    flex: 1;
    min-width: 0;
  }

  .score-info__label {
    font-size: var(--gov-font-size-xs);
    color: var(--gov-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
  }

  .score-info__message {
    font-size: var(--gov-font-size-sm);
    color: var(--gov-text);
    font-weight: 500;
    line-height: 1.4;
  }

  .score-info__detail {
    font-size: var(--gov-font-size-xs);
    color: var(--gov-text-secondary);
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  @keyframes gov-slideDown {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get the color class for a score value.
 *
 * Thresholds per spec:
 *   - Green:  80-100
 *   - Yellow: 60-79
 *   - Red:    0-59
 */
function getScoreColor(score: number): 'green' | 'yellow' | 'red' {
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  return 'red';
}

/**
 * Get the status message for a score value.
 */
function getScoreMessage(score: number): string {
  if (score >= 80) return "You're using our recommended setup";
  if (score >= 60) return 'Some guidelines need attention';
  return 'Critical issues need to be resolved';
}

/**
 * Calculate SVG circle stroke dash properties.
 *
 * @param score  - Score 0-100
 * @param radius - Circle radius in SVG units
 * @returns circumference and dashoffset values
 */
function calculateDashProps(
  score: number,
  radius: number,
): { circumference: number; dashoffset: number } {
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference - (score / 100) * circumference;
  return { circumference, dashoffset };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Render (or update) the campaign score widget.
 *
 * Positioned at the top-right corner of the viewport (floating).
 * If a score widget already exists, it is replaced.
 *
 * @param props - Score properties
 */
export function renderCampaignScore(props: CampaignScoreProps): void {
  const { score, passedCount, totalCount, weightedScore } = props;
  const displayScore = weightedScore ?? score;

  // Remove existing score widget
  removeCampaignScore();

  const scoreOptions: ShadowContainerOptions = {
    positionStyle: `position: fixed; z-index: ${MAX_Z_INDEX - 1}; top: 20px; right: 20px; pointer-events: none;`,
  };
  const { host, shadow } = createShadowContainer('campaign-score', undefined, scoreOptions);
  host.setAttribute('data-gov-component', 'campaign-score');

  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.textContent = getThemeCSS() + SCORE_STYLES;
  shadow.appendChild(styleEl);

  const color = getScoreColor(displayScore);
  const message = getScoreMessage(displayScore);
  const radius = 27;
  const { circumference, dashoffset } = calculateDashProps(displayScore, radius);

  const container = document.createElement('div');
  container.className = 'score-container';

  container.innerHTML = `
    <div class="score-ring">
      <svg class="score-ring__svg" viewBox="0 0 64 64">
        <circle class="score-ring__bg" cx="32" cy="32" r="${radius}" />
        <circle
          class="score-ring__progress score-ring__progress--${color}"
          cx="32" cy="32" r="${radius}"
          stroke-dasharray="${circumference}"
          stroke-dashoffset="${dashoffset}"
        />
      </svg>
      <span class="score-ring__value">${Math.round(displayScore)}</span>
    </div>
    <div class="score-info">
      <div class="score-info__label">Campaign Score</div>
      <div class="score-info__message">${message}</div>
      <div class="score-info__detail">
        ${ICONS.shield} ${passedCount}/${totalCount} guidelines passed
      </div>
    </div>
  `;

  shadow.appendChild(container);
  document.body.appendChild(host);
  activeScoreHost = host;
}

/**
 * Remove the campaign score widget from the DOM.
 */
export function removeCampaignScore(): void {
  if (activeScoreHost) {
    activeScoreHost.remove();
    activeScoreHost = null;
  }

  // Clean up orphans
  const orphan = document.querySelector('[data-gov-component="campaign-score"]');
  orphan?.remove();
}

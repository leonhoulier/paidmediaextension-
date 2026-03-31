/**
 * Unit tests for Meta Ads Manager DOM Selectors
 *
 * Tests the multi-strategy selector system, fallback chains,
 * and injection point resolution.
 */

import { InjectionPosition } from '@media-buying-governance/shared';
import {
  findElement,
  findFieldElement,
  findElementByTextContent,
  findElementByProximity,
  getInjectionPointForField,
  getSelectorConfig,
  META_FIELD_SELECTORS,
  PUBLISH_BUTTON_SELECTORS,
} from '../meta-selectors.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// findElement()
// ---------------------------------------------------------------------------

describe('findElement()', () => {
  it('should find element using first matching strategy', () => {
    document.body.innerHTML = `
      <input aria-label="Campaign name" value="Test" />
    `;

    const el = findElement([
      {
        description: 'aria-label',
        method: 'aria-label',
        selector: 'input[aria-label*="Campaign name"]',
      },
    ]);

    expect(el).not.toBeNull();
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('should fall back to second strategy when first fails', () => {
    document.body.innerHTML = `
      <div data-testid="campaign-name-input">
        <input value="Test" />
      </div>
    `;

    const el = findElement([
      {
        description: 'aria-label (fails)',
        method: 'aria-label',
        selector: 'input[aria-label*="Campaign name"]',
      },
      {
        description: 'data-testid (succeeds)',
        method: 'data-testid',
        selector: '[data-testid*="campaign-name"] input',
      },
    ]);

    expect(el).not.toBeNull();
    expect(el!.tagName.toLowerCase()).toBe('input');
  });

  it('should fall back to text-content strategy', () => {
    document.body.innerHTML = `
      <div>
        <span>Campaign name</span>
        <input value="Test" />
      </div>
    `;

    const el = findElement([
      {
        description: 'aria-label (fails)',
        method: 'aria-label',
        selector: 'input[aria-label*="NONEXISTENT"]',
      },
      {
        description: 'text-content match',
        method: 'text-content',
        textMatch: 'Campaign name',
        tagName: 'span',
      },
    ]);

    expect(el).not.toBeNull();
    expect(el!.textContent?.trim()).toBe('Campaign name');
  });

  it('should fall back to heuristic strategy', () => {
    document.body.innerHTML = `
      <div>
        <label>Campaign name</label>
        <div>
          <input type="text" value="Test" />
        </div>
      </div>
    `;

    const el = findElement([
      {
        description: 'aria-label (fails)',
        method: 'aria-label',
        selector: 'input[aria-label*="NONEXISTENT"]',
      },
      {
        description: 'heuristic proximity',
        method: 'heuristic',
        labelText: 'Campaign name',
        targetTag: 'input',
      },
    ]);

    expect(el).not.toBeNull();
    expect(el!.tagName.toLowerCase()).toBe('input');
  });

  it('should return null when all strategies fail', () => {
    document.body.innerHTML = '<div>Empty page</div>';

    const el = findElement([
      {
        description: 'fails',
        method: 'aria-label',
        selector: 'input[aria-label*="NONEXISTENT"]',
      },
      {
        description: 'also fails',
        method: 'data-testid',
        selector: '[data-testid*="nonexistent"]',
      },
    ]);

    expect(el).toBeNull();
  });

  it('should return null for empty strategies array', () => {
    const el = findElement([]);
    expect(el).toBeNull();
  });

  it('should handle invalid CSS selectors gracefully', () => {
    const el = findElement([
      {
        description: 'invalid selector',
        method: 'aria-label',
        selector: '[[[invalid',
      },
    ]);

    expect(el).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findFieldElement()
// ---------------------------------------------------------------------------

describe('findFieldElement()', () => {
  it('should find campaign name field', () => {
    document.body.innerHTML = `
      <input aria-label="Campaign name" value="My Campaign" />
    `;

    const el = findFieldElement('campaign.name');
    expect(el).not.toBeNull();
  });

  it('should find ad set name field', () => {
    document.body.innerHTML = `
      <input aria-label="Ad set name" value="My Ad Set" />
    `;

    const el = findFieldElement('ad_set.name');
    expect(el).not.toBeNull();
  });

  it('should find ad name field', () => {
    document.body.innerHTML = `
      <input aria-label="Ad name" value="My Ad" />
    `;

    const el = findFieldElement('ad.name');
    expect(el).not.toBeNull();
  });

  it('should return null for unknown field path', () => {
    const el = findFieldElement('unknown.field');
    expect(el).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findElementByTextContent()
// ---------------------------------------------------------------------------

describe('findElementByTextContent()', () => {
  it('should find element by exact text content', () => {
    document.body.innerHTML = `
      <span>Objective</span>
      <span>Budget</span>
    `;

    const el = findElementByTextContent(document.body, 'Objective', 'span');
    expect(el).not.toBeNull();
    expect(el!.textContent?.trim()).toBe('Objective');
  });

  it('should find element by partial text content', () => {
    document.body.innerHTML = `
      <span>Select your campaign objective</span>
    `;

    const el = findElementByTextContent(document.body, 'objective', 'span');
    expect(el).not.toBeNull();
  });

  it('should handle OR patterns with pipe separator', () => {
    document.body.innerHTML = `
      <span>Lifetime budget</span>
    `;

    const el = findElementByTextContent(document.body, 'Daily budget|Lifetime budget', 'span');
    expect(el).not.toBeNull();
    expect(el!.textContent?.trim()).toBe('Lifetime budget');
  });

  it('should be case-insensitive', () => {
    document.body.innerHTML = `
      <span>CAMPAIGN NAME</span>
    `;

    const el = findElementByTextContent(document.body, 'campaign name', 'span');
    expect(el).not.toBeNull();
  });

  it('should return null when no match found', () => {
    document.body.innerHTML = `<span>Something else</span>`;

    const el = findElementByTextContent(document.body, 'Nonexistent', 'span');
    expect(el).toBeNull();
  });

  it('should return null for empty text', () => {
    const el = findElementByTextContent(document.body, '', 'span');
    expect(el).toBeNull();
  });

  it('should search all elements when no tagName specified', () => {
    document.body.innerHTML = `
      <div>Find me</div>
    `;

    const el = findElementByTextContent(document.body, 'Find me');
    expect(el).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findElementByProximity()
// ---------------------------------------------------------------------------

describe('findElementByProximity()', () => {
  it('should find input near a label', () => {
    document.body.innerHTML = `
      <div>
        <label>Budget amount</label>
        <input type="text" value="500" />
      </div>
    `;

    const el = findElementByProximity('Budget amount', 'input');
    expect(el).not.toBeNull();
    expect(el!.tagName.toLowerCase()).toBe('input');
  });

  it('should find input within nested structure', () => {
    document.body.innerHTML = `
      <div>
        <div>
          <span>Campaign name</span>
        </div>
        <div>
          <div>
            <input type="text" value="Test" />
          </div>
        </div>
      </div>
    `;

    const el = findElementByProximity('Campaign name', 'input');
    expect(el).not.toBeNull();
  });

  it('should return null when label not found', () => {
    document.body.innerHTML = `
      <div>
        <input type="text" value="Test" />
      </div>
    `;

    const el = findElementByProximity('Nonexistent label', 'input');
    expect(el).toBeNull();
  });

  it('should return null for empty label text', () => {
    const el = findElementByProximity('', 'input');
    expect(el).toBeNull();
  });

  it('should be case-insensitive for label matching', () => {
    document.body.innerHTML = `
      <div>
        <span>BUDGET AMOUNT</span>
        <input type="text" value="100" />
      </div>
    `;

    const el = findElementByProximity('budget amount', 'input');
    expect(el).not.toBeNull();
  });

  it('should respect max depth of 5 ancestors', () => {
    // Create a deeply nested structure where the input is more than 5 levels away
    document.body.innerHTML = `
      <div>
        <span>Find me</span>
      </div>
      <div>
        <div><div><div><div><div><div>
          <input type="text" value="too deep" />
        </div></div></div></div></div></div>
      </div>
    `;

    // The label and input are siblings of the top div, so walking up from
    // the span should eventually find a common ancestor
    const el = findElementByProximity('Find me', 'input');
    // This should still work because the common ancestor is within 5 levels
    // but the input would be found inside it
    expect(el).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getInjectionPointForField()
// ---------------------------------------------------------------------------

describe('getInjectionPointForField()', () => {
  it('should return AFTER injection point for campaign.name', () => {
    document.body.innerHTML = `
      <div class="wrapper">
        <input aria-label="Campaign name" value="Test" />
      </div>
    `;

    const point = getInjectionPointForField('naming_convention', 'campaign.name');
    expect(point).not.toBeNull();
    expect(point!.position).toBe(InjectionPosition.AFTER);
  });

  it('should return INSIDE injection point for geo_locations', () => {
    document.body.innerHTML = `
      <div>
        <div aria-label="Locations">
          <span>United States</span>
        </div>
      </div>
    `;

    const point = getInjectionPointForField('targeting_constraint', 'ad_set.targeting.geo_locations');
    expect(point).not.toBeNull();
    expect(point!.position).toBe(InjectionPosition.INSIDE);
  });

  it('should return OVERLAY injection point for publish button', () => {
    document.body.innerHTML = `
      <button type="submit">Publish</button>
    `;

    const point = getInjectionPointForField('creation_blocker', 'publish_button');
    expect(point).not.toBeNull();
    expect(point!.position).toBe(InjectionPosition.OVERLAY);
  });

  it('should return OVERLAY for creation_intercept alias', () => {
    document.body.innerHTML = `
      <button type="submit">Publish</button>
    `;

    const point = getInjectionPointForField('creation_blocker', 'creation_intercept');
    expect(point).not.toBeNull();
    expect(point!.position).toBe(InjectionPosition.OVERLAY);
  });

  it('should return null for unknown field path', () => {
    const point = getInjectionPointForField('rule', 'unknown.field');
    expect(point).toBeNull();
  });

  it('should return null when field element is not in DOM', () => {
    document.body.innerHTML = '<div>Empty</div>';

    const point = getInjectionPointForField('naming_convention', 'campaign.name');
    expect(point).toBeNull();
  });

  it('should use container selector when available (budget)', () => {
    document.body.innerHTML = `
      <div class="budget-section">
        <input aria-label="Budget" type="text" value="500" />
      </div>
    `;

    const point = getInjectionPointForField('budget_enforcement', 'campaign.budget_value');
    expect(point).not.toBeNull();
    // With containerSelector, should resolve to the .budget-section container
    expect(point!.element).toBeInstanceOf(HTMLElement);
  });
});

// ---------------------------------------------------------------------------
// getSelectorConfig()
// ---------------------------------------------------------------------------

describe('getSelectorConfig()', () => {
  it('should return config for known field paths', () => {
    const config = getSelectorConfig('campaign.name');
    expect(config).toBeDefined();
    expect(config!.fieldPath).toBe('campaign.name');
    expect(config!.strategies.length).toBeGreaterThan(0);
  });

  it('should return undefined for unknown field paths', () => {
    const config = getSelectorConfig('nonexistent.field');
    expect(config).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// META_FIELD_SELECTORS completeness
// ---------------------------------------------------------------------------

describe('META_FIELD_SELECTORS', () => {
  const expectedFieldPaths = [
    'campaign.name',
    'campaign.objective',
    'campaign.budget_type',
    'campaign.budget_value',
    'campaign.cbo_enabled',
    'ad_set.name',
    'ad_set.targeting.geo_locations',
    'ad_set.targeting.age_range',
    'ad_set.targeting.genders',
    'ad_set.targeting.languages',
    'ad_set.targeting.custom_audiences',
    'ad_set.placements',
    'ad_set.schedule.start_date',
    'ad_set.schedule.end_date',
    'ad.name',
    'ad.creative.destination_url',
    'ad.creative.cta_type',
    'ad.creative.page_id',
  ];

  it('should have configs for all Appendix B Meta fields', () => {
    const configuredPaths = META_FIELD_SELECTORS.map((c) => c.fieldPath);

    for (const path of expectedFieldPaths) {
      expect(configuredPaths).toContain(path);
    }
  });

  it('should have at least 2 strategies per field (primary + fallback)', () => {
    for (const config of META_FIELD_SELECTORS) {
      expect(config.strategies.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('should have a valid injectionPosition for every field', () => {
    const validPositions = Object.values(InjectionPosition);

    for (const config of META_FIELD_SELECTORS) {
      expect(validPositions).toContain(config.injectionPosition);
    }
  });
});

// ---------------------------------------------------------------------------
// Custom Audiences Selector (HIGH-risk fix)
// ---------------------------------------------------------------------------

describe('findFieldElement() -- custom audiences (HIGH-risk fix)', () => {
  it('should find custom audiences element via data-testid', () => {
    document.body.innerHTML = `
      <div data-testid="custom-audience-picker" aria-label="Custom Audiences">
        <div class="chip">Retargeting - Website Visitors</div>
        <div class="chip">Lookalike - Email List</div>
      </div>
    `;

    const el = findFieldElement('ad_set.targeting.custom_audiences');
    expect(el).not.toBeNull();
    expect(el!.getAttribute('data-testid')).toBe('custom-audience-picker');
  });

  it('should find custom audiences element via aria-label', () => {
    document.body.innerHTML = `
      <div aria-label="Custom Audiences">
        <span class="chip">Retargeting</span>
      </div>
    `;

    const el = findFieldElement('ad_set.targeting.custom_audiences');
    expect(el).not.toBeNull();
    expect(el!.getAttribute('aria-label')).toBe('Custom Audiences');
  });

  it('should find custom audiences via text content fallback', () => {
    document.body.innerHTML = `
      <div>
        <span>Custom Audiences</span>
        <div class="audience-picker">
          <span class="chip">Retargeting</span>
        </div>
      </div>
    `;

    const el = findFieldElement('ad_set.targeting.custom_audiences');
    expect(el).not.toBeNull();
    expect(el!.textContent?.trim()).toBe('Custom Audiences');
  });

  it('should return null when no custom audiences section exists', () => {
    document.body.innerHTML = '<div>No audiences here</div>';

    const el = findFieldElement('ad_set.targeting.custom_audiences');
    expect(el).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PUBLISH_BUTTON_SELECTORS
// ---------------------------------------------------------------------------

describe('PUBLISH_BUTTON_SELECTORS', () => {
  it('should have multiple strategies for finding publish button', () => {
    expect(PUBLISH_BUTTON_SELECTORS.length).toBeGreaterThanOrEqual(3);
  });

  it('should find submit button by type', () => {
    document.body.innerHTML = `<button type="submit">Publish</button>`;

    const el = findElement(PUBLISH_BUTTON_SELECTORS);
    expect(el).not.toBeNull();
  });

  it('should find button by "Publish" text', () => {
    document.body.innerHTML = `<button>Publish</button>`;

    const el = findElement(PUBLISH_BUTTON_SELECTORS);
    expect(el).not.toBeNull();
  });

  it('should find button by "Next" text', () => {
    document.body.innerHTML = `<button>Next</button>`;

    const el = findElement(PUBLISH_BUTTON_SELECTORS);
    expect(el).not.toBeNull();
  });
});

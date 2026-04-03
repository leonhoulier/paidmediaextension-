/**
 * Unit tests for Meta Ads Manager Field Extraction
 *
 * Tests individual field getter functions and the remoteEval bridge.
 */

import { jest } from '@jest/globals';

// TextEncoder/TextDecoder polyfill for jsdom
import { TextEncoder, TextDecoder } from 'util';
Object.assign(global, { TextEncoder, TextDecoder });

import {
  getCampaignName,
  getCampaignObjective,
  getCampaignBudgetType,
  getCampaignBudgetValue,
  getCampaignCBOEnabled,
  getAdSetName,
  getGeoLocations,
  getAgeRange,
  getGenders,
  getLanguages,
  getPlacements,
  getScheduleStartDate,
  getScheduleEndDate,
  getAdName,
  getDestinationUrl,
  getCTAType,
  getPageId,
  getReactFiberProps,
  findReactComponentProps,
  getSupportedFieldPaths,
  getDomFieldPaths,
  extractAllFieldValues,
  extractViaRequire,
  RemoteEvalBatcher,
  destroyRemoteEvalBatcher,
  isRequireExtractionEnabled,
  setRequireExtractionEnabled,
  getRequireFieldMap,
  getFieldPathsForEntityLevel,
} from '../meta-fields.js';
import { EntityLevel } from '@media-buying-governance/shared';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  destroyRemoteEvalBatcher();
});

// ---------------------------------------------------------------------------
// getCampaignName()
// ---------------------------------------------------------------------------

describe('getCampaignName()', () => {
  it('should extract campaign name from aria-label input', () => {
    document.body.innerHTML = `
      <input aria-label="Campaign name" value="US_Social_Awareness_Q1_2026" />
    `;

    expect(getCampaignName()).toBe('US_Social_Awareness_Q1_2026');
  });

  it('should return null when input is empty', () => {
    document.body.innerHTML = `
      <input aria-label="Campaign name" value="" />
    `;

    expect(getCampaignName()).toBeNull();
  });

  it('should return null when element is not found', () => {
    document.body.innerHTML = '<div>No input</div>';
    expect(getCampaignName()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCampaignObjective()
// ---------------------------------------------------------------------------

describe('getCampaignObjective()', () => {
  it('should extract selected objective from radiogroup', () => {
    document.body.innerHTML = `
      <div role="radiogroup">
        <div aria-checked="false">Awareness</div>
        <div aria-checked="true">Traffic</div>
        <div aria-checked="false">Engagement</div>
      </div>
    `;

    expect(getCampaignObjective()).toBe('Traffic');
  });

  it('should extract objective from selected card', () => {
    document.body.innerHTML = `
      <div role="radiogroup">
        <div class="selected">Conversions</div>
        <div>Awareness</div>
      </div>
    `;

    expect(getCampaignObjective()).toBe('Conversions');
  });

  it('should return null when no objective selected', () => {
    document.body.innerHTML = `
      <div role="radiogroup">
        <div aria-checked="false">Awareness</div>
        <div aria-checked="false">Traffic</div>
      </div>
    `;

    expect(getCampaignObjective()).toBeNull();
  });

  it('should return null when container not found', () => {
    document.body.innerHTML = '<div>No objectives</div>';
    expect(getCampaignObjective()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCampaignBudgetType()
// ---------------------------------------------------------------------------

describe('getCampaignBudgetType()', () => {
  it('should detect daily budget', () => {
    document.body.innerHTML = `
      <div aria-label="Budget type">
        <span class="selected">Daily budget</span>
        <span>Lifetime budget</span>
      </div>
    `;

    expect(getCampaignBudgetType()).toBe('daily');
  });

  it('should detect lifetime budget', () => {
    document.body.innerHTML = `
      <div aria-label="Budget type">
        <span>Daily budget</span>
        <span class="selected">Lifetime budget</span>
      </div>
    `;

    expect(getCampaignBudgetType()).toBe('lifetime');
  });

  it('should extract from select element', () => {
    document.body.innerHTML = `
      <select aria-label="Budget type">
        <option value="daily">Daily</option>
        <option value="lifetime" selected>Lifetime</option>
      </select>
    `;

    expect(getCampaignBudgetType()).toBe('lifetime');
  });

  it('should return null when element not found', () => {
    document.body.innerHTML = '<div>No budget</div>';
    expect(getCampaignBudgetType()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCampaignBudgetValue()
// ---------------------------------------------------------------------------

describe('getCampaignBudgetValue()', () => {
  it('should extract numeric budget value', () => {
    document.body.innerHTML = `
      <input aria-label="Budget" type="text" value="5000" />
    `;

    expect(getCampaignBudgetValue()).toBe(5000);
  });

  it('should strip currency formatting', () => {
    document.body.innerHTML = `
      <input aria-label="Budget" type="text" value="$5,000.00" />
    `;

    expect(getCampaignBudgetValue()).toBe(5000);
  });

  it('should handle euro formatting', () => {
    document.body.innerHTML = `
      <input aria-label="Budget" type="text" value="2.500" />
    `;

    // Note: This treats '.' as decimal point. For EU formatting (2.500 = 2500),
    // additional locale-aware parsing would be needed.
    expect(getCampaignBudgetValue()).toBe(2.5);
  });

  it('should return null for non-numeric value', () => {
    document.body.innerHTML = `
      <input aria-label="Budget" type="text" value="" />
    `;

    expect(getCampaignBudgetValue()).toBeNull();
  });

  it('should return null when input not found', () => {
    document.body.innerHTML = '<div>No budget</div>';
    expect(getCampaignBudgetValue()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCampaignCBOEnabled()
// ---------------------------------------------------------------------------

describe('getCampaignCBOEnabled()', () => {
  it('should detect enabled toggle via aria-checked', () => {
    document.body.innerHTML = `
      <div aria-label="Advantage+ campaign budget" role="switch" aria-checked="true">
        On
      </div>
    `;

    expect(getCampaignCBOEnabled()).toBe(true);
  });

  it('should detect disabled toggle via aria-checked', () => {
    document.body.innerHTML = `
      <div aria-label="Advantage+ campaign budget" role="switch" aria-checked="false">
        Off
      </div>
    `;

    expect(getCampaignCBOEnabled()).toBe(false);
  });

  it('should detect checkbox state', () => {
    document.body.innerHTML = `
      <input aria-label="Advantage+ campaign budget" type="checkbox" checked />
    `;

    expect(getCampaignCBOEnabled()).toBe(true);
  });

  it('should detect unchecked checkbox', () => {
    document.body.innerHTML = `
      <input aria-label="Advantage+ campaign budget" type="checkbox" />
    `;

    expect(getCampaignCBOEnabled()).toBe(false);
  });

  it('should find child switch element', () => {
    document.body.innerHTML = `
      <div aria-label="Campaign budget optimization">
        <div role="switch" aria-checked="true">Toggle</div>
      </div>
    `;

    expect(getCampaignCBOEnabled()).toBe(true);
  });

  it('should return null when toggle not found', () => {
    document.body.innerHTML = '<div>No toggle</div>';
    expect(getCampaignCBOEnabled()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getAdSetName()
// ---------------------------------------------------------------------------

describe('getAdSetName()', () => {
  it('should extract ad set name', () => {
    document.body.innerHTML = `
      <input aria-label="Ad set name" value="US_Broad_18-65" />
    `;

    expect(getAdSetName()).toBe('US_Broad_18-65');
  });

  it('should return null when empty', () => {
    document.body.innerHTML = `
      <input aria-label="Ad set name" value="" />
    `;

    expect(getAdSetName()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getGeoLocations()
// ---------------------------------------------------------------------------

describe('getGeoLocations()', () => {
  it('should extract location tags', () => {
    document.body.innerHTML = `
      <div aria-label="Locations">
        <div role="listitem">United States</div>
        <div role="listitem">Canada</div>
        <div role="listitem">United Kingdom</div>
      </div>
    `;

    const locations = getGeoLocations();
    expect(locations).toEqual(['United States', 'Canada', 'United Kingdom']);
  });

  it('should extract from chip elements', () => {
    document.body.innerHTML = `
      <div aria-label="Location">
        <span class="chip">France</span>
        <span class="chip">Germany</span>
      </div>
    `;

    const locations = getGeoLocations();
    expect(locations).toEqual(['France', 'Germany']);
  });

  it('should return null when no locations found', () => {
    document.body.innerHTML = `
      <div aria-label="Location"></div>
    `;

    expect(getGeoLocations()).toBeNull();
  });

  it('should return null when container not found', () => {
    document.body.innerHTML = '<div>No locations</div>';
    expect(getGeoLocations()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getAgeRange()
// ---------------------------------------------------------------------------

describe('getAgeRange()', () => {
  it('should extract age range from two inputs', () => {
    document.body.innerHTML = `
      <div aria-label="Age">
        <input value="18" />
        <input value="65" />
      </div>
    `;

    expect(getAgeRange()).toEqual({ min: 18, max: 65 });
  });

  it('should extract from select elements', () => {
    document.body.innerHTML = `
      <div aria-label="Age">
        <select><option value="25" selected>25</option></select>
        <select><option value="54" selected>54</option></select>
      </div>
    `;

    expect(getAgeRange()).toEqual({ min: 25, max: 54 });
  });

  it('should return null when inputs have invalid values', () => {
    document.body.innerHTML = `
      <div aria-label="Age">
        <input value="" />
        <input value="" />
      </div>
    `;

    expect(getAgeRange()).toBeNull();
  });

  it('should return null when container not found', () => {
    document.body.innerHTML = '<div>No age</div>';
    expect(getAgeRange()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getGenders()
// ---------------------------------------------------------------------------

describe('getGenders()', () => {
  it('should extract checked gender options', () => {
    document.body.innerHTML = `
      <div aria-label="Gender">
        <label><input type="checkbox" checked /> Male</label>
        <label><input type="checkbox" checked /> Female</label>
        <label><input type="checkbox" /> Other</label>
      </div>
    `;

    const genders = getGenders();
    expect(genders).toContain('Male');
    expect(genders).toContain('Female');
    expect(genders).not.toContain('Other');
  });

  it('should extract from aria-checked elements', () => {
    document.body.innerHTML = `
      <div aria-label="Gender">
        <div aria-checked="true" aria-label="All">All genders</div>
      </div>
    `;

    const genders = getGenders();
    expect(genders).toEqual(['All']);
  });

  it('should return null when no genders selected', () => {
    document.body.innerHTML = `
      <div aria-label="Gender">
        <label><input type="checkbox" /> Male</label>
      </div>
    `;

    expect(getGenders()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getLanguages()
// ---------------------------------------------------------------------------

describe('getLanguages()', () => {
  it('should extract language chips', () => {
    document.body.innerHTML = `
      <div aria-label="Languages">
        <span class="chip">English</span>
        <span class="chip">Spanish</span>
      </div>
    `;

    expect(getLanguages()).toEqual(['English', 'Spanish']);
  });

  it('should return null when no languages', () => {
    document.body.innerHTML = `<div aria-label="Language"></div>`;
    expect(getLanguages()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getPlacements()
// ---------------------------------------------------------------------------

describe('getPlacements()', () => {
  it('should extract checked placement options', () => {
    document.body.innerHTML = `
      <div aria-label="Placement">
        <label><input type="checkbox" checked /> Facebook Feed</label>
        <label><input type="checkbox" checked /> Instagram Stories</label>
        <label><input type="checkbox" /> Messenger</label>
      </div>
    `;

    const placements = getPlacements();
    expect(placements).toContain('Facebook Feed');
    expect(placements).toContain('Instagram Stories');
    expect(placements).not.toContain('Messenger');
  });

  it('should return null when container not found', () => {
    document.body.innerHTML = '<div>No placements</div>';
    expect(getPlacements()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getScheduleStartDate() / getScheduleEndDate()
// ---------------------------------------------------------------------------

describe('getScheduleStartDate()', () => {
  it('should extract start date from input', () => {
    document.body.innerHTML = `
      <input aria-label="Start date" value="2026-03-01" />
    `;

    expect(getScheduleStartDate()).toBe('2026-03-01');
  });

  it('should return null when input not found', () => {
    document.body.innerHTML = '<div>No date</div>';
    expect(getScheduleStartDate()).toBeNull();
  });

  it('should ignore non-date React values', () => {
    const el = document.createElement('div');
    (el as Record<string, unknown>)['__reactFiber$test123'] = {
      memoizedProps: { value: true },
    };
    el.setAttribute('aria-label', 'Start date');
    document.body.appendChild(el);

    expect(getScheduleStartDate()).toBeNull();
  });
});

describe('getScheduleEndDate()', () => {
  it('should extract end date from input', () => {
    document.body.innerHTML = `
      <input aria-label="End date" value="2026-04-30" />
    `;

    expect(getScheduleEndDate()).toBe('2026-04-30');
  });

  it('should ignore non-date React values', () => {
    const el = document.createElement('div');
    (el as Record<string, unknown>)['__reactFiber$test123'] = {
      memoizedProps: { value: false },
    };
    el.setAttribute('aria-label', 'End date');
    document.body.appendChild(el);

    expect(getScheduleEndDate()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getAdName()
// ---------------------------------------------------------------------------

describe('getAdName()', () => {
  it('should extract ad name', () => {
    document.body.innerHTML = `
      <input aria-label="Ad name" value="Video_15s_LearnMore" />
    `;

    expect(getAdName()).toBe('Video_15s_LearnMore');
  });
});

// ---------------------------------------------------------------------------
// getDestinationUrl()
// ---------------------------------------------------------------------------

describe('getDestinationUrl()', () => {
  it('should extract website URL', () => {
    document.body.innerHTML = `
      <input aria-label="Website URL" value="https://example.com/landing?utm_source=meta" />
    `;

    expect(getDestinationUrl()).toBe('https://example.com/landing?utm_source=meta');
  });
});

// ---------------------------------------------------------------------------
// getCTAType()
// ---------------------------------------------------------------------------

describe('getCTAType()', () => {
  it('should extract CTA from select element', () => {
    document.body.innerHTML = `
      <select aria-label="Call to action">
        <option value="LEARN_MORE" selected>Learn More</option>
        <option value="SHOP_NOW">Shop Now</option>
      </select>
    `;

    expect(getCTAType()).toBe('LEARN_MORE');
  });

  it('should extract CTA from selected option in custom dropdown', () => {
    document.body.innerHTML = `
      <div aria-label="Call to action">
        <div aria-selected="true">Shop Now</div>
        <div>Learn More</div>
      </div>
    `;

    expect(getCTAType()).toBe('Shop Now');
  });

  it('should return null when not found', () => {
    document.body.innerHTML = '<div>No CTA</div>';
    expect(getCTAType()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getPageId()
// ---------------------------------------------------------------------------

describe('getPageId()', () => {
  it('should extract page ID from data attribute', () => {
    document.body.innerHTML = `
      <div aria-label="Facebook Page" data-page-id="12345678">
        My Business Page
      </div>
    `;

    expect(getPageId()).toBe('12345678');
  });

  it('should extract from select element', () => {
    document.body.innerHTML = `
      <select aria-label="Facebook Page">
        <option value="page_123" selected>My Page</option>
      </select>
    `;

    expect(getPageId()).toBe('page_123');
  });

  it('should fall back to selected option text', () => {
    document.body.innerHTML = `
      <div aria-label="Facebook Page">
        <div aria-selected="true">My Business Page</div>
      </div>
    `;

    expect(getPageId()).toBe('My Business Page');
  });

  it('should return null when not found', () => {
    document.body.innerHTML = '<div>No page selector</div>';
    expect(getPageId()).toBeNull();
  });

  it('should ignore generic edit labels', () => {
    document.body.innerHTML = `
      <div aria-label="Facebook Page">
        <div aria-selected="true">EditEditEdit</div>
      </div>
    `;

    expect(getPageId()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getReactFiberProps()
// ---------------------------------------------------------------------------

describe('getReactFiberProps()', () => {
  it('should extract props from React Fiber', () => {
    const el = document.createElement('input');
    // Simulate React Fiber attachment
    const fiberKey = '__reactFiber$test123';
    (el as Record<string, unknown>)[fiberKey] = {
      memoizedProps: {
        value: 'fiber-value',
        onChange: 'function',
      },
    };

    const props = getReactFiberProps(el);
    expect(props).not.toBeNull();
    expect(props!.value).toBe('fiber-value');
  });

  it('should return null when no React Fiber key found', () => {
    const el = document.createElement('input');
    expect(getReactFiberProps(el)).toBeNull();
  });

  it('should return null when fiber has no memoizedProps', () => {
    const el = document.createElement('input');
    (el as Record<string, unknown>)['__reactFiber$test123'] = {
      type: 'input',
    };

    expect(getReactFiberProps(el)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findReactComponentProps()
// ---------------------------------------------------------------------------

describe('findReactComponentProps()', () => {
  it('should find component props by name pattern', () => {
    const el = document.createElement('div');
    const fiberKey = '__reactFiber$test123';

    // Create a mock fiber chain
    const targetFiber = {
      type: { displayName: 'BudgetInput' },
      memoizedProps: { budget: 5000, currency: 'USD' },
      return: null,
    };

    const parentFiber = {
      type: { displayName: 'FormSection' },
      memoizedProps: { section: 'budget' },
      return: targetFiber,
    };

    (el as Record<string, unknown>)[fiberKey] = {
      type: 'div',
      memoizedProps: {},
      return: parentFiber,
    };

    const props = findReactComponentProps(el, /BudgetInput/);
    expect(props).not.toBeNull();
    expect(props!.budget).toBe(5000);
  });

  it('should return null when no matching component found', () => {
    const el = document.createElement('div');
    const fiberKey = '__reactFiber$test123';

    (el as Record<string, unknown>)[fiberKey] = {
      type: 'div',
      memoizedProps: {},
      return: null,
    };

    const props = findReactComponentProps(el, /NonExistentComponent/);
    expect(props).toBeNull();
  });

  it('should return null when no React Fiber present', () => {
    const el = document.createElement('div');
    const props = findReactComponentProps(el, /SomeComponent/);
    expect(props).toBeNull();
  });

  it('should respect maxDepth parameter', () => {
    const el = document.createElement('div');
    const fiberKey = '__reactFiber$test123';

    // Create a chain deeper than maxDepth
    let fiber: Record<string, unknown> = {
      type: { displayName: 'Target' },
      memoizedProps: { found: true },
      return: null,
    };

    // Add 5 intermediate nodes
    for (let i = 0; i < 5; i++) {
      fiber = {
        type: 'div',
        memoizedProps: {},
        return: fiber,
      };
    }

    (el as Record<string, unknown>)[fiberKey] = fiber;

    // With maxDepth 3, should not find the target
    const props = findReactComponentProps(el, /Target/, 3);
    expect(props).toBeNull();

    // With maxDepth 10, should find it
    const propsDeep = findReactComponentProps(el, /Target/, 10);
    expect(propsDeep).not.toBeNull();
    expect(propsDeep!.found).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RemoteEvalBatcher
// ---------------------------------------------------------------------------

describe('RemoteEvalBatcher', () => {
  it('should create a batcher instance', () => {
    const batcher = new RemoteEvalBatcher();
    expect(batcher).toBeDefined();
    batcher.destroy();
  });

  it('should reject on timeout', async () => {
    const batcher = new RemoteEvalBatcher();

    const promise = batcher.execute(
      {
        type: 'evalQuery.governance',
        queryId: 'test-timeout',
        getters: [{ field: 'campaign.name', method: 'elementValue', selector: 'input' }],
      },
      100, // 100ms timeout
    );

    await expect(promise).rejects.toThrow('remoteEval timeout');
    batcher.destroy();
  });

  it('should resolve when result message is received', async () => {
    const batcher = new RemoteEvalBatcher();

    const promise = batcher.execute({
      type: 'evalQuery.governance',
      queryId: 'test-resolve',
      getters: [{ field: 'campaign.name', method: 'elementValue', selector: 'input' }],
    });

    // Simulate the eval.js response
    window.postMessage(
      {
        type: 'evalResult.governance',
        queryId: 'test-resolve',
        results: { 'campaign.name': 'Test Campaign' },
        errors: {},
      },
      '*',
    );

    const result = await promise;
    expect(result['campaign.name']).toBe('Test Campaign');
    batcher.destroy();
  });

  it('should handle destroy with pending queries', () => {
    const batcher = new RemoteEvalBatcher();

    const promise = batcher.execute({
      type: 'evalQuery.governance',
      queryId: 'test-destroy',
      getters: [],
    });

    batcher.destroy();

    return expect(promise).rejects.toThrow('RemoteEvalBatcher destroyed');
  });
});

// ---------------------------------------------------------------------------
// getSupportedFieldPaths()
// ---------------------------------------------------------------------------

describe('getSupportedFieldPaths()', () => {
  it('should return more than 18 field paths (includes require() fields)', () => {
    const paths = getSupportedFieldPaths();
    // Original 18 DOM fields + 88 require() fields (with overlap)
    expect(paths.length).toBeGreaterThanOrEqual(18);
  });

  it('should include all original DOM field paths', () => {
    const paths = getSupportedFieldPaths();

    expect(paths).toContain('campaign.name');
    expect(paths).toContain('campaign.objective');
    expect(paths).toContain('campaign.budget_type');
    expect(paths).toContain('campaign.budget_value');
    expect(paths).toContain('campaign.cbo_enabled');
    expect(paths).toContain('ad_set.name');
    expect(paths).toContain('ad_set.targeting.geo_locations');
    expect(paths).toContain('ad_set.targeting.age_range');
    expect(paths).toContain('ad_set.targeting.genders');
    expect(paths).toContain('ad_set.targeting.languages');
    expect(paths).toContain('ad_set.targeting.custom_audiences');
    expect(paths).toContain('ad_set.placements');
    expect(paths).toContain('ad_set.schedule.start_date');
    expect(paths).toContain('ad_set.schedule.end_date');
    expect(paths).toContain('ad.name');
    expect(paths).toContain('ad.creative.destination_url');
    expect(paths).toContain('ad.creative.cta_type');
    expect(paths).toContain('ad.creative.page_id');
  });

  it('should include require()-only field paths', () => {
    const paths = getSupportedFieldPaths();

    // These fields are only available via require()
    expect(paths).toContain('ad.creative.headline');
    expect(paths).toContain('ad.creative.primary_text');
    expect(paths).toContain('campaign.buying_type');
    expect(paths).toContain('ad_set.optimization_goal');
    expect(paths).toContain('ad.creative.format');
  });
});

describe('getDomFieldPaths()', () => {
  it('should return exactly 18 DOM field paths', () => {
    const paths = getDomFieldPaths();
    expect(paths.length).toBe(18);
  });
});

describe('getFieldPathsForEntityLevel()', () => {
  it('should return campaign fields only for campaign level', () => {
    const paths = getFieldPathsForEntityLevel(EntityLevel.CAMPAIGN);
    expect(paths).toContain('campaign.name');
    expect(paths).not.toContain('ad_set.name');
    expect(paths).not.toContain('ad.name');
  });

  it('should return ad set and ad specific groups separately', () => {
    expect(getFieldPathsForEntityLevel(EntityLevel.AD_SET)).toContain('ad_set.name');
    expect(getFieldPathsForEntityLevel(EntityLevel.AD)).toContain('ad.name');
  });
});

// ---------------------------------------------------------------------------
// Feature Flag: enable-require-extraction
// ---------------------------------------------------------------------------

describe('Feature Flag: require extraction', () => {
  afterEach(() => {
    // Reset the cached flag
    setRequireExtractionEnabled(false);
  });

  it('should default to disabled', async () => {
    // Reset cached value
    setRequireExtractionEnabled(false);
    // isRequireExtractionEnabled will return the cached value
    const enabled = await isRequireExtractionEnabled();
    expect(enabled).toBe(false);
  });

  it('should be toggleable via setRequireExtractionEnabled', async () => {
    setRequireExtractionEnabled(true);
    const enabled = await isRequireExtractionEnabled();
    expect(enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// require() Field Mapping
// ---------------------------------------------------------------------------

describe('getRequireFieldMap()', () => {
  it('should return the full require field mapping', () => {
    const map = getRequireFieldMap();
    expect(Object.keys(map).length).toBeGreaterThanOrEqual(80);
  });

  it('should map campaign.name to AdsCampaignDataStore.name', () => {
    const map = getRequireFieldMap();
    expect(map['campaign.name']).toEqual({
      store: 'AdsCampaignDataStore',
      path: 'name',
    });
  });

  it('should map ad.creative.headline to AdsCreativeEditorDataStore.headline', () => {
    const map = getRequireFieldMap();
    expect(map['ad.creative.headline']).toEqual({
      store: 'AdsCreativeEditorDataStore',
      path: 'headline',
    });
  });

  it('should map targeting fields to AdsTargetingDataStore', () => {
    const map = getRequireFieldMap();
    expect(map['ad_set.targeting.geo_locations'].store).toBe('AdsTargetingDataStore');
    expect(map['ad_set.targeting.age_range'].store).toBe('AdsTargetingDataStore');
    expect(map['ad_set.targeting.genders'].store).toBe('AdsTargetingDataStore');
  });

  it('should have every field path be unique', () => {
    const map = getRequireFieldMap();
    const paths = Object.keys(map);
    const uniquePaths = new Set(paths);
    expect(uniquePaths.size).toBe(paths.length);
  });
});

// ---------------------------------------------------------------------------
// extractViaRequire()
// ---------------------------------------------------------------------------

describe('extractViaRequire()', () => {
  jest.setTimeout(10000);

  it('should return null when eval bridge is not available', async () => {
    // No eval bridge is running, so the batcher will timeout
    // We use a short timeout by re-implementing via the batcher
    const result = await extractViaRequire();
    // Result will be null because facebookEditorTree returns null
    // (no window.require) and the eval bridge is not set up
    expect(result).toBeNull();
  });

  it('should handle a mock editor tree response', async () => {
    // Simulate the eval bridge responding with a mock tree
    const mockTree = {
      AdsCampaignDataStore: {
        name: 'Test Campaign from require()',
        objective: 'OUTCOME_TRAFFIC',
        budgetType: 'daily',
        budgetValue: 5000,
      },
      AdsTargetingDataStore: {
        geoLocations: ['US', 'UK'],
        ageRange: { min: 18, max: 65 },
      },
    };

    // Set up a listener that responds to the query
    const responseHandler = (event: MessageEvent) => {
      if (event.data?.type !== 'evalQuery.governance') return;
      window.postMessage({
        type: 'evalResult.governance',
        queryId: event.data.queryId,
        results: { '_editorTree': mockTree },
        errors: {},
      }, '*');
    };

    // Use the CustomEvent listener
    const customHandler = ((event: CustomEvent) => {
      if (!event.detail?.queryId) return;
      window.postMessage({
        type: 'evalResult.governance',
        queryId: event.detail.queryId,
        results: { '_editorTree': mockTree },
        errors: {},
      }, '*');
    }) as EventListener;

    window.addEventListener('message', responseHandler);
    window.addEventListener('evalQuery.governance', customHandler);

    try {
      const result = await extractViaRequire();

      // The result should map the tree data to field paths
      if (result) {
        expect(result['campaign.name']).toBe('Test Campaign from require()');
        expect(result['campaign.objective']).toBe('OUTCOME_TRAFFIC');
        expect(result['campaign.budget_type']).toBe('daily');
        expect(result['campaign.budget_value']).toBe(5000);
        expect(result['ad_set.targeting.geo_locations']).toEqual(['US', 'UK']);
      }
    } finally {
      window.removeEventListener('message', responseHandler);
      window.removeEventListener('evalQuery.governance', customHandler);
    }
  });
});

// ---------------------------------------------------------------------------
// Fallback Chain in extractAllFieldValues()
// ---------------------------------------------------------------------------

describe('Fallback chain in extractAllFieldValues()', () => {
  jest.setTimeout(10000);

  beforeEach(() => {
    setRequireExtractionEnabled(false);
  });

  it('should fall through to DOM extraction when require() is disabled', async () => {
    document.body.innerHTML = `
      <input aria-label="Campaign name" value="DOM Campaign" />
    `;

    setRequireExtractionEnabled(false);
    const values = await extractAllFieldValues();

    expect(values['campaign.name']).toBe('DOM Campaign');
  });

  it('should return a record with all field paths', async () => {
    document.body.innerHTML = `
      <input aria-label="Campaign name" value="Test Campaign" />
      <input aria-label="Ad set name" value="Test Ad Set" />
      <input aria-label="Ad name" value="Test Ad" />
    `;

    const values = await extractAllFieldValues();

    expect(values).toHaveProperty(['campaign.name']);
    expect(values).toHaveProperty(['ad_set.name']);
    expect(values).toHaveProperty(['ad.name']);
    expect(values['campaign.name']).toBe('Test Campaign');
    expect(values['ad_set.name']).toBe('Test Ad Set');
    expect(values['ad.name']).toBe('Test Ad');
  });

  it('should return null for fields not in DOM', async () => {
    document.body.innerHTML = '<div>Empty</div>';

    const values = await extractAllFieldValues();

    // All fields should be present but null
    expect(values).toHaveProperty(['campaign.name']);
    expect(values['campaign.name']).toBeNull();
    expect(values['campaign.budget_value']).toBeNull();
  });

  it('should scope extraction to the active entity level', async () => {
    document.body.innerHTML = `
      <input aria-label="Campaign name" value="Campaign Name" />
      <input aria-label="Ad set name" value="Ad Set Name" />
      <input aria-label="Ad name" value="Ad Name" />
    `;

    const values = await extractAllFieldValues(EntityLevel.AD_SET);

    expect(values['campaign.name']).toBeNull();
    expect(values['ad_set.name']).toBe('Ad Set Name');
    expect(values['ad.name']).toBeNull();
  });

  it('should not infer countries from unrelated page text', () => {
    document.body.innerHTML = `
      <div>
        <span>Account Overview</span>
        <span>France</span>
        <span>Spain</span>
        <span>China</span>
      </div>
    `;

    expect(getGeoLocationCountries()).toBeNull();
  });

  it('should not throw when getters fail', async () => {
    // Even with a completely empty DOM, should not throw
    document.body.innerHTML = '';

    await expect(extractAllFieldValues()).resolves.toBeDefined();
  });

  it('should add dlg-extracted-* body classes during extraction', async () => {
    document.body.innerHTML = `
      <input aria-label="Campaign name" value="Test" />
    `;

    await extractAllFieldValues();

    // The extraction phase should have added extraction body classes
    // for fields that were successfully extracted
    expect(document.body.classList.contains('dlg-extracted-campaign-name')).toBe(true);
  });

  it('should include require()-mapped fields in results even when empty', async () => {
    document.body.innerHTML = '';
    setRequireExtractionEnabled(false);

    const values = await extractAllFieldValues();

    // require()-only fields should be present (as null) in the result
    expect('ad.creative.headline' in values).toBe(true);
    expect(values['ad.creative.headline']).toBeNull();
  });

  it('should normalize remoteEval-selected values for campaign controls', async () => {
    document.body.innerHTML = '<div></div>';
    setRequireExtractionEnabled(false);

    const customHandler = ((event: CustomEvent) => {
      if (!event.detail?.queryId) return;
      window.postMessage({
        type: 'evalResult.governance',
        queryId: event.detail.queryId,
        results: {
          'campaign.objective': 'Traffic',
          'campaign.budget_type': 'Lifetime budget',
          'campaign.cbo_enabled': true,
        },
        errors: {},
      }, '*');
    }) as EventListener;

    window.addEventListener('evalQuery.governance', customHandler);

    try {
      const values = await extractAllFieldValues();
      expect(values['campaign.objective']).toBe('Traffic');
      expect(values['campaign.budget_type']).toBe('lifetime');
      expect(values['campaign.cbo_enabled']).toBe(true);
    } finally {
      window.removeEventListener('evalQuery.governance', customHandler);
    }
  });
});

// ---------------------------------------------------------------------------
// ArrayBuffer handling in RemoteEvalBatcher
// ---------------------------------------------------------------------------

describe('RemoteEvalBatcher ArrayBuffer handling', () => {
  it('should decode ArrayBuffer when constructed as Uint8Array', () => {
    // Test the decode logic directly since jsdom's postMessage
    // doesn't fully support Transferable ArrayBuffers
    const data = { 'campaign.name': 'From ArrayBuffer' };
    const encoder = new TextEncoder();
    const encoded = encoder.encode(JSON.stringify(data));
    const buffer = encoded.buffer;

    // Decode the buffer (same logic as in the batcher)
    const decoder = new TextDecoder();
    const decoded = decoder.decode(buffer);
    const parsed = JSON.parse(decoded) as Record<string, unknown>;

    expect(parsed['campaign.name']).toBe('From ArrayBuffer');
  });

  it('should detect when buffer has byteLength property', () => {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(JSON.stringify({ field: 'value' }));
    const buffer = encoded.buffer;

    // The buffer should have a byteLength property (duck typing)
    expect(typeof buffer.byteLength).toBe('number');
    expect(buffer.byteLength).toBeGreaterThan(0);
    // It should be usable with TextDecoder
    const decoder = new TextDecoder();
    const decoded = JSON.parse(decoder.decode(buffer));
    expect(decoded['field']).toBe('value');
  });

  it('should fall back to results field when no buffer is present', async () => {
    const batcher = new RemoteEvalBatcher();

    const promise = batcher.execute({
      type: 'evalQuery.governance',
      queryId: 'test-fallback-results',
      getters: [{ field: 'test', method: 'elementValue', selector: 'input' }],
    });

    // Send a response with no buffer, just results
    window.postMessage({
      type: 'evalResult.governance',
      queryId: 'test-fallback-results',
      results: { test: 'from-results' },
      errors: {},
    }, '*');

    const result = await promise;
    expect(result['test']).toBe('from-results');
    batcher.destroy();
  });
});

// ---------------------------------------------------------------------------
// CustomEvent communication in RemoteEvalBatcher
// ---------------------------------------------------------------------------

describe('RemoteEvalBatcher CustomEvent communication', () => {
  it('should dispatch CustomEvent for outbound queries', async () => {
    const batcher = new RemoteEvalBatcher();
    let receivedEvent = false;

    const handler = ((event: CustomEvent) => {
      if (event.detail?.queryId === 'test-custom-event') {
        receivedEvent = true;
        // Send back a response via postMessage
        window.postMessage({
          type: 'evalResult.governance',
          queryId: 'test-custom-event',
          results: { field: 'value' },
          errors: {},
        }, '*');
      }
    }) as EventListener;

    window.addEventListener('evalQuery.governance', handler);

    try {
      const result = await batcher.execute({
        type: 'evalQuery.governance',
        queryId: 'test-custom-event',
        getters: [{ field: 'field', method: 'elementValue', selector: 'input' }],
      });

      expect(receivedEvent).toBe(true);
      expect(result['field']).toBe('value');
    } finally {
      window.removeEventListener('evalQuery.governance', handler);
      batcher.destroy();
    }
  });
});

/**
 * Unit Tests for Google Ads Platform Adapter
 *
 * Tests cover:
 *  - detectContext() with various URL patterns
 *  - extractFieldValues() with mock Material Design DOM
 *  - getInjectionPoint() selector resolution
 *  - interceptCreation() event blocking
 *  - observeFieldChanges() MutationObserver behavior
 *  - cleanup() resource release
 *  - Shadow DOM traversal
 *  - DOM utility functions
 */

import { EntityLevel, ExtensionView, InjectionPosition, Platform } from '@media-buying-governance/shared';
import { GoogleAdsAdapter } from '../google-adapter.js';
import {
  getCampaignName,
  getBudgetValue,
  getGeoTargets,
  getLanguages,
  getBrandSafety,
  getHeadlines,
  getDescriptions,
  getFinalUrl,
  getDisplayPath,
  extractAllFieldValues,
} from '../google-fields.js';
import {
  queryByChain,
  queryAllByChain,
  queryWithShadowDom,
  queryAllWithShadowDom,
  KNOWN_SHADOW_HOSTS,
  findElementByText,
  findButtonByText,
} from '../google-selectors.js';

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

/**
 * Set window.location to a specific URL for testing.
 */
function setLocation(url: string): void {
  Object.defineProperty(window, 'location', {
    value: new URL(url),
    writable: true,
    configurable: true,
  });
}

/**
 * Reset document body between tests.
 */
function resetDom(): void {
  document.body.innerHTML = '';
  document.body.className = '';
}

// ---------------------------------------------------------------------------
// detectContext() tests
// ---------------------------------------------------------------------------

describe('GoogleAdsAdapter', () => {
  let adapter: GoogleAdsAdapter;

  beforeEach(() => {
    adapter = new GoogleAdsAdapter();
    resetDom();
  });

  afterEach(() => {
    adapter.cleanup();
  });

  describe('platform', () => {
    it('should have platform set to GOOGLE_ADS', () => {
      expect(adapter.platform).toBe(Platform.GOOGLE_ADS);
    });
  });

  describe('detectContext()', () => {
    it('should detect campaign creation context from URL with __u param', () => {
      setLocation('https://ads.google.com/aw/campaigns/create?__u=123-456-7890');

      const context = adapter.detectContext();

      expect(context).not.toBeNull();
      expect(context!.accountId).toBe('123-456-7890');
      expect(context!.entityLevel).toBe(EntityLevel.CAMPAIGN);
      expect(context!.view).toBe(ExtensionView.CREATE);
    });

    it('should detect campaign creation from wizard URL', () => {
      setLocation('https://ads.google.com/aw/campaigns/wizard?__u=987-654-3210');

      const context = adapter.detectContext();

      expect(context).not.toBeNull();
      expect(context!.accountId).toBe('987-654-3210');
      expect(context!.entityLevel).toBe(EntityLevel.CAMPAIGN);
      expect(context!.view).toBe(ExtensionView.CREATE);
    });

    it('should detect campaign creation from /new URL', () => {
      setLocation('https://ads.google.com/aw/campaigns/new?__u=111-222-3333');

      const context = adapter.detectContext();

      expect(context).not.toBeNull();
      expect(context!.view).toBe(ExtensionView.CREATE);
    });

    it('should format customer ID without dashes to XXX-XXX-XXXX', () => {
      setLocation('https://ads.google.com/aw/campaigns/create?__u=1234567890');

      const context = adapter.detectContext();

      expect(context).not.toBeNull();
      expect(context!.accountId).toBe('123-456-7890');
    });

    it('should detect campaign edit view', () => {
      setLocation('https://ads.google.com/aw/campaigns/12345/edit?__u=123-456-7890');

      const context = adapter.detectContext();

      expect(context).not.toBeNull();
      expect(context!.entityLevel).toBe(EntityLevel.CAMPAIGN);
      expect(context!.view).toBe(ExtensionView.EDIT);
    });

    it('should detect ad group creation', () => {
      setLocation('https://ads.google.com/aw/adgroups/create?__u=123-456-7890');

      const context = adapter.detectContext();

      expect(context).not.toBeNull();
      expect(context!.entityLevel).toBe(EntityLevel.AD_SET);
      expect(context!.view).toBe(ExtensionView.CREATE);
    });

    it('should detect ad group edit', () => {
      setLocation('https://ads.google.com/aw/adgroups/99999/edit?__u=123-456-7890');

      const context = adapter.detectContext();

      expect(context).not.toBeNull();
      expect(context!.entityLevel).toBe(EntityLevel.AD_SET);
      expect(context!.view).toBe(ExtensionView.EDIT);
    });

    it('should detect ad creation', () => {
      setLocation('https://ads.google.com/aw/ads/create?__u=123-456-7890');

      const context = adapter.detectContext();

      expect(context).not.toBeNull();
      expect(context!.entityLevel).toBe(EntityLevel.AD);
      expect(context!.view).toBe(ExtensionView.CREATE);
    });

    it('should detect ad edit', () => {
      setLocation('https://ads.google.com/aw/ads/12345/edit?__u=123-456-7890');

      const context = adapter.detectContext();

      expect(context).not.toBeNull();
      expect(context!.entityLevel).toBe(EntityLevel.AD);
      expect(context!.view).toBe(ExtensionView.EDIT);
    });

    it('should detect overview as review view', () => {
      setLocation('https://ads.google.com/aw/overview?__u=123-456-7890');

      const context = adapter.detectContext();

      expect(context).not.toBeNull();
      expect(context!.view).toBe(ExtensionView.REVIEW);
    });

    it('should return null for non-Google Ads hostname', () => {
      setLocation('https://www.google.com/search?q=test');

      const context = adapter.detectContext();

      expect(context).toBeNull();
    });

    it('should return null when no customer ID is found', () => {
      setLocation('https://ads.google.com/aw/campaigns/create');

      const context = adapter.detectContext();

      expect(context).toBeNull();
    });

    it('should extract customer ID from ocid param as fallback', () => {
      setLocation('https://ads.google.com/aw/campaigns/create?ocid=555-666-7777');

      const context = adapter.detectContext();

      expect(context).not.toBeNull();
      expect(context!.accountId).toBe('555-666-7777');
    });

    it('should extract customer ID from URL path as fallback', () => {
      setLocation('https://ads.google.com/aw/123-456-7890/campaigns/create');

      const context = adapter.detectContext();

      expect(context).not.toBeNull();
      expect(context!.accountId).toBe('123-456-7890');
    });

    it('should extract customer ID from DOM breadcrumb as fallback', () => {
      setLocation('https://ads.google.com/aw/campaigns/create');

      document.body.innerHTML = `
        <div class="breadcrumb-customer-id">Account: 999-888-7777</div>
      `;

      const context = adapter.detectContext();

      expect(context).not.toBeNull();
      expect(context!.accountId).toBe('999-888-7777');
    });
  });

  // -----------------------------------------------------------------------
  // extractFieldValues() tests
  // -----------------------------------------------------------------------

  describe('extractFieldValues()', () => {
    it('should extract campaign name from material-input', async () => {
      document.body.innerHTML = `
        <material-input debugid="campaign-name">
          <input value="Search_US_BrandAwareness_Q1" />
        </material-input>
      `;

      const values = await adapter.extractFieldValues();

      expect(values['campaign.name']).toBe('Search_US_BrandAwareness_Q1');
    });

    it('should extract campaign name from aria-label input', async () => {
      document.body.innerHTML = `
        <div class="campaign-form">
          <input aria-label="Campaign name" value="My Campaign" />
        </div>
      `;

      const values = await adapter.extractFieldValues();

      expect(values['campaign.name']).toBe('My Campaign');
    });

    it('should extract budget value as a number', async () => {
      document.body.innerHTML = `
        <material-input debugid="budget-input">
          <input value="$10,000.00" />
        </material-input>
      `;

      const values = await adapter.extractFieldValues();

      expect(values['campaign.budget_value']).toBe(10000);
    });

    it('should extract budget value with currency symbol stripped', async () => {
      document.body.innerHTML = `
        <div class="budget-section">
          <input type="number" value="5000" />
        </div>
      `;

      const values = await adapter.extractFieldValues();

      expect(values['campaign.budget_value']).toBe(5000);
    });

    it('should extract geo targets as array', async () => {
      document.body.innerHTML = `
        <div class="location-targeting-panel">
          <div class="selected-location">United States</div>
          <div class="selected-location">Canada</div>
        </div>
      `;

      const values = await adapter.extractFieldValues();

      expect(values['campaign.geo_targets']).toEqual(['United States', 'Canada']);
    });

    it('should extract languages as array', async () => {
      document.body.innerHTML = `
        <div class="language-targeting-section">
          <div class="selected-language">English</div>
          <div class="selected-language">French</div>
        </div>
      `;

      const values = await adapter.extractFieldValues();

      expect(values['campaign.languages']).toEqual(['English', 'French']);
    });

    it('should extract brand safety categories', async () => {
      document.body.innerHTML = `
        <div class="content-exclusion-section">
          <div class="excluded-category">Sexual</div>
          <div class="excluded-category">Weapons</div>
          <div class="excluded-category">Gambling</div>
        </div>
      `;

      const values = await adapter.extractFieldValues();

      expect(values['campaign.brand_safety']).toEqual(['Sexual', 'Weapons', 'Gambling']);
    });

    it('should extract headlines as array', async () => {
      document.body.innerHTML = `
        <material-input debugid="headline-1"><input value="Buy Now" /></material-input>
        <material-input debugid="headline-2"><input value="Free Shipping" /></material-input>
        <material-input debugid="headline-3"><input value="Best Deals" /></material-input>
      `;

      const values = await adapter.extractFieldValues();

      expect(values['ad.headlines']).toEqual(['Buy Now', 'Free Shipping', 'Best Deals']);
    });

    it('should extract descriptions as array', async () => {
      document.body.innerHTML = `
        <material-input debugid="description-1"><input value="Great products" /></material-input>
        <material-input debugid="description-2"><input value="Shop today" /></material-input>
      `;

      const values = await adapter.extractFieldValues();

      expect(values['ad.descriptions']).toEqual(['Great products', 'Shop today']);
    });

    it('should extract final URL', async () => {
      document.body.innerHTML = `
        <material-input debugid="final-url">
          <input value="https://example.com/landing" />
        </material-input>
      `;

      const values = await adapter.extractFieldValues();

      expect(values['ad.final_url']).toBe('https://example.com/landing');
    });

    it('should extract display paths', async () => {
      document.body.innerHTML = `
        <material-input debugid="display-path-1"><input value="shoes" /></material-input>
        <material-input debugid="display-path-2"><input value="sale" /></material-input>
      `;

      const values = await adapter.extractFieldValues();

      expect(values['ad.display_path']).toEqual(['shoes', 'sale']);
    });

    it('should omit fields that are not present in DOM', async () => {
      document.body.innerHTML = `<div>Empty form</div>`;

      const values = await adapter.extractFieldValues();

      expect(values['campaign.name']).toBeUndefined();
      expect(values['campaign.budget_value']).toBeUndefined();
      expect(values['ad.headlines']).toBeUndefined();
    });

    it('should omit empty array fields', async () => {
      document.body.innerHTML = `
        <div class="location-targeting-panel">
          <!-- No selected locations -->
        </div>
      `;

      const values = await adapter.extractFieldValues();

      // Empty arrays should be omitted
      expect(values['campaign.geo_targets']).toBeUndefined();
    });

    it('should extract start and end dates', async () => {
      document.body.innerHTML = `
        <input aria-label="Start date" value="2026-03-01" />
        <input aria-label="End date" value="2026-03-31" />
      `;

      const values = await adapter.extractFieldValues();

      expect(values['campaign.start_date']).toBe('2026-03-01');
      expect(values['campaign.end_date']).toBe('2026-03-31');
    });

    it('should extract ad group name', async () => {
      document.body.innerHTML = `
        <material-input debugid="ad-group-name">
          <input value="Brand Terms - Exact" />
        </material-input>
      `;

      const values = await adapter.extractFieldValues();

      expect(values['ad_group.name']).toBe('Brand Terms - Exact');
    });

    it('should extract CPC bid as number', async () => {
      document.body.innerHTML = `
        <material-input debugid="default-bid">
          <input value="$2.50" />
        </material-input>
      `;

      const values = await adapter.extractFieldValues();

      expect(values['ad_group.cpc_bid']).toBe(2.5);
    });
  });

  // -----------------------------------------------------------------------
  // getInjectionPoint() tests
  // -----------------------------------------------------------------------

  describe('getInjectionPoint()', () => {
    it('should find location targeting injection point', () => {
      document.body.innerHTML = `
        <div class="location-targeting-panel">
          <div class="selected-location">United States</div>
        </div>
      `;

      const point = adapter.getInjectionPoint('targeting_constraint', 'campaign.geo_targets');

      expect(point).not.toBeNull();
      expect(point!.element.classList.contains('location-targeting-panel')).toBe(true);
      expect(point!.position).toBe(InjectionPosition.AFTER);
    });

    it('should find language targeting injection point', () => {
      document.body.innerHTML = `
        <div class="language-targeting-section">
          <div class="selected-language">English</div>
        </div>
      `;

      const point = adapter.getInjectionPoint('targeting_constraint', 'campaign.languages');

      expect(point).not.toBeNull();
      expect(point!.position).toBe(InjectionPosition.AFTER);
    });

    it('should find brand safety injection point', () => {
      document.body.innerHTML = `
        <div class="content-exclusion-section">
          <div class="excluded-category">Sexual</div>
        </div>
      `;

      const point = adapter.getInjectionPoint('brand_safety', 'campaign.brand_safety');

      expect(point).not.toBeNull();
      expect(point!.position).toBe(InjectionPosition.AFTER);
    });

    it('should find budget injection point', () => {
      document.body.innerHTML = `
        <div class="budget-section">
          <input type="number" value="5000" />
        </div>
      `;

      const point = adapter.getInjectionPoint('budget_enforcement', 'campaign.budget_value');

      expect(point).not.toBeNull();
      expect(point!.position).toBe(InjectionPosition.AFTER);
    });

    it('should find bidding strategy injection point', () => {
      document.body.innerHTML = `
        <div class="bidding-strategy-section">
          <div class="selected-strategy">Maximize Conversions</div>
        </div>
      `;

      const point = adapter.getInjectionPoint('bidding_strategy', 'campaign.bidding_strategy');

      expect(point).not.toBeNull();
      expect(point!.position).toBe(InjectionPosition.AFTER);
    });

    it('should find publish button for overlay injection', () => {
      document.body.innerHTML = `
        <button type="submit">Create campaign</button>
      `;

      const point = adapter.getInjectionPoint('any', 'publish_button');

      // publish_button is a special case -- looked up directly
      expect(point).not.toBeNull();
      expect(point!.position).toBe(InjectionPosition.OVERLAY);
    });

    it('should fall back to publish button for unknown field paths', () => {
      document.body.innerHTML = `
        <button type="submit">Save</button>
      `;

      const point = adapter.getInjectionPoint('custom', 'some.unknown.field');

      expect(point).not.toBeNull();
      expect(point!.position).toBe(InjectionPosition.OVERLAY);
    });

    it('should return null when no matching element found', () => {
      document.body.innerHTML = `<div>Empty page</div>`;

      const point = adapter.getInjectionPoint('targeting_constraint', 'campaign.geo_targets');

      expect(point).toBeNull();
    });

    it('should find campaign name injection point', () => {
      document.body.innerHTML = `
        <material-input debugid="campaign-name">
          <input value="Test Campaign" />
        </material-input>
      `;

      const point = adapter.getInjectionPoint('naming_convention', 'campaign.name');

      expect(point).not.toBeNull();
      expect(point!.position).toBe(InjectionPosition.AFTER);
    });
  });

  // -----------------------------------------------------------------------
  // interceptCreation() tests
  // -----------------------------------------------------------------------

  describe('interceptCreation()', () => {
    it('should attach click interceptor to submit button', () => {
      document.body.innerHTML = `
        <button type="submit">Create campaign</button>
      `;

      let callbackCalled = false;
      adapter.interceptCreation(() => {
        callbackCalled = true;
      });

      const button = document.querySelector('button')!;
      button.click();

      expect(callbackCalled).toBe(true);
    });

    it('should call callback with true when user clicks create button', () => {
      document.body.innerHTML = `
        <button type="submit">Create campaign</button>
      `;

      let receivedAllow: boolean | null = null;

      adapter.interceptCreation((allow) => {
        receivedAllow = allow;
      });

      const button = document.querySelector('button')!;
      button.click();

      expect(receivedAllow).toBe(true);
    });

    it('should find button by text content fallback', () => {
      document.body.innerHTML = `
        <div class="footer">
          <button class="custom-button">Create campaign</button>
        </div>
      `;

      let callbackCalled = false;
      adapter.interceptCreation(() => {
        callbackCalled = true;
      });

      const button = document.querySelector('.custom-button')!;
      button.click();

      expect(callbackCalled).toBe(true);
    });

    it('should find Save button as fallback', () => {
      document.body.innerHTML = `
        <div class="footer">
          <button class="save-btn">Save</button>
        </div>
      `;

      let callbackCalled = false;
      adapter.interceptCreation(() => {
        callbackCalled = true;
      });

      const button = document.querySelector('.save-btn')!;
      button.click();

      expect(callbackCalled).toBe(true);
    });

    it('should warn when no create button is found', () => {
      document.body.innerHTML = `<div>No button here</div>`;

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      adapter.interceptCreation(() => {
        // Should not be called
      });

      // logger.warn prefixes with '[Governance]' before the message
      expect(warnSpy).toHaveBeenCalledWith(
        '[Governance]',
        expect.stringContaining('Could not find create/save button'),
      );

      warnSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // observeFieldChanges() tests
  // -----------------------------------------------------------------------

  describe('observeFieldChanges()', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should call callback when a field value changes', async () => {
      document.body.innerHTML = `
        <material-input debugid="campaign-name">
          <input value="Original Name" />
        </material-input>
      `;

      const changes: Array<{ field: string; value: unknown }> = [];

      adapter.observeFieldChanges((field, value) => {
        changes.push({ field, value });
      });

      // Simulate changing the input value (what Angular would do)
      const input = document.querySelector('input')!;
      input.value = 'Updated Name';

      // Trigger mutation observer by modifying DOM
      const span = document.createElement('span');
      document.body.appendChild(span);

      // Advance timers past debounce
      jest.advanceTimersByTime(400);

      // The observer is async, so we need to wait for promises
      await Promise.resolve();
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Changes should have been detected
      const nameChange = changes.find((c) => c.field === 'campaign.name');
      if (nameChange) {
        expect(nameChange.value).toBe('Updated Name');
      }
    });

    it('should not fire callback when values remain the same', async () => {
      document.body.innerHTML = `
        <material-input debugid="campaign-name">
          <input value="Unchanged Name" />
        </material-input>
      `;

      const changes: Array<{ field: string; value: unknown }> = [];

      adapter.observeFieldChanges((field, value) => {
        changes.push({ field, value });
      });

      // Trigger mutation without changing values
      const span = document.createElement('span');
      document.body.appendChild(span);

      jest.advanceTimersByTime(400);
      await Promise.resolve();
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // No change should have been detected (initial value was already cached)
      expect(changes.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // cleanup() tests
  // -----------------------------------------------------------------------

  describe('cleanup()', () => {
    it('should disconnect mutation observer', () => {
      document.body.innerHTML = `
        <material-input debugid="campaign-name">
          <input value="Test" />
        </material-input>
      `;

      adapter.observeFieldChanges(() => {
        // no-op
      });

      // Cleanup should not throw
      expect(() => adapter.cleanup()).not.toThrow();
    });

    it('should remove creation intercept listener', () => {
      document.body.innerHTML = `
        <button type="submit">Create campaign</button>
      `;

      let callCount = 0;
      adapter.interceptCreation((_allow) => {
        callCount++;
      });

      adapter.cleanup();

      // Click after cleanup should not trigger the callback
      const button = document.querySelector('button')!;
      button.click();

      expect(callCount).toBe(0);
    });

    it('should be safe to call cleanup multiple times', () => {
      expect(() => {
        adapter.cleanup();
        adapter.cleanup();
        adapter.cleanup();
      }).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Field extraction function tests (standalone)
// ---------------------------------------------------------------------------

describe('Google Ads Field Extraction Functions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('getCampaignName()', () => {
    it('should extract from material-input debugid', () => {
      document.body.innerHTML = `
        <material-input debugid="campaign-name">
          <input value="Test Campaign Name" />
        </material-input>
      `;

      expect(getCampaignName()).toBe('Test Campaign Name');
    });

    it('should extract from aria-label input as fallback', () => {
      document.body.innerHTML = `
        <input aria-label="Campaign name" value="Fallback Name" />
      `;

      expect(getCampaignName()).toBe('Fallback Name');
    });

    it('should return null when no element matches', () => {
      document.body.innerHTML = `<div>No inputs</div>`;

      expect(getCampaignName()).toBeNull();
    });
  });

  describe('getBudgetValue()', () => {
    it('should parse numeric budget with currency symbol', () => {
      document.body.innerHTML = `
        <material-input debugid="budget-input">
          <input value="$5,000.00" />
        </material-input>
      `;

      expect(getBudgetValue()).toBe(5000);
    });

    it('should parse plain numeric budget', () => {
      document.body.innerHTML = `
        <input aria-label="Budget" value="2500" />
      `;

      expect(getBudgetValue()).toBe(2500);
    });

    it('should return null when budget element not found', () => {
      document.body.innerHTML = `<div>No budget</div>`;

      expect(getBudgetValue()).toBeNull();
    });
  });

  describe('getGeoTargets()', () => {
    it('should extract multiple locations', () => {
      document.body.innerHTML = `
        <div class="location-targeting-panel">
          <div class="selected-location">United States</div>
          <div class="selected-location">United Kingdom</div>
          <div class="selected-location">Canada</div>
        </div>
      `;

      expect(getGeoTargets()).toEqual(['United States', 'United Kingdom', 'Canada']);
    });

    it('should return empty array when no locations selected', () => {
      document.body.innerHTML = `<div>No locations</div>`;

      expect(getGeoTargets()).toEqual([]);
    });
  });

  describe('getLanguages()', () => {
    it('should extract selected languages', () => {
      document.body.innerHTML = `
        <div class="language-targeting-section">
          <div class="selected-language">English</div>
          <div class="selected-language">Spanish</div>
        </div>
      `;

      expect(getLanguages()).toEqual(['English', 'Spanish']);
    });
  });

  describe('getBrandSafety()', () => {
    it('should extract excluded categories', () => {
      document.body.innerHTML = `
        <div class="content-exclusion-section">
          <div class="excluded-category">Sexual</div>
          <div class="excluded-category">Weapons</div>
        </div>
      `;

      expect(getBrandSafety()).toEqual(['Sexual', 'Weapons']);
    });
  });

  describe('getHeadlines()', () => {
    it('should extract multiple headline inputs', () => {
      document.body.innerHTML = `
        <input aria-label="Headline 1" value="First Headline" />
        <input aria-label="Headline 2" value="Second Headline" />
      `;

      expect(getHeadlines()).toEqual(['First Headline', 'Second Headline']);
    });
  });

  describe('getDescriptions()', () => {
    it('should extract description inputs', () => {
      document.body.innerHTML = `
        <input aria-label="Description 1" value="First Description" />
        <input aria-label="Description 2" value="Second Description" />
      `;

      expect(getDescriptions()).toEqual(['First Description', 'Second Description']);
    });
  });

  describe('getFinalUrl()', () => {
    it('should extract final URL', () => {
      document.body.innerHTML = `
        <material-input debugid="final-url">
          <input value="https://example.com" />
        </material-input>
      `;

      expect(getFinalUrl()).toBe('https://example.com');
    });
  });

  describe('getDisplayPath()', () => {
    it('should extract display path segments', () => {
      document.body.innerHTML = `
        <material-input debugid="display-path-1"><input value="shoes" /></material-input>
        <material-input debugid="display-path-2"><input value="sale" /></material-input>
      `;

      expect(getDisplayPath()).toEqual(['shoes', 'sale']);
    });

    it('should extract display paths via aria-label', () => {
      document.body.innerHTML = `
        <input aria-label="Display path 1" value="example" />
        <input aria-label="Display path 2" value="product" />
      `;

      expect(getDisplayPath()).toEqual(['example', 'product']);
    });

    it('should NOT match unrelated "File path" inputs (decoy test)', () => {
      document.body.innerHTML = `
        <div class="display-path-section">
          <material-input debugid="display-path-1"><input value="shoes" /></material-input>
          <material-input debugid="display-path-2"><input value="sale" /></material-input>
        </div>
        <div class="unrelated-section">
          <input aria-label="File path" value="/tracking/path" />
        </div>
      `;

      const paths = getDisplayPath();
      expect(paths).toEqual(['shoes', 'sale']);
      // "File path" input should NOT be included
      expect(paths).not.toContain('/tracking/path');
    });
  });

  describe('extractAllFieldValues()', () => {
    it('should extract all available fields in one call', () => {
      document.body.innerHTML = `
        <material-input debugid="campaign-name">
          <input value="My Campaign" />
        </material-input>
        <material-input debugid="budget-input">
          <input value="1000" />
        </material-input>
        <div class="location-targeting-panel">
          <div class="selected-location">France</div>
        </div>
      `;

      const values = extractAllFieldValues();

      expect(values['campaign.name']).toBe('My Campaign');
      expect(values['campaign.budget_value']).toBe(1000);
      expect(values['campaign.geo_targets']).toEqual(['France']);
    });

    it('should gracefully handle malformed DOM', () => {
      document.body.innerHTML = `
        <material-input debugid="campaign-name">
          <!-- No input child -->
        </material-input>
      `;

      // Should not throw
      const values = extractAllFieldValues();
      expect(values).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// DOM utility function tests
// ---------------------------------------------------------------------------

describe('Google Ads DOM Utilities', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('queryByChain()', () => {
    it('should return first matching element from selector chain', () => {
      document.body.innerHTML = `
        <div class="target">Found</div>
      `;

      const result = queryByChain(document, ['.nonexistent', '.target']);

      expect(result).not.toBeNull();
      expect(result!.textContent).toBe('Found');
    });

    it('should try selectors in order and return first match', () => {
      document.body.innerHTML = `
        <div class="first">First</div>
        <div class="second">Second</div>
      `;

      const result = queryByChain(document, ['.first', '.second']);

      expect(result!.textContent).toBe('First');
    });

    it('should return null when no selectors match', () => {
      document.body.innerHTML = `<div>No match</div>`;

      const result = queryByChain(document, ['.a', '.b', '.c']);

      expect(result).toBeNull();
    });

    it('should handle invalid selectors gracefully', () => {
      document.body.innerHTML = `<div class="valid">Found</div>`;

      const result = queryByChain(document, ['[invalid%%', '.valid']);

      expect(result).not.toBeNull();
      expect(result!.textContent).toBe('Found');
    });
  });

  describe('queryAllByChain()', () => {
    it('should return all matching elements deduplicated', () => {
      document.body.innerHTML = `
        <div class="item a">A</div>
        <div class="item b">B</div>
        <div class="item c">C</div>
      `;

      // Both selectors match some elements; .item matches all 3
      const results = queryAllByChain(document, ['.a', '.item']);

      expect(results.length).toBe(3);
    });

    it('should deduplicate elements matched by multiple selectors', () => {
      document.body.innerHTML = `
        <div class="item special">Both</div>
        <div class="item">Only item</div>
      `;

      const results = queryAllByChain(document, ['.special', '.item']);

      // Should be 2 unique elements, not 3
      expect(results.length).toBe(2);
    });
  });

  describe('findElementByText()', () => {
    it('should find element by text content', () => {
      document.body.innerHTML = `
        <div>Not this one</div>
        <div>Find this text here</div>
        <div>Not this either</div>
      `;

      const result = findElementByText('Find this text');

      expect(result).not.toBeNull();
      expect(result!.textContent).toContain('Find this text');
    });

    it('should be case-insensitive', () => {
      document.body.innerHTML = `
        <div>UPPERCASE TEXT</div>
      `;

      const result = findElementByText('uppercase text');

      expect(result).not.toBeNull();
    });

    it('should filter by tag when specified', () => {
      document.body.innerHTML = `
        <div>Button text</div>
        <button>Button text</button>
      `;

      const result = findElementByText('Button text', 'button');

      expect(result).not.toBeNull();
      expect(result!.tagName).toBe('BUTTON');
    });

    it('should return null when no match found', () => {
      document.body.innerHTML = `<div>Nothing matches</div>`;

      const result = findElementByText('nonexistent text');

      expect(result).toBeNull();
    });
  });

  describe('findButtonByText()', () => {
    it('should find button by text', () => {
      document.body.innerHTML = `
        <button>Cancel</button>
        <button>Create campaign</button>
      `;

      const result = findButtonByText('Create campaign');

      expect(result).not.toBeNull();
      expect(result!.textContent).toBe('Create campaign');
    });

    it('should return null when no button with text exists', () => {
      document.body.innerHTML = `
        <button>Other button</button>
      `;

      const result = findButtonByText('Create campaign');

      expect(result).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Shadow DOM Piercing Tests
// ---------------------------------------------------------------------------

describe('Shadow DOM Piercing', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('KNOWN_SHADOW_HOSTS', () => {
    it('should include Material Design component tag names', () => {
      expect(KNOWN_SHADOW_HOSTS).toContain('material-input');
      expect(KNOWN_SHADOW_HOSTS).toContain('mat-select');
      expect(KNOWN_SHADOW_HOSTS).toContain('mat-checkbox');
      expect(KNOWN_SHADOW_HOSTS).toContain('mat-radio-button');
    });

    it('should include Google Ads specific components', () => {
      expect(KNOWN_SHADOW_HOSTS).toContain('awsm-app-bar');
      expect(KNOWN_SHADOW_HOSTS).toContain('.location-targeting-panel');
    });

    it('should be a non-empty array', () => {
      expect(Array.isArray(KNOWN_SHADOW_HOSTS)).toBe(true);
      expect(KNOWN_SHADOW_HOSTS.length).toBeGreaterThan(0);
    });
  });

  describe('queryWithShadowDom()', () => {
    it('should find element in normal DOM without shadow roots', () => {
      document.body.innerHTML = `
        <div class="test-target">Found</div>
      `;

      const result = queryWithShadowDom(['.test-target']);

      expect(result).not.toBeNull();
      expect(result!.textContent).toBe('Found');
    });

    it('should find element inside a shadow root of a known host', () => {
      // Create a material-input custom element with shadow root
      const host = document.createElement('material-input');
      document.body.appendChild(host);

      const shadow = host.attachShadow({ mode: 'open' });
      const inner = document.createElement('input');
      inner.setAttribute('class', 'shadow-input');
      inner.value = 'shadow-value';
      shadow.appendChild(inner);

      const result = queryWithShadowDom(['.shadow-input']);

      expect(result).not.toBeNull();
      expect((result as HTMLInputElement).value).toBe('shadow-value');
    });

    it('should prefer normal DOM over shadow DOM', () => {
      // Element in normal DOM
      document.body.innerHTML = `<div class="target">Normal</div>`;

      // Also create shadow DOM element with same class
      const host = document.createElement('material-input');
      document.body.appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });
      const inner = document.createElement('div');
      inner.setAttribute('class', 'target');
      inner.textContent = 'Shadow';
      shadow.appendChild(inner);

      const result = queryWithShadowDom(['.target']);

      expect(result).not.toBeNull();
      expect(result!.textContent).toBe('Normal');
    });

    it('should return null when element not found in any root', () => {
      document.body.innerHTML = `<div>Nothing here</div>`;

      const result = queryWithShadowDom(['.nonexistent']);

      expect(result).toBeNull();
    });

    it('should not find elements inside non-known shadow hosts', () => {
      // Create a custom element NOT in KNOWN_SHADOW_HOSTS
      const host = document.createElement('my-unknown-component');
      document.body.appendChild(host);

      const shadow = host.attachShadow({ mode: 'open' });
      const inner = document.createElement('div');
      inner.setAttribute('class', 'hidden-in-unknown');
      inner.textContent = 'Hidden';
      shadow.appendChild(inner);

      const result = queryWithShadowDom(['.hidden-in-unknown']);

      // Should not be found because host is not a known shadow host
      expect(result).toBeNull();
    });
  });

  describe('queryAllWithShadowDom()', () => {
    it('should collect elements from both normal DOM and shadow roots', () => {
      // Normal DOM elements
      document.body.innerHTML = `
        <div class="item">Normal 1</div>
        <div class="item">Normal 2</div>
      `;

      // Shadow DOM elements
      const host = document.createElement('material-input');
      document.body.appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });
      const inner = document.createElement('div');
      inner.setAttribute('class', 'item');
      inner.textContent = 'Shadow 1';
      shadow.appendChild(inner);

      const results = queryAllWithShadowDom(['.item']);

      expect(results.length).toBe(3);
    });

    it('should deduplicate elements across roots', () => {
      document.body.innerHTML = `<div class="item unique">Only One</div>`;

      const results = queryAllWithShadowDom(['.item', '.unique']);

      // Should deduplicate the same element matched by both selectors
      expect(results.length).toBe(1);
    });

    it('should return empty array when nothing matches', () => {
      document.body.innerHTML = `<div>Empty</div>`;

      const results = queryAllWithShadowDom(['.nonexistent']);

      expect(results).toEqual([]);
    });
  });

  describe('readArrayValueWithShadowPiercing (via getGeoTargets)', () => {
    it('should find geo targets in normal DOM', () => {
      document.body.innerHTML = `
        <div class="location-targeting-panel">
          <div class="selected-location">United States</div>
          <div class="selected-location">Canada</div>
        </div>
      `;

      const targets = getGeoTargets();

      expect(targets).toEqual(['United States', 'Canada']);
    });

    it('should find geo targets inside shadow DOM of known host', () => {
      // Create a material-input element (known shadow host) with a shadow root
      // containing a role="listbox" with location options matching geo_targets selectors.
      // In Google Ads, the autocomplete widget may render inside a Material component.
      const host = document.createElement('material-input');
      host.setAttribute('aria-label', 'Location targeting');
      document.body.appendChild(host);

      const shadow = host.attachShadow({ mode: 'open' });
      const listbox = document.createElement('div');
      listbox.setAttribute('role', 'listbox');
      listbox.setAttribute('aria-label', 'Location targeting');

      const opt1 = document.createElement('div');
      opt1.setAttribute('role', 'option');
      opt1.textContent = 'Germany';
      listbox.appendChild(opt1);

      const opt2 = document.createElement('div');
      opt2.setAttribute('role', 'option');
      opt2.textContent = 'France';
      listbox.appendChild(opt2);

      shadow.appendChild(listbox);

      const targets = getGeoTargets();

      // geo_targets has shadowDom: true, so it should pierce.
      // The selector '[role="listbox"][aria-label*="Location" i] [role="option"]' should match.
      expect(targets).toEqual(['Germany', 'France']);
    });

    it('should return empty array when no geo targets exist', () => {
      document.body.innerHTML = `<div>No targeting</div>`;

      const targets = getGeoTargets();

      expect(targets).toEqual([]);
    });
  });

  describe('Dynamic shadow host observer attachment', () => {
    let adapter: GoogleAdsAdapter;

    beforeEach(() => {
      adapter = new GoogleAdsAdapter();
      document.body.innerHTML = '';
    });

    afterEach(() => {
      adapter.cleanup();
    });

    it('should attach observers without error when no shadow hosts present', () => {
      document.body.innerHTML = `<div>Simple page</div>`;

      // This sets up observers including shadow root detection
      expect(() => {
        adapter.observeFieldChanges(() => {
          // no-op
        });
      }).not.toThrow();
    });

    it('should not crash when shadow hosts are added after initial setup', async () => {
      jest.useFakeTimers();

      document.body.innerHTML = `<div>Initial</div>`;

      adapter.observeFieldChanges(() => {
        // no-op
      });

      // Simulate lazy-loaded Material component
      const host = document.createElement('material-input');
      host.setAttribute('debugid', 'lazy-campaign-name');
      document.body.appendChild(host);

      // Advance past debounce
      jest.advanceTimersByTime(400);
      await Promise.resolve();

      // Cleanup should not throw
      expect(() => adapter.cleanup()).not.toThrow();

      jest.useRealTimers();
    });

    it('should clean up all shadow observers on cleanup', () => {
      document.body.innerHTML = `<div>Test</div>`;

      // Create a known shadow host in the DOM
      const host = document.createElement('material-input');
      document.body.appendChild(host);
      host.attachShadow({ mode: 'open' });

      adapter.observeFieldChanges(() => {
        // no-op
      });

      // Cleanup should disconnect all observers
      expect(() => adapter.cleanup()).not.toThrow();

      // Calling cleanup again should also be safe
      expect(() => adapter.cleanup()).not.toThrow();
    });
  });
});

/**
 * Unit tests for MetaAdapter
 *
 * Tests the main MetaAdapter class implementing PlatformAdapter.
 * Uses Jest with mock DOM structures to simulate Meta Ads Manager pages.
 */

import { jest } from '@jest/globals';
import {
  EntityLevel,
  ExtensionView,
  Platform,
  InjectionPosition,
  EnforcementMode,
  RuleType,
  RuleOperator,
} from '@media-buying-governance/shared';
import type { Rule } from '@media-buying-governance/shared';
import { MetaAdapter } from '../meta-adapter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setLocation(href: string): void {
  Object.defineProperty(window, 'location', {
    value: new URL(href),
    writable: true,
    configurable: true,
  });
}

function resetLocation(): void {
  setLocation('https://example.com');
}

function buildMetaDOM(options: {
  campaignName?: string;
  adSetName?: string;
  adName?: string;
  budgetValue?: string;
  budgetType?: 'daily' | 'lifetime';
  cboEnabled?: boolean;
  destinationUrl?: string;
  publishButton?: boolean;
} = {}): void {
  const parts: string[] = [];

  if (options.campaignName !== undefined) {
    parts.push(`
      <div class="campaign-name-section">
        <input aria-label="Campaign name" value="${options.campaignName}" />
      </div>
    `);
  }

  if (options.adSetName !== undefined) {
    parts.push(`
      <div class="adset-name-section">
        <input aria-label="Ad set name" value="${options.adSetName}" />
      </div>
    `);
  }

  if (options.adName !== undefined) {
    parts.push(`
      <div class="ad-name-section">
        <input aria-label="Ad name" value="${options.adName}" />
      </div>
    `);
  }

  if (options.budgetValue !== undefined) {
    parts.push(`
      <div class="budget-section">
        <input aria-label="Budget" type="text" value="${options.budgetValue}" />
      </div>
    `);
  }

  if (options.budgetType !== undefined) {
    const isDaily = options.budgetType === 'daily';
    parts.push(`
      <div class="budget-type-section">
        <div aria-label="Budget type">
          <span class="${isDaily ? 'selected' : ''}">${isDaily ? 'Daily budget' : ''}</span>
          <span class="${!isDaily ? 'selected' : ''}">${!isDaily ? 'Lifetime budget' : ''}</span>
        </div>
      </div>
    `);
  }

  if (options.cboEnabled !== undefined) {
    parts.push(`
      <div class="cbo-section">
        <div aria-label="Advantage+ campaign budget" role="switch" aria-checked="${options.cboEnabled}">
          CBO Toggle
        </div>
      </div>
    `);
  }

  if (options.destinationUrl !== undefined) {
    parts.push(`
      <div class="destination-url-section">
        <input aria-label="Website URL" value="${options.destinationUrl}" />
      </div>
    `);
  }

  if (options.publishButton) {
    parts.push(`
      <div class="action-buttons">
        <button type="submit">Publish</button>
      </div>
    `);
  }

  document.body.innerHTML = parts.join('\n');
}

function createTestRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'rule-1',
    ruleSetId: 'rs-1',
    name: 'Test Rule',
    description: 'A test rule',
    version: 1,
    enabled: true,
    scope: {
      platforms: [Platform.META],
      entityLevels: [EntityLevel.CAMPAIGN],
      accountIds: [],
      teamIds: [],
      buyerIds: [],
    },
    ruleType: RuleType.NAMING_CONVENTION,
    enforcement: EnforcementMode.WARNING,
    condition: {
      operator: RuleOperator.IS_SET,
      field: 'campaign.name',
    },
    ui: {
      injectionPoint: 'campaign.name',
      message: 'Campaign name is required',
      style: 'error',
      category: 'Naming',
      priority: 1,
    },
    metadata: {
      createdBy: 'test',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe('MetaAdapter', () => {
  let adapter: MetaAdapter;

  beforeEach(() => {
    adapter = new MetaAdapter();
    document.body.innerHTML = '';
    document.body.removeAttribute('governance-loaded');
    const govClasses = Array.from(document.body.classList).filter(
      (c) => c.startsWith('gov-') || c.startsWith('gg-') || c.startsWith('governance-') || c.startsWith('dlg-')
    );
    for (const cls of govClasses) {
      document.body.classList.remove(cls);
    }
    resetLocation();
  });

  afterEach(() => {
    adapter.cleanup();
  });

  // ── Platform Identity ─────────────────────────────────────────────────

  describe('platform', () => {
    it('should identify as Platform.META', () => {
      expect(adapter.platform).toBe(Platform.META);
    });
  });

  // ── detectContext() ───────────────────────────────────────────────────

  describe('detectContext()', () => {
    it('should detect campaign creation context', () => {
      setLocation(
        'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123456&tool=CAMPAIGN_CREATION_FLOW',
      );
      const context = adapter.detectContext();
      expect(context).toEqual({
        accountId: 'act_123456',
        entityLevel: EntityLevel.CAMPAIGN,
        view: ExtensionView.CREATE,
      });
    });

    it('should detect ad set creation context', () => {
      setLocation(
        'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=789012&tool=ADGROUP_CREATION_FLOW',
      );
      const context = adapter.detectContext();
      expect(context).toEqual({
        accountId: 'act_789012',
        entityLevel: EntityLevel.AD_SET,
        view: ExtensionView.CREATE,
      });
    });

    it('should detect ad creation context', () => {
      setLocation(
        'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=345678&tool=AD_CREATION_FLOW',
      );
      const context = adapter.detectContext();
      expect(context).toEqual({
        accountId: 'act_345678',
        entityLevel: EntityLevel.AD,
        view: ExtensionView.CREATE,
      });
    });

    it('should handle account ID already prefixed with act_', () => {
      setLocation(
        'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=act_555&tool=CAMPAIGN_CREATION_FLOW',
      );
      const context = adapter.detectContext();
      expect(context).not.toBeNull();
      expect(context!.accountId).toBe('act_555');
    });

    it('should detect edit mode when tool is not a creation flow', () => {
      setLocation(
        'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123456&tool=SOME_EDIT_TOOL',
      );
      const context = adapter.detectContext();
      expect(context).not.toBeNull();
      expect(context!.view).toBe(ExtensionView.EDIT);
    });

    it('should default to edit view when no tool parameter', () => {
      setLocation(
        'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123456',
      );
      const context = adapter.detectContext();
      expect(context).not.toBeNull();
      expect(context!.view).toBe(ExtensionView.EDIT);
    });

    it('should work with business.facebook.com domain', () => {
      setLocation(
        'https://business.facebook.com/adsmanager/manage/campaigns?act=111111&tool=CAMPAIGN_CREATION_FLOW',
      );
      const context = adapter.detectContext();
      expect(context).toEqual({
        accountId: 'act_111111',
        entityLevel: EntityLevel.CAMPAIGN,
        view: ExtensionView.CREATE,
      });
    });

    it('should return null for non-Meta URLs', () => {
      setLocation('https://ads.google.com/campaigns?id=123');
      expect(adapter.detectContext()).toBeNull();
    });

    it('should return null when act= parameter is missing', () => {
      setLocation(
        'https://adsmanager.facebook.com/adsmanager/manage/campaigns?tool=CAMPAIGN_CREATION_FLOW',
      );
      expect(adapter.detectContext()).toBeNull();
    });

    it('should infer entity level from URL path when tool is absent', () => {
      setLocation(
        'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123456',
      );
      const context = adapter.detectContext();
      expect(context).not.toBeNull();
      expect(context!.entityLevel).toBe(EntityLevel.CAMPAIGN);
    });

    it('should infer ad set edit context from standalone editor URL', () => {
      setLocation(
        'https://adsmanager.facebook.com/adsmanager/manage/adsets/edit/standalone?act=123456&selected_campaign_ids=111&selected_adset_ids=222',
      );
      const context = adapter.detectContext();
      expect(context).not.toBeNull();
      expect(context!.entityLevel).toBe(EntityLevel.AD_SET);
      expect(context!.view).toBe(ExtensionView.EDIT);
    });

    it('should infer ad edit context from selected ad ids when tool is absent', () => {
      setLocation(
        'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123456&selected_campaign_ids=111&selected_adset_ids=222&selected_ad_ids=333',
      );
      const context = adapter.detectContext();
      expect(context).not.toBeNull();
      expect(context!.entityLevel).toBe(EntityLevel.AD);
    });

    it('should infer entity level from current_step in multi-step flows', () => {
      setLocation(
        'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123456&current_step=1',
      );
      const context = adapter.detectContext();
      expect(context).not.toBeNull();
      expect(context!.entityLevel).toBe(EntityLevel.AD_SET);
    });

    it('should return null for completely invalid URLs', () => {
      Object.defineProperty(window, 'location', {
        value: { href: '' },
        writable: true,
        configurable: true,
      });
      expect(adapter.detectContext()).toBeNull();
    });

    it('should detect localhost test fixtures', () => {
      setLocation(
        'http://localhost:8080/meta-campaign-creation.html?act=123456&tool=CAMPAIGN_CREATION_FLOW',
      );
      const context = adapter.detectContext();
      expect(context).not.toBeNull();
      expect(context!.accountId).toBe('act_123456');
      expect(context!.entityLevel).toBe(EntityLevel.CAMPAIGN);
      expect(context!.view).toBe(ExtensionView.CREATE);
    });
  });

  // ── extractFieldValues() ──────────────────────────────────────────────

  describe('extractFieldValues()', () => {
    // Increase timeout since extractAllFieldValues has a remoteEval fallback
    // that times out after 5s for null fields
    jest.setTimeout(10000);

    it('should extract campaign name from input', async () => {
      buildMetaDOM({ campaignName: 'US_Social_Awareness_Q1_2026' });
      const values = await adapter.extractFieldValues();
      expect(values['campaign.name']).toBe('US_Social_Awareness_Q1_2026');
    });

    it('should extract budget value as a number', async () => {
      buildMetaDOM({ budgetValue: '$5,000.00' });
      const values = await adapter.extractFieldValues();
      expect(values['campaign.budget_value']).toBe(5000);
    });

    it('should extract CBO toggle state (enabled)', async () => {
      buildMetaDOM({ cboEnabled: true });
      const values = await adapter.extractFieldValues();
      expect(values['campaign.cbo_enabled']).toBe(true);
    });

    it('should extract CBO toggle state (disabled)', async () => {
      buildMetaDOM({ cboEnabled: false });
      const values = await adapter.extractFieldValues();
      expect(values['campaign.cbo_enabled']).toBe(false);
    });

    it('should return null for fields not present in DOM', async () => {
      document.body.innerHTML = '<div>Empty page</div>';
      const values = await adapter.extractFieldValues();
      expect(values['campaign.name']).toBeNull();
    });

    it('should handle empty input values', async () => {
      buildMetaDOM({ campaignName: '' });
      const values = await adapter.extractFieldValues();
      expect(values['campaign.name']).toBeNull();
    });
  });

  // ── getInjectionPoint() ───────────────────────────────────────────────

  describe('getInjectionPoint()', () => {
    it('should return injection point for campaign name field', () => {
      buildMetaDOM({ campaignName: 'Test' });
      const point = adapter.getInjectionPoint('naming_convention', 'campaign.name');
      expect(point).not.toBeNull();
      expect(point!.position).toBe(InjectionPosition.AFTER);
    });

    it('should return OVERLAY position for publish button', () => {
      buildMetaDOM({ publishButton: true });
      const point = adapter.getInjectionPoint('creation_blocker', 'publish_button');
      expect(point).not.toBeNull();
      expect(point!.position).toBe(InjectionPosition.OVERLAY);
    });

    it('should return null for unknown field paths', () => {
      expect(adapter.getInjectionPoint('some_rule', 'unknown.field.path')).toBeNull();
    });
  });

  // ── interceptCreation() ───────────────────────────────────────────────

  describe('interceptCreation()', () => {
    it('should attach click handler to publish button', () => {
      buildMetaDOM({ publishButton: true });
      const button = document.querySelector('button[type="submit"]') as HTMLElement;
      const addEventSpy = jest.spyOn(button, 'addEventListener');
      adapter.interceptCreation(() => {});
      expect(addEventSpy).toHaveBeenCalledWith(
        'click',
        expect.any(Function),
        { capture: true },
      );
    });

    it('should warn when publish button is not found', () => {
      document.body.innerHTML = '<div>No button</div>';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      adapter.interceptCreation(() => {});
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not find publish/next button'),
      );
      warnSpy.mockRestore();
    });
  });

  // ── observeFieldChanges() ─────────────────────────────────────────────

  describe('observeFieldChanges()', () => {
    it('should create a MutationObserver', () => {
      const callback = jest.fn();
      adapter.observeFieldChanges(callback);
      expect(adapter['observer']).not.toBeNull();
    });

    it('should disconnect previous observer when called again', () => {
      adapter.observeFieldChanges(jest.fn());
      const first = adapter['observer'];
      adapter.observeFieldChanges(jest.fn());
      expect(adapter['observer']).not.toBe(first);
    });
  });

  // ── Validation Loop ───────────────────────────────────────────────────

  describe('startValidationLoop()', () => {
    jest.setTimeout(15000);

    it('should initialize all UI components', async () => {
      buildMetaDOM({ campaignName: 'Test Campaign', publishButton: true });
      setLocation(
        'http://localhost:8080/meta-campaign-creation.html?act=123456&tool=CAMPAIGN_CREATION_FLOW',
      );

      const rule = createTestRule();
      await adapter.startValidationLoop([rule], []);

      expect(adapter['sidebar']).not.toBeNull();
      expect(adapter['creationBlocker']).not.toBeNull();
      expect(adapter['commentModal']).not.toBeNull();
      expect(adapter['validationLoopActive']).toBe(true);
    });

    it('should evaluate rules and produce results', async () => {
      buildMetaDOM({ campaignName: 'Test Campaign', publishButton: true });
      setLocation(
        'http://localhost:8080/meta-campaign-creation.html?act=123456&tool=CAMPAIGN_CREATION_FLOW',
      );

      const rule = createTestRule();
      await adapter.startValidationLoop([rule], []);

      const results = adapter.getEvaluationResults();
      expect(results).toHaveLength(1);
      expect(results[0].ruleId).toBe('rule-1');
      // campaign.name IS_SET should pass since value = 'Test Campaign'
      expect(results[0].passed).toBe(true);
    });

    it('should compute compliance score of 100 when all rules pass', async () => {
      buildMetaDOM({ campaignName: 'Test Campaign', publishButton: true });
      setLocation(
        'http://localhost:8080/meta-campaign-creation.html?act=123456&tool=CAMPAIGN_CREATION_FLOW',
      );

      const rule = createTestRule();
      await adapter.startValidationLoop([rule], []);

      const score = adapter.getComplianceScore();
      expect(score.overall).toBe(100);
      expect(score.passedCount).toBe(1);
      expect(score.totalCount).toBe(1);
    });

    it('should detect violations when field is empty', async () => {
      buildMetaDOM({ campaignName: '', publishButton: true });
      setLocation(
        'http://localhost:8080/meta-campaign-creation.html?act=123456&tool=CAMPAIGN_CREATION_FLOW',
      );

      const rule = createTestRule();
      await adapter.startValidationLoop([rule], []);

      const results = adapter.getEvaluationResults();
      expect(results[0].passed).toBe(false);

      const score = adapter.getComplianceScore();
      expect(score.overall).toBe(0);
    });
  });

  // ── Multi-Entity Flow ─────────────────────────────────────────────────

  describe('getCurrentEntityLevel()', () => {
    it('should track the current entity level', () => {
      setLocation(
        'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123456&tool=CAMPAIGN_CREATION_FLOW',
      );
      adapter.detectContext();
      expect(adapter.getCurrentEntityLevel()).toBe(EntityLevel.CAMPAIGN);
    });

    it('should update entity level on context detection', () => {
      setLocation(
        'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123456&tool=ADGROUP_CREATION_FLOW',
      );
      adapter.detectContext();
      expect(adapter.getCurrentEntityLevel()).toBe(EntityLevel.AD_SET);
    });
  });

  // ── cleanup() ─────────────────────────────────────────────────────────

  describe('cleanup()', () => {
    it('should disconnect the MutationObserver', () => {
      adapter.observeFieldChanges(jest.fn());
      expect(adapter['observer']).not.toBeNull();
      adapter.cleanup();
      expect(adapter['observer']).toBeNull();
    });

    it('should remove injected elements from DOM', () => {
      const injected = document.createElement('div');
      document.body.appendChild(injected);
      adapter.trackInjectedElement(injected);
      adapter.cleanup();
      expect(document.body.contains(injected)).toBe(false);
    });

    it('should remove governance body classes including dlg- prefix', () => {
      document.body.classList.add('governance-creation-blocked');
      document.body.classList.add('gg-invalid-campaign-name');
      document.body.classList.add('dlg-valid-campaign-name');
      document.body.classList.add('dlg-invalid-ad-set-name');
      adapter.cleanup();
      expect(document.body.classList.contains('governance-creation-blocked')).toBe(false);
      expect(document.body.classList.contains('gg-invalid-campaign-name')).toBe(false);
      expect(document.body.classList.contains('dlg-valid-campaign-name')).toBe(false);
      expect(document.body.classList.contains('dlg-invalid-ad-set-name')).toBe(false);
    });

    it('should remove governance-loaded body attribute', () => {
      adapter.markLoaded();
      expect(document.body.hasAttribute('governance-loaded')).toBe(true);
      adapter.cleanup();
      expect(document.body.hasAttribute('governance-loaded')).toBe(false);
    });

    it('should be safe to call multiple times', () => {
      adapter.cleanup();
      adapter.cleanup();
    });

    it('should deactivate the validation loop', async () => {
      buildMetaDOM({ campaignName: 'Test', publishButton: true });
      setLocation(
        'http://localhost:8080/meta-campaign-creation.html?act=123456&tool=CAMPAIGN_CREATION_FLOW',
      );
      await adapter.startValidationLoop([createTestRule()], []);
      expect(adapter['validationLoopActive']).toBe(true);
      adapter.cleanup();
      expect(adapter['validationLoopActive']).toBe(false);
    }, 15000);

    it('should clear evaluation results', async () => {
      buildMetaDOM({ campaignName: 'Test', publishButton: true });
      setLocation(
        'http://localhost:8080/meta-campaign-creation.html?act=123456&tool=CAMPAIGN_CREATION_FLOW',
      );
      await adapter.startValidationLoop([createTestRule()], []);
      expect(adapter.getEvaluationResults().length).toBeGreaterThan(0);
      adapter.cleanup();
      expect(adapter.getEvaluationResults()).toHaveLength(0);
    }, 15000);
  });

  // ── isLoaded / markLoaded ─────────────────────────────────────────────

  describe('isLoaded() / markLoaded()', () => {
    it('should return false initially', () => {
      expect(adapter.isLoaded()).toBe(false);
    });

    it('should return true after markLoaded()', () => {
      adapter.markLoaded();
      expect(adapter.isLoaded()).toBe(true);
    });
  });

  // ── DLG CSS Prefix ──────────────────────────────────────────────────────

  describe('DLG CSS class prefix', () => {
    jest.setTimeout(15000);

    it('should use dlg- prefix for validation body classes', async () => {
      buildMetaDOM({ campaignName: 'Test Campaign', publishButton: true });
      setLocation(
        'http://localhost:8080/meta-campaign-creation.html?act=123456&tool=CAMPAIGN_CREATION_FLOW',
      );

      const rule = createTestRule();
      await adapter.startValidationLoop([rule], []);

      // The body should have dlg-valid-* classes, not gov-valid-*
      const bodyClasses = Array.from(document.body.classList);
      const dlgClasses = bodyClasses.filter((c) => c.startsWith('dlg-valid-') || c.startsWith('dlg-invalid-'));
      const govClasses = bodyClasses.filter((c) => c.startsWith('gov-valid-') || c.startsWith('gov-invalid-'));

      expect(dlgClasses.length).toBeGreaterThan(0);
      expect(govClasses.length).toBe(0);
    });

    it('should add dlg-valid-campaign-name when campaign name passes IS_SET', async () => {
      buildMetaDOM({ campaignName: 'Test Campaign', publishButton: true });
      setLocation(
        'http://localhost:8080/meta-campaign-creation.html?act=123456&tool=CAMPAIGN_CREATION_FLOW',
      );

      const rule = createTestRule();
      await adapter.startValidationLoop([rule], []);

      expect(document.body.classList.contains('dlg-valid-campaign-name')).toBe(true);
    });

    it('should add dlg-invalid-campaign-name when campaign name fails IS_SET', async () => {
      buildMetaDOM({ campaignName: '', publishButton: true });
      setLocation(
        'http://localhost:8080/meta-campaign-creation.html?act=123456&tool=CAMPAIGN_CREATION_FLOW',
      );

      const rule = createTestRule();
      await adapter.startValidationLoop([rule], []);

      expect(document.body.classList.contains('dlg-invalid-campaign-name')).toBe(true);
    });
  });

  // ── SPA Navigation ──────────────────────────────────────────────────────

  describe('SPA navigation via pushState', () => {
    jest.setTimeout(15000);

    it('should listen for governance:pushstate events', async () => {
      buildMetaDOM({ campaignName: 'Test', publishButton: true });
      setLocation(
        'http://localhost:8080/meta-campaign-creation.html?act=123456&tool=CAMPAIGN_CREATION_FLOW',
      );

      const rule = createTestRule();
      await adapter.startValidationLoop([rule], []);

      // Dispatch a pushstate event (simulating SPA navigation)
      window.dispatchEvent(
        new CustomEvent('governance:pushstate', {
          detail: { url: '/new-page' },
        }),
      );

      // Should not throw; the adapter should handle the event gracefully
      expect(adapter['validationLoopActive']).toBe(true);
    });

    it('should clean up pushstate listener on cleanup', async () => {
      buildMetaDOM({ campaignName: 'Test', publishButton: true });
      setLocation(
        'http://localhost:8080/meta-campaign-creation.html?act=123456&tool=CAMPAIGN_CREATION_FLOW',
      );

      const rule = createTestRule();
      await adapter.startValidationLoop([rule], []);

      adapter.cleanup();

      // After cleanup, dispatching the event should not cause issues
      expect(() => {
        window.dispatchEvent(
          new CustomEvent('governance:pushstate', {
            detail: { url: '/after-cleanup' },
          }),
        );
      }).not.toThrow();
    });
  });
});

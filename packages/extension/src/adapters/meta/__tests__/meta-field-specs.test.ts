import { EntityLevel } from '@media-buying-governance/shared';

import {
  getMetaDomAliasMap,
  getMetaDomFieldPaths,
  getMetaFieldPaths,
  getMetaFieldPathsForEntityLevel,
  getMetaFieldPathsForTier,
  getMetaFieldSpec,
  getMetaFieldTier,
  getMetaRequireFieldMap,
  getMetaRemoteEvalConfig,
} from '../meta-field-specs.js';

describe('meta-field-specs', () => {
  it('keeps the maintained DOM core list small and explicit', () => {
    expect(getMetaDomFieldPaths()).toHaveLength(18);
    expect(getMetaFieldPathsForTier('core')).toEqual(getMetaDomFieldPaths());
  });

  it('exposes canonical aliases for backend-compatible field names', () => {
    expect(getMetaDomAliasMap()).toEqual({
      'ad.facebook_page_id': 'ad.creative.page_id',
      'ad.destination_url': 'ad.creative.destination_url',
      'ad_set.targeting.geo_locations.countries': 'ad_set.targeting.geo_locations',
    });
  });

  it('builds specs with tier, entity level, and extraction metadata', () => {
    expect(getMetaFieldTier('campaign.name')).toBe('core');
    expect(getMetaFieldTier('campaign.buying_type')).toBe('experimental');

    expect(getMetaFieldSpec('campaign.name')).toEqual({
      fieldPath: 'campaign.name',
      entityLevel: EntityLevel.CAMPAIGN,
      tier: 'core',
      domSupported: true,
      canonicalFieldPath: undefined,
      require: {
        store: 'AdsCampaignDataStore',
        path: 'name',
      },
      remoteEval: {
        selector: 'input[placeholder*="campaign name" i]',
        method: 'elementValue',
      },
    });
  });

  it('keeps unsupported remote-eval helpers out of the supported field contract', () => {
    expect(getMetaFieldPaths()).not.toContain('ad_set.budget_type');
    expect(getMetaFieldPaths()).not.toContain('ad_set.budget_value');
    expect(getMetaRemoteEvalConfig('ad_set.budget_type')).toEqual({
      selector: '[role="radiogroup"] [aria-checked="true"]',
      method: 'selectedOptionText',
    });
  });

  it('groups fields by entity level from the shared registry', () => {
    const adSetFields = getMetaFieldPathsForEntityLevel(EntityLevel.AD_SET);

    expect(adSetFields).toContain('ad_set.name');
    expect(adSetFields).not.toContain('campaign.name');
    expect(adSetFields).not.toContain('ad.name');
  });

  it('retains the require() mapping in the shared registry', () => {
    const map = getMetaRequireFieldMap();

    expect(map['campaign.name']).toEqual({
      store: 'AdsCampaignDataStore',
      path: 'name',
    });
    expect(Object.keys(map).length).toBeGreaterThanOrEqual(80);
  });
});

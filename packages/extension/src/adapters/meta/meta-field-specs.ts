import { EntityLevel } from '@media-buying-governance/shared';
import type { RemoteEvalQuery } from '@media-buying-governance/shared';

export type MetaFieldTier = 'core' | 'experimental';

export interface MetaRequireFieldMapping {
  store: string;
  path: string;
}

export interface MetaRemoteEvalConfig {
  selector: string;
  method: RemoteEvalQuery['getters'][number]['method'];
}

export interface MetaFieldSpec {
  fieldPath: string;
  entityLevel: EntityLevel;
  tier: MetaFieldTier;
  domSupported: boolean;
  canonicalFieldPath?: string;
  require?: MetaRequireFieldMapping;
  remoteEval?: MetaRemoteEvalConfig;
}

const META_DOM_PRIMARY_FIELD_PATHS = [
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
  'campaign.buying_type',
  'campaign.special_ad_categories',
  'campaign.a_b_test',
  'campaign.bid_strategy',
  'ad_set.performance_goal',
  'ad_set.bid_amount',
  'ad_set.beneficiary_payer',
  'ad_set.facebook_page',
  'ad.partnership_ad',
  'ad.creative.instagram_account',
  'ad.creative.format',
  'ad.tracking.url_parameters',
  // Ad creative text fields (2026 Ad panel)
  'ad.creative.primary_text',
  'ad.creative.headline',
  'ad.creative.description',
  'ad.creative.display_link',
  'ad.creative.cta_type_label',
  'ad.creative.format_radio',
  'ad.creative.destination_type',
  'ad.creative.flexible_media',
  'ad.creative.add_music',
] as const;

const META_DOM_ALIAS_FIELD_PATHS = {
  'ad.facebook_page_id': 'ad.creative.page_id',
  'ad.destination_url': 'ad.creative.destination_url',
  'ad_set.targeting.geo_locations.countries': 'ad_set.targeting.geo_locations',
} as const;

const META_REQUIRE_FIELD_MAP: Record<string, MetaRequireFieldMapping> = {
  'campaign.name': { store: 'AdsCampaignDataStore', path: 'name' },
  'campaign.objective': { store: 'AdsCampaignDataStore', path: 'objective' },
  'campaign.budget_type': { store: 'AdsCampaignDataStore', path: 'budgetType' },
  'campaign.budget_value': { store: 'AdsCampaignDataStore', path: 'budgetValue' },
  'campaign.cbo_enabled': { store: 'AdsCampaignDataStore', path: 'cboEnabled' },
  'campaign.buying_type': { store: 'AdsCampaignDataStore', path: 'buyingType' },
  'campaign.special_ad_categories': { store: 'AdsCampaignDataStore', path: 'specialAdCategories' },
  'campaign.spending_limit': { store: 'AdsCampaignDataStore', path: 'spendingLimit' },
  'campaign.bid_strategy': { store: 'AdsCampaignDataStore', path: 'bidStrategy' },
  'campaign.a_b_test': { store: 'AdsCampaignDataStore', path: 'abTest' },

  'ad_set.name': { store: 'AdsEditorDataStore', path: 'adSetName' },
  'ad_set.targeting.geo_locations': { store: 'AdsTargetingDataStore', path: 'geoLocations' },
  'ad_set.targeting.age_range': { store: 'AdsTargetingDataStore', path: 'ageRange' },
  'ad_set.targeting.genders': { store: 'AdsTargetingDataStore', path: 'genders' },
  'ad_set.targeting.languages': { store: 'AdsTargetingDataStore', path: 'languages' },
  'ad_set.targeting.custom_audiences': { store: 'AdsTargetingDataStore', path: 'customAudiences' },
  'ad_set.targeting.excluded_audiences': { store: 'AdsTargetingDataStore', path: 'excludedAudiences' },
  'ad_set.targeting.lookalike_audiences': { store: 'AdsTargetingDataStore', path: 'lookalikeAudiences' },
  'ad_set.targeting.detailed_targeting': { store: 'AdsTargetingDataStore', path: 'detailedTargeting' },
  'ad_set.targeting.connections': { store: 'AdsTargetingDataStore', path: 'connections' },
  'ad_set.placements': { store: 'AdsEditorDataStore', path: 'placements' },
  'ad_set.placements.type': { store: 'AdsEditorDataStore', path: 'placementType' },
  'ad_set.placements.platforms': { store: 'AdsEditorDataStore', path: 'placementPlatforms' },
  'ad_set.placements.positions': { store: 'AdsEditorDataStore', path: 'placementPositions' },
  'ad_set.schedule.start_date': { store: 'AdsEditorDataStore', path: 'startDate' },
  'ad_set.schedule.end_date': { store: 'AdsEditorDataStore', path: 'endDate' },
  'ad_set.schedule.day_parting': { store: 'AdsEditorDataStore', path: 'dayParting' },
  'ad_set.optimization_goal': { store: 'AdsEditorDataStore', path: 'optimizationGoal' },
  'ad_set.billing_event': { store: 'AdsEditorDataStore', path: 'billingEvent' },
  'ad_set.bid_amount': { store: 'AdsEditorDataStore', path: 'bidAmount' },
  'ad_set.bid_strategy': { store: 'AdsEditorDataStore', path: 'bidStrategy' },
  'ad_set.daily_budget': { store: 'AdsEditorDataStore', path: 'dailyBudget' },
  'ad_set.lifetime_budget': { store: 'AdsEditorDataStore', path: 'lifetimeBudget' },
  'ad_set.frequency_cap': { store: 'AdsEditorDataStore', path: 'frequencyCap' },
  'ad_set.pixel_id': { store: 'AdsEditorDataStore', path: 'pixelId' },
  'ad_set.conversion_event': { store: 'AdsEditorDataStore', path: 'conversionEvent' },
  'ad_set.attribution_setting': { store: 'AdsEditorDataStore', path: 'attributionSetting' },
  'ad_set.advantage_targeting': { store: 'AdsTargetingDataStore', path: 'advantageTargeting' },
  'ad_set.advantage_placements': { store: 'AdsEditorDataStore', path: 'advantagePlacements' },
  'ad_set.performance_goal': { store: 'AdsEditorDataStore', path: 'performanceGoal' },
  'ad_set.beneficiary_payer': { store: 'AdsEditorDataStore', path: 'beneficiaryPayer' },
  'ad_set.facebook_page': { store: 'AdsEditorDataStore', path: 'facebookPage' },

  'ad.name': { store: 'AdsCreativeEditorDataStore', path: 'adName' },
  'ad.creative.destination_url': { store: 'AdsCreativeEditorDataStore', path: 'destinationUrl' },
  'ad.creative.cta_type': { store: 'AdsCreativeEditorDataStore', path: 'ctaType' },
  'ad.creative.page_id': { store: 'AdsCreativeEditorDataStore', path: 'pageId' },
  'ad.creative.instagram_account_id': { store: 'AdsCreativeEditorDataStore', path: 'instagramAccountId' },
  'ad.creative.headline': { store: 'AdsCreativeEditorDataStore', path: 'headline' },
  'ad.creative.primary_text': { store: 'AdsCreativeEditorDataStore', path: 'primaryText' },
  'ad.creative.description': { store: 'AdsCreativeEditorDataStore', path: 'description' },
  'ad.creative.display_link': { store: 'AdsCreativeEditorDataStore', path: 'displayLink' },
  'ad.creative.image_hash': { store: 'AdsCreativeEditorDataStore', path: 'imageHash' },
  'ad.creative.video_id': { store: 'AdsCreativeEditorDataStore', path: 'videoId' },
  'ad.creative.carousel_cards': { store: 'AdsCreativeEditorDataStore', path: 'carouselCards' },
  'ad.creative.format': { store: 'AdsCreativeEditorDataStore', path: 'format' },
  'ad.creative.dynamic_creative': { store: 'AdsCreativeEditorDataStore', path: 'dynamicCreative' },
  'ad.creative.url_parameters': { store: 'AdsCreativeEditorDataStore', path: 'urlParameters' },
  'ad.creative.url_tags': { store: 'AdsCreativeEditorDataStore', path: 'urlTags' },
  'ad.creative.deep_link': { store: 'AdsCreativeEditorDataStore', path: 'deepLink' },
  'ad.creative.app_link': { store: 'AdsCreativeEditorDataStore', path: 'appLink' },
  'ad.creative.pixel_id': { store: 'AdsCreativeEditorDataStore', path: 'pixelId' },
  'ad.creative.event_type': { store: 'AdsCreativeEditorDataStore', path: 'eventType' },
  'ad.creative.offer_id': { store: 'AdsCreativeEditorDataStore', path: 'offerId' },
  'ad.creative.lead_form_id': { store: 'AdsCreativeEditorDataStore', path: 'leadFormId' },
  'ad.creative.canvas_id': { store: 'AdsCreativeEditorDataStore', path: 'canvasId' },
  'ad.creative.collection_id': { store: 'AdsCreativeEditorDataStore', path: 'collectionId' },
  'ad.creative.product_catalog_id': { store: 'AdsCreativeEditorDataStore', path: 'productCatalogId' },
  'ad.creative.product_set_id': { store: 'AdsCreativeEditorDataStore', path: 'productSetId' },
  'ad.creative.instant_experience_id': { store: 'AdsCreativeEditorDataStore', path: 'instantExperienceId' },
  'ad.creative.branded_content_sponsor_id': { store: 'AdsCreativeEditorDataStore', path: 'brandedContentSponsorId' },
  'ad.creative.advantage_creative_enhancements': { store: 'AdsCreativeEditorDataStore', path: 'advantageCreativeEnhancements' },

  'ad.partnership_ad': { store: 'AdsCreativeEditorDataStore', path: 'partnershipAd' },
  'ad.tracking.pixel_id': { store: 'AdsCreativeEditorDataStore', path: 'trackingPixelId' },
  'ad.tracking.app_events': { store: 'AdsCreativeEditorDataStore', path: 'appEvents' },
  'ad.tracking.offline_event_set_id': { store: 'AdsCreativeEditorDataStore', path: 'offlineEventSetId' },
  'ad.tracking.url_params': { store: 'AdsCreativeEditorDataStore', path: 'trackingUrlParams' },

  'campaign.advantage_plus_shopping': { store: 'AdsCampaignDataStore', path: 'advantagePlusShopping' },
  'campaign.advantage_plus_app': { store: 'AdsCampaignDataStore', path: 'advantagePlusApp' },
  'campaign.advantage_plus_creative': { store: 'AdsCampaignDataStore', path: 'advantagePlusCreative' },
  'ad_set.targeting.advantage_audience': { store: 'AdsTargetingDataStore', path: 'advantageAudience' },
  'ad_set.targeting.audience_network': { store: 'AdsTargetingDataStore', path: 'audienceNetwork' },
  'ad_set.targeting.device_targeting': { store: 'AdsTargetingDataStore', path: 'deviceTargeting' },
  'ad_set.targeting.publisher_platforms': { store: 'AdsTargetingDataStore', path: 'publisherPlatforms' },
  'ad_set.targeting.mobile_os': { store: 'AdsTargetingDataStore', path: 'mobileOs' },
  'ad_set.targeting.device_platforms': { store: 'AdsTargetingDataStore', path: 'devicePlatforms' },
  'ad_set.targeting.brand_safety': { store: 'AdsTargetingDataStore', path: 'brandSafety' },
  'ad_set.targeting.inventory_filter': { store: 'AdsTargetingDataStore', path: 'inventoryFilter' },
  'ad_set.targeting.exclude_content_types': { store: 'AdsTargetingDataStore', path: 'excludeContentTypes' },
  'ad_set.targeting.block_lists': { store: 'AdsTargetingDataStore', path: 'blockLists' },
  'ad.creative.media_type': { store: 'AdsCreativeEditorDataStore', path: 'mediaType' },
  'ad.creative.aspect_ratio': { store: 'AdsCreativeEditorDataStore', path: 'aspectRatio' },
  'ad.creative.thumbnail_url': { store: 'AdsCreativeEditorDataStore', path: 'thumbnailUrl' },
};

const META_REMOTE_EVAL_CONFIG_MAP: Record<string, MetaRemoteEvalConfig> = {
  'campaign.name': {
    selector: 'input[placeholder*="campaign name" i]',
    method: 'elementValue',
  },
  'campaign.objective': {
    selector: '[role="radiogroup"]',
    method: 'selectedOptionText',
  },
  'campaign.budget_type': {
    selector: '[role="radiogroup"], [aria-label*="Budget type"], [aria-label*="budget type"]',
    method: 'selectedOptionText',
  },
  'campaign.budget_value': {
    selector: 'input[placeholder*="enter amount" i]',
    method: 'elementValue',
  },
  'campaign.cbo_enabled': {
    selector: '[role="switch"][aria-label*="budget" i], [role="switch"], input[type="checkbox"][aria-label*="budget" i], input[type="checkbox"][aria-label*="Advantage" i]',
    method: 'elementChecked',
  },
  'campaign.buying_type': {
    selector: '[role="combobox"]',
    method: 'selectedOptionText',
  },
  'campaign.special_ad_categories': {
    selector: '[role="combobox"]',
    method: 'selectedOptionText',
  },
  'campaign.a_b_test': {
    selector: '[role="switch"]',
    method: 'elementChecked',
  },
  'campaign.bid_strategy': {
    selector: '[role="combobox"]',
    method: 'selectedOptionText',
  },

  'ad_set.name': {
    selector: 'input[placeholder*="ad set name" i]',
    method: 'elementValue',
  },
  'ad_set.budget_type': {
    selector: '[role="radiogroup"] [aria-checked="true"]',
    method: 'selectedOptionText',
  },
  'ad_set.budget_value': {
    selector: 'input[placeholder*="enter amount" i]',
    method: 'elementValue',
  },
  'ad_set.targeting.geo_locations': {
    selector: '[aria-label*="Location"]',
    method: 'FindReact',
  },
  'ad_set.targeting.geo_locations.countries': {
    selector: '[aria-label*="Location"]',
    method: 'FindReact',
  },
  'ad_set.targeting.age_range': {
    selector: '[aria-label*="Age"]',
    method: 'FindReact',
  },
  'ad_set.targeting.genders': {
    selector: '[aria-label*="Gender"]',
    method: 'FindReact',
  },
  'ad_set.targeting.languages': {
    selector: '[aria-label*="Language"]',
    method: 'FindReact',
  },
  'ad_set.targeting.custom_audiences': {
    selector: '[aria-label*="Custom audience"]',
    method: 'FindReact',
  },
  'ad_set.placements': {
    selector: '[aria-label*="Placement"]',
    method: 'FindReact',
  },
  'ad_set.schedule.start_date': {
    selector: 'input[placeholder="mm/dd/yyyy"]',
    method: 'elementValue',
  },
  'ad_set.schedule.end_date': {
    selector: 'input[placeholder="mm/dd/yyyy"]',
    method: 'elementValue',
  },
  'ad_set.performance_goal': {
    selector: '[role="combobox"]',
    method: 'selectedOptionText',
  },
  'ad_set.bid_amount': {
    selector: 'input[placeholder="X.XXX"]',
    method: 'elementValue',
  },
  'ad_set.beneficiary_payer': {
    selector: '[role="switch"][aria-label*="advertiser and payer" i]',
    method: 'elementChecked',
  },
  'ad_set.facebook_page': {
    selector: 'input',
    method: 'elementValue',
  },

  'ad.name': {
    selector: 'input[placeholder*="ad name" i]',
    method: 'elementValue',
  },
  'ad.creative.destination_url': {
    selector: 'input[aria-label*="Website URL"]',
    method: 'elementValue',
  },
  'ad.destination_url': {
    selector: 'input[aria-label*="Website URL"]',
    method: 'elementValue',
  },
  'ad.creative.cta_type': {
    selector: '[aria-label*="Call to action"]',
    method: 'selectedOptionText',
  },
  'ad.creative.page_id': {
    selector: '[role="combobox"]',
    method: 'selectedOptionText',
  },
  'ad.facebook_page_id': {
    selector: '[role="combobox"]',
    method: 'selectedOptionText',
  },
  'ad.partnership_ad': {
    selector: '[role="switch"]',
    method: 'elementChecked',
  },
  'ad.creative.instagram_account': {
    selector: '[role="combobox"][aria-label="Instagram account"]',
    method: 'selectedOptionText',
  },
  'ad.creative.format': {
    selector: '[role="combobox"]',
    method: 'selectedOptionText',
  },
  'ad.tracking.url_parameters': {
    selector: 'input[placeholder*="key1=value1"]',
    method: 'elementValue',
  },
};

const META_CORE_FIELD_PATHS = new Set<string>(META_DOM_PRIMARY_FIELD_PATHS);

const META_DOM_FIELD_PATHS = [
  ...META_DOM_PRIMARY_FIELD_PATHS,
  ...Object.keys(META_DOM_ALIAS_FIELD_PATHS),
];

function dedupeAndSort(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function getMetaFieldEntityLevel(fieldPath: string): EntityLevel | null {
  if (fieldPath.startsWith('campaign.')) {
    return EntityLevel.CAMPAIGN;
  }
  if (fieldPath.startsWith('ad_set.')) {
    return EntityLevel.AD_SET;
  }
  if (fieldPath.startsWith('ad.')) {
    return EntityLevel.AD;
  }
  return null;
}

export function getMetaFieldPaths(): string[] {
  return dedupeAndSort([
    ...META_DOM_FIELD_PATHS,
    ...Object.keys(META_REQUIRE_FIELD_MAP),
  ]);
}

export function getMetaDomFieldPaths(): string[] {
  return [...META_DOM_PRIMARY_FIELD_PATHS];
}

export function getMetaDomAliasMap(): Record<string, string> {
  return { ...META_DOM_ALIAS_FIELD_PATHS };
}

export function getMetaRequireFieldMap(): Record<string, MetaRequireFieldMapping> {
  return { ...META_REQUIRE_FIELD_MAP };
}

export function getMetaRemoteEvalConfigMap(): Record<string, MetaRemoteEvalConfig> {
  return { ...META_REMOTE_EVAL_CONFIG_MAP };
}

export function getMetaRemoteEvalConfig(fieldPath: string): MetaRemoteEvalConfig | null {
  return META_REMOTE_EVAL_CONFIG_MAP[fieldPath] ?? null;
}

export function getMetaFieldPathsForEntityLevel(entityLevel: EntityLevel): string[] {
  return getMetaFieldPaths().filter(
    (fieldPath) => getMetaFieldEntityLevel(fieldPath) === entityLevel,
  );
}

export function getMetaFieldPathsForTier(tier: MetaFieldTier): string[] {
  if (tier === 'core') {
    return [...META_DOM_PRIMARY_FIELD_PATHS];
  }

  return getMetaFieldPaths().filter((fieldPath) => getMetaFieldTier(fieldPath) === tier);
}

export function getMetaFieldTier(fieldPath: string): MetaFieldTier {
  return META_CORE_FIELD_PATHS.has(fieldPath) ? 'core' : 'experimental';
}

export function getMetaFieldSpec(fieldPath: string): MetaFieldSpec | null {
  const entityLevel = getMetaFieldEntityLevel(fieldPath);
  if (!entityLevel) return null;

  return {
    fieldPath,
    entityLevel,
    tier: getMetaFieldTier(fieldPath),
    domSupported: META_DOM_FIELD_PATHS.includes(fieldPath),
    canonicalFieldPath: META_DOM_ALIAS_FIELD_PATHS[
      fieldPath as keyof typeof META_DOM_ALIAS_FIELD_PATHS
    ],
    require: META_REQUIRE_FIELD_MAP[fieldPath],
    remoteEval: META_REMOTE_EVAL_CONFIG_MAP[fieldPath],
  };
}

export function getMetaFieldSpecs(): MetaFieldSpec[] {
  return getMetaFieldPaths()
    .map((fieldPath) => getMetaFieldSpec(fieldPath))
    .filter((spec): spec is MetaFieldSpec => spec !== null);
}

import {
  Rule as PrismaRule,
  RuleSet as PrismaRuleSet,
  NamingTemplate as PrismaNamingTemplate,
  Platform as PrismaPlatform,
  EntityLevel as PrismaEntityLevel,
  EnforcementMode as PrismaEnforcementMode,
} from '@prisma/client';
import {
  Rule as ApiRule,
  RuleScope,
  RuleCondition,
  RuleUIConfig,
  RuleMetadata,
  Platform,
  EntityLevel,
  EnforcementMode,
  RuleType,
  RuleOperator,
} from '@media-buying-governance/shared';

/**
 * Prisma Rule with included relations needed for transformation.
 * The ruleSet relation is required to build the nested scope object.
 */
export type PrismaRuleWithRelations = PrismaRule & {
  ruleSet?: PrismaRuleSet | null;
  namingTemplate?: PrismaNamingTemplate | null;
};

/**
 * Map Prisma Platform enum value to shared Platform enum value.
 */
function mapPlatform(platform: PrismaPlatform): Platform {
  switch (platform) {
    case 'meta':
      return Platform.META;
    case 'google_ads':
      return Platform.GOOGLE_ADS;
    case 'all':
      return Platform.ALL;
    default:
      return Platform.ALL;
  }
}

/**
 * Expand a single Prisma platform value into a platforms array for the scope.
 * 'all' expands to both platforms, otherwise wraps in array.
 */
function expandPlatforms(platform: PrismaPlatform): Platform[] {
  if (platform === 'all') {
    return [Platform.META, Platform.GOOGLE_ADS];
  }
  return [mapPlatform(platform)];
}

/**
 * Map Prisma EntityLevel enum value to shared EntityLevel enum value.
 */
function mapEntityLevel(level: PrismaEntityLevel): EntityLevel {
  switch (level) {
    case 'campaign':
      return EntityLevel.CAMPAIGN;
    case 'ad_set':
      return EntityLevel.AD_SET;
    case 'ad':
      return EntityLevel.AD;
    default:
      return EntityLevel.CAMPAIGN;
  }
}

/**
 * Map Prisma EnforcementMode enum value to shared EnforcementMode enum value.
 */
function mapEnforcementMode(mode: PrismaEnforcementMode): EnforcementMode {
  switch (mode) {
    case 'warning':
      return EnforcementMode.WARNING;
    case 'blocking':
      return EnforcementMode.BLOCKING;
    case 'comment_required':
      return EnforcementMode.COMMENT_REQUIRED;
    case 'second_approver':
      return EnforcementMode.SECOND_APPROVER;
    default:
      return EnforcementMode.WARNING;
  }
}

/**
 * Map a raw ruleType string to the shared RuleType enum value.
 * Falls back to CUSTOM_FIELD if not recognized.
 */
function mapRuleType(ruleType: string): RuleType {
  const mapping: Record<string, RuleType> = {
    // Original 11 types
    naming_convention: RuleType.NAMING_CONVENTION,
    budget_enforcement: RuleType.BUDGET_ENFORCEMENT,
    targeting_constraint: RuleType.TARGETING_CONSTRAINT,
    placement_enforcement: RuleType.PLACEMENT_ENFORCEMENT,
    brand_safety: RuleType.BRAND_SAFETY,
    taxonomy_compliance: RuleType.TAXONOMY_COMPLIANCE,
    bidding_strategy: RuleType.BIDDING_STRATEGY,
    schedule_enforcement: RuleType.SCHEDULE_ENFORCEMENT,
    tracking_validation: RuleType.TRACKING_VALIDATION,
    creative_validation: RuleType.CREATIVE_VALIDATION,
    custom_field: RuleType.CUSTOM_FIELD,
    // 19 new types for expanded rule catalog
    spending_limit: RuleType.SPENDING_LIMIT,
    special_ad_categories: RuleType.SPECIAL_AD_CATEGORIES,
    pixel_conversion: RuleType.PIXEL_CONVERSION,
    bid_value: RuleType.BID_VALUE,
    frequency_cap: RuleType.FREQUENCY_CAP,
    tracking_url: RuleType.TRACKING_URL,
    status_enforcement: RuleType.STATUS_ENFORCEMENT,
    identity_enforcement: RuleType.IDENTITY_ENFORCEMENT,
    inventory_filter: RuleType.INVENTORY_FILTER,
    performance_goal: RuleType.PERFORMANCE_GOAL,
    billing_event: RuleType.BILLING_EVENT,
    audience_control: RuleType.AUDIENCE_CONTROL,
    placement_control: RuleType.PLACEMENT_CONTROL,
    duration_enforcement: RuleType.DURATION_ENFORCEMENT,
    eu_compliance: RuleType.EU_COMPLIANCE,
    day_scheduling: RuleType.DAY_SCHEDULING,
    creative_specs: RuleType.CREATIVE_SPECS,
    confirmation: RuleType.CONFIRMATION,
    media_plan: RuleType.MEDIA_PLAN,
  };
  return mapping[ruleType] ?? RuleType.CUSTOM_FIELD;
}

/**
 * Build the nested scope object from the flat Prisma Rule + parent RuleSet.
 *
 * - rule.platform -> scope.platforms (expand 'all' to ['meta', 'google_ads'])
 * - rule.entityLevel -> scope.entityLevels (wrap in array)
 * - ruleSet.accountIds -> scope.accountIds
 * - ruleSet.teamIds -> scope.teamIds
 * - ruleSet.buyerIds -> scope.buyerIds
 */
function buildScope(rule: PrismaRuleWithRelations): RuleScope {
  return {
    platforms: expandPlatforms(rule.platform),
    entityLevels: [mapEntityLevel(rule.entityLevel)],
    accountIds: rule.ruleSet?.accountIds ?? [],
    teamIds: rule.ruleSet?.teamIds ?? [],
    buyerIds: rule.ruleSet?.buyerIds ?? [],
  };
}

/**
 * Map the raw uiConfig JSON to the typed RuleUIConfig interface.
 * Provides sensible defaults for missing fields.
 */
function buildUIConfig(uiConfig: unknown): RuleUIConfig {
  const raw = (uiConfig ?? {}) as Record<string, unknown>;
  return {
    injectionPoint: (raw['injectionPoint'] as string) ?? (raw['injection_point'] as string) ?? 'auto',
    message: (raw['message'] as string) ?? '',
    style: (raw['style'] as string) ?? 'warning_banner',
    category: (raw['category'] as string) ?? 'General',
    priority: (raw['priority'] as number) ?? 0,
    requireConfirmation: (raw['requireConfirmation'] as boolean) ?? (raw['require_confirmation'] as boolean) ?? undefined,
    confirmationMessage: (raw['confirmationMessage'] as string) ?? (raw['confirmation_message'] as string) ?? undefined,
  };
}

/**
 * Map the raw condition JSON to the typed RuleCondition interface.
 */
function buildCondition(condition: unknown): RuleCondition {
  const raw = (condition ?? {}) as Record<string, unknown>;
  const result: RuleCondition = {
    operator: (raw['operator'] as RuleOperator) ?? RuleOperator.EQUALS,
  };
  if (raw['field'] !== undefined) {
    result.field = raw['field'] as string;
  }
  if (raw['value'] !== undefined) {
    result.value = raw['value'];
  }
  if (Array.isArray(raw['conditions'])) {
    result.conditions = (raw['conditions'] as unknown[]).map(buildCondition);
  }
  return result;
}

/**
 * Build rule metadata. The Prisma Rule model does not have created_at/updated_at
 * columns, so we use placeholder values. A future schema migration should add these.
 */
function buildMetadata(_rule: PrismaRule): RuleMetadata {
  return {
    createdBy: '',
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

/**
 * Transform a Prisma Rule (with relations) into the shared API Rule type.
 *
 * This is the core transformation that fixes the data model mismatch
 * between the flat Prisma columns and the nested shared API type structure.
 *
 * IMPORTANT: The rule must be queried with { include: { ruleSet: true, namingTemplate: true } }
 * for the scope object to be populated correctly.
 */
export function toApiRule(rule: PrismaRuleWithRelations): ApiRule {
  return {
    id: rule.id,
    ruleSetId: rule.ruleSetId,
    name: rule.name,
    description: rule.description ?? '',
    version: rule.version,
    enabled: rule.enabled,
    scope: buildScope(rule),
    ruleType: mapRuleType(rule.ruleType),
    enforcement: mapEnforcementMode(rule.enforcement),
    condition: buildCondition(rule.condition),
    ui: buildUIConfig(rule.uiConfig),
    metadata: buildMetadata(rule),
  };
}

// Re-export helper functions for testing
export {
  expandPlatforms,
  mapPlatform,
  mapEntityLevel,
  mapEnforcementMode,
  mapRuleType,
  buildScope,
  buildUIConfig,
  buildCondition,
  buildMetadata,
};

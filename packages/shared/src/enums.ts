/**
 * Platform types supported by the governance system
 */
export enum Platform {
  META = 'meta',
  GOOGLE_ADS = 'google_ads',
  ALL = 'all',
}

/**
 * Entity levels in ad platform hierarchy
 */
export enum EntityLevel {
  CAMPAIGN = 'campaign',
  AD_SET = 'ad_set',
  AD = 'ad',
}

/**
 * Rule enforcement modes
 */
export enum EnforcementMode {
  WARNING = 'warning',
  BLOCKING = 'blocking',
  COMMENT_REQUIRED = 'comment_required',
  SECOND_APPROVER = 'second_approver',
}

/**
 * User roles in the organization
 */
export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  VIEWER = 'viewer',
  BUYER = 'buyer',
}

/**
 * Subscription plan tiers
 */
export enum SubscriptionPlan {
  FREE = 'free',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

/**
 * Rule types — covers all 30 rule categories across the governance platform
 */
export enum RuleType {
  // Original 11 types
  NAMING_CONVENTION = 'naming_convention',
  BUDGET_ENFORCEMENT = 'budget_enforcement',
  TARGETING_CONSTRAINT = 'targeting_constraint',
  PLACEMENT_ENFORCEMENT = 'placement_enforcement',
  BRAND_SAFETY = 'brand_safety',
  TAXONOMY_COMPLIANCE = 'taxonomy_compliance',
  BIDDING_STRATEGY = 'bidding_strategy',
  SCHEDULE_ENFORCEMENT = 'schedule_enforcement',
  TRACKING_VALIDATION = 'tracking_validation',
  CREATIVE_VALIDATION = 'creative_validation',
  CUSTOM_FIELD = 'custom_field',
  // 19 new types for expanded rule catalog
  SPENDING_LIMIT = 'spending_limit',
  SPECIAL_AD_CATEGORIES = 'special_ad_categories',
  PIXEL_CONVERSION = 'pixel_conversion',
  BID_VALUE = 'bid_value',
  FREQUENCY_CAP = 'frequency_cap',
  TRACKING_URL = 'tracking_url',
  STATUS_ENFORCEMENT = 'status_enforcement',
  IDENTITY_ENFORCEMENT = 'identity_enforcement',
  INVENTORY_FILTER = 'inventory_filter',
  PERFORMANCE_GOAL = 'performance_goal',
  BILLING_EVENT = 'billing_event',
  AUDIENCE_CONTROL = 'audience_control',
  PLACEMENT_CONTROL = 'placement_control',
  DURATION_ENFORCEMENT = 'duration_enforcement',
  EU_COMPLIANCE = 'eu_compliance',
  DAY_SCHEDULING = 'day_scheduling',
  CREATIVE_SPECS = 'creative_specs',
  CONFIRMATION = 'confirmation',
  MEDIA_PLAN = 'media_plan',
}

/**
 * Compliance event statuses
 */
export enum ComplianceStatus {
  PASSED = 'passed',
  VIOLATED = 'violated',
  OVERRIDDEN = 'overridden',
  PENDING = 'pending',
}

/**
 * Approval request statuses
 */
export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/**
 * Rule condition operators — supports simple comparisons, set operations,
 * range checks, cross-entity validation, and external data matching
 */
export enum RuleOperator {
  // Original 12 operators
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  MUST_INCLUDE = 'must_include',
  MUST_EXCLUDE = 'must_exclude',
  MUST_ONLY_BE = 'must_only_be',
  MATCHES_PATTERN = 'matches_pattern',
  IN_RANGE = 'in_range',
  IS_SET = 'is_set',
  IS_NOT_SET = 'is_not_set',
  MATCHES_TEMPLATE = 'matches_template',
  AND = 'and',
  OR = 'or',
  // 10 new operators for expanded rule catalog
  LESS_THAN = 'less_than',
  GREATER_THAN = 'greater_than',
  LESS_THAN_OR_EQUAL = 'less_than_or_equal',
  GREATER_THAN_OR_EQUAL = 'greater_than_or_equal',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  IS_VALID_URL = 'is_valid_url',
  CROSS_ENTITY_EQUALS = 'cross_entity_equals',
  MATCHES_EXTERNAL = 'matches_external',
  COUNT_IN_RANGE = 'count_in_range',
}

/**
 * Naming template segment types
 */
export enum SegmentType {
  ENUM = 'enum',
  FREE_TEXT = 'free_text',
  DATE = 'date',
  AUTO_GENERATED = 'auto_generated',
}

/**
 * Validation status for naming segments
 */
export enum ValidationStatus {
  VALID = 'valid',
  INVALID = 'invalid',
  PENDING = 'pending',
}

/**
 * Extension context view types
 */
export enum ExtensionView {
  CREATE = 'create',
  EDIT = 'edit',
  REVIEW = 'review',
}

/**
 * DOM injection positions
 */
export enum InjectionPosition {
  BEFORE = 'before',
  AFTER = 'after',
  INSIDE = 'inside',
  OVERLAY = 'overlay',
}

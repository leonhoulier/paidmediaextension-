import {
  Platform,
  EntityLevel,
  EnforcementMode,
  UserRole,
  SubscriptionPlan,
  RuleType,
  ComplianceStatus,
  ApprovalStatus,
  RuleOperator,
  SegmentType,
  ValidationStatus,
  ExtensionView,
  InjectionPosition,
} from './enums.js';

/**
 * Rule category for organizing rules in the catalog and UI.
 * Each category groups related rules by their functional domain.
 */
export type RuleCategory =
  | 'media_plan'
  | 'budget'
  | 'naming'
  | 'date'
  | 'campaign'
  | 'adset_targeting'
  | 'ad';

/**
 * A single entry in the rule catalog.
 * Describes the template for a specific governance rule with
 * its default configuration, evaluation criteria, and UI display hints.
 */
export interface RuleCatalogEntry {
  /** Unique catalog identifier, e.g. "R001" */
  catalogId: string;
  /** Human-readable rule name */
  name: string;
  /** Detailed description of what this rule enforces */
  description: string;
  /** Functional category this rule belongs to */
  category: RuleCategory;
  /** The type classification for this rule */
  ruleType: RuleType;
  /** Which entity level(s) this rule typically applies to */
  defaultEntityLevels: EntityLevel[];
  /** Which platform(s) this rule supports */
  defaultPlatforms: Platform[];
  /** Recommended enforcement mode */
  defaultEnforcement: EnforcementMode;
  /** Default operator for the primary condition */
  defaultOperator: RuleOperator;
  /** The field path this rule typically validates */
  defaultField: string;
  /** Default expected value (type varies by rule) */
  defaultValue?: unknown;
  /** UI display configuration */
  uiHints: {
    /** Where in the platform UI to inject the validation message */
    injectionPoint: string;
    /** Default style for the validation display */
    style: string;
    /** Default warning/error message shown to the buyer */
    message: string;
    /** Display priority (lower = higher priority) */
    priority: number;
  };
  /** Whether this rule requires cross-entity validation */
  crossEntity?: boolean;
  /** Tags for filtering and search */
  tags: string[];
}

/**
 * Cross-entity condition for rules that validate relationships
 * between different entity levels (e.g., campaign budget must
 * match the sum of ad set budgets).
 */
export interface CrossEntityCondition {
  /** The source entity level being validated */
  sourceEntity: EntityLevel;
  /** The field on the source entity */
  sourceField: string;
  /** The target entity level to compare against */
  targetEntity: EntityLevel;
  /** The field on the target entity */
  targetField: string;
  /** How to aggregate target values when multiple exist */
  aggregation?: 'sum' | 'min' | 'max' | 'count' | 'avg';
  /** The comparison operator */
  operator: RuleOperator;
}

/**
 * Organization entity
 */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: SubscriptionPlan;
  settings: Record<string, unknown>;
  createdAt: Date;
}

/**
 * User entity
 */
export interface User {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: UserRole;
  teamIds: string[];
  extensionToken?: string;
  lastActiveAt?: Date;
}

/**
 * Ad Account entity
 */
export interface AdAccount {
  id: string;
  organizationId: string;
  platform: Platform;
  platformAccountId: string;
  accountName: string;
  market?: string;
  region?: string;
  active: boolean;
}

/**
 * Team entity
 */
export interface Team {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  memberIds: string[];
}

/**
 * Rule scope configuration
 */
export interface RuleScope {
  platforms: Platform[];
  entityLevels: EntityLevel[];
  accountIds: string[];
  teamIds: string[];
  buyerIds: string[];
}

/**
 * Rule condition - can be simple or composite
 */
export interface RuleCondition {
  operator: RuleOperator;
  field?: string;
  value?: unknown;
  conditions?: RuleCondition[];
}

/**
 * UI configuration for rule injection
 */
export interface RuleUIConfig {
  injectionPoint: string;
  message: string;
  style: string;
  category: string;
  /** Optional sub-category for finer-grained grouping in the UI */
  subcategory?: string;
  priority: number;
  requireConfirmation?: boolean;
  confirmationMessage?: string;
}

/**
 * Rule metadata
 */
export interface RuleMetadata {
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Rule entity
 */
export interface Rule {
  id: string;
  ruleSetId: string;
  name: string;
  description: string;
  version: number;
  enabled: boolean;
  scope: RuleScope;
  ruleType: RuleType;
  enforcement: EnforcementMode;
  condition: RuleCondition;
  ui: RuleUIConfig;
  metadata: RuleMetadata;
}

/**
 * Rule Set entity
 */
export interface RuleSet {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  accountIds: string[];
  teamIds: string[];
  buyerIds: string[];
  active: boolean;
  version: number;
}

/**
 * Naming template segment
 */
export interface NamingSegment {
  label: string;
  type: SegmentType;
  separator: string;
  required: boolean;
  allowedValues?: string[];
  pattern?: string;
  format?: string;
  autoGenerator?: 'uuid_short' | 'sequential' | 'hash';
  validationStatus?: ValidationStatus;
}

/**
 * Naming Template entity
 */
export interface NamingTemplate {
  id: string;
  ruleId: string;
  segments: NamingSegment[];
  separator: string;
  example: string;
}

/**
 * Compliance Event entity
 */
export interface ComplianceEvent {
  id: string;
  organizationId: string;
  buyerId: string;
  adAccountId: string;
  platform: Platform;
  entityLevel: EntityLevel;
  entityName: string;
  ruleId: string;
  status: ComplianceStatus;
  fieldValue?: string;
  expectedValue?: string;
  comment?: string;
  createdAt: Date;
}

/**
 * Approval Request entity
 */
export interface ApprovalRequest {
  id: string;
  organizationId: string;
  buyerId: string;
  approverId: string;
  ruleId: string;
  entitySnapshot: Record<string, unknown>;
  status: ApprovalStatus;
  comment?: string;
  requestedAt: Date;
  resolvedAt?: Date;
}

/**
 * Extension context detection result
 */
export interface ExtensionContext {
  accountId: string;
  entityLevel: EntityLevel;
  view: ExtensionView;
}

/**
 * DOM injection point
 */
export interface InjectionPoint {
  element: HTMLElement;
  position: InjectionPosition;
}

/**
 * Rule evaluation result
 */
export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  /** Ternary evaluation status: 'passed', 'failed', or 'unknown' (field value couldn't be extracted) */
  status: 'passed' | 'failed' | 'unknown';
  message: string;
  category: string;
  enforcement: EnforcementMode;
  fieldValue?: unknown;
  expectedValue?: unknown;
}

/**
 * Compliance score aggregate
 */
export interface ComplianceScore {
  overall: number;
  byCategory: Record<string, number>;
  passedCount: number;
  totalCount: number;
}

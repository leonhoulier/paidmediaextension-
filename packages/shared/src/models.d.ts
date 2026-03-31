import { Platform, EntityLevel, EnforcementMode, UserRole, SubscriptionPlan, RuleType, ComplianceStatus, ApprovalStatus, RuleOperator, SegmentType, ValidationStatus, ExtensionView, InjectionPosition } from './enums.js';
export interface Organization {
    id: string;
    name: string;
    slug: string;
    plan: SubscriptionPlan;
    settings: Record<string, unknown>;
    createdAt: Date;
}
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
export interface Team {
    id: string;
    organizationId: string;
    name: string;
    description?: string;
    memberIds: string[];
}
export interface RuleScope {
    platforms: Platform[];
    entityLevels: EntityLevel[];
    accountIds: string[];
    teamIds: string[];
    buyerIds: string[];
}
export interface RuleCondition {
    operator: RuleOperator;
    field?: string;
    value?: unknown;
    conditions?: RuleCondition[];
}
export interface RuleUIConfig {
    injectionPoint: string;
    message: string;
    style: string;
    category: string;
    priority: number;
    requireConfirmation?: boolean;
    confirmationMessage?: string;
}
export interface RuleMetadata {
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}
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
export interface NamingTemplate {
    id: string;
    ruleId: string;
    segments: NamingSegment[];
    separator: string;
    example: string;
}
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
export interface ExtensionContext {
    accountId: string;
    entityLevel: EntityLevel;
    view: ExtensionView;
}
export interface InjectionPoint {
    element: HTMLElement;
    position: InjectionPosition;
}
export interface RuleEvaluationResult {
    ruleId: string;
    ruleName: string;
    passed: boolean;
    message: string;
    category: string;
    enforcement: EnforcementMode;
    fieldValue?: unknown;
    expectedValue?: unknown;
}
export interface ComplianceScore {
    overall: number;
    byCategory: Record<string, number>;
    passedCount: number;
    totalCount: number;
}

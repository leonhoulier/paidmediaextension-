export declare enum Platform {
    META = "meta",
    GOOGLE_ADS = "google_ads",
    ALL = "all"
}
export declare enum EntityLevel {
    CAMPAIGN = "campaign",
    AD_SET = "ad_set",
    AD = "ad"
}
export declare enum EnforcementMode {
    WARNING = "warning",
    BLOCKING = "blocking",
    COMMENT_REQUIRED = "comment_required",
    SECOND_APPROVER = "second_approver"
}
export declare enum UserRole {
    SUPER_ADMIN = "super_admin",
    ADMIN = "admin",
    VIEWER = "viewer",
    BUYER = "buyer"
}
export declare enum SubscriptionPlan {
    FREE = "free",
    PRO = "pro",
    ENTERPRISE = "enterprise"
}
export declare enum RuleType {
    NAMING_CONVENTION = "naming_convention",
    BUDGET_ENFORCEMENT = "budget_enforcement",
    TARGETING_CONSTRAINT = "targeting_constraint",
    PLACEMENT_ENFORCEMENT = "placement_enforcement",
    BRAND_SAFETY = "brand_safety",
    TAXONOMY_COMPLIANCE = "taxonomy_compliance",
    BIDDING_STRATEGY = "bidding_strategy",
    SCHEDULE_ENFORCEMENT = "schedule_enforcement",
    TRACKING_VALIDATION = "tracking_validation",
    CREATIVE_VALIDATION = "creative_validation",
    CUSTOM_FIELD = "custom_field"
}
export declare enum ComplianceStatus {
    PASSED = "passed",
    VIOLATED = "violated",
    OVERRIDDEN = "overridden",
    PENDING = "pending"
}
export declare enum ApprovalStatus {
    PENDING = "pending",
    APPROVED = "approved",
    REJECTED = "rejected"
}
export declare enum RuleOperator {
    EQUALS = "equals",
    NOT_EQUALS = "not_equals",
    MUST_INCLUDE = "must_include",
    MUST_EXCLUDE = "must_exclude",
    MUST_ONLY_BE = "must_only_be",
    MATCHES_PATTERN = "matches_pattern",
    IN_RANGE = "in_range",
    IS_SET = "is_set",
    IS_NOT_SET = "is_not_set",
    MATCHES_TEMPLATE = "matches_template",
    AND = "and",
    OR = "or"
}
export declare enum SegmentType {
    ENUM = "enum",
    FREE_TEXT = "free_text",
    DATE = "date",
    AUTO_GENERATED = "auto_generated"
}
export declare enum ValidationStatus {
    VALID = "valid",
    INVALID = "invalid",
    PENDING = "pending"
}
export declare enum ExtensionView {
    CREATE = "create",
    EDIT = "edit",
    REVIEW = "review"
}
export declare enum InjectionPosition {
    BEFORE = "before",
    AFTER = "after",
    INSIDE = "inside",
    OVERLAY = "overlay"
}

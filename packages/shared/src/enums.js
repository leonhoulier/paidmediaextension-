"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InjectionPosition = exports.ExtensionView = exports.ValidationStatus = exports.SegmentType = exports.RuleOperator = exports.ApprovalStatus = exports.ComplianceStatus = exports.RuleType = exports.SubscriptionPlan = exports.UserRole = exports.EnforcementMode = exports.EntityLevel = exports.Platform = void 0;
var Platform;
(function (Platform) {
    Platform["META"] = "meta";
    Platform["GOOGLE_ADS"] = "google_ads";
    Platform["ALL"] = "all";
})(Platform || (exports.Platform = Platform = {}));
var EntityLevel;
(function (EntityLevel) {
    EntityLevel["CAMPAIGN"] = "campaign";
    EntityLevel["AD_SET"] = "ad_set";
    EntityLevel["AD"] = "ad";
})(EntityLevel || (exports.EntityLevel = EntityLevel = {}));
var EnforcementMode;
(function (EnforcementMode) {
    EnforcementMode["WARNING"] = "warning";
    EnforcementMode["BLOCKING"] = "blocking";
    EnforcementMode["COMMENT_REQUIRED"] = "comment_required";
    EnforcementMode["SECOND_APPROVER"] = "second_approver";
})(EnforcementMode || (exports.EnforcementMode = EnforcementMode = {}));
var UserRole;
(function (UserRole) {
    UserRole["SUPER_ADMIN"] = "super_admin";
    UserRole["ADMIN"] = "admin";
    UserRole["VIEWER"] = "viewer";
    UserRole["BUYER"] = "buyer";
})(UserRole || (exports.UserRole = UserRole = {}));
var SubscriptionPlan;
(function (SubscriptionPlan) {
    SubscriptionPlan["FREE"] = "free";
    SubscriptionPlan["PRO"] = "pro";
    SubscriptionPlan["ENTERPRISE"] = "enterprise";
})(SubscriptionPlan || (exports.SubscriptionPlan = SubscriptionPlan = {}));
var RuleType;
(function (RuleType) {
    RuleType["NAMING_CONVENTION"] = "naming_convention";
    RuleType["BUDGET_ENFORCEMENT"] = "budget_enforcement";
    RuleType["TARGETING_CONSTRAINT"] = "targeting_constraint";
    RuleType["PLACEMENT_ENFORCEMENT"] = "placement_enforcement";
    RuleType["BRAND_SAFETY"] = "brand_safety";
    RuleType["TAXONOMY_COMPLIANCE"] = "taxonomy_compliance";
    RuleType["BIDDING_STRATEGY"] = "bidding_strategy";
    RuleType["SCHEDULE_ENFORCEMENT"] = "schedule_enforcement";
    RuleType["TRACKING_VALIDATION"] = "tracking_validation";
    RuleType["CREATIVE_VALIDATION"] = "creative_validation";
    RuleType["CUSTOM_FIELD"] = "custom_field";
})(RuleType || (exports.RuleType = RuleType = {}));
var ComplianceStatus;
(function (ComplianceStatus) {
    ComplianceStatus["PASSED"] = "passed";
    ComplianceStatus["VIOLATED"] = "violated";
    ComplianceStatus["OVERRIDDEN"] = "overridden";
    ComplianceStatus["PENDING"] = "pending";
})(ComplianceStatus || (exports.ComplianceStatus = ComplianceStatus = {}));
var ApprovalStatus;
(function (ApprovalStatus) {
    ApprovalStatus["PENDING"] = "pending";
    ApprovalStatus["APPROVED"] = "approved";
    ApprovalStatus["REJECTED"] = "rejected";
})(ApprovalStatus || (exports.ApprovalStatus = ApprovalStatus = {}));
var RuleOperator;
(function (RuleOperator) {
    RuleOperator["EQUALS"] = "equals";
    RuleOperator["NOT_EQUALS"] = "not_equals";
    RuleOperator["MUST_INCLUDE"] = "must_include";
    RuleOperator["MUST_EXCLUDE"] = "must_exclude";
    RuleOperator["MUST_ONLY_BE"] = "must_only_be";
    RuleOperator["MATCHES_PATTERN"] = "matches_pattern";
    RuleOperator["IN_RANGE"] = "in_range";
    RuleOperator["IS_SET"] = "is_set";
    RuleOperator["IS_NOT_SET"] = "is_not_set";
    RuleOperator["MATCHES_TEMPLATE"] = "matches_template";
    RuleOperator["AND"] = "and";
    RuleOperator["OR"] = "or";
})(RuleOperator || (exports.RuleOperator = RuleOperator = {}));
var SegmentType;
(function (SegmentType) {
    SegmentType["ENUM"] = "enum";
    SegmentType["FREE_TEXT"] = "free_text";
    SegmentType["DATE"] = "date";
    SegmentType["AUTO_GENERATED"] = "auto_generated";
})(SegmentType || (exports.SegmentType = SegmentType = {}));
var ValidationStatus;
(function (ValidationStatus) {
    ValidationStatus["VALID"] = "valid";
    ValidationStatus["INVALID"] = "invalid";
    ValidationStatus["PENDING"] = "pending";
})(ValidationStatus || (exports.ValidationStatus = ValidationStatus = {}));
var ExtensionView;
(function (ExtensionView) {
    ExtensionView["CREATE"] = "create";
    ExtensionView["EDIT"] = "edit";
    ExtensionView["REVIEW"] = "review";
})(ExtensionView || (exports.ExtensionView = ExtensionView = {}));
var InjectionPosition;
(function (InjectionPosition) {
    InjectionPosition["BEFORE"] = "before";
    InjectionPosition["AFTER"] = "after";
    InjectionPosition["INSIDE"] = "inside";
    InjectionPosition["OVERLAY"] = "overlay";
})(InjectionPosition || (exports.InjectionPosition = InjectionPosition = {}));
//# sourceMappingURL=enums.js.map
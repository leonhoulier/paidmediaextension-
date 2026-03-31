import { Rule, NamingTemplate, ComplianceEvent } from './models.js';
import { Platform, EntityLevel } from './enums.js';
export interface GetRulesRequest {
    platform?: Platform;
    accountId?: string;
    entityLevel?: EntityLevel;
}
export interface GetRulesResponse {
    rules: Rule[];
    namingTemplates: NamingTemplate[];
    version: string;
}
export interface GetRulesVersionResponse {
    version: string;
    lastUpdated: string;
}
export interface PostComplianceEventsRequest {
    events: Omit<ComplianceEvent, 'id' | 'createdAt'>[];
}
export interface PostComplianceEventsResponse {
    created: number;
}
export interface PostComplianceCommentRequest {
    ruleId: string;
    entityName: string;
    comment: string;
}
export interface PostComplianceCommentResponse {
    eventId: string;
}
export interface PostApprovalRequestRequest {
    ruleId: string;
    entitySnapshot: Record<string, unknown>;
}
export interface PostApprovalRequestResponse {
    requestId: string;
}
export interface GetComplianceDashboardRequest {
    dateRange?: {
        start: string;
        end: string;
    };
    groupBy?: 'market' | 'team' | 'buyer' | 'account' | 'rule_category';
}
export interface ComplianceDashboardBreakdown {
    dimension: string;
    score: number;
    passedCount: number;
    totalCount: number;
}
export interface ComplianceDashboardTrend {
    date: string;
    score: number;
}
export interface GetComplianceDashboardResponse {
    overallScore: number;
    campaignsCreated: number;
    violationsThisWeek: number;
    blockedCreations: number;
    breakdowns: ComplianceDashboardBreakdown[];
    trends: ComplianceDashboardTrend[];
}
export interface RulesUpdatedMessage {
    type: 'rules_updated';
    version: string;
    accountIdsAffected: string[];
}
export interface ForceRefreshMessage {
    type: 'force_refresh';
}
export type WebSocketMessage = RulesUpdatedMessage | ForceRefreshMessage;

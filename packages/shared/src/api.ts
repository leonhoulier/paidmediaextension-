import { Rule, NamingTemplate, ComplianceEvent } from './models.js';
import { Platform, EntityLevel } from './enums.js';

/**
 * API Request/Response types
 */

/**
 * Rules API - GET /api/v1/rules
 */
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

/**
 * Rules version check - GET /api/v1/rules/version
 */
export interface GetRulesVersionResponse {
  version: string;
  lastUpdated: string;
}

/**
 * Compliance events batch - POST /api/v1/compliance/events
 */
export interface PostComplianceEventsRequest {
  events: Omit<ComplianceEvent, 'id' | 'createdAt'>[];
}

export interface PostComplianceEventsResponse {
  created: number;
}

/**
 * Submit buyer comment - POST /api/v1/compliance/comment
 */
export interface PostComplianceCommentRequest {
  ruleId: string;
  entityName: string;
  comment: string;
}

export interface PostComplianceCommentResponse {
  eventId: string;
}

/**
 * Request approval - POST /api/v1/approval/request
 */
export interface PostApprovalRequestRequest {
  ruleId: string;
  entitySnapshot: Record<string, unknown>;
}

export interface PostApprovalRequestResponse {
  requestId: string;
}

/**
 * Compliance dashboard - GET /api/v1/admin/compliance/dashboard
 */
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

/**
 * WebSocket / SSE message types
 */
export interface RulesUpdatedMessage {
  type: 'rules_updated';
  version: string;
  accountIdsAffected: string[];
}

export interface ForceRefreshMessage {
  type: 'force_refresh';
}

export type WebSocketMessage = RulesUpdatedMessage | ForceRefreshMessage;

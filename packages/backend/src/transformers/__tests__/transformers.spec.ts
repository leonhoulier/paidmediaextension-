import {
  Platform,
  EntityLevel,
  EnforcementMode,
  UserRole,
  SubscriptionPlan,
  RuleType,
  RuleOperator,
  ComplianceStatus,
  ApprovalStatus,
} from '@media-buying-governance/shared';

import { toApiRule, PrismaRuleWithRelations } from '../rule.transformer';
import { toApiUser } from '../user.transformer';
import { toApiTeam } from '../team.transformer';
import { toApiAdAccount } from '../account.transformer';
import { toApiOrganization } from '../organization.transformer';
import { toApiNamingTemplate } from '../naming-template.transformer';
import { toApiRuleSet } from '../rule-set.transformer';
import { toApiApprovalRequest } from '../approval-request.transformer';
import { toApiComplianceEvent } from '../compliance-event.transformer';

// ---------------------------------------------------------------------------
// Helpers: build mock Prisma objects matching generated Prisma client shapes
// ---------------------------------------------------------------------------

function makePrismaOrganization(overrides: Record<string, unknown> = {}) {
  return {
    id: 'org-1',
    name: 'Acme Corp',
    slug: 'acme-corp',
    plan: 'pro' as const,
    settings: { timezone: 'UTC' },
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makePrismaUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    email: 'alice@example.com',
    name: 'Alice',
    role: 'admin' as const,
    teamIds: ['team-1', 'team-2'],
    extensionToken: 'tok_abc',
    tokenExpiresAt: null as Date | null,
    tokenRevokedAt: null as Date | null,
    lastActiveAt: new Date('2025-06-01T12:00:00Z'),
    ...overrides,
  };
}

function makePrismaTeam(overrides: Record<string, unknown> = {}) {
  return {
    id: 'team-1',
    organizationId: 'org-1',
    name: 'Performance',
    description: 'Performance marketing team',
    memberIds: ['user-1', 'user-2', 'user-3'],
    ...overrides,
  };
}

function makePrismaAdAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    organizationId: 'org-1',
    platform: 'meta' as const,
    platformAccountId: 'act_123456',
    accountName: 'US - Brand',
    market: 'US',
    region: 'NA',
    active: true,
    ...overrides,
  };
}

function makePrismaRuleSet(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rs-1',
    organizationId: 'org-1',
    name: 'Default Rule Set',
    description: 'Main rules',
    accountIds: ['acc-1', 'acc-2'],
    teamIds: ['team-1'],
    buyerIds: ['user-1'],
    active: true,
    version: 2,
    ...overrides,
  };
}

function makePrismaRule(overrides: Record<string, unknown> = {}): PrismaRuleWithRelations {
  return {
    id: 'rule-1',
    ruleSetId: 'rs-1',
    name: 'Budget Cap',
    description: 'Daily budget must be under 10k',
    platform: 'meta' as const,
    entityLevel: 'campaign' as const,
    ruleType: 'budget_enforcement',
    enforcement: 'blocking' as const,
    condition: { operator: 'less_than', field: 'daily_budget', value: 10000 },
    uiConfig: {
      injectionPoint: 'budget_section',
      message: 'Budget exceeds limit',
      style: 'error_banner',
      category: 'Budget',
      priority: 1,
    },
    priority: 1,
    enabled: true,
    version: 3,
    ruleSet: makePrismaRuleSet(),
    namingTemplate: null,
    ...overrides,
  } as PrismaRuleWithRelations;
}

function makePrismaNamingTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'nt-1',
    ruleId: 'rule-1',
    segments: [
      { label: 'Market', type: 'enum', separator: '_', required: true, allowedValues: ['US', 'EU'] },
      { label: 'Campaign', type: 'free_text', separator: '_', required: true },
    ],
    separator: '_',
    example: 'US_Spring2025',
    ...overrides,
  };
}

function makePrismaApprovalRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ar-1',
    organizationId: 'org-1',
    buyerId: 'user-1',
    approverId: 'user-2',
    ruleId: 'rule-1',
    entitySnapshot: { campaignName: 'Test Campaign', dailyBudget: 15000 },
    status: 'pending' as const,
    comment: null as string | null,
    requestedAt: new Date('2025-07-01T10:00:00Z'),
    resolvedAt: null as Date | null,
    ...overrides,
  };
}

function makePrismaComplianceEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ce-1',
    organizationId: 'org-1',
    buyerId: 'user-1',
    adAccountId: 'acc-1',
    platform: 'meta' as const,
    entityLevel: 'campaign' as const,
    entityName: 'Spring Campaign',
    ruleId: 'rule-1',
    status: 'violated' as const,
    fieldValue: '15000',
    expectedValue: '<10000',
    comment: 'Approved by manager',
    createdAt: new Date('2025-07-02T08:30:00Z'),
    ...overrides,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('toApiRule', () => {
  it('maps basic fields correctly', () => {
    const prismaRule = makePrismaRule();
    const result = toApiRule(prismaRule);

    expect(result.id).toBe('rule-1');
    expect(result.ruleSetId).toBe('rs-1');
    expect(result.name).toBe('Budget Cap');
    expect(result.description).toBe('Daily budget must be under 10k');
    expect(result.version).toBe(3);
    expect(result.enabled).toBe(true);
    expect(result.ruleType).toBe(RuleType.BUDGET_ENFORCEMENT);
    expect(result.enforcement).toBe(EnforcementMode.BLOCKING);
  });

  it('builds scope.platforms from a specific platform', () => {
    const result = toApiRule(makePrismaRule({ platform: 'meta' }));
    expect(result.scope.platforms).toEqual([Platform.META]);
  });

  it('expands scope.platforms for platform "all"', () => {
    const result = toApiRule(makePrismaRule({ platform: 'all' }));
    expect(result.scope.platforms).toEqual([Platform.META, Platform.GOOGLE_ADS]);
  });

  it('maps google_ads platform', () => {
    const result = toApiRule(makePrismaRule({ platform: 'google_ads' }));
    expect(result.scope.platforms).toEqual([Platform.GOOGLE_ADS]);
  });

  it('wraps entityLevel in an array', () => {
    const result = toApiRule(makePrismaRule({ entityLevel: 'ad_set' }));
    expect(result.scope.entityLevels).toEqual([EntityLevel.AD_SET]);
  });

  it('populates scope accountIds, teamIds, buyerIds from ruleSet', () => {
    const ruleSet = makePrismaRuleSet({
      accountIds: ['a1', 'a2'],
      teamIds: ['t1'],
      buyerIds: ['b1', 'b2', 'b3'],
    });
    const result = toApiRule(makePrismaRule({ ruleSet }));

    expect(result.scope.accountIds).toEqual(['a1', 'a2']);
    expect(result.scope.teamIds).toEqual(['t1']);
    expect(result.scope.buyerIds).toEqual(['b1', 'b2', 'b3']);
  });

  it('defaults scope arrays when ruleSet is null', () => {
    const result = toApiRule(makePrismaRule({ ruleSet: null }));

    expect(result.scope.accountIds).toEqual([]);
    expect(result.scope.teamIds).toEqual([]);
    expect(result.scope.buyerIds).toEqual([]);
  });

  it('defaults scope arrays when ruleSet is undefined', () => {
    const result = toApiRule(makePrismaRule({ ruleSet: undefined }));

    expect(result.scope.accountIds).toEqual([]);
    expect(result.scope.teamIds).toEqual([]);
    expect(result.scope.buyerIds).toEqual([]);
  });

  it('maps null description to empty string', () => {
    const result = toApiRule(makePrismaRule({ description: null }));
    expect(result.description).toBe('');
  });

  it('builds condition from JSON', () => {
    const condition = { operator: 'in_range', field: 'budget', value: [100, 500] };
    const result = toApiRule(makePrismaRule({ condition }));

    expect(result.condition.operator).toBe(RuleOperator.IN_RANGE);
    expect(result.condition.field).toBe('budget');
    expect(result.condition.value).toEqual([100, 500]);
  });

  it('builds uiConfig with defaults for missing fields', () => {
    const result = toApiRule(makePrismaRule({ uiConfig: {} }));

    expect(result.ui.injectionPoint).toBe('auto');
    expect(result.ui.message).toBe('');
    expect(result.ui.style).toBe('warning_banner');
    expect(result.ui.category).toBe('General');
    expect(result.ui.priority).toBe(0);
  });

  it('maps unknown ruleType to CUSTOM_FIELD', () => {
    const result = toApiRule(makePrismaRule({ ruleType: 'totally_unknown' }));
    expect(result.ruleType).toBe(RuleType.CUSTOM_FIELD);
  });

  it('maps enforcement modes correctly', () => {
    expect(toApiRule(makePrismaRule({ enforcement: 'warning' })).enforcement).toBe(EnforcementMode.WARNING);
    expect(toApiRule(makePrismaRule({ enforcement: 'comment_required' })).enforcement).toBe(EnforcementMode.COMMENT_REQUIRED);
    expect(toApiRule(makePrismaRule({ enforcement: 'second_approver' })).enforcement).toBe(EnforcementMode.SECOND_APPROVER);
  });

  it('builds metadata with placeholder dates', () => {
    const result = toApiRule(makePrismaRule());

    expect(result.metadata.createdBy).toBe('');
    expect(result.metadata.createdAt).toEqual(new Date(0));
    expect(result.metadata.updatedAt).toEqual(new Date(0));
  });
});

describe('toApiUser', () => {
  it('maps basic fields correctly', () => {
    const result = toApiUser(makePrismaUser());

    expect(result.id).toBe('user-1');
    expect(result.organizationId).toBe('org-1');
    expect(result.email).toBe('alice@example.com');
    expect(result.name).toBe('Alice');
    expect(result.teamIds).toEqual(['team-1', 'team-2']);
    expect(result.extensionToken).toBe('tok_abc');
    expect(result.lastActiveAt).toEqual(new Date('2025-06-01T12:00:00Z'));
  });

  it('maps role super_admin', () => {
    const result = toApiUser(makePrismaUser({ role: 'super_admin' }));
    expect(result.role).toBe(UserRole.SUPER_ADMIN);
  });

  it('maps role admin', () => {
    const result = toApiUser(makePrismaUser({ role: 'admin' }));
    expect(result.role).toBe(UserRole.ADMIN);
  });

  it('maps role viewer', () => {
    const result = toApiUser(makePrismaUser({ role: 'viewer' }));
    expect(result.role).toBe(UserRole.VIEWER);
  });

  it('maps role buyer', () => {
    const result = toApiUser(makePrismaUser({ role: 'buyer' }));
    expect(result.role).toBe(UserRole.BUYER);
  });

  it('converts null extensionToken to undefined', () => {
    const result = toApiUser(makePrismaUser({ extensionToken: null }));
    expect(result.extensionToken).toBeUndefined();
  });

  it('converts null lastActiveAt to undefined', () => {
    const result = toApiUser(makePrismaUser({ lastActiveAt: null }));
    expect(result.lastActiveAt).toBeUndefined();
  });
});

describe('toApiTeam', () => {
  it('maps basic fields correctly', () => {
    const result = toApiTeam(makePrismaTeam());

    expect(result.id).toBe('team-1');
    expect(result.organizationId).toBe('org-1');
    expect(result.name).toBe('Performance');
    expect(result.description).toBe('Performance marketing team');
    expect(result.memberIds).toEqual(['user-1', 'user-2', 'user-3']);
  });

  it('preserves memberIds order', () => {
    const result = toApiTeam(makePrismaTeam({ memberIds: ['z', 'a', 'm'] }));
    expect(result.memberIds).toEqual(['z', 'a', 'm']);
  });

  it('converts null description to undefined', () => {
    const result = toApiTeam(makePrismaTeam({ description: null }));
    expect(result.description).toBeUndefined();
  });

  it('handles empty memberIds', () => {
    const result = toApiTeam(makePrismaTeam({ memberIds: [] }));
    expect(result.memberIds).toEqual([]);
  });
});

describe('toApiAdAccount', () => {
  it('maps basic fields correctly', () => {
    const result = toApiAdAccount(makePrismaAdAccount());

    expect(result.id).toBe('acc-1');
    expect(result.organizationId).toBe('org-1');
    expect(result.platformAccountId).toBe('act_123456');
    expect(result.accountName).toBe('US - Brand');
    expect(result.market).toBe('US');
    expect(result.region).toBe('NA');
    expect(result.active).toBe(true);
  });

  it('maps platform meta', () => {
    const result = toApiAdAccount(makePrismaAdAccount({ platform: 'meta' }));
    expect(result.platform).toBe(Platform.META);
  });

  it('maps platform google_ads', () => {
    const result = toApiAdAccount(makePrismaAdAccount({ platform: 'google_ads' }));
    expect(result.platform).toBe(Platform.GOOGLE_ADS);
  });

  it('maps platform all', () => {
    const result = toApiAdAccount(makePrismaAdAccount({ platform: 'all' }));
    expect(result.platform).toBe(Platform.ALL);
  });

  it('converts null market to undefined', () => {
    const result = toApiAdAccount(makePrismaAdAccount({ market: null }));
    expect(result.market).toBeUndefined();
  });

  it('converts null region to undefined', () => {
    const result = toApiAdAccount(makePrismaAdAccount({ region: null }));
    expect(result.region).toBeUndefined();
  });

  it('handles inactive accounts', () => {
    const result = toApiAdAccount(makePrismaAdAccount({ active: false }));
    expect(result.active).toBe(false);
  });
});

describe('toApiOrganization', () => {
  it('maps basic fields correctly', () => {
    const result = toApiOrganization(makePrismaOrganization());

    expect(result.id).toBe('org-1');
    expect(result.name).toBe('Acme Corp');
    expect(result.slug).toBe('acme-corp');
    expect(result.createdAt).toEqual(new Date('2025-01-01T00:00:00Z'));
  });

  it('maps plan free', () => {
    const result = toApiOrganization(makePrismaOrganization({ plan: 'free' }));
    expect(result.plan).toBe(SubscriptionPlan.FREE);
  });

  it('maps plan pro', () => {
    const result = toApiOrganization(makePrismaOrganization({ plan: 'pro' }));
    expect(result.plan).toBe(SubscriptionPlan.PRO);
  });

  it('maps plan enterprise', () => {
    const result = toApiOrganization(makePrismaOrganization({ plan: 'enterprise' }));
    expect(result.plan).toBe(SubscriptionPlan.ENTERPRISE);
  });

  it('passes through settings JSON as Record<string, unknown>', () => {
    const settings = { timezone: 'UTC', locale: 'en-US', features: { dark: true } };
    const result = toApiOrganization(makePrismaOrganization({ settings }));
    expect(result.settings).toEqual(settings);
  });

  it('defaults null settings to empty object', () => {
    const result = toApiOrganization(makePrismaOrganization({ settings: null }));
    expect(result.settings).toEqual({});
  });
});

describe('toApiNamingTemplate', () => {
  it('maps basic fields correctly', () => {
    const result = toApiNamingTemplate(makePrismaNamingTemplate());

    expect(result.id).toBe('nt-1');
    expect(result.ruleId).toBe('rule-1');
    expect(result.separator).toBe('_');
    expect(result.example).toBe('US_Spring2025');
  });

  it('casts segments JSON to NamingSegment[]', () => {
    const result = toApiNamingTemplate(makePrismaNamingTemplate());

    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toEqual({
      label: 'Market',
      type: 'enum',
      separator: '_',
      required: true,
      allowedValues: ['US', 'EU'],
    });
    expect(result.segments[1]).toEqual({
      label: 'Campaign',
      type: 'free_text',
      separator: '_',
      required: true,
    });
  });

  it('defaults null segments to empty array', () => {
    const result = toApiNamingTemplate(makePrismaNamingTemplate({ segments: null }));
    expect(result.segments).toEqual([]);
  });

  it('handles different separator', () => {
    const result = toApiNamingTemplate(makePrismaNamingTemplate({ separator: '-' }));
    expect(result.separator).toBe('-');
  });
});

describe('toApiRuleSet', () => {
  it('maps basic fields correctly', () => {
    const result = toApiRuleSet(makePrismaRuleSet());

    expect(result.id).toBe('rs-1');
    expect(result.organizationId).toBe('org-1');
    expect(result.name).toBe('Default Rule Set');
    expect(result.description).toBe('Main rules');
    expect(result.active).toBe(true);
    expect(result.version).toBe(2);
  });

  it('maps accountIds, teamIds, buyerIds', () => {
    const result = toApiRuleSet(makePrismaRuleSet());

    expect(result.accountIds).toEqual(['acc-1', 'acc-2']);
    expect(result.teamIds).toEqual(['team-1']);
    expect(result.buyerIds).toEqual(['user-1']);
  });

  it('defaults null description to empty string', () => {
    const result = toApiRuleSet(makePrismaRuleSet({ description: null }));
    expect(result.description).toBe('');
  });

  it('handles empty scope arrays', () => {
    const result = toApiRuleSet(makePrismaRuleSet({
      accountIds: [],
      teamIds: [],
      buyerIds: [],
    }));

    expect(result.accountIds).toEqual([]);
    expect(result.teamIds).toEqual([]);
    expect(result.buyerIds).toEqual([]);
  });

  it('handles inactive rule set', () => {
    const result = toApiRuleSet(makePrismaRuleSet({ active: false }));
    expect(result.active).toBe(false);
  });
});

describe('toApiApprovalRequest', () => {
  it('maps basic fields correctly', () => {
    const result = toApiApprovalRequest(makePrismaApprovalRequest());

    expect(result.id).toBe('ar-1');
    expect(result.organizationId).toBe('org-1');
    expect(result.buyerId).toBe('user-1');
    expect(result.approverId).toBe('user-2');
    expect(result.ruleId).toBe('rule-1');
    expect(result.requestedAt).toEqual(new Date('2025-07-01T10:00:00Z'));
  });

  it('maps status pending', () => {
    const result = toApiApprovalRequest(makePrismaApprovalRequest({ status: 'pending' }));
    expect(result.status).toBe(ApprovalStatus.PENDING);
  });

  it('maps status approved', () => {
    const result = toApiApprovalRequest(makePrismaApprovalRequest({ status: 'approved' }));
    expect(result.status).toBe(ApprovalStatus.APPROVED);
  });

  it('maps status rejected', () => {
    const result = toApiApprovalRequest(makePrismaApprovalRequest({ status: 'rejected' }));
    expect(result.status).toBe(ApprovalStatus.REJECTED);
  });

  it('passes through entitySnapshot JSON', () => {
    const snapshot = { campaignName: 'Test', dailyBudget: 15000 };
    const result = toApiApprovalRequest(makePrismaApprovalRequest({ entitySnapshot: snapshot }));
    expect(result.entitySnapshot).toEqual(snapshot);
  });

  it('converts null comment to undefined', () => {
    const result = toApiApprovalRequest(makePrismaApprovalRequest({ comment: null }));
    expect(result.comment).toBeUndefined();
  });

  it('passes through non-null comment', () => {
    const result = toApiApprovalRequest(makePrismaApprovalRequest({ comment: 'Looks good' }));
    expect(result.comment).toBe('Looks good');
  });

  it('converts null resolvedAt to undefined', () => {
    const result = toApiApprovalRequest(makePrismaApprovalRequest({ resolvedAt: null }));
    expect(result.resolvedAt).toBeUndefined();
  });

  it('passes through non-null resolvedAt', () => {
    const resolved = new Date('2025-07-02T14:00:00Z');
    const result = toApiApprovalRequest(makePrismaApprovalRequest({ resolvedAt: resolved }));
    expect(result.resolvedAt).toEqual(resolved);
  });
});

describe('toApiComplianceEvent', () => {
  it('maps basic fields correctly', () => {
    const result = toApiComplianceEvent(makePrismaComplianceEvent());

    expect(result.id).toBe('ce-1');
    expect(result.organizationId).toBe('org-1');
    expect(result.buyerId).toBe('user-1');
    expect(result.adAccountId).toBe('acc-1');
    expect(result.entityName).toBe('Spring Campaign');
    expect(result.ruleId).toBe('rule-1');
    expect(result.createdAt).toEqual(new Date('2025-07-02T08:30:00Z'));
  });

  it('maps status passed', () => {
    const result = toApiComplianceEvent(makePrismaComplianceEvent({ status: 'passed' }));
    expect(result.status).toBe(ComplianceStatus.PASSED);
  });

  it('maps status violated', () => {
    const result = toApiComplianceEvent(makePrismaComplianceEvent({ status: 'violated' }));
    expect(result.status).toBe(ComplianceStatus.VIOLATED);
  });

  it('maps status overridden', () => {
    const result = toApiComplianceEvent(makePrismaComplianceEvent({ status: 'overridden' }));
    expect(result.status).toBe(ComplianceStatus.OVERRIDDEN);
  });

  it('maps status pending', () => {
    const result = toApiComplianceEvent(makePrismaComplianceEvent({ status: 'pending' }));
    expect(result.status).toBe(ComplianceStatus.PENDING);
  });

  it('maps platform and entityLevel enums', () => {
    const result = toApiComplianceEvent(makePrismaComplianceEvent({
      platform: 'google_ads',
      entityLevel: 'ad_set',
    }));
    expect(result.platform).toBe(Platform.GOOGLE_ADS);
    expect(result.entityLevel).toBe(EntityLevel.AD_SET);
  });

  it('maps entityLevel ad', () => {
    const result = toApiComplianceEvent(makePrismaComplianceEvent({ entityLevel: 'ad' }));
    expect(result.entityLevel).toBe(EntityLevel.AD);
  });

  it('converts null optional fields to undefined', () => {
    const result = toApiComplianceEvent(makePrismaComplianceEvent({
      fieldValue: null,
      expectedValue: null,
      comment: null,
    }));

    expect(result.fieldValue).toBeUndefined();
    expect(result.expectedValue).toBeUndefined();
    expect(result.comment).toBeUndefined();
  });

  it('passes through non-null optional fields', () => {
    const result = toApiComplianceEvent(makePrismaComplianceEvent({
      fieldValue: '15000',
      expectedValue: '<10000',
      comment: 'Override accepted',
    }));

    expect(result.fieldValue).toBe('15000');
    expect(result.expectedValue).toBe('<10000');
    expect(result.comment).toBe('Override accepted');
  });
});

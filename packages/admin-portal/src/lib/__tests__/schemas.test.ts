import { describe, it, expect } from 'vitest';
import {
  Platform,
  EntityLevel,
  EnforcementMode,
  RuleType,
  RuleOperator,
  SegmentType,
} from '@media-buying-governance/shared';
import {
  ruleScopeSchema,
  ruleConditionSchema,
  ruleUIConfigSchema,
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  createRuleSchema,
  namingSegmentSchema,
  createNamingTemplateSchema,
} from '../schemas';

/* ---------- ruleScopeSchema ---------- */

describe('ruleScopeSchema', () => {
  const validScope = {
    platforms: [Platform.META],
    entityLevels: [EntityLevel.CAMPAIGN],
    accountIds: ['acc-1'],
    teamIds: [],
    buyerIds: [],
  };

  it('accepts valid scope', () => {
    expect(ruleScopeSchema.safeParse(validScope).success).toBe(true);
  });

  it('requires at least one platform', () => {
    const result = ruleScopeSchema.safeParse({ ...validScope, platforms: [] });
    expect(result.success).toBe(false);
  });

  it('requires at least one entity level', () => {
    const result = ruleScopeSchema.safeParse({ ...validScope, entityLevels: [] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid platform enum value', () => {
    const result = ruleScopeSchema.safeParse({ ...validScope, platforms: ['tiktok'] });
    expect(result.success).toBe(false);
  });

  it('allows empty accountIds, teamIds, buyerIds', () => {
    const result = ruleScopeSchema.safeParse({
      ...validScope,
      accountIds: [],
      teamIds: [],
      buyerIds: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing platforms field', () => {
    const { platforms: _platforms, ...rest } = validScope;
    expect(ruleScopeSchema.safeParse(rest).success).toBe(false);
  });
});

/* ---------- ruleConditionSchema ---------- */

describe('ruleConditionSchema', () => {
  it('accepts a simple condition', () => {
    const result = ruleConditionSchema.safeParse({
      operator: RuleOperator.EQUALS,
      field: 'status',
      value: 'active',
    });
    expect(result.success).toBe(true);
  });

  it('accepts nested conditions', () => {
    const result = ruleConditionSchema.safeParse({
      operator: RuleOperator.AND,
      conditions: [
        { operator: RuleOperator.EQUALS, field: 'status', value: 'active' },
        { operator: RuleOperator.GREATER_THAN, field: 'budget', value: 100 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid operator', () => {
    const result = ruleConditionSchema.safeParse({
      operator: 'INVALID_OP',
      field: 'status',
    });
    expect(result.success).toBe(false);
  });

  it('allows omitting optional field and value', () => {
    const result = ruleConditionSchema.safeParse({
      operator: RuleOperator.AND,
    });
    expect(result.success).toBe(true);
  });
});

/* ---------- ruleUIConfigSchema ---------- */

describe('ruleUIConfigSchema', () => {
  const validUI = {
    injectionPoint: '.campaign-form',
    message: 'Budget exceeds limit',
    style: 'warning',
    category: 'budget',
    priority: 1,
  };

  it('accepts valid UI config', () => {
    expect(ruleUIConfigSchema.safeParse(validUI).success).toBe(true);
  });

  it('rejects empty injectionPoint', () => {
    const result = ruleUIConfigSchema.safeParse({ ...validUI, injectionPoint: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty message', () => {
    const result = ruleUIConfigSchema.safeParse({ ...validUI, message: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty style', () => {
    const result = ruleUIConfigSchema.safeParse({ ...validUI, style: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty category', () => {
    const result = ruleUIConfigSchema.safeParse({ ...validUI, category: '' });
    expect(result.success).toBe(false);
  });

  it('rejects negative priority', () => {
    const result = ruleUIConfigSchema.safeParse({ ...validUI, priority: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer priority', () => {
    const result = ruleUIConfigSchema.safeParse({ ...validUI, priority: 1.5 });
    expect(result.success).toBe(false);
  });

  it('accepts priority of 0', () => {
    const result = ruleUIConfigSchema.safeParse({ ...validUI, priority: 0 });
    expect(result.success).toBe(true);
  });

  it('accepts optional requireConfirmation and confirmationMessage', () => {
    const result = ruleUIConfigSchema.safeParse({
      ...validUI,
      requireConfirmation: true,
      confirmationMessage: 'Are you sure?',
    });
    expect(result.success).toBe(true);
  });
});

/* ---------- step1Schema ---------- */

describe('step1Schema', () => {
  const validStep1 = {
    accountIds: ['acc-1'],
    teamIds: ['team-1'],
    buyerIds: [],
    allAccounts: false,
    allTeams: false,
    allBuyers: true,
  };

  it('accepts valid step 1 data', () => {
    expect(step1Schema.safeParse(validStep1).success).toBe(true);
  });

  it('accepts empty arrays for ids', () => {
    const result = step1Schema.safeParse({
      ...validStep1,
      accountIds: [],
      teamIds: [],
      buyerIds: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing allAccounts', () => {
    const { allAccounts: _allAccounts, ...rest } = validStep1;
    expect(step1Schema.safeParse(rest).success).toBe(false);
  });

  it('rejects non-boolean allAccounts', () => {
    const result = step1Schema.safeParse({ ...validStep1, allAccounts: 'yes' });
    expect(result.success).toBe(false);
  });
});

/* ---------- step2Schema ---------- */

describe('step2Schema', () => {
  it('accepts valid step 2 data', () => {
    const result = step2Schema.safeParse({
      platforms: [Platform.META, Platform.GOOGLE_ADS],
      entityLevels: [EntityLevel.CAMPAIGN],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty platforms', () => {
    const result = step2Schema.safeParse({
      platforms: [],
      entityLevels: [EntityLevel.CAMPAIGN],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty entityLevels', () => {
    const result = step2Schema.safeParse({
      platforms: [Platform.META],
      entityLevels: [],
    });
    expect(result.success).toBe(false);
  });
});

/* ---------- step3Schema ---------- */

describe('step3Schema', () => {
  it('accepts valid step 3 data', () => {
    const result = step3Schema.safeParse({
      ruleType: RuleType.BUDGET_ENFORCEMENT,
      condition: { operator: RuleOperator.GREATER_THAN, field: 'budget', value: 1000 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional namingTemplateId', () => {
    const result = step3Schema.safeParse({
      ruleType: RuleType.NAMING_CONVENTION,
      condition: { operator: RuleOperator.MATCHES_TEMPLATE },
      namingTemplateId: 'tpl-1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid ruleType', () => {
    const result = step3Schema.safeParse({
      ruleType: 'INVALID_TYPE',
      condition: { operator: RuleOperator.EQUALS },
    });
    expect(result.success).toBe(false);
  });
});

/* ---------- step4Schema ---------- */

describe('step4Schema', () => {
  const validStep4 = {
    enforcement: EnforcementMode.WARNING,
    message: 'Budget exceeds limit',
    category: 'budget',
    priority: 1,
  };

  it('accepts valid step 4 data', () => {
    expect(step4Schema.safeParse(validStep4).success).toBe(true);
  });

  it('rejects empty message', () => {
    const result = step4Schema.safeParse({ ...validStep4, message: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty category', () => {
    const result = step4Schema.safeParse({ ...validStep4, category: '' });
    expect(result.success).toBe(false);
  });

  it('rejects negative priority', () => {
    const result = step4Schema.safeParse({ ...validStep4, priority: -1 });
    expect(result.success).toBe(false);
  });

  it('accepts all enforcement modes', () => {
    for (const mode of Object.values(EnforcementMode)) {
      const result = step4Schema.safeParse({ ...validStep4, enforcement: mode });
      expect(result.success).toBe(true);
    }
  });
});

/* ---------- createRuleSchema ---------- */

describe('createRuleSchema', () => {
  const validRule = {
    name: 'Budget Cap Rule',
    description: 'Prevent budget overspend',
    ruleSetId: 'rs-1',
    scope: {
      platforms: [Platform.META],
      entityLevels: [EntityLevel.CAMPAIGN],
      accountIds: [],
      teamIds: [],
      buyerIds: [],
    },
    ruleType: RuleType.BUDGET_ENFORCEMENT,
    enforcement: EnforcementMode.BLOCKING,
    condition: { operator: RuleOperator.GREATER_THAN, field: 'budget', value: 10000 },
    ui: {
      injectionPoint: '.budget-field',
      message: 'Budget exceeds $10,000',
      style: 'error',
      category: 'budget',
      priority: 1,
    },
    enabled: true,
    version: 1,
  };

  it('accepts a fully valid rule', () => {
    expect(createRuleSchema.safeParse(validRule).success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createRuleSchema.safeParse({ ...validRule, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty description', () => {
    const result = createRuleSchema.safeParse({ ...validRule, description: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty ruleSetId', () => {
    const result = createRuleSchema.safeParse({ ...validRule, ruleSetId: '' });
    expect(result.success).toBe(false);
  });

  it('rejects version less than 1', () => {
    const result = createRuleSchema.safeParse({ ...validRule, version: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer version', () => {
    const result = createRuleSchema.safeParse({ ...validRule, version: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = createRuleSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

/* ---------- namingSegmentSchema ---------- */

describe('namingSegmentSchema', () => {
  const validSegment = {
    label: 'Platform',
    type: SegmentType.ENUM,
    separator: '_',
    required: true,
    allowedValues: ['meta', 'google'],
  };

  it('accepts a valid segment', () => {
    expect(namingSegmentSchema.safeParse(validSegment).success).toBe(true);
  });

  it('rejects empty label', () => {
    const result = namingSegmentSchema.safeParse({ ...validSegment, label: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid segment type', () => {
    const result = namingSegmentSchema.safeParse({ ...validSegment, type: 'UNKNOWN' });
    expect(result.success).toBe(false);
  });

  it('provides default separator', () => {
    const { separator: _sep, ...withoutSep } = validSegment;
    const result = namingSegmentSchema.safeParse(withoutSep);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.separator).toBe('_');
    }
  });

  it('provides default required=true', () => {
    const { required: _req, ...withoutReq } = validSegment;
    const result = namingSegmentSchema.safeParse(withoutReq);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.required).toBe(true);
    }
  });

  it('accepts optional autoGenerator values', () => {
    for (const gen of ['uuid_short', 'sequential', 'hash'] as const) {
      const result = namingSegmentSchema.safeParse({ ...validSegment, autoGenerator: gen });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid autoGenerator value', () => {
    const result = namingSegmentSchema.safeParse({ ...validSegment, autoGenerator: 'random' });
    expect(result.success).toBe(false);
  });

  it('accepts all SegmentType enum values', () => {
    for (const type of Object.values(SegmentType)) {
      const result = namingSegmentSchema.safeParse({ ...validSegment, type });
      expect(result.success).toBe(true);
    }
  });
});

/* ---------- createNamingTemplateSchema ---------- */

describe('createNamingTemplateSchema', () => {
  const validTemplate = {
    ruleId: 'rule-1',
    segments: [
      { label: 'Platform', type: SegmentType.ENUM, separator: '_', required: true },
    ],
    separator: '_',
    example: 'meta_campaign_2024',
  };

  it('accepts a valid naming template', () => {
    expect(createNamingTemplateSchema.safeParse(validTemplate).success).toBe(true);
  });

  it('rejects empty ruleId', () => {
    const result = createNamingTemplateSchema.safeParse({ ...validTemplate, ruleId: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty segments array', () => {
    const result = createNamingTemplateSchema.safeParse({ ...validTemplate, segments: [] });
    expect(result.success).toBe(false);
  });

  it('rejects missing ruleId', () => {
    const { ruleId: _ruleId, ...rest } = validTemplate;
    expect(createNamingTemplateSchema.safeParse(rest).success).toBe(false);
  });

  it('provides default separator when omitted', () => {
    const { separator: _sep, ...withoutSep } = validTemplate;
    const result = createNamingTemplateSchema.safeParse(withoutSep);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.separator).toBe('_');
    }
  });
});

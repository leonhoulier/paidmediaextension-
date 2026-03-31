/**
 * Rule Evaluation Engine Tests
 *
 * Comprehensive tests for evaluateRules(), evaluateCondition(), all 18 operators,
 * validateNamingConvention(), computeScore(), and getNestedValue().
 *
 * @module rules/__tests__/evaluator
 */

/**
 * ts-jest ESM compilation only exposes the original 12 RuleOperator enum
 * members at test time.  We augment the module with the full enum so that
 * both the evaluator's switch statement and the test conditions resolve to
 * the same string values.
 */
jest.mock('@media-buying-governance/shared', () => {
  const actual = jest.requireActual('@media-buying-governance/shared') as Record<string, unknown>;
  const existingOp = (actual.RuleOperator ?? {}) as Record<string, string>;
  return {
    ...actual,
    RuleOperator: {
      ...existingOp,
      // Ensure all 22 members are present
      EQUALS: 'equals',
      NOT_EQUALS: 'not_equals',
      MUST_INCLUDE: 'must_include',
      MUST_EXCLUDE: 'must_exclude',
      MUST_ONLY_BE: 'must_only_be',
      MATCHES_PATTERN: 'matches_pattern',
      IN_RANGE: 'in_range',
      IS_SET: 'is_set',
      IS_NOT_SET: 'is_not_set',
      MATCHES_TEMPLATE: 'matches_template',
      AND: 'and',
      OR: 'or',
      LESS_THAN: 'less_than',
      GREATER_THAN: 'greater_than',
      LESS_THAN_OR_EQUAL: 'less_than_or_equal',
      GREATER_THAN_OR_EQUAL: 'greater_than_or_equal',
      CONTAINS: 'contains',
      NOT_CONTAINS: 'not_contains',
      IS_VALID_URL: 'is_valid_url',
      CROSS_ENTITY_EQUALS: 'cross_entity_equals',
      MATCHES_EXTERNAL: 'matches_external',
      COUNT_IN_RANGE: 'count_in_range',
    },
    EnforcementMode: {
      ...((actual.EnforcementMode ?? {}) as Record<string, string>),
      WARNING: 'warning',
      BLOCKING: 'blocking',
      COMMENT_REQUIRED: 'comment_required',
      SECOND_APPROVER: 'second_approver',
    },
  };
});

// Mock the logger to suppress console output during tests
jest.mock('../../utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import type { Rule, RuleCondition, RuleEvaluationResult, NamingTemplate } from '@media-buying-governance/shared';
import { RuleOperator, EnforcementMode, RuleType, Platform, EntityLevel } from '@media-buying-governance/shared';
import { evaluateRules, validateNamingConvention, computeScore } from '../evaluator.js';

// Mock performance.now for deterministic timing
const mockPerformanceNow = jest.fn();
let perfCallCount = 0;
beforeAll(() => {
  mockPerformanceNow.mockImplementation(() => {
    perfCallCount++;
    // First call returns 0, second returns 10 (fast evaluation)
    return perfCallCount % 2 === 1 ? 0 : 10;
  });
  jest.spyOn(performance, 'now').mockImplementation(mockPerformanceNow);
});

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  perfCallCount = 0;
  jest.clearAllMocks();
});

/**
 * Helper: create a minimal valid Rule object for testing.
 */
function makeRule(overrides: Partial<Rule> & { condition: RuleCondition }): Rule {
  return {
    id: 'test-rule-1',
    ruleSetId: 'rs-1',
    name: 'Test Rule',
    description: 'A test rule',
    version: 1,
    enabled: true,
    scope: {
      platforms: [Platform.META],
      entityLevels: [EntityLevel.CAMPAIGN],
      accountIds: [],
      teamIds: [],
      buyerIds: [],
    },
    ruleType: RuleType.CUSTOM_FIELD,
    enforcement: EnforcementMode.WARNING,
    ui: {
      injectionPoint: 'campaign-name',
      message: 'Test message',
      style: 'warning',
      category: 'general',
      priority: 1,
    },
    metadata: {
      createdBy: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// evaluateRules()
// ---------------------------------------------------------------------------
describe('evaluateRules()', () => {
  it('filters out disabled rules', () => {
    const enabledRule = makeRule({
      id: 'enabled',
      enabled: true,
      condition: { operator: RuleOperator.IS_SET, field: 'name' },
    });
    const disabledRule = makeRule({
      id: 'disabled',
      enabled: false,
      condition: { operator: RuleOperator.IS_SET, field: 'name' },
    });

    const results = evaluateRules({ name: 'Campaign' }, [enabledRule, disabledRule]);

    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe('enabled');
  });

  it('returns results for each enabled rule', () => {
    const rule1 = makeRule({
      id: 'r1',
      condition: { operator: RuleOperator.IS_SET, field: 'name' },
    });
    const rule2 = makeRule({
      id: 'r2',
      condition: { operator: RuleOperator.IS_SET, field: 'budget' },
    });

    const results = evaluateRules({ name: 'Campaign', budget: 100 }, [rule1, rule2]);

    expect(results).toHaveLength(2);
    expect(results[0].ruleId).toBe('r1');
    expect(results[1].ruleId).toBe('r2');
  });
});

// ---------------------------------------------------------------------------
// evaluateCondition() -- composite conditions (via evaluateRules)
// ---------------------------------------------------------------------------
describe('evaluateCondition() via evaluateRules', () => {
  it('AND composite: all sub-conditions must pass', () => {
    const rule = makeRule({
      condition: {
        operator: RuleOperator.AND,
        conditions: [
          { operator: RuleOperator.IS_SET, field: 'name' },
          { operator: RuleOperator.IS_SET, field: 'budget' },
        ],
      },
    });

    const pass = evaluateRules({ name: 'X', budget: 100 }, [rule]);
    expect(pass[0].passed).toBe(true);

    const fail = evaluateRules({ name: 'X' }, [rule]);
    expect(fail[0].passed).toBe(false);
  });

  it('OR composite: any sub-condition passes', () => {
    const rule = makeRule({
      condition: {
        operator: RuleOperator.OR,
        conditions: [
          { operator: RuleOperator.IS_SET, field: 'name' },
          { operator: RuleOperator.IS_SET, field: 'budget' },
        ],
      },
    });

    const passOne = evaluateRules({ name: 'X' }, [rule]);
    expect(passOne[0].passed).toBe(true);

    const failAll = evaluateRules({}, [rule]);
    expect(failAll[0].passed).toBe(false);
  });

  it('missing field path returns false', () => {
    const rule = makeRule({
      condition: { operator: RuleOperator.EQUALS, value: 'x' },
    });

    const results = evaluateRules({}, [rule]);
    expect(results[0].passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// All 18 operators (via evaluateRules with appropriate rule conditions)
// ---------------------------------------------------------------------------
describe('Operators', () => {
  // --- EQUALS ---
  describe('EQUALS', () => {
    it('string case-insensitive match', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.EQUALS, field: 'status', value: 'Active' },
      });
      const result = evaluateRules({ status: 'active' }, [rule]);
      expect(result[0].passed).toBe(true);
    });

    it('array equality', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.EQUALS, field: 'tags', value: ['a', 'b'] },
      });
      expect(evaluateRules({ tags: ['a', 'b'] }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ tags: ['a'] }, [rule])[0].passed).toBe(false);
    });

    it('exact match for non-string/non-array', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.EQUALS, field: 'count', value: 5 },
      });
      expect(evaluateRules({ count: 5 }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ count: 6 }, [rule])[0].passed).toBe(false);
    });
  });

  // --- NOT_EQUALS ---
  describe('NOT_EQUALS', () => {
    it('inverse of EQUALS', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.NOT_EQUALS, field: 'status', value: 'paused' },
      });
      expect(evaluateRules({ status: 'active' }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ status: 'Paused' }, [rule])[0].passed).toBe(false);
    });
  });

  // --- MUST_INCLUDE ---
  describe('MUST_INCLUDE', () => {
    it('array contains all expected', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.MUST_INCLUDE, field: 'placements', value: ['feed', 'stories'] },
      });
      expect(evaluateRules({ placements: ['feed', 'stories', 'reels'] }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ placements: ['feed'] }, [rule])[0].passed).toBe(false);
    });
  });

  // --- MUST_EXCLUDE ---
  describe('MUST_EXCLUDE', () => {
    it('array excludes all expected', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.MUST_EXCLUDE, field: 'placements', value: ['audience_network'] },
      });
      expect(evaluateRules({ placements: ['feed', 'stories'] }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ placements: ['feed', 'audience_network'] }, [rule])[0].passed).toBe(false);
    });
  });

  // --- MUST_ONLY_BE ---
  describe('MUST_ONLY_BE', () => {
    it('exact array match', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.MUST_ONLY_BE, field: 'geos', value: ['US', 'CA'] },
      });
      expect(evaluateRules({ geos: ['US', 'CA'] }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ geos: ['US', 'CA', 'UK'] }, [rule])[0].passed).toBe(false);
      expect(evaluateRules({ geos: ['US'] }, [rule])[0].passed).toBe(false);
    });
  });

  // --- MATCHES_PATTERN ---
  describe('MATCHES_PATTERN', () => {
    it('valid regex match', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.MATCHES_PATTERN, field: 'name', value: '^Campaign_\\d+$' },
      });
      expect(evaluateRules({ name: 'Campaign_123' }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ name: 'BadName' }, [rule])[0].passed).toBe(false);
    });

    it('invalid regex returns false', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.MATCHES_PATTERN, field: 'name', value: '[invalid(' },
      });
      expect(evaluateRules({ name: 'anything' }, [rule])[0].passed).toBe(false);
    });
  });

  // --- IN_RANGE ---
  describe('IN_RANGE', () => {
    it('numeric within {min, max}', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.IN_RANGE, field: 'budget', value: { min: 10, max: 1000 } },
      });
      expect(evaluateRules({ budget: 500 }, [rule])[0].passed).toBe(true);
    });

    it('below min fails', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.IN_RANGE, field: 'budget', value: { min: 10, max: 1000 } },
      });
      expect(evaluateRules({ budget: 5 }, [rule])[0].passed).toBe(false);
    });

    it('above max fails', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.IN_RANGE, field: 'budget', value: { min: 10, max: 1000 } },
      });
      expect(evaluateRules({ budget: 2000 }, [rule])[0].passed).toBe(false);
    });

    it('NaN value returns false', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.IN_RANGE, field: 'budget', value: { min: 10, max: 1000 } },
      });
      expect(evaluateRules({ budget: 'not-a-number' }, [rule])[0].passed).toBe(false);
    });
  });

  // --- IS_SET ---
  describe('IS_SET', () => {
    it('truthy values pass', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.IS_SET, field: 'name' },
      });
      expect(evaluateRules({ name: 'Campaign' }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ name: 0 }, [rule])[0].passed).toBe(true);
    });

    it('null/undefined/empty string/empty array fail', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.IS_SET, field: 'name' },
      });
      expect(evaluateRules({ name: null }, [rule])[0].passed).toBe(false);
      expect(evaluateRules({ name: undefined }, [rule])[0].passed).toBe(false);
      expect(evaluateRules({ name: '' }, [rule])[0].passed).toBe(false);
      expect(evaluateRules({ name: '   ' }, [rule])[0].passed).toBe(false);
      expect(evaluateRules({ name: [] }, [rule])[0].passed).toBe(false);
    });
  });

  // --- IS_NOT_SET ---
  describe('IS_NOT_SET', () => {
    it('inverse of IS_SET', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.IS_NOT_SET, field: 'name' },
      });
      expect(evaluateRules({ name: null }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ name: 'Campaign' }, [rule])[0].passed).toBe(false);
    });
  });

  // --- MATCHES_TEMPLATE ---
  describe('MATCHES_TEMPLATE', () => {
    const template: NamingTemplate = {
      id: 'tpl-1',
      ruleId: 'r-1',
      segments: [
        { label: 'Brand', type: 'enum', separator: '_', required: true, allowedValues: ['Acme', 'BetaCo'] },
        { label: 'Region', type: 'enum', separator: '_', required: true, allowedValues: ['US', 'EU'] },
      ],
      separator: '_',
      example: 'Acme_US',
    };

    it('template lookup and match', () => {
      const rule = makeRule({
        condition: {
          operator: RuleOperator.MATCHES_TEMPLATE,
          field: 'name',
          value: { template_id: 'tpl-1' },
        },
      });
      expect(evaluateRules({ name: 'Acme_US' }, [rule], [template])[0].passed).toBe(true);
    });

    it('template not found returns false', () => {
      const rule = makeRule({
        condition: {
          operator: RuleOperator.MATCHES_TEMPLATE,
          field: 'name',
          value: { template_id: 'nonexistent' },
        },
      });
      expect(evaluateRules({ name: 'Acme_US' }, [rule], [])[0].passed).toBe(false);
    });
  });

  // --- LESS_THAN ---
  describe('LESS_THAN', () => {
    it('numeric less than', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.LESS_THAN, field: 'bid', value: 10 },
      });
      expect(evaluateRules({ bid: 5 }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ bid: 10 }, [rule])[0].passed).toBe(false);
      expect(evaluateRules({ bid: 15 }, [rule])[0].passed).toBe(false);
    });
  });

  // --- GREATER_THAN ---
  describe('GREATER_THAN', () => {
    it('numeric greater than', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.GREATER_THAN, field: 'bid', value: 10 },
      });
      expect(evaluateRules({ bid: 15 }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ bid: 10 }, [rule])[0].passed).toBe(false);
      expect(evaluateRules({ bid: 5 }, [rule])[0].passed).toBe(false);
    });
  });

  // --- LESS_THAN_OR_EQUAL ---
  describe('LESS_THAN_OR_EQUAL', () => {
    it('numeric less than or equal', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.LESS_THAN_OR_EQUAL, field: 'bid', value: 10 },
      });
      expect(evaluateRules({ bid: 5 }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ bid: 10 }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ bid: 15 }, [rule])[0].passed).toBe(false);
    });
  });

  // --- GREATER_THAN_OR_EQUAL ---
  describe('GREATER_THAN_OR_EQUAL', () => {
    it('numeric greater than or equal', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.GREATER_THAN_OR_EQUAL, field: 'bid', value: 10 },
      });
      expect(evaluateRules({ bid: 15 }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ bid: 10 }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ bid: 5 }, [rule])[0].passed).toBe(false);
    });
  });

  // --- CONTAINS ---
  describe('CONTAINS', () => {
    it('string contains substring', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.CONTAINS, field: 'name', value: 'campaign' },
      });
      expect(evaluateRules({ name: 'My Campaign 2024' }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ name: 'My Ad 2024' }, [rule])[0].passed).toBe(false);
    });

    it('array contains element', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.CONTAINS, field: 'tags', value: 'vip' },
      });
      expect(evaluateRules({ tags: ['vip', 'premium'] }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ tags: ['standard'] }, [rule])[0].passed).toBe(false);
    });
  });

  // --- NOT_CONTAINS ---
  describe('NOT_CONTAINS', () => {
    it('inverse of CONTAINS', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.NOT_CONTAINS, field: 'name', value: 'test' },
      });
      expect(evaluateRules({ name: 'Production Campaign' }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ name: 'Test Campaign' }, [rule])[0].passed).toBe(false);
    });
  });

  // --- IS_VALID_URL ---
  describe('IS_VALID_URL', () => {
    it('valid http/https URLs pass', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.IS_VALID_URL, field: 'url' },
      });
      expect(evaluateRules({ url: 'https://example.com' }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ url: 'http://example.com/path' }, [rule])[0].passed).toBe(true);
    });

    it('invalid URLs fail', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.IS_VALID_URL, field: 'url' },
      });
      expect(evaluateRules({ url: 'not-a-url' }, [rule])[0].passed).toBe(false);
      expect(evaluateRules({ url: '' }, [rule])[0].passed).toBe(false);
      expect(evaluateRules({ url: 'ftp://files.example.com' }, [rule])[0].passed).toBe(false);
    });
  });

  // --- COUNT_IN_RANGE ---
  describe('COUNT_IN_RANGE', () => {
    it('array length in range', () => {
      const rule = makeRule({
        condition: { operator: RuleOperator.COUNT_IN_RANGE, field: 'images', value: { min: 1, max: 5 } },
      });
      expect(evaluateRules({ images: ['a', 'b', 'c'] }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ images: [] }, [rule])[0].passed).toBe(false);
      expect(evaluateRules({ images: ['a', 'b', 'c', 'd', 'e', 'f'] }, [rule])[0].passed).toBe(false);
    });
  });

  // --- CROSS_ENTITY_EQUALS ---
  describe('CROSS_ENTITY_EQUALS', () => {
    it('with value: checks equality', () => {
      const rule = makeRule({
        condition: {
          operator: RuleOperator.CROSS_ENTITY_EQUALS,
          field: 'objective',
          value: { value: 'CONVERSIONS' },
        },
      });
      expect(evaluateRules({ objective: 'CONVERSIONS' }, [rule])[0].passed).toBe(true);
      expect(evaluateRules({ objective: 'TRAFFIC' }, [rule])[0].passed).toBe(false);
    });

    it('without value: passes through (server-side)', () => {
      const rule = makeRule({
        condition: {
          operator: RuleOperator.CROSS_ENTITY_EQUALS,
          field: 'objective',
          value: { sourceEntity: 'campaign', targetEntity: 'ad_set' },
        },
      });
      expect(evaluateRules({ objective: 'anything' }, [rule])[0].passed).toBe(true);
    });
  });

  // --- MATCHES_EXTERNAL ---
  describe('MATCHES_EXTERNAL', () => {
    it('always passes (returns true)', () => {
      const rule = makeRule({
        condition: {
          operator: RuleOperator.MATCHES_EXTERNAL,
          field: 'audience_id',
          value: { source: 'external-api' },
        },
      });
      expect(evaluateRules({ audience_id: 'aud_123' }, [rule])[0].passed).toBe(true);
    });
  });

  // --- Unknown operator ---
  describe('Unknown operator', () => {
    it('returns false', () => {
      const rule = makeRule({
        condition: { operator: 'nonexistent_op' as RuleOperator, field: 'name', value: 'x' },
      });
      expect(evaluateRules({ name: 'x' }, [rule])[0].passed).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// validateNamingConvention()
// ---------------------------------------------------------------------------
describe('validateNamingConvention()', () => {
  it('valid name matching template with separator', () => {
    const template: NamingTemplate = {
      id: 't1',
      ruleId: 'r1',
      segments: [
        { label: 'Brand', type: 'enum', separator: '_', required: true, allowedValues: ['Acme'] },
        { label: 'Region', type: 'enum', separator: '_', required: true, allowedValues: ['US', 'EU'] },
      ],
      separator: '_',
      example: 'Acme_US',
    };
    expect(validateNamingConvention('Acme_US', template)).toBe(true);
  });

  it('missing required segment fails', () => {
    const template: NamingTemplate = {
      id: 't1',
      ruleId: 'r1',
      segments: [
        { label: 'Brand', type: 'enum', separator: '_', required: true, allowedValues: ['Acme'] },
        { label: 'Region', type: 'enum', separator: '_', required: true, allowedValues: ['US'] },
        { label: 'Campaign', type: 'free_text', separator: '_', required: true },
      ],
      separator: '_',
      example: 'Acme_US_Summer',
    };
    // Only 2 parts but 3 required segments
    expect(validateNamingConvention('Acme_US', template)).toBe(false);
  });

  it('enum segment with allowedValues validates correctly', () => {
    const template: NamingTemplate = {
      id: 't1',
      ruleId: 'r1',
      segments: [
        { label: 'Platform', type: 'enum', separator: '_', required: true, allowedValues: ['Meta', 'Google'] },
      ],
      separator: '_',
      example: 'Meta',
    };
    expect(validateNamingConvention('Meta', template)).toBe(true);
    expect(validateNamingConvention('TikTok', template)).toBe(false);
  });

  it('date segment (YYYYMMDD format)', () => {
    const template: NamingTemplate = {
      id: 't1',
      ruleId: 'r1',
      segments: [
        { label: 'Date', type: 'date', separator: '_', required: true, format: 'YYYYMMDD' },
      ],
      separator: '_',
      example: '20240101',
    };
    expect(validateNamingConvention('20240315', template)).toBe(true);
    expect(validateNamingConvention('2024-03-15', template)).toBe(false);
    expect(validateNamingConvention('notadate', template)).toBe(false);
  });

  it('free text with pattern', () => {
    const template: NamingTemplate = {
      id: 't1',
      ruleId: 'r1',
      segments: [
        { label: 'Code', type: 'free_text', separator: '_', required: true, pattern: '^[A-Z]{3}\\d{3}$' },
      ],
      separator: '_',
      example: 'ABC123',
    };
    expect(validateNamingConvention('ABC123', template)).toBe(true);
    expect(validateNamingConvention('abc123', template)).toBe(false);
    expect(validateNamingConvention('ABCD1234', template)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeScore()
// ---------------------------------------------------------------------------
describe('computeScore()', () => {
  function makeResult(overrides: Partial<RuleEvaluationResult>): RuleEvaluationResult {
    return {
      ruleId: 'r-1',
      ruleName: 'Rule',
      passed: true,
      message: 'msg',
      category: 'general',
      enforcement: EnforcementMode.WARNING,
      ...overrides,
    };
  }

  it('empty results returns score 100', () => {
    const score = computeScore([]);
    expect(score.overall).toBe(100);
    expect(score.passedCount).toBe(0);
    expect(score.totalCount).toBe(0);
  });

  it('all passed returns score 100', () => {
    const score = computeScore([
      makeResult({ ruleId: 'r1', passed: true }),
      makeResult({ ruleId: 'r2', passed: true }),
    ]);
    expect(score.overall).toBe(100);
    expect(score.passedCount).toBe(2);
    expect(score.totalCount).toBe(2);
  });

  it('mix of passed/failed computes correctly', () => {
    const score = computeScore([
      makeResult({ ruleId: 'r1', passed: true }),
      makeResult({ ruleId: 'r2', passed: false }),
    ]);
    // Both WARNING (weight 1): 1 passed / 2 total = 50%
    expect(score.overall).toBe(50);
    expect(score.passedCount).toBe(1);
    expect(score.totalCount).toBe(2);
  });

  it('blocking rules count double weight', () => {
    const score = computeScore([
      makeResult({ ruleId: 'r1', passed: true, enforcement: EnforcementMode.WARNING }),
      makeResult({ ruleId: 'r2', passed: false, enforcement: EnforcementMode.BLOCKING }),
    ]);
    // WARNING passed (weight 1) + BLOCKING failed (weight 2) = 1/3 = 33%
    expect(score.overall).toBe(33);
  });

  it('category breakdown', () => {
    const score = computeScore([
      makeResult({ ruleId: 'r1', passed: true, category: 'naming' }),
      makeResult({ ruleId: 'r2', passed: false, category: 'naming' }),
      makeResult({ ruleId: 'r3', passed: true, category: 'budget' }),
    ]);
    expect(score.byCategory['naming']).toBe(50);
    expect(score.byCategory['budget']).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// getNestedValue() -- tested via field access in evaluateRules
// ---------------------------------------------------------------------------
describe('getNestedValue() via field access', () => {
  it('flat key match (dotted key exists directly)', () => {
    const rule = makeRule({
      condition: { operator: RuleOperator.EQUALS, field: 'campaign.name', value: 'My Campaign' },
    });
    // Flat map has the dotted key directly
    const results = evaluateRules({ 'campaign.name': 'My Campaign' }, [rule]);
    expect(results[0].passed).toBe(true);
  });

  it('nested dot-notation traversal', () => {
    const rule = makeRule({
      condition: { operator: RuleOperator.EQUALS, field: 'campaign.name', value: 'My Campaign' },
    });
    // Nested object -- getNestedValue walks keys
    const results = evaluateRules({ campaign: { name: 'My Campaign' } } as unknown as Record<string, unknown>, [rule]);
    expect(results[0].passed).toBe(true);
  });
});

/**
 * Rule Evaluation Engine
 *
 * Evaluates rules locally in the Chrome extension for maximum speed.
 * All rule conditions are checked against current DOM field values.
 *
 * Performance target: <100ms for evaluating all rules against a form.
 */

import type {
  Rule,
  RuleCondition,
  RuleEvaluationResult,
  NamingTemplate,
  ComplianceScore,
} from '@media-buying-governance/shared';
import { RuleOperator, EnforcementMode } from '@media-buying-governance/shared';
import { logger } from '../utils/logger.js';

/**
 * Sentinel value injected by the injector for fields that belong to a
 * different entity-level panel than the one currently visible in the DOM.
 *
 * When the user is on the "Campaign" panel, ad_set.* and ad.* fields can't
 * be extracted. Instead of leaving them as `null` (which IS_SET / IS_NOT_SET
 * would interpret as a definitive "not set"), we mark them with this sentinel
 * so the evaluator can return `status: 'unknown'`.
 */
export const NOT_VISIBLE_SENTINEL = '__NOT_VISIBLE__';

/**
 * Evaluate all rules against the current field values
 *
 * @param fieldValues - Current field values extracted from the DOM
 * @param rules - The rule set to evaluate
 * @param namingTemplates - Naming templates for template matching
 * @returns Array of evaluation results for each rule
 */
export function evaluateRules(
  fieldValues: Record<string, unknown>,
  rules: Rule[],
  namingTemplates: NamingTemplate[] = []
): RuleEvaluationResult[] {
  const startTime = performance.now();

  const results = rules
    .filter((rule) => rule.enabled)
    .map((rule) => evaluateRule(fieldValues, rule, namingTemplates));

  const elapsed = performance.now() - startTime;
  if (elapsed > 100) {
    logger.warn(`Rule evaluation took ${elapsed.toFixed(1)}ms (target: <100ms)`);
  } else {
    logger.debug(`Rule evaluation completed in ${elapsed.toFixed(1)}ms`);
  }

  return results;
}

/**
 * Evaluate a single rule against field values
 *
 * @param fieldValues - Current field values
 * @param rule - The rule to evaluate
 * @param namingTemplates - Available naming templates
 * @returns Evaluation result for this rule
 */
function evaluateRule(
  fieldValues: Record<string, unknown>,
  rule: Rule,
  namingTemplates: NamingTemplate[]
): RuleEvaluationResult {
  let passed: boolean;
  let fieldValue: unknown;
  let status: 'passed' | 'failed' | 'unknown';

  try {
    // Extract the field value first to determine if it's available
    fieldValue = rule.condition.field
      ? getNestedValue(fieldValues, rule.condition.field)
      : undefined;

    // Check if the field value is missing/unextractable for simple conditions.
    // For composite conditions (AND/OR) or operators that explicitly check presence
    // (IS_SET, IS_NOT_SET), we always evaluate normally.
    const isPresenceOperator =
      rule.condition.operator === RuleOperator.IS_SET ||
      rule.condition.operator === RuleOperator.IS_NOT_SET;
    const isCompositeOperator =
      rule.condition.operator === RuleOperator.AND ||
      rule.condition.operator === RuleOperator.OR;
    const isServerSideOperator =
      rule.condition.operator === RuleOperator.MATCHES_EXTERNAL ||
      rule.condition.operator === RuleOperator.CROSS_ENTITY_EQUALS;

    // If the field is on a different panel (sentinel value), we can't evaluate at all
    const fieldNotVisible = fieldValue === NOT_VISIBLE_SENTINEL;

    // Rule has no field condition (e.g. test/telemetry rules with field=(none)).
    // Without a field to check, we can't determine pass/fail.
    const hasNoFieldCondition =
      !rule.condition.field && !isCompositeOperator;

    const fieldIsMissing =
      rule.condition.field &&
      (fieldValue === undefined || fieldValue === null) &&
      !isPresenceOperator &&
      !isCompositeOperator &&
      !isServerSideOperator;

    if (fieldNotVisible || hasNoFieldCondition) {
      // Field is on another panel or rule has no field — can't determine pass/fail
      passed = false;
      status = 'unknown';
      // Clear the sentinel so it doesn't leak into the result's fieldValue
      if (fieldNotVisible) fieldValue = undefined;
    } else if (fieldIsMissing) {
      // Field value couldn't be extracted -- we can't determine pass/fail
      passed = false;
      status = 'unknown';
    } else {
      passed = evaluateCondition(fieldValues, rule.condition, namingTemplates);
      status = passed ? 'passed' : 'failed';
    }

    // Debug logging for rule evaluation
    if (!passed && rule.condition.field) {
      console.log(`[RULE-DEBUG] Rule "${rule.name}" checking field: "${rule.condition.field}", actualValue:`, fieldValue, `status: ${status}`);
    }
  } catch (err) {
    logger.error(`Error evaluating rule "${rule.name}":`, err);
    passed = false;
    status = 'unknown';
  }

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    passed,
    status,
    message: rule.ui.message,
    category: rule.ui.category,
    enforcement: rule.enforcement,
    fieldValue,
    expectedValue: rule.condition.value,
  };
}

/**
 * Evaluate a rule condition (supports simple and composite conditions)
 *
 * @param fieldValues - Current field values
 * @param condition - The condition to evaluate
 * @param namingTemplates - Available naming templates
 * @returns true if the condition is met
 */
function evaluateCondition(
  fieldValues: Record<string, unknown>,
  condition: RuleCondition,
  namingTemplates: NamingTemplate[]
): boolean {
  // Handle composite conditions (AND / OR)
  if (
    condition.operator === RuleOperator.AND &&
    condition.conditions
  ) {
    return condition.conditions.every((sub) =>
      evaluateCondition(fieldValues, sub, namingTemplates)
    );
  }

  if (
    condition.operator === RuleOperator.OR &&
    condition.conditions
  ) {
    return condition.conditions.some((sub) =>
      evaluateCondition(fieldValues, sub, namingTemplates)
    );
  }

  // Simple condition: must have a field
  if (!condition.field) {
    logger.warn('Condition missing field path:', condition);
    return false;
  }

  const actualValue = getNestedValue(fieldValues, condition.field);
  const expectedValue = condition.value;

  return evaluateOperator(condition.operator, actualValue, expectedValue, namingTemplates);
}

/**
 * Evaluate a specific operator against actual and expected values
 *
 * @param operator - The comparison operator
 * @param actual - The actual field value from the DOM
 * @param expected - The expected value from the rule
 * @param namingTemplates - Available naming templates
 * @returns true if the condition is satisfied
 */
function evaluateOperator(
  operator: RuleOperator,
  actual: unknown,
  expected: unknown,
  namingTemplates: NamingTemplate[]
): boolean {
  // Handle operator aliases for backwards compatibility with backend
  let normalizedOperator = operator;
  if (operator === 'gte' as RuleOperator) {
    normalizedOperator = RuleOperator.GREATER_THAN_OR_EQUAL;
  } else if (operator === 'lte' as RuleOperator) {
    normalizedOperator = RuleOperator.LESS_THAN_OR_EQUAL;
  } else if (operator === 'gt' as RuleOperator) {
    normalizedOperator = RuleOperator.GREATER_THAN;
  } else if (operator === 'lt' as RuleOperator) {
    normalizedOperator = RuleOperator.LESS_THAN;
  }

  switch (normalizedOperator) {
    case RuleOperator.EQUALS:
      return isEqual(actual, expected);

    case RuleOperator.NOT_EQUALS:
      return !isEqual(actual, expected);

    case RuleOperator.MUST_INCLUDE:
      return mustInclude(actual, expected);

    case RuleOperator.MUST_EXCLUDE:
      return mustExclude(actual, expected);

    case RuleOperator.MUST_ONLY_BE:
      return mustOnlyBe(actual, expected);

    case RuleOperator.MATCHES_PATTERN:
      return matchesPattern(actual, expected);

    case RuleOperator.IN_RANGE:
      return inRange(actual, expected);

    case RuleOperator.IS_SET:
      return isSet(actual);

    case RuleOperator.IS_NOT_SET:
      return !isSet(actual);

    case RuleOperator.MATCHES_TEMPLATE:
      return matchesTemplate(actual, expected, namingTemplates);

    case RuleOperator.LESS_THAN:
      return compareNumeric(actual, expected) === -1;

    case RuleOperator.GREATER_THAN:
      return compareNumeric(actual, expected) === 1;

    case RuleOperator.LESS_THAN_OR_EQUAL: {
      const cmp = compareNumeric(actual, expected);
      return cmp === -1 || cmp === 0;
    }

    case RuleOperator.GREATER_THAN_OR_EQUAL: {
      const cmp = compareNumeric(actual, expected);
      return cmp === 1 || cmp === 0;
    }

    case RuleOperator.CONTAINS:
      return contains(actual, expected);

    case RuleOperator.NOT_CONTAINS:
      return !contains(actual, expected);

    case RuleOperator.IS_VALID_URL:
      return isValidUrl(actual);

    case RuleOperator.COUNT_IN_RANGE:
      return countInRange(actual, expected);

    case RuleOperator.CROSS_ENTITY_EQUALS:
      // Cross-entity evaluation requires external context; in the extension
      // evaluator we treat it as a pass-through (validated server-side) or
      // delegate to evaluateCrossEntityCondition when context is provided.
      return evaluateCrossEntityCondition(actual, expected);

    case RuleOperator.MATCHES_EXTERNAL:
      // External data matching is resolved server-side; the extension
      // evaluator defaults to pass when external data is unavailable.
      logger.debug('MATCHES_EXTERNAL operator: external data not available in extension, passing.');
      return true;

    default:
      logger.warn(`Unknown operator: ${operator}`);
      return false;
  }
}

/**
 * Deep equality check for comparing values
 */
function isEqual(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;

  // Compare arrays
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) return false;
    return actual.every((v, i) => isEqual(v, expected[i]));
  }

  // Normalize string comparisons (case-insensitive)
  if (typeof actual === 'string' && typeof expected === 'string') {
    return actual.toLowerCase() === expected.toLowerCase();
  }

  return false;
}

/**
 * Check if actual value includes all expected values
 * actual should be an array containing all items in expected
 */
function mustInclude(actual: unknown, expected: unknown): boolean {
  const actualArr = toArray(actual);
  const expectedArr = toArray(expected);

  return expectedArr.every((exp) =>
    actualArr.some((act) => isEqual(act, exp))
  );
}

/**
 * Check if actual value excludes all expected values
 * actual should not contain any items in expected
 */
function mustExclude(actual: unknown, expected: unknown): boolean {
  const actualArr = toArray(actual);
  const expectedArr = toArray(expected);

  return expectedArr.every(
    (exp) => !actualArr.some((act) => isEqual(act, exp))
  );
}

/**
 * Check if actual value matches exactly the expected value(s)
 * actual must contain exactly the expected items and nothing else
 */
function mustOnlyBe(actual: unknown, expected: unknown): boolean {
  const actualArr = toArray(actual);
  const expectedArr = toArray(expected);

  if (actualArr.length !== expectedArr.length) return false;

  return expectedArr.every((exp) =>
    actualArr.some((act) => isEqual(act, exp))
  );
}

/**
 * Check if actual value matches a regex pattern
 */
function matchesPattern(actual: unknown, expected: unknown): boolean {
  if (typeof actual !== 'string' || typeof expected !== 'string') {
    return false;
  }

  try {
    const regex = new RegExp(expected);
    return regex.test(actual);
  } catch (err) {
    logger.error('Invalid regex pattern:', expected, err);
    return false;
  }
}

/**
 * Check if a numeric value is within a range
 * expected should be { min?: number, max?: number }
 */
function inRange(actual: unknown, expected: unknown): boolean {
  const num = typeof actual === 'number' ? actual : parseFloat(String(actual));
  if (isNaN(num)) return false;

  const range = expected as { min?: number; max?: number } | null;
  if (!range || typeof range !== 'object') return false;

  if (range.min !== undefined && num < range.min) return false;
  if (range.max !== undefined && num > range.max) return false;

  return true;
}

/**
 * Check if a value is set (not null, undefined, empty string, empty array, or false).
 *
 * Boolean `false` is treated as "not set" because in Meta Ads Manager
 * toggle/switch fields, `false` means the feature is turned off (i.e. not
 * enabled / not configured). Rules like `is_not_set` on a switch that is
 * Off should PASS.
 */
function isSet(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (value === false) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/**
 * Check if a value matches a naming template
 * expected should be { template_id: string }
 */
function matchesTemplate(
  actual: unknown,
  expected: unknown,
  namingTemplates: NamingTemplate[]
): boolean {
  if (typeof actual !== 'string') return false;

  const templateRef = expected as { template_id?: string } | null;
  if (!templateRef?.template_id) return false;

  const template = namingTemplates.find((t) => t.id === templateRef.template_id);
  if (!template) {
    logger.warn(`Naming template not found: ${templateRef.template_id}`);
    return false;
  }

  return validateNamingConvention(actual, template);
}

/**
 * Validate a name against a naming template
 *
 * @param name - The campaign/ad set/ad name to validate
 * @param template - The naming template to validate against
 * @returns true if the name matches the template
 */
export function validateNamingConvention(
  name: string,
  template: NamingTemplate
): boolean {
  const separator = template.separator || '_';
  const parts = name.split(separator);
  const segments = template.segments;

  // Count required segments
  const requiredCount = segments.filter((s) => s.required).length;
  if (parts.length < requiredCount) return false;

  // Validate each segment in order
  let partIndex = 0;
  for (const segment of segments) {
    if (partIndex >= parts.length) {
      // If this segment is required and we've run out of parts, fail
      return !segment.required;
    }

    const part = parts[partIndex]?.trim() ?? '';

    if (segment.required && part === '') return false;

    if (part !== '' || segment.required) {
      if (!validateSegment(part, segment)) {
        return false;
      }
      partIndex++;
    }
  }

  return true;
}

/**
 * Validate a single naming segment value
 */
function validateSegment(
  value: string,
  segment: { type: string; allowedValues?: string[]; pattern?: string; format?: string }
): boolean {
  switch (segment.type) {
    case 'enum':
      if (segment.allowedValues && segment.allowedValues.length > 0) {
        return segment.allowedValues.some(
          (v) => v.toLowerCase() === value.toLowerCase()
        );
      }
      return true;

    case 'free_text':
      if (segment.pattern) {
        try {
          return new RegExp(segment.pattern).test(value);
        } catch {
          return true;
        }
      }
      return value.length > 0;

    case 'date':
      // Basic date validation - check if it looks like a date
      if (segment.format === 'YYYYMMDD') {
        return /^\d{8}$/.test(value);
      }
      return /^\d{4}[-/]?\d{2}[-/]?\d{2}$/.test(value);

    case 'auto_generated':
      // Auto-generated segments are always valid if present
      return value.length > 0;

    default:
      return true;
  }
}

/**
 * Parse a name into its segments according to a template
 *
 * Returns validation status for each segment, used by NamingPreview component.
 *
 * @param name - The name to parse
 * @param template - The naming template
 * @returns Array of segment results with validation status
 */
export function parseNamingSegments(
  name: string,
  template: NamingTemplate
): Array<{
  label: string;
  value: string;
  valid: boolean;
  required: boolean;
}> {
  const separator = template.separator || '_';
  const parts = name.split(separator);

  return template.segments.map((segment, index) => {
    const value = parts[index]?.trim() ?? '';
    const valid =
      value !== ''
        ? validateSegment(value, segment)
        : !segment.required;

    return {
      label: segment.label,
      value,
      valid,
      required: segment.required,
    };
  });
}

/**
 * Compute the overall compliance score from evaluation results
 *
 * Score = (passed / total) * 100
 * Rules with 'blocking' enforcement count double toward the score.
 *
 * @param results - Rule evaluation results
 * @returns Compliance score with breakdown by category
 */
export function computeScore(results: RuleEvaluationResult[]): ComplianceScore {
  if (results.length === 0) {
    return { overall: 100, byCategory: {}, passedCount: 0, totalCount: 0 };
  }

  let weightedPassed = 0;
  let weightedTotal = 0;
  const byCategory: Record<string, number> = {};
  const categoryPassed: Record<string, number> = {};
  const categoryTotal: Record<string, number> = {};

  for (const result of results) {
    // Unknown rules are excluded from score calculation — they shouldn't penalize
    if (result.status === 'unknown') {
      continue;
    }

    // Blocking rules count double in score calculation
    const weight = result.enforcement === EnforcementMode.BLOCKING ? 2 : 1;

    weightedTotal += weight;
    if (result.passed) {
      weightedPassed += weight;
    }

    // Category tracking
    const cat = result.category;
    categoryTotal[cat] = (categoryTotal[cat] ?? 0) + 1;
    categoryPassed[cat] = (categoryPassed[cat] ?? 0) + (result.passed ? 1 : 0);
  }

  // Compute category scores
  for (const cat of Object.keys(categoryTotal)) {
    const total = categoryTotal[cat] ?? 0;
    const passed = categoryPassed[cat] ?? 0;
    byCategory[cat] = total > 0 ? Math.round((passed / total) * 100) : 100;
  }

  const overall =
    weightedTotal > 0
      ? Math.round((weightedPassed / weightedTotal) * 100)
      : 100;

  const passedCount = results.filter((r) => r.passed).length;

  return {
    overall,
    byCategory,
    passedCount,
    totalCount: results.length,
  };
}

/**
 * Compare two values as numbers.
 * Returns -1 if actual < expected, 0 if equal, 1 if actual > expected.
 * Returns null if either value cannot be parsed as a number.
 */
function compareNumeric(actual: unknown, expected: unknown): -1 | 0 | 1 | null {
  const a = typeof actual === 'number' ? actual : parseFloat(String(actual));
  const b = typeof expected === 'number' ? expected : parseFloat(String(expected));
  if (isNaN(a) || isNaN(b)) return null;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Check if actual value contains the expected substring or element.
 * Works with both strings and arrays.
 */
function contains(actual: unknown, expected: unknown): boolean {
  if (typeof actual === 'string' && typeof expected === 'string') {
    return actual.toLowerCase().includes(expected.toLowerCase());
  }
  if (typeof actual === 'string' && Array.isArray(expected)) {
    const lowerActual = actual.toLowerCase();
    return expected.some((e) => lowerActual.includes(String(e).toLowerCase()));
  }
  if (Array.isArray(actual)) {
    if (Array.isArray(expected)) {
      return expected.some((e) => actual.some((a) => isEqual(a, e)));
    }
    return actual.some((a) => isEqual(a, expected));
  }
  return false;
}

/**
 * Validate that a value is a well-formed URL.
 * Accepts http: and https: protocols.
 */
function isValidUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Check if the count of items in an array-like value falls within a range.
 * Expected should be { min?: number, max?: number }.
 */
function countInRange(actual: unknown, expected: unknown): boolean {
  const count = Array.isArray(actual) ? actual.length : 0;
  const range = expected as { min?: number; max?: number } | null;
  if (!range || typeof range !== 'object') return false;
  if (range.min !== undefined && count < range.min) return false;
  if (range.max !== undefined && count > range.max) return false;
  return true;
}

/**
 * Evaluate a cross-entity condition.
 * In the extension context, this provides basic equality checking.
 * Full cross-entity validation is handled server-side.
 *
 * @param actual - The actual value from the current entity
 * @param expected - The cross-entity condition configuration
 * @returns true if the condition is satisfied or cannot be evaluated locally
 */
function evaluateCrossEntityCondition(actual: unknown, expected: unknown): boolean {
  if (!expected || typeof expected !== 'object') return true;
  const config = expected as Record<string, unknown>;

  // If a direct comparison value is provided, use it
  if (config['value'] !== undefined) {
    return isEqual(actual, config['value']);
  }

  // Otherwise, cross-entity checks require server-side resolution
  logger.debug('Cross-entity condition requires server-side resolution, passing.');
  return true;
}

/**
 * Get a nested value from an object using dot-notation path
 *
 * @example getNestedValue({ a: { b: 'c' } }, 'a.b') => 'c'
 */
function getNestedValue(
  obj: Record<string, unknown>,
  path: string
): unknown {
  // First: check for exact dotted key in flat map (extension extraction uses flat keys)
  if (path in obj) {
    return obj[path];
  }

  // Second: try progressively longer dotted prefixes
  // e.g., for "ad_set.targeting.geo_locations.countries", try:
  //   "ad_set.targeting.geo_locations.countries" (already checked above)
  //   then walk nested from "ad_set" → "targeting" → etc.
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * Convert a value to an array for set operations
 */
function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

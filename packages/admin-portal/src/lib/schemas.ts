import { z } from 'zod';
import {
  Platform,
  EntityLevel,
  EnforcementMode,
  RuleType,
  RuleOperator,
  SegmentType,
} from '@media-buying-governance/shared';

/**
 * Zod schema for rule scope
 */
export const ruleScopeSchema = z.object({
  platforms: z.array(z.nativeEnum(Platform)).min(1, 'Select at least one platform'),
  entityLevels: z.array(z.nativeEnum(EntityLevel)).min(1, 'Select at least one entity level'),
  accountIds: z.array(z.string()),
  teamIds: z.array(z.string()),
  buyerIds: z.array(z.string()),
});

/**
 * Zod schema for a rule condition
 */
export const ruleConditionSchema: z.ZodType<{
  operator: RuleOperator;
  field?: string;
  value?: unknown;
  conditions?: Array<{ operator: RuleOperator; field?: string; value?: unknown }>;
}> = z.object({
  operator: z.nativeEnum(RuleOperator),
  field: z.string().optional(),
  value: z.unknown().optional(),
  conditions: z.lazy(() => z.array(ruleConditionSchema)).optional(),
});

/**
 * Zod schema for rule UI config
 */
export const ruleUIConfigSchema = z.object({
  injectionPoint: z.string().min(1, 'Injection point is required'),
  message: z.string().min(1, 'Message is required'),
  style: z.string().min(1, 'Style is required'),
  category: z.string().min(1, 'Category is required'),
  priority: z.number().int().min(0),
  requireConfirmation: z.boolean().optional(),
  confirmationMessage: z.string().optional(),
});

/**
 * Step 1: Scope selection schema
 */
export const step1Schema = z.object({
  accountIds: z.array(z.string()),
  teamIds: z.array(z.string()),
  buyerIds: z.array(z.string()),
  allAccounts: z.boolean(),
  allTeams: z.boolean(),
  allBuyers: z.boolean(),
});

/**
 * Step 2: Platform & Entity Level schema
 */
export const step2Schema = z.object({
  platforms: z.array(z.nativeEnum(Platform)).min(1, 'Select at least one platform'),
  entityLevels: z.array(z.nativeEnum(EntityLevel)).min(1, 'Select at least one entity level'),
});

/**
 * Step 3: Rule Type & Condition schema
 */
export const step3Schema = z.object({
  ruleType: z.nativeEnum(RuleType),
  condition: ruleConditionSchema,
  namingTemplateId: z.string().optional(),
});

/**
 * Step 4: Enforcement Mode schema
 */
export const step4Schema = z.object({
  enforcement: z.nativeEnum(EnforcementMode),
  message: z.string().min(1, 'Message is required'),
  category: z.string().min(1, 'Category is required'),
  priority: z.number().int().min(0),
});

/**
 * Full rule creation schema
 */
export const createRuleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().min(1, 'Description is required'),
  ruleSetId: z.string().min(1, 'Rule set is required'),
  scope: ruleScopeSchema,
  ruleType: z.nativeEnum(RuleType),
  enforcement: z.nativeEnum(EnforcementMode),
  condition: ruleConditionSchema,
  ui: ruleUIConfigSchema,
  enabled: z.boolean(),
  version: z.number().int().min(1),
});

/**
 * Naming template segment schema
 */
export const namingSegmentSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  type: z.nativeEnum(SegmentType),
  separator: z.string().default('_'),
  required: z.boolean().default(true),
  allowedValues: z.array(z.string()).optional(),
  pattern: z.string().optional(),
  format: z.string().optional(),
  autoGenerator: z.enum(['uuid_short', 'sequential', 'hash']).optional(),
});

/**
 * Naming template creation schema
 */
export const createNamingTemplateSchema = z.object({
  ruleId: z.string().min(1, 'Associated rule is required'),
  segments: z.array(namingSegmentSchema).min(1, 'At least one segment is required'),
  separator: z.string().default('_'),
  example: z.string(),
});

export type Step1FormData = z.infer<typeof step1Schema>;
export type Step2FormData = z.infer<typeof step2Schema>;
export type Step3FormData = z.infer<typeof step3Schema>;
export type Step4FormData = z.infer<typeof step4Schema>;
export type CreateRuleFormData = z.infer<typeof createRuleSchema>;
export type NamingSegmentFormData = z.infer<typeof namingSegmentSchema>;
export type CreateNamingTemplateFormData = z.infer<typeof createNamingTemplateSchema>;

/**
 * Transformation layer: Prisma models -> shared API types
 *
 * This module converts raw Prisma database models into the typed API interfaces
 * defined in @media-buying-governance/shared. All API endpoints MUST use these
 * transformers to ensure the frontend receives the expected type shapes.
 *
 * The most critical transformation is toApiRule(), which builds the nested
 * scope object from flat Prisma columns + parent RuleSet relation data.
 */

export { toApiRule } from './rule.transformer';
export type { PrismaRuleWithRelations } from './rule.transformer';

export { toApiAdAccount } from './account.transformer';
export { toApiComplianceEvent } from './compliance-event.transformer';
export { toApiNamingTemplate } from './naming-template.transformer';
export { toApiOrganization } from './organization.transformer';
export { toApiUser } from './user.transformer';
export { toApiTeam } from './team.transformer';
export { toApiRuleSet } from './rule-set.transformer';
export { toApiApprovalRequest } from './approval-request.transformer';

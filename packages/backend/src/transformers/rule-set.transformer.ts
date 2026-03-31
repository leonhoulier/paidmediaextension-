import { RuleSet as PrismaRuleSet } from '@prisma/client';
import { RuleSet as ApiRuleSet } from '@media-buying-governance/shared';

/**
 * Transform a Prisma RuleSet into the shared API RuleSet type.
 */
export function toApiRuleSet(ruleSet: PrismaRuleSet): ApiRuleSet {
  return {
    id: ruleSet.id,
    organizationId: ruleSet.organizationId,
    name: ruleSet.name,
    description: ruleSet.description ?? '',
    accountIds: ruleSet.accountIds,
    teamIds: ruleSet.teamIds,
    buyerIds: ruleSet.buyerIds,
    active: ruleSet.active,
    version: ruleSet.version,
  };
}

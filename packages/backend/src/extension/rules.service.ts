import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaRuleWithRelations } from '../transformers';
import { isFeatureEnabled } from '../instrumentation/feature-flags';

/**
 * Filter parameters for fetching rules
 */
interface RuleFilter {
  organizationId: string;
  buyerId: string;
  teamIds: string[];
  platform?: string;
  accountId?: string;
  entityLevel?: string;
}

/**
 * Service for fetching and filtering rules for the Chrome extension.
 *
 * All queries include { ruleSet: true, namingTemplate: true } so the
 * transformation layer can build the nested scope object required by
 * the shared API types.
 */
@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch rules applicable to a buyer, filtered by scope
   */
  async getRulesForBuyer(filter: RuleFilter): Promise<{
    rules: PrismaRuleWithRelations[];
    version: string;
  }> {
    // Find all active rule sets for this organization that match the buyer's scope
    const ruleSets = await this.prisma.ruleSet.findMany({
      where: {
        organizationId: filter.organizationId,
        active: true,
        // Rule set applies if:
        // 1. buyerIds is empty (applies to all) OR buyer is in the list
        // 2. teamIds is empty (applies to all) OR at least one of buyer's teams is in the list
        OR: [
          { buyerIds: { isEmpty: true }, teamIds: { isEmpty: true } },
          { buyerIds: { has: filter.buyerId } },
          ...(filter.teamIds.length > 0
            ? filter.teamIds.map((teamId) => ({ teamIds: { has: teamId } }))
            : []),
        ],
      },
      select: { id: true, accountIds: true },
    });

    if (ruleSets.length === 0) {
      return { rules: [], version: this.computeVersion([]) };
    }

    // If accountId filter provided, only include rule sets that contain that account
    // or have empty accountIds (applies to all accounts)
    let filteredRuleSetIds = ruleSets.map((rs) => rs.id);

    if (filter.accountId) {
      // Look up the ad account by platform_account_id
      const adAccount = await this.prisma.adAccount.findFirst({
        where: {
          organizationId: filter.organizationId,
          platformAccountId: filter.accountId,
        },
      });

      if (adAccount) {
        filteredRuleSetIds = ruleSets
          .filter(
            (rs) =>
              rs.accountIds.length === 0 || rs.accountIds.includes(adAccount.id),
          )
          .map((rs) => rs.id);
      }
    }

    // Build the rule filter
    const ruleWhere: Record<string, unknown> = {
      ruleSetId: { in: filteredRuleSetIds },
      enabled: true,
    };

    if (filter.platform) {
      ruleWhere['platform'] = { in: [filter.platform, 'all'] };
    }

    if (filter.entityLevel) {
      ruleWhere['entityLevel'] = filter.entityLevel;
    }

    let rules = await this.prisma.rule.findMany({
      where: ruleWhere,
      include: {
        ruleSet: true,
        namingTemplate: true,
      },
      orderBy: { priority: 'asc' },
    });

    // Filter rules based on the 'enable-expanded-rules' feature flag.
    // When the flag is off, exclude rule types that are part of the expanded set
    // (e.g., advanced naming convention rules, cross-entity rules).
    if (!isFeatureEnabled('enable-expanded-rules', filter.organizationId)) {
      rules = rules.filter(
        (rule) => rule.ruleType !== 'cross_entity' && rule.ruleType !== 'advanced_naming',
      );
    }

    const version = this.computeVersion(rules);

    return { rules, version };
  }

  /**
   * Get the current version hash and last update timestamp for cache invalidation
   */
  async getRulesVersion(
    organizationId: string,
    buyerId: string,
    teamIds: string[],
  ): Promise<{ version: string; lastUpdated: string }> {
    const { rules, version } = await this.getRulesForBuyer({
      organizationId,
      buyerId,
      teamIds,
    });

    // Find the most recent rule modification time
    // Since rules don't have updated_at, use version as proxy
    const lastUpdated = rules.length > 0 ? new Date().toISOString() : new Date(0).toISOString();

    return { version, lastUpdated };
  }

  /**
   * Compute SHA256 version hash from rules array
   */
  private computeVersion(rules: unknown[]): string {
    const serialized = JSON.stringify(rules);
    return createHash('sha256').update(serialized).digest('hex');
  }
}

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * A single rule version entry
 */
export interface RuleVersionEntry {
  id: string;
  ruleId: string;
  version: number;
  snapshot: Record<string, unknown>;
  changedFields: string[];
  changedBy: string | null;
  createdAt: Date;
}

/**
 * Diff between two consecutive versions
 */
export interface RuleVersionDiff {
  field: string;
  previousValue: unknown;
  newValue: unknown;
}

/**
 * A version entry enriched with computed diffs
 */
export interface RuleVersionWithDiff extends RuleVersionEntry {
  diffs: RuleVersionDiff[];
}

/**
 * Service for rule version tracking.
 *
 * Every time a rule is created or updated, a version snapshot is saved
 * to the rule_versions table. The version history endpoint returns
 * all versions with computed diffs showing what changed between each version.
 */
@Injectable()
export class RuleVersionsService {
  private readonly logger = new Logger(RuleVersionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a version snapshot for a rule.
   * Called by the rules service on create and update.
   */
  async createVersionSnapshot(
    ruleId: string,
    version: number,
    snapshot: Record<string, unknown>,
    changedFields: string[],
    changedBy?: string,
  ): Promise<void> {
    await this.prisma.ruleVersion.create({
      data: {
        ruleId,
        version,
        snapshot: snapshot as Prisma.InputJsonValue,
        changedFields,
        changedBy: changedBy ?? null,
      },
    });
    this.logger.log(`Created version ${version} snapshot for rule ${ruleId}`);
  }

  /**
   * Get all versions for a rule, enriched with computed diffs.
   *
   * For each version after the first, we compare the snapshot to the
   * previous version's snapshot and compute which fields changed.
   */
  async getVersionHistory(
    ruleId: string,
    organizationId: string,
  ): Promise<RuleVersionWithDiff[]> {
    // Verify the rule exists and belongs to this org
    const rule = await this.prisma.rule.findFirst({
      where: {
        id: ruleId,
        ruleSet: { organizationId },
      },
    });

    if (!rule) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    const versions = await this.prisma.ruleVersion.findMany({
      where: { ruleId },
      orderBy: { version: 'asc' },
    });

    return versions.map((version, index) => {
      const snapshot = version.snapshot as Record<string, unknown>;
      const previousSnapshot =
        index > 0
          ? (versions[index - 1].snapshot as Record<string, unknown>)
          : null;

      const diffs = previousSnapshot
        ? this.computeDiffs(previousSnapshot, snapshot)
        : [];

      return {
        id: version.id,
        ruleId: version.ruleId,
        version: version.version,
        snapshot,
        changedFields: version.changedFields,
        changedBy: version.changedBy,
        createdAt: version.createdAt,
        diffs,
      };
    });
  }

  /**
   * Compute field-level diffs between two snapshots.
   * Only includes fields that actually changed.
   */
  private computeDiffs(
    previous: Record<string, unknown>,
    current: Record<string, unknown>,
  ): RuleVersionDiff[] {
    const diffs: RuleVersionDiff[] = [];
    const allKeys = new Set([
      ...Object.keys(previous),
      ...Object.keys(current),
    ]);

    for (const key of allKeys) {
      const prevVal = previous[key];
      const currVal = current[key];

      if (JSON.stringify(prevVal) !== JSON.stringify(currVal)) {
        diffs.push({
          field: key,
          previousValue: prevVal ?? null,
          newValue: currVal ?? null,
        });
      }
    }

    return diffs;
  }
}

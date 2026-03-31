import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PubSubService } from '../../pubsub/pubsub.service';
import { RuleVersionsService } from '../rule-versions/rule-versions.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { Prisma, Platform, EntityLevel, EnforcementMode } from '@prisma/client';
import { PrismaRuleWithRelations } from '../../transformers';

/**
 * Prisma include clause for rules — always includes ruleSet and namingTemplate
 * so the transformation layer can build the nested scope object.
 */
const RULE_INCLUDE = { ruleSet: true, namingTemplate: true } as const;

/**
 * Fields tracked for versioning change detection
 */
const TRACKED_FIELDS = [
  'name',
  'description',
  'platform',
  'entityLevel',
  'ruleType',
  'enforcement',
  'condition',
  'uiConfig',
  'priority',
  'enabled',
] as const;

/**
 * Service for managing rules with Pub/Sub notification on changes
 * and automatic version tracking.
 */
@Injectable()
export class RulesService {
  private readonly logger = new Logger(RulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pubsub: PubSubService,
    private readonly ruleVersions: RuleVersionsService,
  ) {}

  async findAll(organizationId: string): Promise<PrismaRuleWithRelations[]> {
    return this.prisma.rule.findMany({
      where: {
        ruleSet: { organizationId },
      },
      include: RULE_INCLUDE,
      orderBy: { priority: 'asc' },
    });
  }

  async findOne(id: string, organizationId: string): Promise<PrismaRuleWithRelations> {
    const rule = await this.prisma.rule.findFirst({
      where: {
        id,
        ruleSet: { organizationId },
      },
      include: RULE_INCLUDE,
    });
    if (!rule) {
      throw new NotFoundException(`Rule ${id} not found`);
    }
    return rule;
  }

  async create(organizationId: string, dto: CreateRuleDto): Promise<PrismaRuleWithRelations> {
    // Verify the rule set belongs to this organization
    const ruleSet = await this.prisma.ruleSet.findFirst({
      where: { id: dto.ruleSetId, organizationId },
    });
    if (!ruleSet) {
      throw new NotFoundException(`Rule set ${dto.ruleSetId} not found`);
    }

    const rule = await this.prisma.rule.create({
      data: {
        ruleSetId: dto.ruleSetId,
        name: dto.name,
        description: dto.description ?? null,
        platform: (dto.platform as Platform) ?? 'all',
        entityLevel: dto.entityLevel as EntityLevel,
        ruleType: dto.ruleType,
        enforcement: (dto.enforcement as EnforcementMode) ?? 'warning',
        condition: dto.condition as Prisma.InputJsonValue,
        uiConfig: (dto.uiConfig ?? {}) as Prisma.InputJsonValue,
        priority: dto.priority ?? 0,
        enabled: dto.enabled ?? true,
      },
      include: RULE_INCLUDE,
    });

    // Create initial version snapshot
    await this.createSnapshot(rule, [], 'system');

    // Publish rule update notification
    await this.publishRuleUpdate(ruleSet.accountIds);

    return rule;
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateRuleDto,
  ): Promise<PrismaRuleWithRelations> {
    const existing = await this.findOne(id, organizationId);

    // Detect which fields changed
    const changedFields: string[] = [];
    const data: Prisma.RuleUpdateInput = {
      version: existing.version + 1,
    };
    if (dto.name !== undefined) {
      data.name = dto.name;
      if (dto.name !== existing.name) changedFields.push('name');
    }
    if (dto.description !== undefined) {
      data.description = dto.description;
      if (dto.description !== existing.description) changedFields.push('description');
    }
    if (dto.platform !== undefined) {
      data.platform = dto.platform as Platform;
      if (dto.platform !== existing.platform) changedFields.push('platform');
    }
    if (dto.entityLevel !== undefined) {
      data.entityLevel = dto.entityLevel as EntityLevel;
      if (dto.entityLevel !== existing.entityLevel) changedFields.push('entityLevel');
    }
    if (dto.ruleType !== undefined) {
      data.ruleType = dto.ruleType;
      if (dto.ruleType !== existing.ruleType) changedFields.push('ruleType');
    }
    if (dto.enforcement !== undefined) {
      data.enforcement = dto.enforcement as EnforcementMode;
      if (dto.enforcement !== existing.enforcement) changedFields.push('enforcement');
    }
    if (dto.condition !== undefined) {
      data.condition = dto.condition as Prisma.InputJsonValue;
      if (JSON.stringify(dto.condition) !== JSON.stringify(existing.condition))
        changedFields.push('condition');
    }
    if (dto.uiConfig !== undefined) {
      data.uiConfig = dto.uiConfig as Prisma.InputJsonValue;
      if (JSON.stringify(dto.uiConfig) !== JSON.stringify(existing.uiConfig))
        changedFields.push('uiConfig');
    }
    if (dto.priority !== undefined) {
      data.priority = dto.priority;
      if (dto.priority !== existing.priority) changedFields.push('priority');
    }
    if (dto.enabled !== undefined) {
      data.enabled = dto.enabled;
      if (dto.enabled !== existing.enabled) changedFields.push('enabled');
    }

    const rule = await this.prisma.rule.update({
      where: { id },
      data,
      include: RULE_INCLUDE,
    });

    // Create version snapshot with changed fields
    await this.createSnapshot(rule, changedFields, 'system');

    // Publish rule update notification using account IDs from the included ruleSet
    await this.publishRuleUpdate(rule.ruleSet?.accountIds ?? []);

    return rule;
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const rule = await this.findOne(id, organizationId);

    await this.prisma.rule.delete({ where: { id } });

    // Use the ruleSet relation already loaded to get account IDs
    await this.publishRuleUpdate(rule.ruleSet?.accountIds ?? []);
  }

  /**
   * Create a version snapshot for a rule
   */
  private async createSnapshot(
    rule: PrismaRuleWithRelations,
    changedFields: string[],
    changedBy: string,
  ): Promise<void> {
    try {
      const snapshot: Record<string, unknown> = {};
      for (const field of TRACKED_FIELDS) {
        snapshot[field] = rule[field];
      }

      await this.ruleVersions.createVersionSnapshot(
        rule.id,
        rule.version,
        snapshot,
        changedFields,
        changedBy,
      );
    } catch (err) {
      // Don't fail the request if versioning fails
      this.logger.warn(
        `Failed to create version snapshot for rule ${rule.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Publish a rule update notification to Pub/Sub
   */
  private async publishRuleUpdate(accountIds: string[]): Promise<void> {
    try {
      await this.pubsub.publishRuleUpdate(accountIds);
    } catch (err) {
      // Don't fail the request if Pub/Sub is unavailable
      this.logger.warn('Failed to publish rule update notification', err);
    }
  }
}

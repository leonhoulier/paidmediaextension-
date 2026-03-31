import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Platform, EntityLevel, ComplianceStatus } from '@prisma/client';

/**
 * Input for a single compliance event
 */
interface ComplianceEventInput {
  organizationId: string;
  buyerId: string;
  adAccountId: string;
  platform: Platform;
  entityLevel: EntityLevel;
  entityName: string;
  ruleId: string;
  status: ComplianceStatus;
  fieldValue?: string;
  expectedValue?: string;
  comment?: string;
}

/**
 * Service for creating compliance events from the Chrome extension
 */
@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Batch insert compliance events (up to 100)
   */
  async createBatchEvents(
    events: ComplianceEventInput[],
  ): Promise<{ created: number }> {
    if (events.length === 0) {
      throw new BadRequestException('Events array must not be empty');
    }

    if (events.length > 100) {
      throw new BadRequestException('Maximum 100 events per batch');
    }

    const result = await this.prisma.complianceEvent.createMany({
      data: events.map((e) => ({
        organizationId: e.organizationId,
        buyerId: e.buyerId,
        adAccountId: e.adAccountId,
        platform: e.platform,
        entityLevel: e.entityLevel,
        entityName: e.entityName,
        ruleId: e.ruleId,
        status: e.status,
        fieldValue: e.fieldValue ?? null,
        expectedValue: e.expectedValue ?? null,
        comment: e.comment ?? null,
      })),
    });

    this.logger.log(`Created ${result.count} compliance events`);
    return { created: result.count };
  }

  /**
   * Create a single compliance comment event
   */
  async createCommentEvent(
    organizationId: string,
    buyerId: string,
    ruleId: string,
    entityName: string,
    comment: string,
  ): Promise<{ eventId: string }> {
    // Look up the rule to get associated account info
    const rule = await this.prisma.rule.findUnique({
      where: { id: ruleId },
      include: {
        ruleSet: true,
      },
    });

    if (!rule) {
      throw new BadRequestException(`Rule not found: ${ruleId}`);
    }

    // Use the first account from the rule set, or find buyer's default account
    let adAccountId: string;
    if (rule.ruleSet.accountIds.length > 0) {
      adAccountId = rule.ruleSet.accountIds[0];
    } else {
      // Find any account in the organization
      const account = await this.prisma.adAccount.findFirst({
        where: { organizationId },
      });
      if (!account) {
        throw new BadRequestException('No ad account found for organization');
      }
      adAccountId = account.id;
    }

    const event = await this.prisma.complianceEvent.create({
      data: {
        organizationId,
        buyerId,
        adAccountId,
        platform: rule.platform === 'all' ? 'meta' : rule.platform,
        entityLevel: rule.entityLevel,
        entityName,
        ruleId,
        status: 'passed',
        comment,
      },
    });

    this.logger.log(`Created comment event ${event.id} for rule ${ruleId}`);
    return { eventId: event.id };
  }
}

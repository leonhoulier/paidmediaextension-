import { Controller, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { ExtensionTokenGuard } from '../auth/extension-token.guard';
import { CurrentExtensionUser } from '../auth/current-user.decorator';
import { ExtensionTokenUser } from '../auth/auth.types';
import { ComplianceService } from './compliance.service';
import { PostComplianceEventsDto } from './dto/post-compliance-events.dto';
import { PostComplianceCommentDto } from './dto/post-compliance-comment.dto';
import { Platform, EntityLevel, ComplianceStatus } from '@prisma/client';

/**
 * Controller for extension compliance API endpoints
 */
@Controller('api/v1/compliance')
@UseGuards(ExtensionTokenGuard)
export class ComplianceController {
  private readonly logger = new Logger(ComplianceController.name);

  constructor(private readonly complianceService: ComplianceService) {}

  /**
   * POST /api/v1/compliance/events
   * Batch submit compliance events from the extension
   */
  @Post('events')
  async createEvents(
    @CurrentExtensionUser() user: ExtensionTokenUser,
    @Body() dto: PostComplianceEventsDto,
  ): Promise<{ created: number }> {
    this.logger.debug(`Receiving ${dto.events.length} compliance events from buyer ${user.userId}`);

    const events = dto.events.map((e) => ({
      organizationId: user.organizationId,
      buyerId: user.userId,
      adAccountId: e.adAccountId,
      platform: e.platform as Platform,
      entityLevel: e.entityLevel as EntityLevel,
      entityName: e.entityName,
      ruleId: e.ruleId,
      status: e.status as ComplianceStatus,
      fieldValue: e.fieldValue,
      expectedValue: e.expectedValue,
      comment: e.comment,
    }));

    return this.complianceService.createBatchEvents(events);
  }

  /**
   * POST /api/v1/compliance/comment
   * Submit a buyer comment for a comment-required rule
   */
  @Post('comment')
  async createComment(
    @CurrentExtensionUser() user: ExtensionTokenUser,
    @Body() dto: PostComplianceCommentDto,
  ): Promise<{ eventId: string }> {
    this.logger.debug(
      `Buyer ${user.userId} commenting on rule ${dto.ruleId}`,
    );

    return this.complianceService.createCommentEvent(
      user.organizationId,
      user.userId,
      dto.ruleId,
      dto.entityName,
      dto.comment,
    );
  }
}

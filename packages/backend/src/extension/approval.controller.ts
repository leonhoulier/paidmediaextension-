import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import { ExtensionTokenGuard } from '../auth/extension-token.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { CurrentExtensionUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ExtensionTokenUser, AuthenticatedUser } from '../auth/auth.types';
import { ApprovalService } from './approval.service';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';
import { UpdateApprovalRequestDto } from './dto/update-approval-request.dto';
import { ApprovalRequest } from '@media-buying-governance/shared';
import { ApprovalStatus } from '@prisma/client';
import { toApiApprovalRequest } from '../transformers';

/**
 * Controller for approval request API endpoints
 *
 * Extension endpoints (ExtensionTokenGuard):
 * - POST /api/v1/extension/approval/request - Create approval request
 * - GET /api/v1/extension/approval/requests/:id - Get single request (polling)
 * - DELETE /api/v1/extension/approval/requests/:id - Cancel request
 *
 * Admin endpoints (FirebaseAuthGuard + RolesGuard):
 * - GET /api/v1/admin/approval/requests - List requests (approver inbox)
 * - PUT /api/v1/admin/approval/requests/:id - Approve or reject
 */
@Controller('api/v1')
export class ApprovalController {
  private readonly logger = new Logger(ApprovalController.name);

  constructor(private readonly approvalService: ApprovalService) {}

  /**
   * POST /api/v1/extension/approval/request
   * Create approval request from extension (called by buyer)
   */
  @Post('extension/approval/request')
  @UseGuards(ExtensionTokenGuard)
  async create(
    @CurrentExtensionUser() user: ExtensionTokenUser,
    @Body() dto: CreateApprovalRequestDto,
  ): Promise<ApprovalRequest> {
    this.logger.debug(
      `Creating approval request for buyer ${user.userId}, rule ${dto.ruleId}`,
    );

    const request = await this.approvalService.create(
      user.organizationId,
      user.userId,
      dto,
    );

    return toApiApprovalRequest(request);
  }

  /**
   * GET /api/v1/admin/approval/requests
   * List approval requests for approver's inbox
   * Filter by status (pending/approved/rejected)
   * Returns only requests where current user is the approver
   */
  @Get('admin/approval/requests')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: 'pending' | 'approved' | 'rejected',
  ): Promise<ApprovalRequest[]> {
    this.logger.debug(
      `Fetching approval requests for approver ${user.uid}, status=${status}`,
    );

    // Map API status to Prisma enum
    let prismaStatus: ApprovalStatus | undefined;
    if (status === 'pending') {
      prismaStatus = ApprovalStatus.pending;
    } else if (status === 'approved') {
      prismaStatus = ApprovalStatus.approved;
    } else if (status === 'rejected') {
      prismaStatus = ApprovalStatus.rejected;
    }

    const requests = await this.approvalService.findAllForApprover(
      user.uid,
      user.organizationId,
      prismaStatus,
    );

    return requests.map(toApiApprovalRequest);
  }

  /**
   * GET /api/v1/extension/approval/requests/:id
   * Get single approval request (for polling by extension)
   */
  @Get('extension/approval/requests/:id')
  @UseGuards(ExtensionTokenGuard)
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentExtensionUser() user: ExtensionTokenUser,
  ): Promise<ApprovalRequest> {
    this.logger.debug(
      `Extension polling approval request ${id}`,
    );

    const request = await this.approvalService.findOne(id, user.organizationId);
    return toApiApprovalRequest(request);
  }

  /**
   * PUT /api/v1/admin/approval/requests/:id
   * Approve or reject an approval request
   * Verifies current user is the assigned approver
   */
  @Put('admin/approval/requests/:id')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApprovalRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApprovalRequest> {
    this.logger.debug(
      `Approver ${user.uid} updating approval request ${id}: ${dto.status}`,
    );

    const updated = await this.approvalService.updateStatus(
      id,
      user.uid,
      user.organizationId,
      dto,
    );

    return toApiApprovalRequest(updated);
  }

  /**
   * DELETE /api/v1/extension/approval/requests/:id
   * Cancel approval request (called by extension when buyer cancels)
   */
  @Delete('extension/approval/requests/:id')
  @UseGuards(ExtensionTokenGuard)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentExtensionUser() user: ExtensionTokenUser,
  ): Promise<{ deleted: boolean }> {
    this.logger.debug(
      `Buyer ${user.userId} cancelling approval request ${id}`,
    );

    await this.approvalService.cancel(id, user.organizationId);
    return { deleted: true };
  }
}

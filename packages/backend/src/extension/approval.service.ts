import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';
import { UpdateApprovalRequestDto } from './dto/update-approval-request.dto';
import { ApprovalRequest, ApprovalStatus } from '@prisma/client';

/**
 * Service for managing approval requests in the second-approver workflow
 */
@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new approval request from the extension
   * Validates that:
   * - Approver exists and has admin or super_admin role
   * - Buyer cannot approve their own requests
   * - Rule exists
   */
  async create(
    organizationId: string,
    buyerId: string,
    dto: CreateApprovalRequestDto,
  ): Promise<ApprovalRequest> {
    // Validate approver exists and has appropriate role
    const approver = await this.prisma.user.findFirst({
      where: {
        id: dto.approverId,
        organizationId,
      },
    });

    if (!approver) {
      throw new NotFoundException(
        `Approver ${dto.approverId} not found in organization`,
      );
    }

    if (approver.role !== 'admin' && approver.role !== 'super_admin') {
      throw new BadRequestException(
        `Approver must have admin or super_admin role, got ${approver.role}`,
      );
    }

    // Buyer cannot approve their own requests
    if (approver.id === buyerId) {
      throw new BadRequestException(
        'Buyer cannot be their own approver',
      );
    }

    // Validate rule exists
    const rule = await this.prisma.rule.findFirst({
      where: {
        id: dto.ruleId,
      },
      include: {
        ruleSet: true,
      },
    });

    if (!rule) {
      throw new NotFoundException(`Rule ${dto.ruleId} not found`);
    }

    if (rule.ruleSet.organizationId !== organizationId) {
      throw new ForbiddenException(
        'Rule does not belong to buyer organization',
      );
    }

    // Create the approval request
    this.logger.debug(
      `Creating approval request: buyer=${buyerId}, approver=${dto.approverId}, rule=${dto.ruleId}`,
    );

    return this.prisma.approvalRequest.create({
      data: {
        organizationId,
        buyerId,
        approverId: dto.approverId,
        ruleId: dto.ruleId,
        entitySnapshot: dto.campaignSnapshot as any,
        status: ApprovalStatus.pending,
      },
    });
  }

  /**
   * Get all approval requests for a specific approver
   * Optionally filter by status
   */
  async findAllForApprover(
    approverId: string,
    organizationId: string,
    status?: ApprovalStatus,
  ): Promise<ApprovalRequest[]> {
    return this.prisma.approvalRequest.findMany({
      where: {
        approverId,
        organizationId,
        ...(status && { status }),
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });
  }

  /**
   * Get a single approval request by ID
   * Used by extension for polling request status
   */
  async findOne(
    id: string,
    organizationId: string,
  ): Promise<ApprovalRequest> {
    const request = await this.prisma.approvalRequest.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!request) {
      throw new NotFoundException(`Approval request ${id} not found`);
    }

    return request;
  }

  /**
   * Approve or reject an approval request
   * Validates that current user is the assigned approver
   */
  async updateStatus(
    id: string,
    approverId: string,
    organizationId: string,
    dto: UpdateApprovalRequestDto,
  ): Promise<ApprovalRequest> {
    // Fetch existing request
    const request = await this.findOne(id, organizationId);

    // Verify current user is the approver
    if (request.approverId !== approverId) {
      throw new ForbiddenException(
        'Only the assigned approver can approve or reject this request',
      );
    }

    // Check if already resolved
    if (request.status !== ApprovalStatus.pending) {
      throw new BadRequestException(
        `Request already ${request.status}`,
      );
    }

    // Map status to Prisma enum
    const prismaStatus: ApprovalStatus =
      dto.status === 'approved' ? ApprovalStatus.approved : ApprovalStatus.rejected;

    this.logger.debug(
      `Updating approval request ${id}: status=${dto.status}, approver=${approverId}`,
    );

    // Update status atomically
    return this.prisma.approvalRequest.update({
      where: { id },
      data: {
        status: prismaStatus,
        comment: dto.comment,
        resolvedAt: new Date(),
      },
    });
  }

  /**
   * Cancel an approval request (soft delete)
   * Called by extension when buyer cancels the request
   */
  async cancel(id: string, organizationId: string): Promise<void> {
    const request = await this.findOne(id, organizationId);

    // Only pending requests can be cancelled
    if (request.status !== ApprovalStatus.pending) {
      throw new BadRequestException(
        `Cannot cancel ${request.status} request`,
      );
    }

    this.logger.debug(`Cancelling approval request ${id}`);

    // Soft delete by updating status to rejected with comment
    await this.prisma.approvalRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        comment: 'Cancelled by buyer',
        resolvedAt: new Date(),
      },
    });
  }
}

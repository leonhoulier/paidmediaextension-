import {
  ApprovalRequest as PrismaApprovalRequest,
  ApprovalStatus as PrismaApprovalStatus,
} from '@prisma/client';
import {
  ApprovalRequest as ApiApprovalRequest,
  ApprovalStatus,
} from '@media-buying-governance/shared';

/**
 * Map Prisma ApprovalStatus enum to shared ApprovalStatus enum.
 */
function mapApprovalStatus(status: PrismaApprovalStatus): ApprovalStatus {
  switch (status) {
    case PrismaApprovalStatus.pending:
      return ApprovalStatus.PENDING;
    case PrismaApprovalStatus.approved:
      return ApprovalStatus.APPROVED;
    case PrismaApprovalStatus.rejected:
      return ApprovalStatus.REJECTED;
    default:
      return ApprovalStatus.PENDING;
  }
}

/**
 * Transform a Prisma ApprovalRequest into the shared API ApprovalRequest type.
 */
export function toApiApprovalRequest(
  request: PrismaApprovalRequest,
): ApiApprovalRequest {
  return {
    id: request.id,
    organizationId: request.organizationId,
    buyerId: request.buyerId,
    approverId: request.approverId,
    ruleId: request.ruleId,
    entitySnapshot: request.entitySnapshot as Record<string, unknown>,
    status: mapApprovalStatus(request.status),
    comment: request.comment ?? undefined,
    requestedAt: request.requestedAt,
    resolvedAt: request.resolvedAt ?? undefined,
  };
}

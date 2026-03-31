import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient, ApprovalStatus } from '@prisma/client';
import { ApprovalService } from '../approval.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ApprovalService', () => {
  let service: ApprovalService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();

    const module = await Test.createTestingModule({
      providers: [
        ApprovalService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ApprovalService);
  });

  const orgId = 'org-1';
  const buyerId = 'buyer-1';

  // ── create() ──────────────────────────────────────────────────────────────

  describe('create()', () => {
    const dto = {
      approverId: 'approver-1',
      ruleId: 'rule-1',
      campaignSnapshot: { name: 'Campaign A' },
    };

    it('should throw NotFoundException when approver is not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.create(orgId, buyerId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when approver has wrong role', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: dto.approverId,
        role: 'buyer',
      } as never);

      await expect(service.create(orgId, buyerId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when buyer is own approver', async () => {
      const selfDto = { ...dto, approverId: buyerId };
      prisma.user.findFirst.mockResolvedValue({
        id: buyerId,
        role: 'admin',
      } as never);

      await expect(
        service.create(orgId, buyerId, selfDto),
      ).rejects.toThrow('Buyer cannot be their own approver');
    });

    it('should throw NotFoundException when rule is not found', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: dto.approverId,
        role: 'admin',
      } as never);
      prisma.rule.findFirst.mockResolvedValue(null);

      await expect(service.create(orgId, buyerId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when rule belongs to a different org', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: dto.approverId,
        role: 'admin',
      } as never);
      prisma.rule.findFirst.mockResolvedValue({
        id: dto.ruleId,
        ruleSet: { organizationId: 'other-org' },
      } as never);

      await expect(service.create(orgId, buyerId, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should create and return an ApprovalRequest on success', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: dto.approverId,
        role: 'super_admin',
      } as never);
      prisma.rule.findFirst.mockResolvedValue({
        id: dto.ruleId,
        ruleSet: { organizationId: orgId },
      } as never);

      const created = {
        id: 'req-1',
        organizationId: orgId,
        buyerId,
        approverId: dto.approverId,
        ruleId: dto.ruleId,
        entitySnapshot: dto.campaignSnapshot,
        status: ApprovalStatus.pending,
        comment: null,
        requestedAt: new Date(),
        resolvedAt: null,
      };
      prisma.approvalRequest.create.mockResolvedValue(created as never);

      const result = await service.create(orgId, buyerId, dto);

      expect(result).toEqual(created);
      expect(prisma.approvalRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgId,
          buyerId,
          approverId: dto.approverId,
          ruleId: dto.ruleId,
          status: ApprovalStatus.pending,
        }),
      });
    });
  });

  // ── findAllForApprover() ──────────────────────────────────────────────────

  describe('findAllForApprover()', () => {
    it('should return a filtered list of approval requests', async () => {
      const requests = [
        { id: 'req-1', approverId: 'approver-1', status: ApprovalStatus.pending },
        { id: 'req-2', approverId: 'approver-1', status: ApprovalStatus.pending },
      ];
      prisma.approvalRequest.findMany.mockResolvedValue(requests as never);

      const result = await service.findAllForApprover(
        'approver-1',
        orgId,
        ApprovalStatus.pending,
      );

      expect(result).toEqual(requests);
      expect(prisma.approvalRequest.findMany).toHaveBeenCalledWith({
        where: {
          approverId: 'approver-1',
          organizationId: orgId,
          status: ApprovalStatus.pending,
        },
        orderBy: { requestedAt: 'desc' },
      });
    });
  });

  // ── findOne() ─────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('should throw NotFoundException when request is not found', async () => {
      prisma.approvalRequest.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('nonexistent', orgId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return the request on success', async () => {
      const request = {
        id: 'req-1',
        organizationId: orgId,
        status: ApprovalStatus.pending,
      };
      prisma.approvalRequest.findFirst.mockResolvedValue(request as never);

      const result = await service.findOne('req-1', orgId);
      expect(result).toEqual(request);
    });
  });

  // ── updateStatus() ────────────────────────────────────────────────────────

  describe('updateStatus()', () => {
    const pendingRequest = {
      id: 'req-1',
      organizationId: orgId,
      approverId: 'approver-1',
      status: ApprovalStatus.pending,
    };

    it('should throw ForbiddenException when called by wrong approver', async () => {
      prisma.approvalRequest.findFirst.mockResolvedValue(pendingRequest as never);

      await expect(
        service.updateStatus('req-1', 'wrong-user', orgId, {
          status: 'approved',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when request is already resolved', async () => {
      prisma.approvalRequest.findFirst.mockResolvedValue({
        ...pendingRequest,
        status: ApprovalStatus.approved,
      } as never);

      await expect(
        service.updateStatus('req-1', 'approver-1', orgId, {
          status: 'approved',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should approve a pending request', async () => {
      prisma.approvalRequest.findFirst.mockResolvedValue(pendingRequest as never);
      const updated = { ...pendingRequest, status: ApprovalStatus.approved };
      prisma.approvalRequest.update.mockResolvedValue(updated as never);

      const result = await service.updateStatus('req-1', 'approver-1', orgId, {
        status: 'approved',
      });

      expect(result.status).toBe(ApprovalStatus.approved);
      expect(prisma.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: expect.objectContaining({ status: ApprovalStatus.approved }),
      });
    });

    it('should reject a pending request', async () => {
      prisma.approvalRequest.findFirst.mockResolvedValue(pendingRequest as never);
      const updated = { ...pendingRequest, status: ApprovalStatus.rejected };
      prisma.approvalRequest.update.mockResolvedValue(updated as never);

      const result = await service.updateStatus('req-1', 'approver-1', orgId, {
        status: 'rejected',
        comment: 'Needs changes',
      });

      expect(result.status).toBe(ApprovalStatus.rejected);
      expect(prisma.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: expect.objectContaining({
          status: ApprovalStatus.rejected,
          comment: 'Needs changes',
        }),
      });
    });
  });

  // ── cancel() ──────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('should throw BadRequestException when request is not pending', async () => {
      prisma.approvalRequest.findFirst.mockResolvedValue({
        id: 'req-1',
        organizationId: orgId,
        status: ApprovalStatus.approved,
      } as never);

      await expect(service.cancel('req-1', orgId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should update status to rejected on success', async () => {
      prisma.approvalRequest.findFirst.mockResolvedValue({
        id: 'req-1',
        organizationId: orgId,
        status: ApprovalStatus.pending,
      } as never);
      prisma.approvalRequest.update.mockResolvedValue({} as never);

      await service.cancel('req-1', orgId);

      expect(prisma.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: expect.objectContaining({
          status: 'rejected',
          comment: 'Cancelled by buyer',
        }),
      });
    });
  });
});

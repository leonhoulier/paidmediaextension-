import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { ComplianceService } from '../compliance.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ComplianceService', () => {
  let service: ComplianceService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();

    const module = await Test.createTestingModule({
      providers: [
        ComplianceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ComplianceService);
  });

  const orgId = 'org-1';
  const buyerId = 'buyer-1';

  // ── createBatchEvents() ───────────────────────────────────────────────────

  describe('createBatchEvents()', () => {
    it('should throw BadRequestException when events array is empty', async () => {
      await expect(service.createBatchEvents([])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when events exceed 100', async () => {
      const events = Array.from({ length: 101 }, (_, i) => ({
        organizationId: orgId,
        buyerId,
        adAccountId: 'acc-1',
        platform: 'meta' as const,
        entityLevel: 'campaign' as const,
        entityName: `Campaign ${i}`,
        ruleId: 'rule-1',
        status: 'passed' as const,
      }));

      await expect(service.createBatchEvents(events)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return { created } count on success', async () => {
      prisma.complianceEvent.createMany.mockResolvedValue({ count: 2 });

      const events = [
        {
          organizationId: orgId,
          buyerId,
          adAccountId: 'acc-1',
          platform: 'meta' as const,
          entityLevel: 'campaign' as const,
          entityName: 'Campaign A',
          ruleId: 'rule-1',
          status: 'passed' as const,
        },
        {
          organizationId: orgId,
          buyerId,
          adAccountId: 'acc-1',
          platform: 'meta' as const,
          entityLevel: 'campaign' as const,
          entityName: 'Campaign B',
          ruleId: 'rule-2',
          status: 'violated' as const,
        },
      ];

      const result = await service.createBatchEvents(events);

      expect(result).toEqual({ created: 2 });
      expect(prisma.complianceEvent.createMany).toHaveBeenCalledTimes(1);
    });
  });

  // ── createCommentEvent() ──────────────────────────────────────────────────

  describe('createCommentEvent()', () => {
    it('should throw BadRequestException when rule is not found', async () => {
      prisma.rule.findUnique.mockResolvedValue(null);

      await expect(
        service.createCommentEvent(orgId, buyerId, 'bad-rule', 'Camp', 'note'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no account is found', async () => {
      prisma.rule.findUnique.mockResolvedValue({
        id: 'rule-1',
        platform: 'meta',
        entityLevel: 'campaign',
        ruleSet: { accountIds: [] },
      } as never);
      prisma.adAccount.findFirst.mockResolvedValue(null);

      await expect(
        service.createCommentEvent(orgId, buyerId, 'rule-1', 'Camp', 'note'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use first ruleSet account when available', async () => {
      prisma.rule.findUnique.mockResolvedValue({
        id: 'rule-1',
        platform: 'meta',
        entityLevel: 'campaign',
        ruleSet: { accountIds: ['acc-1', 'acc-2'] },
      } as never);
      prisma.complianceEvent.create.mockResolvedValue({
        id: 'evt-1',
      } as never);

      const result = await service.createCommentEvent(
        orgId,
        buyerId,
        'rule-1',
        'Campaign X',
        'looks good',
      );

      expect(result).toEqual({ eventId: 'evt-1' });
      expect(prisma.complianceEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adAccountId: 'acc-1',
        }),
      });
      // adAccount.findFirst should NOT have been called
      expect(prisma.adAccount.findFirst).not.toHaveBeenCalled();
    });

    it("should map platform 'all' to 'meta'", async () => {
      prisma.rule.findUnique.mockResolvedValue({
        id: 'rule-1',
        platform: 'all',
        entityLevel: 'campaign',
        ruleSet: { accountIds: ['acc-1'] },
      } as never);
      prisma.complianceEvent.create.mockResolvedValue({
        id: 'evt-2',
      } as never);

      await service.createCommentEvent(
        orgId,
        buyerId,
        'rule-1',
        'Camp',
        'comment',
      );

      expect(prisma.complianceEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          platform: 'meta',
        }),
      });
    });
  });
});

import { Test } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { RulesService } from '../rules.service';
import { PrismaService } from '../../prisma/prisma.service';

// Mock the feature-flags module
jest.mock('../../instrumentation/feature-flags', () => ({
  isFeatureEnabled: jest.fn(),
}));

import { isFeatureEnabled } from '../../instrumentation/feature-flags';

const mockIsFeatureEnabled = isFeatureEnabled as jest.MockedFunction<
  typeof isFeatureEnabled
>;

describe('RulesService', () => {
  let service: RulesService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    mockIsFeatureEnabled.mockReturnValue(true);

    const module = await Test.createTestingModule({
      providers: [
        RulesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(RulesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const orgId = 'org-1';
  const buyerId = 'buyer-1';
  const teamIds = ['team-1'];

  // ── getRulesForBuyer() ────────────────────────────────────────────────────

  describe('getRulesForBuyer()', () => {
    it('should return empty rules when no matching rule sets exist', async () => {
      prisma.ruleSet.findMany.mockResolvedValue([]);

      const result = await service.getRulesForBuyer({
        organizationId: orgId,
        buyerId,
        teamIds,
      });

      expect(result.rules).toEqual([]);
      expect(result.version).toBeDefined();
    });

    it('should match rule sets by buyerId', async () => {
      prisma.ruleSet.findMany.mockResolvedValue([
        { id: 'rs-1', accountIds: [] },
      ] as never);
      prisma.rule.findMany.mockResolvedValue([
        { id: 'rule-1', ruleType: 'budget_cap', ruleSet: {}, namingTemplate: null },
      ] as never);

      const result = await service.getRulesForBuyer({
        organizationId: orgId,
        buyerId,
        teamIds: [],
      });

      expect(result.rules).toHaveLength(1);
      expect(prisma.ruleSet.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: orgId,
            active: true,
          }),
        }),
      );
    });

    it('should match rule sets by teamId', async () => {
      prisma.ruleSet.findMany.mockResolvedValue([
        { id: 'rs-1', accountIds: [] },
      ] as never);
      prisma.rule.findMany.mockResolvedValue([
        { id: 'rule-1', ruleType: 'budget_cap', ruleSet: {}, namingTemplate: null },
      ] as never);

      const result = await service.getRulesForBuyer({
        organizationId: orgId,
        buyerId,
        teamIds: ['team-1'],
      });

      expect(result.rules).toHaveLength(1);
    });

    it('should match global scope (empty buyerIds + teamIds)', async () => {
      prisma.ruleSet.findMany.mockResolvedValue([
        { id: 'rs-global', accountIds: [] },
      ] as never);
      prisma.rule.findMany.mockResolvedValue([
        { id: 'rule-global', ruleType: 'budget_cap', ruleSet: {}, namingTemplate: null },
      ] as never);

      const result = await service.getRulesForBuyer({
        organizationId: orgId,
        buyerId: 'any-buyer',
        teamIds: [],
      });

      expect(result.rules).toHaveLength(1);
    });

    it('should narrow results by account filter', async () => {
      prisma.ruleSet.findMany.mockResolvedValue([
        { id: 'rs-1', accountIds: ['acc-internal-1'] },
        { id: 'rs-2', accountIds: [] },
      ] as never);
      prisma.adAccount.findFirst.mockResolvedValue({
        id: 'acc-internal-1',
        platformAccountId: 'act_123',
      } as never);
      prisma.rule.findMany.mockResolvedValue([
        { id: 'rule-1', ruleType: 'budget_cap', ruleSet: {}, namingTemplate: null },
        { id: 'rule-2', ruleType: 'naming', ruleSet: {}, namingTemplate: null },
      ] as never);

      const result = await service.getRulesForBuyer({
        organizationId: orgId,
        buyerId,
        teamIds,
        accountId: 'act_123',
      });

      expect(result.rules).toHaveLength(2);
      expect(prisma.adAccount.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          platformAccountId: 'act_123',
        },
      });
    });

    it('should filter rules by platform', async () => {
      prisma.ruleSet.findMany.mockResolvedValue([
        { id: 'rs-1', accountIds: [] },
      ] as never);
      prisma.rule.findMany.mockResolvedValue([
        { id: 'rule-meta', ruleType: 'budget_cap', platform: 'meta' },
      ] as never);

      await service.getRulesForBuyer({
        organizationId: orgId,
        buyerId,
        teamIds,
        platform: 'meta',
      });

      expect(prisma.rule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            platform: { in: ['meta', 'all'] },
          }),
        }),
      );
    });

    it('should filter out cross_entity and advanced_naming when feature flag is off', async () => {
      mockIsFeatureEnabled.mockReturnValue(false);

      prisma.ruleSet.findMany.mockResolvedValue([
        { id: 'rs-1', accountIds: [] },
      ] as never);
      prisma.rule.findMany.mockResolvedValue([
        { id: 'r1', ruleType: 'budget_cap', ruleSet: {}, namingTemplate: null },
        { id: 'r2', ruleType: 'cross_entity', ruleSet: {}, namingTemplate: null },
        { id: 'r3', ruleType: 'advanced_naming', ruleSet: {}, namingTemplate: null },
      ] as never);

      const result = await service.getRulesForBuyer({
        organizationId: orgId,
        buyerId,
        teamIds,
      });

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0]).toEqual(
        expect.objectContaining({ ruleType: 'budget_cap' }),
      );
    });
  });

  // ── getRulesVersion() ─────────────────────────────────────────────────────

  describe('getRulesVersion()', () => {
    it('should return a SHA256 version hash and lastUpdated', async () => {
      prisma.ruleSet.findMany.mockResolvedValue([
        { id: 'rs-1', accountIds: [] },
      ] as never);
      prisma.rule.findMany.mockResolvedValue([
        { id: 'rule-1', ruleType: 'budget_cap', ruleSet: {}, namingTemplate: null },
      ] as never);

      const result = await service.getRulesVersion(orgId, buyerId, teamIds);

      expect(result.version).toMatch(/^[a-f0-9]{64}$/);
      expect(result.lastUpdated).toBeDefined();
      expect(new Date(result.lastUpdated).getTime()).not.toBeNaN();
    });
  });
});

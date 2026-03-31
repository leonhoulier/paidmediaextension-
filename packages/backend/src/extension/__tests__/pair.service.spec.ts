import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { PairService } from '../pair.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PairService', () => {
  let service: PairService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();

    const module = await Test.createTestingModule({
      providers: [
        PairService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(PairService);
  });

  const org = { id: 'org-1', name: 'Acme Corp', slug: 'acme' };

  // ── pair() ────────────────────────────────────────────────────────────────

  describe('pair()', () => {
    it('should throw BadRequestException when neither email nor invite_code is provided', async () => {
      await expect(service.pair({})).rejects.toThrow(BadRequestException);
    });
  });

  // ── pairByInviteCode() (via pair()) ───────────────────────────────────────

  describe('pairByInviteCode()', () => {
    it('should throw NotFoundException for an invalid invite code', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.pair({ invite_code: 'bad-code' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return token and organization on success', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'bob@acme.com',
        extensionToken: 'tok-abc',
        organization: org,
      } as never);

      const result = await service.pair({ invite_code: 'tok-abc' });

      expect(result).toEqual({
        extension_token: 'tok-abc',
        organization: { id: org.id, name: org.name, slug: org.slug },
      });
    });
  });

  // ── pairByEmail() (via pair()) ────────────────────────────────────────────

  describe('pairByEmail()', () => {
    it('should throw NotFoundException when user is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.pair({ email: 'nobody@acme.com' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when org slug does not match', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'bob@acme.com',
        extensionToken: 'tok-abc',
        organization: org,
      } as never);

      await expect(
        service.pair({ email: 'bob@acme.com', org_slug: 'wrong-slug' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should generate a token if the user has none', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'bob@acme.com',
        extensionToken: null,
        organization: org,
      } as never);
      prisma.user.update.mockResolvedValue({} as never);

      const result = await service.pair({ email: 'bob@acme.com' });

      expect(result.extension_token).toBeDefined();
      expect(result.extension_token.length).toBe(64); // 32 bytes hex
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { extensionToken: expect.any(String) },
      });
    });

    it('should return existing token if user already has one', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'bob@acme.com',
        extensionToken: 'existing-token',
        organization: org,
      } as never);

      const result = await service.pair({ email: 'bob@acme.com' });

      expect(result.extension_token).toBe('existing-token');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});

/**
 * Tests for ExtensionTokenGuard
 *
 * Verifies:
 * - Missing token header AND query param throws UnauthorizedException
 * - Invalid token (user not found) throws UnauthorizedException
 * - Valid token via header sets request.extensionUser, updates lastActiveAt, returns true
 * - Valid token via query param (SSE) has same behavior
 * - DB error during lookup throws UnauthorizedException
 */

import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ExtensionTokenGuard } from '../extension-token.guard';

/** Factory for a mock ExecutionContext backed by the given request object. */
function createMockContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => jest.fn(),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn() as unknown as ReturnType<ExecutionContext['getClass']>,
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({}) as ReturnType<ExecutionContext['switchToRpc']>,
    switchToWs: () => ({}) as ReturnType<ExecutionContext['switchToWs']>,
    getType: () => 'http' as const,
  } as unknown as ExecutionContext;
}

describe('ExtensionTokenGuard', () => {
  let guard: ExtensionTokenGuard;
  let prisma: DeepMockProxy<PrismaClient>;

  const fakeUser = {
    id: 'user-uuid-1',
    email: 'buyer@example.com',
    organizationId: 'org-uuid-1',
    teamIds: ['team-uuid-1', 'team-uuid-2'],
    name: 'Test Buyer',
    role: 'buyer',
    extensionToken: 'valid-token-abc',
    tokenExpiresAt: null,
    tokenRevokedAt: null,
    lastActiveAt: null,
  };

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    guard = new ExtensionTokenGuard(prisma as unknown as PrismaService);
  });

  it('throws UnauthorizedException when token header and query param are both missing', async () => {
    const request = { headers: {}, query: {} };
    const ctx = createMockContext(request);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'Missing X-Extension-Token header or token query parameter',
    );
  });

  it('throws UnauthorizedException when token is invalid (user not found)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const request = { headers: { 'x-extension-token': 'bad-token' }, query: {} };
    const ctx = createMockContext(request);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid extension token');
  });

  it('sets request.extensionUser and updates lastActiveAt for valid header token', async () => {
    prisma.user.findUnique.mockResolvedValue(fakeUser as never);
    prisma.user.update.mockResolvedValue(fakeUser as never);

    const request = {
      headers: { 'x-extension-token': 'valid-token-abc' },
      query: {},
    } as Record<string, unknown>;
    const ctx = createMockContext(request);

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(request['extensionUser']).toEqual({
      userId: fakeUser.id,
      email: fakeUser.email,
      organizationId: fakeUser.organizationId,
      teamIds: fakeUser.teamIds,
      name: fakeUser.name,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: fakeUser.id },
      data: { lastActiveAt: expect.any(Date) },
    });
  });

  it('sets request.extensionUser for valid query param token (SSE)', async () => {
    prisma.user.findUnique.mockResolvedValue(fakeUser as never);
    prisma.user.update.mockResolvedValue(fakeUser as never);

    const request = {
      headers: {},
      query: { token: 'valid-token-abc' },
    } as Record<string, unknown>;
    const ctx = createMockContext(request);

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(request['extensionUser']).toEqual({
      userId: fakeUser.id,
      email: fakeUser.email,
      organizationId: fakeUser.organizationId,
      teamIds: fakeUser.teamIds,
      name: fakeUser.name,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { extensionToken: 'valid-token-abc' },
    });
  });

  it('throws UnauthorizedException on database error during lookup', async () => {
    prisma.user.findUnique.mockRejectedValue(new Error('connection refused'));

    const request = { headers: { 'x-extension-token': 'any-token' }, query: {} };
    const ctx = createMockContext(request);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('Extension token validation failed');
  });
});

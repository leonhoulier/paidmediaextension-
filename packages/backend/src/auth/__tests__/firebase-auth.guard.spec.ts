/**
 * Tests for FirebaseAuthGuard (local-auth mode only)
 *
 * Verifies:
 * - Missing Authorization header throws UnauthorizedException
 * - Invalid header format (no "Bearer ") throws UnauthorizedException
 * - Local auth: valid base64 JSON sets request.user
 * - Local auth: invalid base64 throws UnauthorizedException
 * - Local auth: user not found in DB throws UnauthorizedException
 * - Local auth: missing uid or email in payload throws UnauthorizedException
 */

import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { mockDeep, DeepMockProxy, mock } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { FirebaseAuthGuard } from '../firebase-auth.guard';

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

/** Encode a payload as base64 for local auth tokens. */
function encodeLocalToken(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

describe('FirebaseAuthGuard', () => {
  let guard: FirebaseAuthGuard;
  let prisma: DeepMockProxy<PrismaClient>;
  let configService: ConfigService;

  const fakeDbUser = {
    id: 'user-uuid-1',
    email: 'admin@example.com',
    organizationId: 'org-uuid-1',
    teamIds: [],
    name: 'Admin User',
    role: 'admin',
    extensionToken: null,
    tokenExpiresAt: null,
    tokenRevokedAt: null,
    lastActiveAt: null,
  };

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();

    // Use a real mock with controlled .get() behavior so the constructor sees allowLocalAuth=true
    configService = mock<ConfigService>();
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'allowLocalAuth') return true;
      return undefined;
    });

    guard = new FirebaseAuthGuard(configService, prisma as unknown as PrismaService);
  });

  it('throws UnauthorizedException when Authorization header is missing', async () => {
    const request = { headers: {} };
    const ctx = createMockContext(request);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('Missing or invalid Authorization header');
  });

  it('throws UnauthorizedException when header does not start with "Bearer "', async () => {
    const request = { headers: { authorization: 'Basic abc123' } };
    const ctx = createMockContext(request);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('Missing or invalid Authorization header');
  });

  it('sets request.user for a valid local auth token', async () => {
    prisma.user.findUnique.mockResolvedValue(fakeDbUser as never);

    const token = encodeLocalToken({ uid: 'firebase-uid-1', email: 'admin@example.com' });
    const request = { headers: { authorization: `Bearer ${token}` } } as Record<string, unknown>;
    const ctx = createMockContext(request);

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(request['user']).toEqual({
      uid: 'firebase-uid-1',
      email: fakeDbUser.email,
      organizationId: fakeDbUser.organizationId,
      role: fakeDbUser.role,
      name: fakeDbUser.name,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'admin@example.com' },
    });
  });

  it('throws UnauthorizedException for invalid base64 token', async () => {
    const request = { headers: { authorization: 'Bearer !!!not-base64!!!' } };
    const ctx = createMockContext(request);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when user is not found in DB', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const token = encodeLocalToken({ uid: 'uid-unknown', email: 'ghost@example.com' });
    const request = { headers: { authorization: `Bearer ${token}` } };
    const ctx = createMockContext(request);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('User not found');
  });

  it('throws UnauthorizedException when payload is missing uid', async () => {
    const token = encodeLocalToken({ email: 'admin@example.com' });
    const request = { headers: { authorization: `Bearer ${token}` } };
    const ctx = createMockContext(request);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'Local auth token must contain uid and email',
    );
  });

  it('throws UnauthorizedException when payload is missing email', async () => {
    const token = encodeLocalToken({ uid: 'some-uid' });
    const request = { headers: { authorization: `Bearer ${token}` } };
    const ctx = createMockContext(request);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'Local auth token must contain uid and email',
    );
  });
});

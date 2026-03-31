/**
 * Tests for RolesGuard
 *
 * Verifies:
 * - No @Roles decorator allows access (returns true)
 * - User has matching role returns true
 * - User missing required role throws ForbiddenException
 * - No user on request throws ForbiddenException
 */

import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { mock } from 'jest-mock-extended';
import { Reflector } from '@nestjs/core';
import { RolesGuard, ROLES_KEY } from '../roles.guard';
import { AuthenticatedUser } from '../auth.types';

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

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    uid: 'uid-1',
    email: 'user@example.com',
    organizationId: 'org-1',
    role: 'buyer',
    name: 'Test User',
    ...overrides,
  };
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = mock<Reflector>();
    guard = new RolesGuard(reflector);
  });

  it('allows access when no @Roles decorator is present', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

    const request = { user: makeUser() };
    const ctx = createMockContext(request);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      expect.any(Function),
      expect.any(Function),
    ]);
  });

  it('allows access when @Roles returns an empty array', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([]);

    const request = { user: makeUser() };
    const ctx = createMockContext(request);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows access when user has a matching role', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['admin', 'super_admin']);

    const request = { user: makeUser({ role: 'admin' }) };
    const ctx = createMockContext(request);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws ForbiddenException when user role does not match', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['admin', 'super_admin']);

    const request = { user: makeUser({ role: 'buyer' }) };
    const ctx = createMockContext(request);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow(
      "User role 'buyer' does not have access. Required: admin, super_admin",
    );
  });

  it('throws ForbiddenException when no user is on the request', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['admin']);

    const request = {};
    const ctx = createMockContext(request);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow('No user found in request');
  });
});

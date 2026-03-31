import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from './auth.types';

export const ROLES_KEY = 'roles';

/**
 * Decorator to set required roles for an endpoint
 *
 * @example
 * ```
 * @Roles('admin', 'super_admin')
 * @UseGuards(FirebaseAuthGuard, RolesGuard)
 * ```
 */
export const Roles = (...roles: string[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);

/**
 * Guard that checks if the authenticated user has one of the required roles.
 * Must be used after FirebaseAuthGuard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('No user found in request');
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(
        `User role '${user.role}' does not have access. Required: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}

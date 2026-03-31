import {
  User as PrismaUser,
  UserRole as PrismaUserRole,
} from '@prisma/client';
import {
  User as ApiUser,
  UserRole,
} from '@media-buying-governance/shared';

/**
 * Map Prisma UserRole enum to shared UserRole enum.
 */
function mapUserRole(role: PrismaUserRole): UserRole {
  switch (role) {
    case 'super_admin':
      return UserRole.SUPER_ADMIN;
    case 'admin':
      return UserRole.ADMIN;
    case 'viewer':
      return UserRole.VIEWER;
    case 'buyer':
      return UserRole.BUYER;
    default:
      return UserRole.BUYER;
  }
}

/**
 * Transform a Prisma User into the shared API User type.
 */
export function toApiUser(user: PrismaUser): ApiUser {
  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    role: mapUserRole(user.role),
    teamIds: user.teamIds,
    extensionToken: user.extensionToken ?? undefined,
    lastActiveAt: user.lastActiveAt ?? undefined,
  };
}

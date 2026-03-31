import {
  Organization as PrismaOrganization,
  SubscriptionPlan as PrismaSubscriptionPlan,
} from '@prisma/client';
import {
  Organization as ApiOrganization,
  SubscriptionPlan,
} from '@media-buying-governance/shared';

/**
 * Map Prisma SubscriptionPlan enum to shared SubscriptionPlan enum.
 */
function mapSubscriptionPlan(plan: PrismaSubscriptionPlan): SubscriptionPlan {
  switch (plan) {
    case 'free':
      return SubscriptionPlan.FREE;
    case 'pro':
      return SubscriptionPlan.PRO;
    case 'enterprise':
      return SubscriptionPlan.ENTERPRISE;
    default:
      return SubscriptionPlan.FREE;
  }
}

/**
 * Transform a Prisma Organization into the shared API Organization type.
 */
export function toApiOrganization(
  org: PrismaOrganization,
): ApiOrganization {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: mapSubscriptionPlan(org.plan),
    settings: (org.settings ?? {}) as Record<string, unknown>,
    createdAt: org.createdAt,
  };
}

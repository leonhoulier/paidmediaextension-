import {
  ComplianceEvent as PrismaComplianceEvent,
  Platform as PrismaPlatform,
  EntityLevel as PrismaEntityLevel,
  ComplianceStatus as PrismaComplianceStatus,
} from '@prisma/client';
import {
  ComplianceEvent as ApiComplianceEvent,
  Platform,
  EntityLevel,
  ComplianceStatus,
} from '@media-buying-governance/shared';

/**
 * Map Prisma Platform enum to shared Platform enum.
 */
function mapPlatform(platform: PrismaPlatform): Platform {
  switch (platform) {
    case 'meta':
      return Platform.META;
    case 'google_ads':
      return Platform.GOOGLE_ADS;
    case 'all':
      return Platform.ALL;
    default:
      return Platform.META;
  }
}

/**
 * Map Prisma EntityLevel enum to shared EntityLevel enum.
 */
function mapEntityLevel(level: PrismaEntityLevel): EntityLevel {
  switch (level) {
    case 'campaign':
      return EntityLevel.CAMPAIGN;
    case 'ad_set':
      return EntityLevel.AD_SET;
    case 'ad':
      return EntityLevel.AD;
    default:
      return EntityLevel.CAMPAIGN;
  }
}

/**
 * Map Prisma ComplianceStatus enum to shared ComplianceStatus enum.
 */
function mapComplianceStatus(status: PrismaComplianceStatus): ComplianceStatus {
  switch (status) {
    case 'passed':
      return ComplianceStatus.PASSED;
    case 'violated':
      return ComplianceStatus.VIOLATED;
    case 'overridden':
      return ComplianceStatus.OVERRIDDEN;
    case 'pending':
      return ComplianceStatus.PENDING;
    default:
      return ComplianceStatus.PENDING;
  }
}

/**
 * Transform a Prisma ComplianceEvent into the shared API ComplianceEvent type.
 */
export function toApiComplianceEvent(
  event: PrismaComplianceEvent,
): ApiComplianceEvent {
  return {
    id: event.id,
    organizationId: event.organizationId,
    buyerId: event.buyerId,
    adAccountId: event.adAccountId,
    platform: mapPlatform(event.platform),
    entityLevel: mapEntityLevel(event.entityLevel),
    entityName: event.entityName,
    ruleId: event.ruleId,
    status: mapComplianceStatus(event.status),
    fieldValue: event.fieldValue ?? undefined,
    expectedValue: event.expectedValue ?? undefined,
    comment: event.comment ?? undefined,
    createdAt: event.createdAt,
  };
}

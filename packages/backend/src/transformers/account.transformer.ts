import {
  AdAccount as PrismaAdAccount,
  Platform as PrismaPlatform,
} from '@prisma/client';
import {
  AdAccount as ApiAdAccount,
  Platform,
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
 * Transform a Prisma AdAccount into the shared API AdAccount type.
 *
 * The Prisma model and shared type have the same field names (camelCase),
 * so the mapping is straightforward. The main work is casting enum types.
 */
export function toApiAdAccount(account: PrismaAdAccount): ApiAdAccount {
  return {
    id: account.id,
    organizationId: account.organizationId,
    platform: mapPlatform(account.platform),
    platformAccountId: account.platformAccountId,
    accountName: account.accountName,
    market: account.market ?? undefined,
    region: account.region ?? undefined,
    active: account.active,
  };
}

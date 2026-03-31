import { Team as PrismaTeam } from '@prisma/client';
import { Team as ApiTeam } from '@media-buying-governance/shared';

/**
 * Transform a Prisma Team into the shared API Team type.
 */
export function toApiTeam(team: PrismaTeam): ApiTeam {
  return {
    id: team.id,
    organizationId: team.organizationId,
    name: team.name,
    description: team.description ?? undefined,
    memberIds: team.memberIds,
  };
}

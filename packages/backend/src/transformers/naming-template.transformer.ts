import { NamingTemplate as PrismaNamingTemplate } from '@prisma/client';
import {
  NamingTemplate as ApiNamingTemplate,
  NamingSegment,
} from '@media-buying-governance/shared';

/**
 * Transform a Prisma NamingTemplate into the shared API NamingTemplate type.
 *
 * The key transformation is casting the `segments` field from Prisma's
 * raw Json type to the typed NamingSegment[] array.
 */
export function toApiNamingTemplate(
  template: PrismaNamingTemplate,
): ApiNamingTemplate {
  return {
    id: template.id,
    ruleId: template.ruleId,
    segments: (template.segments ?? []) as unknown as NamingSegment[],
    separator: template.separator,
    example: template.example,
  };
}

import { Controller, Get, Query, UseGuards, Logger } from '@nestjs/common';
import { ExtensionTokenGuard } from '../auth/extension-token.guard';
import { CurrentExtensionUser } from '../auth/current-user.decorator';
import { ExtensionTokenUser } from '../auth/auth.types';
import { RulesService } from './rules.service';
import {
  GetRulesResponse,
  GetRulesVersionResponse,
  Rule,
  NamingTemplate,
} from '@media-buying-governance/shared';
import { toApiRule, toApiNamingTemplate } from '../transformers';

/**
 * Controller for extension rules API endpoints.
 *
 * All responses are transformed from Prisma models to shared API types
 * using the transformation layer, replacing the previous manual mapping.
 */
@Controller('api/v1/rules')
@UseGuards(ExtensionTokenGuard)
export class RulesController {
  private readonly logger = new Logger(RulesController.name);

  constructor(private readonly rulesService: RulesService) {}

  /**
   * GET /api/v1/rules
   * Fetch rules applicable to the current buyer, optionally filtered.
   * Returns typed GetRulesResponse from @media-buying-governance/shared.
   */
  @Get()
  async getRules(
    @CurrentExtensionUser() user: ExtensionTokenUser,
    @Query('platform') platform?: string,
    @Query('account_id') accountId?: string,
    @Query('entity_level') entityLevel?: string,
  ): Promise<GetRulesResponse> {
    this.logger.debug(
      `Fetching rules for buyer ${user.userId}, platform=${platform}, account=${accountId}, level=${entityLevel}`,
    );

    const { rules, version } = await this.rulesService.getRulesForBuyer({
      organizationId: user.organizationId,
      buyerId: user.userId,
      teamIds: user.teamIds,
      platform,
      accountId,
      entityLevel,
    });

    // Transform rules using the shared type transformer
    const mappedRules: Rule[] = rules.map(toApiRule);

    // Separate and transform naming templates from rules
    const namingTemplates: NamingTemplate[] = rules
      .filter((r) => r.namingTemplate !== null && r.namingTemplate !== undefined)
      .map((r) => toApiNamingTemplate(r.namingTemplate!));

    return {
      rules: mappedRules,
      namingTemplates,
      version,
    };
  }

  /**
   * GET /api/v1/rules/version
   * Lightweight version check for cache invalidation.
   * Returns typed GetRulesVersionResponse from @media-buying-governance/shared.
   */
  @Get('version')
  async getRulesVersion(
    @CurrentExtensionUser() user: ExtensionTokenUser,
  ): Promise<GetRulesVersionResponse> {
    return this.rulesService.getRulesVersion(
      user.organizationId,
      user.userId,
      user.teamIds,
    );
  }
}

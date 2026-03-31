import {
  Controller,
  Get,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { AuthenticatedUser } from '../../auth/auth.types';
import { RuleVersionsService, RuleVersionWithDiff } from './rule-versions.service';

/**
 * Admin controller for rule version history.
 *
 * GET /api/v1/admin/rules/:id/versions
 * Returns the full version history for a rule with computed diffs.
 */
@Controller('api/v1/admin/rules')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class RuleVersionsController {
  constructor(private readonly service: RuleVersionsService) {}

  @Get(':id/versions')
  async getVersions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RuleVersionWithDiff[]> {
    return this.service.getVersionHistory(id, user.organizationId);
  }
}

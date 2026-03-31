import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { AuthenticatedUser } from '../../auth/auth.types';
import { RuleSetsService } from './rule-sets.service';
import { CreateRuleSetDto } from './dto/create-rule-set.dto';
import { UpdateRuleSetDto } from './dto/update-rule-set.dto';
import { RuleSet } from '@media-buying-governance/shared';
import { toApiRuleSet } from '../../transformers';

/**
 * Admin CRUD controller for rule sets.
 * All responses are transformed to shared API types.
 */
@Controller('api/v1/admin/rule-sets')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class RuleSetsController {
  constructor(private readonly service: RuleSetsService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser): Promise<RuleSet[]> {
    const sets = await this.service.findAll(user.organizationId);
    return sets.map(toApiRuleSet);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RuleSet> {
    const set = await this.service.findOne(id, user.organizationId);
    return toApiRuleSet(set);
  }

  @Post()
  async create(
    @Body() dto: CreateRuleSetDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RuleSet> {
    const set = await this.service.create(user.organizationId, dto);
    return toApiRuleSet(set);
  }

  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRuleSetDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RuleSet> {
    const set = await this.service.update(id, user.organizationId, dto);
    return toApiRuleSet(set);
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ deleted: boolean }> {
    await this.service.remove(id, user.organizationId);
    return { deleted: true };
  }
}

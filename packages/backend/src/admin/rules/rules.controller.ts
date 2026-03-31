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
import { RulesService } from './rules.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { Rule } from '@media-buying-governance/shared';
import { toApiRule } from '../../transformers';

/**
 * Admin CRUD controller for rules.
 *
 * All responses are transformed from Prisma models to shared API types
 * using the toApiRule() transformer, which builds the nested scope object.
 */
@Controller('api/v1/admin/rules')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class RulesController {
  constructor(private readonly service: RulesService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser): Promise<Rule[]> {
    const rules = await this.service.findAll(user.organizationId);
    return rules.map(toApiRule);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Rule> {
    const rule = await this.service.findOne(id, user.organizationId);
    return toApiRule(rule);
  }

  @Post()
  async create(
    @Body() dto: CreateRuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Rule> {
    const rule = await this.service.create(user.organizationId, dto);
    return toApiRule(rule);
  }

  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Rule> {
    const rule = await this.service.update(id, user.organizationId, dto);
    return toApiRule(rule);
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

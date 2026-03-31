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
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { Team } from '@media-buying-governance/shared';
import { toApiTeam } from '../../transformers';

/**
 * Admin CRUD controller for teams.
 * All responses are transformed to shared API types.
 */
@Controller('api/v1/admin/teams')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class TeamsController {
  constructor(private readonly service: TeamsService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser): Promise<Team[]> {
    const teams = await this.service.findAll(user.organizationId);
    return teams.map(toApiTeam);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Team> {
    const team = await this.service.findOne(id, user.organizationId);
    return toApiTeam(team);
  }

  @Post()
  async create(
    @Body() dto: CreateTeamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Team> {
    const team = await this.service.create(user.organizationId, dto);
    return toApiTeam(team);
  }

  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Team> {
    const team = await this.service.update(id, user.organizationId, dto);
    return toApiTeam(team);
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

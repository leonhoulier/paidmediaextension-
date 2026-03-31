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
import { NamingTemplatesService } from './naming-templates.service';
import { CreateNamingTemplateDto } from './dto/create-naming-template.dto';
import { UpdateNamingTemplateDto } from './dto/update-naming-template.dto';
import { NamingTemplate } from '@media-buying-governance/shared';
import { toApiNamingTemplate } from '../../transformers';

/**
 * Admin CRUD controller for naming templates.
 * All responses are transformed to shared API types.
 */
@Controller('api/v1/admin/naming-templates')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class NamingTemplatesController {
  constructor(private readonly service: NamingTemplatesService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser): Promise<NamingTemplate[]> {
    const templates = await this.service.findAll(user.organizationId);
    return templates.map(toApiNamingTemplate);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NamingTemplate> {
    const template = await this.service.findOne(id, user.organizationId);
    return toApiNamingTemplate(template);
  }

  @Post()
  async create(
    @Body() dto: CreateNamingTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NamingTemplate> {
    const template = await this.service.create(user.organizationId, dto);
    return toApiNamingTemplate(template);
  }

  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNamingTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NamingTemplate> {
    const template = await this.service.update(id, user.organizationId, dto);
    return toApiNamingTemplate(template);
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

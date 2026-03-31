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
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { Organization } from '@media-buying-governance/shared';
import { toApiOrganization } from '../../transformers';

/**
 * Admin CRUD controller for organizations.
 * All responses are transformed to shared API types.
 */
@Controller('api/v1/admin/organizations')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('super_admin')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Get()
  async findAll(): Promise<Organization[]> {
    const orgs = await this.service.findAll();
    return orgs.map(toApiOrganization);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Organization> {
    const org = await this.service.findOne(id);
    return toApiOrganization(org);
  }

  @Post()
  async create(@Body() dto: CreateOrganizationDto): Promise<Organization> {
    const org = await this.service.create(dto);
    return toApiOrganization(org);
  }

  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    const org = await this.service.update(id, dto);
    return toApiOrganization(org);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ deleted: boolean }> {
    await this.service.remove(id);
    return { deleted: true };
  }
}

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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from '@media-buying-governance/shared';
import { toApiUser } from '../../transformers';

/**
 * Admin CRUD controller for users.
 * All responses are transformed to shared API types.
 */
@Controller('api/v1/admin/users')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser): Promise<User[]> {
    const users = await this.service.findAll(user.organizationId);
    return users.map(toApiUser);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    const found = await this.service.findOne(id, user.organizationId);
    return toApiUser(found);
  }

  @Post()
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    const created = await this.service.create(user.organizationId, dto);
    return toApiUser(created);
  }

  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    const updated = await this.service.update(id, user.organizationId, dto);
    return toApiUser(updated);
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

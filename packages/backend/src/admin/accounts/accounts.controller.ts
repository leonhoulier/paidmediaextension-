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
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AdAccount } from '@media-buying-governance/shared';
import { toApiAdAccount } from '../../transformers';

/**
 * Admin CRUD controller for ad accounts.
 * All responses are transformed to shared API types.
 */
@Controller('api/v1/admin/accounts')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser): Promise<AdAccount[]> {
    const accounts = await this.service.findAll(user.organizationId);
    return accounts.map(toApiAdAccount);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdAccount> {
    const account = await this.service.findOne(id, user.organizationId);
    return toApiAdAccount(account);
  }

  @Post()
  async create(
    @Body() dto: CreateAccountDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdAccount> {
    const account = await this.service.create(user.organizationId, dto);
    return toApiAdAccount(account);
  }

  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdAccount> {
    const account = await this.service.update(id, user.organizationId, dto);
    return toApiAdAccount(account);
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

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AdAccount, Platform } from '@prisma/client';

/**
 * Service for managing ad accounts
 */
@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string): Promise<AdAccount[]> {
    return this.prisma.adAccount.findMany({
      where: { organizationId },
      orderBy: { accountName: 'asc' },
    });
  }

  async findOne(id: string, organizationId: string): Promise<AdAccount> {
    const account = await this.prisma.adAccount.findFirst({
      where: { id, organizationId },
    });
    if (!account) {
      throw new NotFoundException(`Ad account ${id} not found`);
    }
    return account;
  }

  async create(organizationId: string, dto: CreateAccountDto): Promise<AdAccount> {
    return this.prisma.adAccount.create({
      data: {
        organizationId,
        platform: dto.platform as Platform,
        platformAccountId: dto.platformAccountId,
        accountName: dto.accountName,
        market: dto.market ?? null,
        region: dto.region ?? null,
        active: dto.active ?? true,
      },
    });
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateAccountDto,
  ): Promise<AdAccount> {
    await this.findOne(id, organizationId);
    return this.prisma.adAccount.update({
      where: { id },
      data: {
        ...(dto.platform !== undefined && { platform: dto.platform as Platform }),
        ...(dto.platformAccountId !== undefined && { platformAccountId: dto.platformAccountId }),
        ...(dto.accountName !== undefined && { accountName: dto.accountName }),
        ...(dto.market !== undefined && { market: dto.market }),
        ...(dto.region !== undefined && { region: dto.region }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });
  }

  async remove(id: string, organizationId: string): Promise<void> {
    await this.findOne(id, organizationId);
    await this.prisma.adAccount.delete({ where: { id } });
  }
}

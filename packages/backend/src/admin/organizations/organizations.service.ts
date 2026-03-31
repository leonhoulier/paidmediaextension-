import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { Organization, Prisma, SubscriptionPlan } from '@prisma/client';

/**
 * Service for managing organizations
 */
@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Organization[]> {
    return this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<Organization> {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) {
      throw new NotFoundException(`Organization ${id} not found`);
    }
    return org;
  }

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    return this.prisma.organization.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        plan: (dto.plan as SubscriptionPlan) ?? 'free',
        settings: (dto.settings ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async update(id: string, dto: UpdateOrganizationDto): Promise<Organization> {
    await this.findOne(id);
    const data: Prisma.OrganizationUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.plan !== undefined) data.plan = dto.plan as SubscriptionPlan;
    if (dto.settings !== undefined) data.settings = dto.settings as Prisma.InputJsonValue;

    return this.prisma.organization.update({
      where: { id },
      data,
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.organization.delete({ where: { id } });
  }
}

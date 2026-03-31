import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNamingTemplateDto } from './dto/create-naming-template.dto';
import { UpdateNamingTemplateDto } from './dto/update-naming-template.dto';
import { NamingTemplate, Prisma } from '@prisma/client';

/**
 * Service for managing naming templates
 */
@Injectable()
export class NamingTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string): Promise<NamingTemplate[]> {
    return this.prisma.namingTemplate.findMany({
      where: {
        rule: {
          ruleSet: { organizationId },
        },
      },
    });
  }

  async findOne(id: string, organizationId: string): Promise<NamingTemplate> {
    const template = await this.prisma.namingTemplate.findFirst({
      where: {
        id,
        rule: {
          ruleSet: { organizationId },
        },
      },
    });
    if (!template) {
      throw new NotFoundException(`Naming template ${id} not found`);
    }
    return template;
  }

  async create(
    organizationId: string,
    dto: CreateNamingTemplateDto,
  ): Promise<NamingTemplate> {
    // Verify the rule belongs to this organization
    const rule = await this.prisma.rule.findFirst({
      where: {
        id: dto.ruleId,
        ruleSet: { organizationId },
      },
    });
    if (!rule) {
      throw new NotFoundException(`Rule ${dto.ruleId} not found`);
    }

    return this.prisma.namingTemplate.create({
      data: {
        ruleId: dto.ruleId,
        segments: dto.segments as unknown as Prisma.InputJsonValue,
        separator: dto.separator ?? '_',
        example: dto.example ?? '',
      },
    });
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateNamingTemplateDto,
  ): Promise<NamingTemplate> {
    await this.findOne(id, organizationId);
    const data: Prisma.NamingTemplateUpdateInput = {};
    if (dto.segments !== undefined) data.segments = dto.segments as unknown as Prisma.InputJsonValue;
    if (dto.separator !== undefined) data.separator = dto.separator;
    if (dto.example !== undefined) data.example = dto.example;

    return this.prisma.namingTemplate.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, organizationId: string): Promise<void> {
    await this.findOne(id, organizationId);
    await this.prisma.namingTemplate.delete({ where: { id } });
  }
}

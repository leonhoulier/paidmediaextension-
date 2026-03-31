import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRuleSetDto } from './dto/create-rule-set.dto';
import { UpdateRuleSetDto } from './dto/update-rule-set.dto';
import { RuleSet } from '@prisma/client';

/**
 * Service for managing rule sets
 */
@Injectable()
export class RuleSetsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string): Promise<RuleSet[]> {
    return this.prisma.ruleSet.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, organizationId: string): Promise<RuleSet> {
    const ruleSet = await this.prisma.ruleSet.findFirst({
      where: { id, organizationId },
    });
    if (!ruleSet) {
      throw new NotFoundException(`Rule set ${id} not found`);
    }
    return ruleSet;
  }

  async create(organizationId: string, dto: CreateRuleSetDto): Promise<RuleSet> {
    return this.prisma.ruleSet.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description ?? null,
        accountIds: dto.accountIds ?? [],
        teamIds: dto.teamIds ?? [],
        buyerIds: dto.buyerIds ?? [],
        active: dto.active ?? true,
      },
    });
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateRuleSetDto,
  ): Promise<RuleSet> {
    const existing = await this.findOne(id, organizationId);
    return this.prisma.ruleSet.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.accountIds !== undefined && { accountIds: dto.accountIds }),
        ...(dto.teamIds !== undefined && { teamIds: dto.teamIds }),
        ...(dto.buyerIds !== undefined && { buyerIds: dto.buyerIds }),
        ...(dto.active !== undefined && { active: dto.active }),
        version: existing.version + 1,
      },
    });
  }

  async remove(id: string, organizationId: string): Promise<void> {
    await this.findOne(id, organizationId);
    await this.prisma.ruleSet.delete({ where: { id } });
  }
}

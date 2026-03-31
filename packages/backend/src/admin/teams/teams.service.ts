import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { Team } from '@prisma/client';

/**
 * Service for managing teams
 */
@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string): Promise<Team[]> {
    return this.prisma.team.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, organizationId: string): Promise<Team> {
    const team = await this.prisma.team.findFirst({
      where: { id, organizationId },
    });
    if (!team) {
      throw new NotFoundException(`Team ${id} not found`);
    }
    return team;
  }

  async create(organizationId: string, dto: CreateTeamDto): Promise<Team> {
    return this.prisma.team.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description ?? null,
        memberIds: dto.memberIds ?? [],
      },
    });
  }

  async update(id: string, organizationId: string, dto: UpdateTeamDto): Promise<Team> {
    await this.findOne(id, organizationId);
    return this.prisma.team.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.memberIds !== undefined && { memberIds: dto.memberIds }),
      },
    });
  }

  async remove(id: string, organizationId: string): Promise<void> {
    await this.findOne(id, organizationId);
    await this.prisma.team.delete({ where: { id } });
  }
}

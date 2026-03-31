import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserRole } from '@prisma/client';

/**
 * Service for managing users
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string): Promise<User[]> {
    return this.prisma.user.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, organizationId: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
    });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async create(organizationId: string, dto: CreateUserDto): Promise<User> {
    // Generate extension token for buyer users
    const extensionToken =
      dto.role === 'buyer' ? this.generateExtensionToken() : null;

    return this.prisma.user.create({
      data: {
        organizationId,
        email: dto.email,
        name: dto.name,
        role: dto.role as UserRole,
        teamIds: dto.teamIds ?? [],
        extensionToken,
      },
    });
  }

  async update(id: string, organizationId: string, dto: UpdateUserDto): Promise<User> {
    await this.findOne(id, organizationId);
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.role !== undefined && { role: dto.role as UserRole }),
        ...(dto.teamIds !== undefined && { teamIds: dto.teamIds }),
      },
    });
  }

  async remove(id: string, organizationId: string): Promise<void> {
    await this.findOne(id, organizationId);
    await this.prisma.user.delete({ where: { id } });
  }

  /**
   * Generate a 64-character hex extension token
   */
  private generateExtensionToken(): string {
    return randomBytes(32).toString('hex');
  }
}

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global Prisma module — makes PrismaService available across the application
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

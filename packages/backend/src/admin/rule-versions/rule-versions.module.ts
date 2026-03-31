import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { RuleVersionsController } from './rule-versions.controller';
import { RuleVersionsService } from './rule-versions.service';

/**
 * Module for rule version history tracking
 */
@Module({
  imports: [AuthModule],
  controllers: [RuleVersionsController],
  providers: [RuleVersionsService],
  exports: [RuleVersionsService],
})
export class RuleVersionsModule {}

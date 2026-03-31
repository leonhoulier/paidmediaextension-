import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { RuleSetsController } from './rule-sets.controller';
import { RuleSetsService } from './rule-sets.service';

@Module({
  imports: [AuthModule],
  controllers: [RuleSetsController],
  providers: [RuleSetsService],
  exports: [RuleSetsService],
})
export class RuleSetsModule {}

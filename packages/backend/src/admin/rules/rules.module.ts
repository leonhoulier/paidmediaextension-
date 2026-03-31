import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PubSubModule } from '../../pubsub/pubsub.module';
import { RuleVersionsModule } from '../rule-versions/rule-versions.module';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

@Module({
  imports: [AuthModule, PubSubModule, RuleVersionsModule],
  controllers: [RulesController],
  providers: [RulesService],
  exports: [RulesService],
})
export class RulesModule {}

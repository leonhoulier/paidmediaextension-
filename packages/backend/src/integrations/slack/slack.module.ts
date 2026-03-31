import { Module } from '@nestjs/common';
import { SlackService } from './slack.service';

/**
 * Module for Slack integration (Block Kit compliance notifications)
 */
@Module({
  providers: [SlackService],
  exports: [SlackService],
})
export class SlackModule {}

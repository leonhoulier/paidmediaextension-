import { Module } from '@nestjs/common';
import { PubSubService } from './pubsub.service';

/**
 * Module for Google Cloud Pub/Sub integration
 */
@Module({
  providers: [PubSubService],
  exports: [PubSubService],
})
export class PubSubModule {}

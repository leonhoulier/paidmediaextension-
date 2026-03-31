import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

/**
 * Module for webhook CRUD and delivery
 */
@Module({
  imports: [AuthModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { AuthenticatedUser } from '../../auth/auth.types';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { GetWebhookDeliveriesDto } from './dto/get-webhook-deliveries.dto';

/**
 * Response shape for webhook API endpoints.
 * We return the Prisma model directly since webhooks are not in the shared types
 * (they are an admin-only backend concern).
 */
interface WebhookResponse {
  id: string;
  organizationId: string;
  url: string;
  events: string[];
  active: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Transform a Prisma Webhook to the API response (strip the secret)
 */
function toWebhookResponse(webhook: {
  id: string;
  organizationId: string;
  url: string;
  events: string[];
  active: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): WebhookResponse {
  return {
    id: webhook.id,
    organizationId: webhook.organizationId,
    url: webhook.url,
    events: webhook.events,
    active: webhook.active,
    description: webhook.description,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
  };
}

/**
 * Admin CRUD controller for webhook registrations.
 *
 * Endpoints:
 * - POST   /api/v1/admin/webhooks       — Register a new webhook
 * - GET    /api/v1/admin/webhooks       — List all webhooks
 * - PUT    /api/v1/admin/webhooks/:id   — Update a webhook
 * - DELETE /api/v1/admin/webhooks/:id   — Delete a webhook
 */
@Controller('api/v1/admin/webhooks')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser): Promise<WebhookResponse[]> {
    const webhooks = await this.service.findAll(user.organizationId);
    return webhooks.map(toWebhookResponse);
  }

  @Post()
  async create(
    @Body() dto: CreateWebhookDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WebhookResponse> {
    const webhook = await this.service.create(user.organizationId, dto);
    return toWebhookResponse(webhook);
  }

  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WebhookResponse> {
    const webhook = await this.service.update(id, user.organizationId, dto);
    return toWebhookResponse(webhook);
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ deleted: boolean }> {
    await this.service.remove(id, user.organizationId);
    return { deleted: true };
  }

  @Get('deliveries')
  async getDeliveries(
    @Query() filters: GetWebhookDeliveriesDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ deliveries: any[]; total: number }> {
    return this.service.getDeliveries(user.organizationId, filters);
  }
}

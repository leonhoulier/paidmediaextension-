import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { GetWebhookDeliveriesDto } from './dto/get-webhook-deliveries.dto';
import { Webhook } from '@prisma/client';
import { createHmac } from 'crypto';

/**
 * Webhook payload sent to registered URLs
 */
export interface WebhookPayload {
  event_type: string;
  timestamp: string;
  organization_id: string;
  data: {
    buyer?: string;
    account?: string;
    platform?: string;
    rule?: string;
    violation_details?: string;
    entity_name?: string;
    status?: string;
  };
}

/**
 * Service for managing webhooks and delivering compliance event payloads.
 *
 * Webhook payloads are signed with HMAC-SHA256 using the registered secret.
 * In production, delivery would be backed by Cloud Pub/Sub push subscriptions
 * for reliable at-least-once delivery with retry.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all webhooks for an organization
   */
  async findAll(organizationId: string): Promise<Webhook[]> {
    return this.prisma.webhook.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single webhook by ID
   */
  async findOne(id: string, organizationId: string): Promise<Webhook> {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id, organizationId },
    });
    if (!webhook) {
      throw new NotFoundException(`Webhook ${id} not found`);
    }
    return webhook;
  }

  /**
   * Create a new webhook registration
   */
  async create(organizationId: string, dto: CreateWebhookDto): Promise<Webhook> {
    return this.prisma.webhook.create({
      data: {
        organizationId,
        url: dto.url,
        events: dto.events,
        secret: dto.secret,
        active: dto.active ?? true,
        description: dto.description ?? null,
      },
    });
  }

  /**
   * Update an existing webhook
   */
  async update(
    id: string,
    organizationId: string,
    dto: UpdateWebhookDto,
  ): Promise<Webhook> {
    // Verify existence
    await this.findOne(id, organizationId);

    return this.prisma.webhook.update({
      where: { id },
      data: {
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.events !== undefined && { events: dto.events }),
        ...(dto.secret !== undefined && { secret: dto.secret }),
        ...(dto.active !== undefined && { active: dto.active }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
  }

  /**
   * Delete a webhook
   */
  async remove(id: string, organizationId: string): Promise<void> {
    await this.findOne(id, organizationId);
    await this.prisma.webhook.delete({ where: { id } });
  }

  /**
   * Fan out a compliance event to all matching registered webhooks.
   *
   * This method:
   * 1. Queries all active webhooks for the organization that subscribe to the event type
   * 2. Builds the payload
   * 3. Signs it with HMAC-SHA256 using each webhook's secret
   * 4. Delivers via HTTP POST (fire-and-forget with logging)
   *
   * In production, this would publish to a Pub/Sub topic with push subscriptions
   * for guaranteed delivery with exponential backoff retry.
   */
  async fanOutComplianceEvent(
    organizationId: string,
    eventType: string,
    payload: WebhookPayload,
  ): Promise<void> {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        organizationId,
        active: true,
      },
    });

    // Filter to webhooks that subscribe to this event type (or subscribe to all via '*')
    const matching = webhooks.filter(
      (w) => w.events.includes(eventType) || w.events.includes('*'),
    );

    if (matching.length === 0) {
      this.logger.debug(`No webhooks matched event ${eventType}`);
      return;
    }

    // Deliver to each webhook in parallel (fire-and-forget)
    const deliveryPromises = matching.map((webhook) =>
      this.deliverPayload(webhook, payload),
    );

    // Wait for all deliveries but don't fail the caller
    const results = await Promise.allSettled(deliveryPromises);
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      this.logger.warn(
        `${failed.length}/${matching.length} webhook deliveries failed for event ${eventType}`,
      );
    }
  }

  /**
   * Deliver a webhook payload to a single URL with HMAC-SHA256 signature.
   */
  private async deliverPayload(
    webhook: Webhook,
    payload: WebhookPayload,
  ): Promise<void> {
    const body = JSON.stringify(payload);
    const signature = this.signPayload(body, webhook.secret);
    const startTime = Date.now();

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': payload.event_type,
          'X-Webhook-Timestamp': payload.timestamp,
        },
        body,
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      const duration = Date.now() - startTime;
      const responseBody = await response.text().catch(() => undefined);

      if (!response.ok) {
        this.logger.warn(
          `Webhook delivery to ${webhook.url} returned ${response.status}`,
        );
      } else {
        this.logger.log(
          `Webhook delivered to ${webhook.url} for event ${payload.event_type}`,
        );
      }

      // Log delivery attempt
      await this.logDelivery({
        webhookId: webhook.id,
        event: payload.event_type,
        url: webhook.url,
        statusCode: response.status,
        success: response.ok,
        requestBody: body,
        responseBody,
        duration,
      });
    } catch (err) {
      const duration = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      this.logger.error(
        `Webhook delivery to ${webhook.url} failed: ${errorMessage}`,
      );

      // Log failed delivery attempt
      await this.logDelivery({
        webhookId: webhook.id,
        event: payload.event_type,
        url: webhook.url,
        success: false,
        requestBody: body,
        error: errorMessage,
        duration,
      });

      throw err;
    }
  }

  /**
   * Sign a payload with HMAC-SHA256 using the webhook secret.
   * Returns the signature as a hex string prefixed with 'sha256='.
   */
  private signPayload(payload: string, secret: string): string {
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Log a webhook delivery attempt to the database for troubleshooting.
   */
  async logDelivery(data: {
    webhookId: string;
    event: string;
    url: string;
    statusCode?: number;
    success: boolean;
    requestBody: string;
    responseBody?: string;
    error?: string;
    duration: number;
  }): Promise<void> {
    await this.prisma.webhookDelivery.create({
      data: {
        webhookId: data.webhookId,
        event: data.event,
        url: data.url,
        statusCode: data.statusCode,
        success: data.success,
        requestBody: data.requestBody,
        responseBody: data.responseBody,
        error: data.error,
        attemptedAt: new Date(),
        duration: data.duration,
      },
    });
  }

  /**
   * Get webhook delivery history for an organization.
   * Supports filtering by webhookId and success status, with pagination.
   */
  async getDeliveries(
    organizationId: string,
    filters: GetWebhookDeliveriesDto,
  ): Promise<{ deliveries: any[]; total: number }> {
    // First verify webhookId belongs to org if provided
    const where: any = {};

    if (filters.webhookId) {
      const webhook = await this.prisma.webhook.findFirst({
        where: { id: filters.webhookId, organizationId },
      });
      if (!webhook) throw new NotFoundException('Webhook not found');
      where.webhookId = filters.webhookId;
    } else {
      // Get all webhook IDs for this org
      const webhooks = await this.prisma.webhook.findMany({
        where: { organizationId },
        select: { id: true },
      });
      where.webhookId = { in: webhooks.map((w) => w.id) };
    }

    if (filters.success !== undefined) {
      where.success = filters.success;
    }

    const [deliveries, total] = await Promise.all([
      this.prisma.webhookDelivery.findMany({
        where,
        orderBy: { attemptedAt: 'desc' },
        take: filters.limit || 50,
        skip: filters.offset || 0,
        include: { webhook: true },
      }),
      this.prisma.webhookDelivery.count({ where }),
    ]);

    return { deliveries, total };
  }
}

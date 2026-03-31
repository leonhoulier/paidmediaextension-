import {
  Controller,
  Get,
  Res,
  UseGuards,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Response } from 'express';
import { ExtensionTokenGuard } from '../auth/extension-token.guard';
import { ConfigService } from '@nestjs/config';
import { PubSub, Subscription, Message } from '@google-cloud/pubsub';

/**
 * SSE controller for real-time rule update notifications to extensions.
 *
 * Uses a Cloud Pub/Sub subscription on the "rules-updated" topic.
 * When a message arrives, it is broadcast to all connected SSE clients.
 *
 * Extensions connect to GET /api/v1/extension/rules-stream and receive
 * server-sent events whenever rules are created, updated, or deleted.
 */
@Controller('api/v1/extension')
export class RulesStreamController implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RulesStreamController.name);
  private readonly clients = new Set<Response>();
  private pubsub: PubSub | null = null;
  private subscription: Subscription | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    try {
      const projectId =
        this.configService.get<string>('googleCloudProject') ?? 'local-dev';
      this.pubsub = new PubSub({ projectId });

      // Create or get the subscription for SSE consumers
      const topicName = 'rules-updated';
      const subscriptionName = 'rules-updated-sse';

      const topic = this.pubsub.topic(topicName);
      const [topicExists] = await topic.exists();

      if (!topicExists) {
        this.logger.warn(
          `Topic ${topicName} does not exist yet. SSE will start once the topic is created.`,
        );
        return;
      }

      let sub = this.pubsub.subscription(subscriptionName);
      const [subExists] = await sub.exists();

      if (!subExists) {
        this.logger.log(`Creating subscription: ${subscriptionName}`);
        [sub] = await topic.createSubscription(subscriptionName);
      }

      this.subscription = sub;

      // Listen for messages and broadcast to all SSE clients
      this.subscription.on('message', (message: Message) => {
        this.handlePubSubMessage(message);
      });

      this.subscription.on('error', (err: Error) => {
        this.logger.error(`Pub/Sub subscription error: ${err.message}`);
      });

      this.logger.log('SSE rules-stream subscription initialized');
    } catch (err) {
      this.logger.warn(
        `Failed to initialize SSE Pub/Sub subscription: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Close the subscription
    if (this.subscription) {
      this.subscription.removeAllListeners();
      await this.subscription.close();
    }

    // Close all SSE connections
    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();
  }

  /**
   * GET /api/v1/extension/rules-stream
   *
   * Server-Sent Events endpoint. Extensions maintain a persistent connection
   * and receive events when rules are updated.
   *
   * Event format:
   * ```
   * event: rules_updated
   * data: {"version":"abc123","accountIdsAffected":["uuid1","uuid2"],"timestamp":"..."}
   * ```
   */
  @Get('rules-stream')
  @UseGuards(ExtensionTokenGuard)
  stream(@Res() res: Response): void {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Send initial connection event
    res.write(`event: connected\ndata: {"status":"connected"}\n\n`);

    // Register this client
    this.clients.add(res);
    this.logger.log(
      `SSE client connected. Total clients: ${this.clients.size}`,
    );

    // Log telemetry: connection established
    this.logger.debug({
      event: 'sse_client_connected',
      totalClients: this.clients.size,
      timestamp: new Date().toISOString(),
    });

    // Send heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      try {
        const heartbeatData = {
          timestamp: new Date().toISOString(),
        };
        res.write(`event: heartbeat\ndata: ${JSON.stringify(heartbeatData)}\n\n`);
      } catch (err) {
        this.logger.warn('Failed to send heartbeat:', err);
      }
    }, 30000);

    // Clean up on disconnect
    res.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(res);
      this.logger.log(
        `SSE client disconnected. Total clients: ${this.clients.size}`,
      );

      // Log telemetry: connection closed
      this.logger.debug({
        event: 'sse_client_disconnected',
        totalClients: this.clients.size,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Handle an incoming Pub/Sub message and broadcast to all SSE clients.
   */
  private handlePubSubMessage(message: Message): void {
    const broadcastStartTime = Date.now();
    let successCount = 0;
    let failureCount = 0;

    try {
      const data = message.data.toString();
      this.logger.log(`Broadcasting rule update to ${this.clients.size} SSE clients`);

      for (const client of this.clients) {
        try {
          client.write(`event: rules_updated\ndata: ${data}\n\n`);
          successCount++;
        } catch (err) {
          this.logger.warn('Failed to write to SSE client:', err);
          failureCount++;
        }
      }

      const broadcastLatencyMs = Date.now() - broadcastStartTime;

      // Log telemetry: broadcast success
      this.logger.debug({
        event: 'sse_broadcast_complete',
        totalClients: this.clients.size,
        successCount,
        failureCount,
        latencyMs: broadcastLatencyMs,
        timestamp: new Date().toISOString(),
      });

      message.ack();
    } catch (err) {
      const broadcastLatencyMs = Date.now() - broadcastStartTime;

      this.logger.error(
        `Error broadcasting SSE message: ${err instanceof Error ? err.message : String(err)}`,
      );

      // Log telemetry: broadcast failure
      this.logger.error({
        event: 'sse_broadcast_failure',
        totalClients: this.clients.size,
        successCount,
        failureCount,
        latencyMs: broadcastLatencyMs,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });

      message.nack();
    }
  }
}

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PubSub, Topic } from '@google-cloud/pubsub';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const RULES_UPDATED_TOPIC = 'rules-updated';
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Service for publishing messages to Google Cloud Pub/Sub.
 * On startup, creates the rules-updated topic if it does not exist.
 * For local dev, uses the Pub/Sub emulator via PUBSUB_EMULATOR_HOST.
 */
@Injectable()
export class PubSubService implements OnModuleInit {
  private readonly logger = new Logger(PubSubService.name);
  private pubsub: PubSub;
  private topic: Topic | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const projectId = this.configService.get<string>('googleCloudProject') ?? 'local-dev';
    const emulatorHost = this.configService.get<string>('pubsubEmulatorHost');

    if (emulatorHost) {
      this.logger.log(`Using Pub/Sub emulator at ${emulatorHost}`);
    }

    this.pubsub = new PubSub({ projectId });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureTopicExists();
    } catch (err) {
      this.logger.warn(
        `Failed to initialize Pub/Sub topic. Publishing will be skipped. Error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Publish a rule update notification with retry logic
   */
  async publishRuleUpdate(accountIdsAffected: string[]): Promise<void> {
    if (!this.topic) {
      this.logger.warn('Pub/Sub topic not initialized, skipping publish');
      return;
    }

    const publishStartTime = Date.now();
    const version = createHash('sha256')
      .update(Date.now().toString() + JSON.stringify(accountIdsAffected))
      .digest('hex');

    const message = {
      version,
      accountIdsAffected,
      timestamp: new Date().toISOString(),
    };

    const messageJson = JSON.stringify(message);

    // Try publishing with exponential backoff
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const messageId = await this.topic.publishMessage({
          data: Buffer.from(messageJson),
          attributes: {
            eventType: 'rules_updated',
          },
        });

        const publishLatencyMs = Date.now() - publishStartTime;

        this.logger.log(
          `Published rule update message ${messageId} ` +
          `(version: ${version}, accounts: ${accountIdsAffected.length}, latency: ${publishLatencyMs}ms, attempt: ${attempt})`,
        );

        // Log telemetry metrics
        this.logger.debug({
          event: 'pubsub_publish_success',
          messageId,
          version,
          accountCount: accountIdsAffected.length,
          latencyMs: publishLatencyMs,
          attempt,
        });

        return; // Success - exit function
      } catch (err) {
        const publishLatencyMs = Date.now() - publishStartTime;
        const isLastAttempt = attempt === MAX_RETRY_ATTEMPTS;

        this.logger.error(
          `Failed to publish rule update (version: ${version}, accounts: ${accountIdsAffected.length}, ` +
          `latency: ${publishLatencyMs}ms, attempt: ${attempt}/${MAX_RETRY_ATTEMPTS})`,
          err,
        );

        // Log telemetry metrics for failure
        this.logger.error({
          event: 'pubsub_publish_failure',
          version,
          accountCount: accountIdsAffected.length,
          latencyMs: publishLatencyMs,
          attempt,
          error: err instanceof Error ? err.message : String(err),
        });

        if (isLastAttempt) {
          // Store failed publish in database for background retry
          await this.storeFailedPublish(RULES_UPDATED_TOPIC, messageJson, err);
          // Don't throw - we've persisted for retry
          return;
        }

        // Exponential backoff: 2s, 4s, 8s
        const delayMs = Math.pow(2, attempt) * 1000;
        this.logger.log(`Retrying publish in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  /**
   * Store a failed publish attempt for background retry
   */
  private async storeFailedPublish(
    topic: string,
    message: string,
    error: unknown,
  ): Promise<void> {
    try {
      await this.prisma.pubSubFailure.create({
        data: {
          topic,
          message,
          lastError: error instanceof Error ? error.message : String(error),
        },
      });

      this.logger.log(`Stored failed Pub/Sub publish for background retry (topic: ${topic})`);
    } catch (dbErr) {
      this.logger.error('Failed to store failed publish in database:', dbErr);
    }
  }

  /**
   * Retry all unresolved failed publishes
   * Call this from a scheduled job (e.g., every 5 minutes)
   */
  async retryFailedPublishes(): Promise<void> {
    if (!this.topic) {
      this.logger.warn('Pub/Sub topic not initialized, skipping retry');
      return;
    }

    const failures = await this.prisma.pubSubFailure.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 10, // Process 10 at a time
    });

    for (const failure of failures) {
      try {
        const messageId = await this.topic.publishMessage({
          data: Buffer.from(failure.message),
          attributes: {
            eventType: 'rules_updated',
            retryAttempt: String(failure.attempts),
          },
        });

        this.logger.log(
          `Successfully published previously failed message ${messageId} (failure ID: ${failure.id}, attempts: ${failure.attempts})`,
        );

        // Mark as resolved
        await this.prisma.pubSubFailure.update({
          where: { id: failure.id },
          data: { resolvedAt: new Date() },
        });
      } catch (err) {
        this.logger.error(`Failed to retry publish (failure ID: ${failure.id}):`, err);

        // Update attempt count and last error
        await this.prisma.pubSubFailure.update({
          where: { id: failure.id },
          data: {
            attempts: failure.attempts + 1,
            lastAttempt: new Date(),
            lastError: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
  }

  /**
   * Create the topic if it does not already exist
   */
  private async ensureTopicExists(): Promise<void> {
    this.topic = this.pubsub.topic(RULES_UPDATED_TOPIC);

    const [exists] = await this.topic.exists();
    if (!exists) {
      this.logger.log(`Creating Pub/Sub topic: ${RULES_UPDATED_TOPIC}`);
      [this.topic] = await this.pubsub.createTopic(RULES_UPDATED_TOPIC);
      this.logger.log(`Pub/Sub topic created: ${RULES_UPDATED_TOPIC}`);
    } else {
      this.logger.log(`Pub/Sub topic already exists: ${RULES_UPDATED_TOPIC}`);
    }
  }
}

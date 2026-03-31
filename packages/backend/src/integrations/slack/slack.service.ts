import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Compliance event data passed to the Slack formatter
 */
export interface SlackComplianceEvent {
  buyerName: string;
  ruleName: string;
  entityName: string;
  platform: string;
  accountName: string;
  status: 'passed' | 'violated' | 'overridden';
  fieldValue?: string;
  expectedValue?: string;
}

/**
 * Slack Block Kit message structure
 */
interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: string;
    text: string;
  }>;
  fields?: Array<{
    type: string;
    text: string;
  }>;
}

interface SlackMessage {
  blocks: SlackBlock[];
}

/**
 * Service for formatting compliance events as Slack Block Kit messages
 * and posting them to a Slack webhook URL.
 *
 * The webhook URL is configured via the SLACK_WEBHOOK_URL environment variable.
 * If not set, messages are logged but not sent.
 */
@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);
  private readonly webhookUrl: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.webhookUrl = this.configService.get<string>('SLACK_WEBHOOK_URL');
    if (!this.webhookUrl) {
      this.logger.warn(
        'SLACK_WEBHOOK_URL not configured. Slack notifications will be logged only.',
      );
    }
  }

  /**
   * Send a compliance violation notification to Slack
   */
  async notifyComplianceEvent(event: SlackComplianceEvent): Promise<void> {
    const message = this.formatMessage(event);

    if (!this.webhookUrl) {
      this.logger.log(
        `[Slack] Would send: ${event.status} - ${event.buyerName} on rule "${event.ruleName}"`,
      );
      return;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        this.logger.warn(`Slack webhook returned ${response.status}`);
      } else {
        this.logger.log(`Slack notification sent for ${event.status} event`);
      }
    } catch (err) {
      this.logger.error(
        `Failed to send Slack notification: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Format a compliance event into a Slack Block Kit message.
   *
   * Uses structured blocks with:
   * - Header with status emoji
   * - Section with buyer/rule/campaign details
   * - Fields with platform, account, values
   * - Context with timestamp
   */
  private formatMessage(event: SlackComplianceEvent): SlackMessage {
    const emoji = this.getStatusEmoji(event.status);
    const statusLabel = this.getStatusLabel(event.status);
    const color = this.getStatusColor(event.status);

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} Compliance ${statusLabel}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${event.buyerName}* ${event.status === 'violated' ? 'violated' : event.status === 'passed' ? 'passed' : 'overrode'} rule *"${event.ruleName}"* in campaign *"${event.entityName}"*`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Platform:*\n${event.platform}`,
          },
          {
            type: 'mrkdwn',
            text: `*Account:*\n${event.accountName}`,
          },
          ...(event.fieldValue
            ? [
                {
                  type: 'mrkdwn' as const,
                  text: `*Actual Value:*\n\`${event.fieldValue}\``,
                },
              ]
            : []),
          ...(event.expectedValue
            ? [
                {
                  type: 'mrkdwn' as const,
                  text: `*Expected:*\n\`${event.expectedValue}\``,
                },
              ]
            : []),
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `${color} *Status:* ${statusLabel} | ${new Date().toISOString()}`,
          },
        ],
      },
    ];

    return { blocks };
  }

  /**
   * Get emoji for compliance status
   */
  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'violated':
        return '\u26A0\uFE0F'; // warning sign
      case 'passed':
        return '\u2705'; // green check
      case 'overridden':
        return '\uD83D\uDD04'; // counterclockwise arrows
      default:
        return '\u2139\uFE0F'; // info
    }
  }

  /**
   * Get human-readable label for status
   */
  private getStatusLabel(status: string): string {
    switch (status) {
      case 'violated':
        return 'Violation';
      case 'passed':
        return 'Pass';
      case 'overridden':
        return 'Override';
      default:
        return 'Event';
    }
  }

  /**
   * Get color indicator for status
   */
  private getStatusColor(status: string): string {
    switch (status) {
      case 'violated':
        return '\uD83D\uDD34'; // red circle
      case 'passed':
        return '\uD83D\uDFE2'; // green circle
      case 'overridden':
        return '\uD83D\uDFE1'; // yellow circle
      default:
        return '\u26AA'; // white circle
    }
  }
}

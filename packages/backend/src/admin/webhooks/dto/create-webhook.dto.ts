import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

/**
 * DTO for creating a webhook registration
 */
export class CreateWebhookDto {
  /** The URL to deliver webhook payloads to */
  @IsUrl({}, { message: 'url must be a valid URL' })
  @IsNotEmpty()
  url!: string;

  /** Array of event types to subscribe to (e.g. ['compliance.violated', 'compliance.passed']) */
  @IsArray()
  @IsString({ each: true })
  events!: string[];

  /** HMAC-SHA256 secret for payload signing */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  secret!: string;

  /** Whether the webhook is active */
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** Optional description */
  @IsOptional()
  @IsString()
  description?: string;
}

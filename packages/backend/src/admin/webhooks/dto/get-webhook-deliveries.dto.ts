import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * DTO for querying webhook delivery history
 */
export class GetWebhookDeliveriesDto {
  /** Filter by specific webhook ID (optional) */
  @IsOptional()
  @IsUUID()
  webhookId?: string;

  /** Filter by success status (optional) */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  success?: boolean;

  /** Pagination limit (default: 50) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  /** Pagination offset (default: 0) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

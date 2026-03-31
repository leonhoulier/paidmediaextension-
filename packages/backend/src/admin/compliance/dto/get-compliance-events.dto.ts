import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for querying compliance events with filters and pagination.
 *
 * All fields are optional to support flexible filtering.
 */
export class GetComplianceEventsDto {
  /**
   * Filter by buyer ID (user who created the entity)
   */
  @IsOptional()
  @IsUUID()
  buyerId?: string;

  /**
   * Filter by ad account ID
   */
  @IsOptional()
  @IsUUID()
  accountId?: string;

  /**
   * Filter by rule ID
   */
  @IsOptional()
  @IsUUID()
  ruleId?: string;

  /**
   * Filter by compliance status
   */
  @IsOptional()
  @IsEnum(['passed', 'violated', 'overridden', 'pending'])
  status?: string;

  /**
   * Start date for date range filter (ISO 8601 format)
   */
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  /**
   * End date for date range filter (ISO 8601 format)
   */
  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  /**
   * Pagination limit (default: 50, max: 100)
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  /**
   * Pagination offset (default: 0)
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number;
}

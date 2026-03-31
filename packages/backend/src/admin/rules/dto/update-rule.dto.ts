import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * DTO for updating a rule
 */
export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['meta', 'google_ads', 'all'])
  platform?: string;

  @IsOptional()
  @IsEnum(['campaign', 'ad_set', 'ad'])
  entityLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  ruleType?: string;

  @IsOptional()
  @IsEnum(['warning', 'blocking', 'comment_required', 'second_approver'])
  enforcement?: string;

  @IsOptional()
  @IsObject()
  condition?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  uiConfig?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

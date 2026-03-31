import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * DTO for creating a rule
 */
export class CreateRuleDto {
  @IsUUID()
  @IsNotEmpty()
  ruleSetId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['meta', 'google_ads', 'all'])
  platform?: string;

  @IsEnum(['campaign', 'ad_set', 'ad'])
  entityLevel!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  ruleType!: string;

  @IsOptional()
  @IsEnum(['warning', 'blocking', 'comment_required', 'second_approver'])
  enforcement?: string;

  @IsObject()
  condition!: Record<string, unknown>;

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

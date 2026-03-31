import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for a single compliance event in a batch
 */
export class ComplianceEventDto {
  @IsUUID()
  @IsNotEmpty()
  adAccountId!: string;

  @IsEnum(['meta', 'google_ads', 'all'])
  platform!: string;

  @IsEnum(['campaign', 'ad_set', 'ad'])
  entityLevel!: string;

  @IsString()
  @IsNotEmpty()
  entityName!: string;

  @IsUUID()
  @IsNotEmpty()
  ruleId!: string;

  @IsEnum(['passed', 'violated', 'overridden', 'pending'])
  status!: string;

  @IsOptional()
  @IsString()
  fieldValue?: string;

  @IsOptional()
  @IsString()
  expectedValue?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

/**
 * DTO for batch compliance events request
 */
export class PostComplianceEventsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @Type(() => ComplianceEventDto)
  events!: ComplianceEventDto[];
}

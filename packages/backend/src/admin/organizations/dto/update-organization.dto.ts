import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * DTO for updating an organization
 */
export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @IsOptional()
  @IsEnum(['free', 'pro', 'enterprise'])
  plan?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

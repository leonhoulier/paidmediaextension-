import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * DTO for creating an organization
 */
export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  slug!: string;

  @IsOptional()
  @IsEnum(['free', 'pro', 'enterprise'])
  plan?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

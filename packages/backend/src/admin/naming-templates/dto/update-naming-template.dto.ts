import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO for updating a naming template
 */
export class UpdateNamingTemplateDto {
  @IsOptional()
  @IsArray()
  segments?: Record<string, unknown>[];

  @IsOptional()
  @IsString()
  @MaxLength(5)
  separator?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  example?: string;
}

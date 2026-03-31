import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * DTO for creating a naming template
 */
export class CreateNamingTemplateDto {
  @IsUUID()
  @IsNotEmpty()
  ruleId!: string;

  @IsArray()
  segments!: Record<string, unknown>[];

  @IsOptional()
  @IsString()
  @MaxLength(5)
  separator?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  example?: string;
}

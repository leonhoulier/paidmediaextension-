import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

/**
 * DTO for updating a webhook registration
 */
export class UpdateWebhookDto {
  @IsOptional()
  @IsUrl({}, { message: 'url must be a valid URL' })
  url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  secret?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}

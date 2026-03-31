import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * DTO for updating an ad account
 */
export class UpdateAccountDto {
  @IsOptional()
  @IsEnum(['meta', 'google_ads'])
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  platformAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  accountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  market?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  region?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

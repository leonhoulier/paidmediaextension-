import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * DTO for creating an ad account
 */
export class CreateAccountDto {
  @IsEnum(['meta', 'google_ads'])
  platform!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  platformAccountId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  accountName!: string;

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

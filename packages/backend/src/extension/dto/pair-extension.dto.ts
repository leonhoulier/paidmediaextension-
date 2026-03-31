import { IsOptional, IsString, IsEmail } from 'class-validator';

/**
 * DTO for extension pairing request.
 *
 * The extension can pair using one of:
 * - invite_code: a pre-generated invite code (future feature)
 * - email + org_slug: identify the user and organization
 *
 * At least email or invite_code must be provided.
 */
export class PairExtensionDto {
  @IsOptional()
  @IsString()
  invite_code?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  org_slug?: string;
}

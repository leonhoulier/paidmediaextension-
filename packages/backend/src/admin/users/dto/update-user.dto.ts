import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * DTO for updating a user
 */
export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEnum(['super_admin', 'admin', 'viewer', 'buyer'])
  role?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  teamIds?: string[];
}

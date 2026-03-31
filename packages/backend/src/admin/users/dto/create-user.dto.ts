import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * DTO for creating a user
 */
export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsEnum(['super_admin', 'admin', 'viewer', 'buyer'])
  role!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  teamIds?: string[];
}

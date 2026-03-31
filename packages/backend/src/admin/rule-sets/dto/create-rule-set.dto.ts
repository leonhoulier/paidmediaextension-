import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * DTO for creating a rule set
 */
export class CreateRuleSetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  accountIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  teamIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  buyerIds?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

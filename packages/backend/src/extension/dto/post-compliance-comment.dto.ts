import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

/**
 * DTO for submitting a buyer comment on a rule
 */
export class PostComplianceCommentDto {
  @IsUUID()
  @IsNotEmpty()
  ruleId!: string;

  @IsString()
  @IsNotEmpty()
  entityName!: string;

  @IsString()
  @IsNotEmpty()
  comment!: string;
}

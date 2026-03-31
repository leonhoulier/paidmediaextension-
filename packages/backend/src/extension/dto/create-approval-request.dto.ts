import {
  IsNotEmpty,
  IsObject,
  IsUUID,
} from 'class-validator';

/**
 * DTO for creating an approval request from the extension
 */
export class CreateApprovalRequestDto {
  @IsUUID()
  @IsNotEmpty()
  ruleId!: string;

  @IsUUID()
  @IsNotEmpty()
  approverId!: string;

  @IsObject()
  @IsNotEmpty()
  campaignSnapshot!: Record<string, unknown>;
}

import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * DTO for approving or rejecting an approval request
 */
export class UpdateApprovalRequestDto {
  @IsEnum(['approved', 'rejected'])
  @IsNotEmpty()
  status!: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  comment?: string;
}

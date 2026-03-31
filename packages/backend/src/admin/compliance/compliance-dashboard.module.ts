import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ComplianceDashboardController } from './compliance-dashboard.controller';
import { ComplianceDashboardService } from './compliance-dashboard.service';

/**
 * Module for compliance dashboard aggregation API
 */
@Module({
  imports: [AuthModule],
  controllers: [ComplianceDashboardController],
  providers: [ComplianceDashboardService],
})
export class ComplianceDashboardModule {}

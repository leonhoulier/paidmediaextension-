import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { AuthenticatedUser } from '../../auth/auth.types';
import { ComplianceDashboardService } from './compliance-dashboard.service';
import {
  GetComplianceDashboardResponse,
  ComplianceEvent,
} from '@media-buying-governance/shared';
import { GetComplianceEventsDto } from './dto/get-compliance-events.dto';

/**
 * Admin compliance dashboard aggregation API.
 *
 * Returns overall compliance scores, breakdowns by dimension,
 * and daily trend data for charting. All computation happens
 * server-side via PostgreSQL GROUP BY queries.
 */
@Controller('api/v1/admin/compliance')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class ComplianceDashboardController {
  constructor(private readonly service: ComplianceDashboardService) {}

  /**
   * GET /api/v1/admin/compliance/dashboard
   *
   * Query parameters:
   *   - group_by: 'market' | 'team' | 'buyer' | 'account' | 'rule_category'
   *   - start: ISO date string (default: 30 days ago)
   *   - end: ISO date string (default: now)
   */
  @Get('dashboard')
  async getDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('group_by') groupBy?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ): Promise<GetComplianceDashboardResponse> {
    const validGroupBy = ['market', 'team', 'buyer', 'account', 'rule_category'];
    const dimension = validGroupBy.includes(groupBy ?? '')
      ? (groupBy as 'market' | 'team' | 'buyer' | 'account' | 'rule_category')
      : 'account';

    const dateRange = start && end ? { start, end } : undefined;

    return this.service.getDashboard(user.organizationId, dimension, dateRange);
  }

  /**
   * GET /api/v1/admin/compliance/events
   *
   * Returns a paginated list of compliance events with optional filters.
   * All events are scoped to the authenticated user's organization.
   *
   * Query parameters:
   *   - buyerId: Filter by buyer (user) ID
   *   - accountId: Filter by ad account ID
   *   - ruleId: Filter by rule ID
   *   - status: Filter by status (passed/violated/overridden/pending)
   *   - dateFrom: Start date (ISO 8601)
   *   - dateTo: End date (ISO 8601)
   *   - limit: Pagination limit (default 50, max 100)
   *   - offset: Pagination offset (default 0)
   */
  @Get('events')
  async getEvents(
    @Query() filters: GetComplianceEventsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ events: ComplianceEvent[]; total: number }> {
    return this.service.getEvents(user.organizationId, filters);
  }
}

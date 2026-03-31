import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GetComplianceDashboardResponse,
  ComplianceDashboardBreakdown,
  ComplianceDashboardTrend,
  ComplianceEvent,
} from '@media-buying-governance/shared';
import { GetComplianceEventsDto } from './dto/get-compliance-events.dto';
import { toApiComplianceEvent } from '../../transformers/compliance-event.transformer';

/**
 * Valid GROUP BY dimensions for dashboard breakdowns
 */
type GroupByDimension = 'market' | 'team' | 'buyer' | 'account' | 'rule_category';

/**
 * Raw row returned from the PostgreSQL aggregation query
 */
interface AggregationRow {
  dimension: string;
  total_count: bigint;
  passed_count: bigint;
}

/**
 * Raw row returned from the daily trend query
 */
interface TrendRow {
  day: Date;
  total_count: bigint;
  passed_count: bigint;
}

/**
 * Service for the compliance dashboard aggregation API.
 *
 * All computations use PostgreSQL GROUP BY / COUNT / SUM queries
 * to avoid loading events into memory.
 */
@Injectable()
export class ComplianceDashboardService {
  private readonly logger = new Logger(ComplianceDashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build the full compliance dashboard response
   */
  async getDashboard(
    organizationId: string,
    groupBy: GroupByDimension = 'account',
    dateRange?: { start: string; end: string },
  ): Promise<GetComplianceDashboardResponse> {
    const startDate = dateRange?.start
      ? new Date(dateRange.start)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: last 30 days
    const endDate = dateRange?.end ? new Date(dateRange.end) : new Date();

    this.logger.log(
      `Building dashboard for org=${organizationId}, groupBy=${groupBy}, range=${startDate.toISOString()}..${endDate.toISOString()}`,
    );

    // Run all queries in parallel for performance
    const [overallStats, breakdowns, trends] = await Promise.all([
      this.getOverallStats(organizationId, startDate, endDate),
      this.getBreakdowns(organizationId, groupBy, startDate, endDate),
      this.getDailyTrends(organizationId, startDate, endDate),
    ]);

    this.logger.log(
      `Dashboard result: score=${overallStats.score}, breakdowns=${breakdowns.length}, trends=${trends.length}`,
    );

    return {
      overallScore: overallStats.score,
      campaignsCreated: overallStats.totalCount,
      violationsThisWeek: overallStats.violationsThisWeek,
      blockedCreations: overallStats.blockedCount,
      breakdowns,
      trends,
    };
  }

  /**
   * Get overall compliance statistics using PostgreSQL aggregation.
   */
  private async getOverallStats(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    score: number;
    totalCount: number;
    violationsThisWeek: number;
    blockedCount: number;
  }> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Single query with conditional aggregation for all metrics
    const result = await this.prisma.$queryRaw<
      {
        total_count: bigint;
        passed_count: bigint;
        violated_count: bigint;
        violations_this_week: bigint;
      }[]
    >`
      SELECT
        COUNT(*)::bigint AS total_count,
        COUNT(*) FILTER (WHERE status = 'passed')::bigint AS passed_count,
        COUNT(*) FILTER (WHERE status = 'violated')::bigint AS violated_count,
        COUNT(*) FILTER (WHERE status = 'violated' AND created_at >= ${weekAgo})::bigint AS violations_this_week
      FROM compliance_events
      WHERE organization_id = ${organizationId}::uuid
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
    `;

    const row = result[0];
    if (!row) {
      return { score: 100, totalCount: 0, violationsThisWeek: 0, blockedCount: 0 };
    }

    const totalCount = Number(row.total_count);
    const passedCount = Number(row.passed_count);
    const violatedCount = Number(row.violated_count);
    const violationsThisWeek = Number(row.violations_this_week);

    const score = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 100;

    return {
      score,
      totalCount,
      violationsThisWeek,
      blockedCount: violatedCount,
    };
  }

  /**
   * Get breakdowns by the specified dimension using PostgreSQL GROUP BY.
   *
   * Each dimension joins different tables to produce a human-readable label:
   * - market: ad_accounts.market
   * - team: cross-reference via users.team_ids (unnest)
   * - buyer: users.name
   * - account: ad_accounts.account_name
   * - rule_category: rules.rule_type
   */
  private async getBreakdowns(
    organizationId: string,
    groupBy: GroupByDimension,
    startDate: Date,
    endDate: Date,
  ): Promise<ComplianceDashboardBreakdown[]> {
    let rows: AggregationRow[];

    switch (groupBy) {
      case 'market':
        rows = await this.prisma.$queryRaw<AggregationRow[]>`
          SELECT
            COALESCE(a.market, 'Unknown') AS dimension,
            COUNT(*)::bigint AS total_count,
            COUNT(*) FILTER (WHERE ce.status = 'passed')::bigint AS passed_count
          FROM compliance_events ce
          JOIN ad_accounts a ON a.id = ce.ad_account_id
          WHERE ce.organization_id = ${organizationId}::uuid
            AND ce.created_at >= ${startDate}
            AND ce.created_at <= ${endDate}
          GROUP BY a.market
          ORDER BY total_count DESC
        `;
        break;

      case 'buyer':
        rows = await this.prisma.$queryRaw<AggregationRow[]>`
          SELECT
            u.name AS dimension,
            COUNT(*)::bigint AS total_count,
            COUNT(*) FILTER (WHERE ce.status = 'passed')::bigint AS passed_count
          FROM compliance_events ce
          JOIN users u ON u.id = ce.buyer_id
          WHERE ce.organization_id = ${organizationId}::uuid
            AND ce.created_at >= ${startDate}
            AND ce.created_at <= ${endDate}
          GROUP BY u.name
          ORDER BY total_count DESC
        `;
        break;

      case 'account':
        rows = await this.prisma.$queryRaw<AggregationRow[]>`
          SELECT
            a.account_name AS dimension,
            COUNT(*)::bigint AS total_count,
            COUNT(*) FILTER (WHERE ce.status = 'passed')::bigint AS passed_count
          FROM compliance_events ce
          JOIN ad_accounts a ON a.id = ce.ad_account_id
          WHERE ce.organization_id = ${organizationId}::uuid
            AND ce.created_at >= ${startDate}
            AND ce.created_at <= ${endDate}
          GROUP BY a.account_name
          ORDER BY total_count DESC
        `;
        break;

      case 'rule_category':
        rows = await this.prisma.$queryRaw<AggregationRow[]>`
          SELECT
            r.rule_type AS dimension,
            COUNT(*)::bigint AS total_count,
            COUNT(*) FILTER (WHERE ce.status = 'passed')::bigint AS passed_count
          FROM compliance_events ce
          JOIN rules r ON r.id = ce.rule_id
          WHERE ce.organization_id = ${organizationId}::uuid
            AND ce.created_at >= ${startDate}
            AND ce.created_at <= ${endDate}
          GROUP BY r.rule_type
          ORDER BY total_count DESC
        `;
        break;

      case 'team':
        // Teams are stored as an array in users.team_ids.
        // We unnest the array and join to the teams table for the label.
        rows = await this.prisma.$queryRaw<AggregationRow[]>`
          SELECT
            COALESCE(t.name, 'Unassigned') AS dimension,
            COUNT(*)::bigint AS total_count,
            COUNT(*) FILTER (WHERE ce.status = 'passed')::bigint AS passed_count
          FROM compliance_events ce
          JOIN users u ON u.id = ce.buyer_id
          LEFT JOIN LATERAL unnest(u.team_ids) AS tid ON true
          LEFT JOIN teams t ON t.id = tid
          WHERE ce.organization_id = ${organizationId}::uuid
            AND ce.created_at >= ${startDate}
            AND ce.created_at <= ${endDate}
          GROUP BY COALESCE(t.name, 'Unassigned')
          ORDER BY total_count DESC
        `;
        break;

      default:
        rows = [];
    }

    return rows.map((row) => {
      const total = Number(row.total_count);
      const passed = Number(row.passed_count);
      return {
        dimension: row.dimension,
        score: total > 0 ? Math.round((passed / total) * 100) : 100,
        passedCount: passed,
        totalCount: total,
      };
    });
  }

  /**
   * Get daily compliance trend data for charting using PostgreSQL date_trunc.
   */
  private async getDailyTrends(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ComplianceDashboardTrend[]> {
    const rows = await this.prisma.$queryRaw<TrendRow[]>`
      SELECT
        date_trunc('day', created_at)::date AS day,
        COUNT(*)::bigint AS total_count,
        COUNT(*) FILTER (WHERE status = 'passed')::bigint AS passed_count
      FROM compliance_events
      WHERE organization_id = ${organizationId}::uuid
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
      GROUP BY date_trunc('day', created_at)
      ORDER BY day ASC
    `;

    return rows.map((row) => {
      const total = Number(row.total_count);
      const passed = Number(row.passed_count);
      return {
        date: new Date(row.day).toISOString().split('T')[0],
        score: total > 0 ? Math.round((passed / total) * 100) : 100,
      };
    });
  }

  /**
   * Get paginated compliance events with optional filters.
   *
   * Returns individual compliance event records scoped to the organization,
   * sorted by createdAt descending (newest first).
   */
  async getEvents(
    organizationId: string,
    filters: GetComplianceEventsDto,
  ): Promise<{ events: ComplianceEvent[]; total: number }> {
    this.logger.log(
      `Fetching compliance events for org=${organizationId} with filters=${JSON.stringify(filters)}`,
    );

    // Build the where clause with organization scoping and optional filters
    const where: Record<string, unknown> = {
      organizationId,
    };

    if (filters.buyerId) {
      where.buyerId = filters.buyerId;
    }

    if (filters.accountId) {
      where.adAccountId = filters.accountId;
    }

    if (filters.ruleId) {
      where.ruleId = filters.ruleId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    // Handle date range filters
    if (filters.dateFrom || filters.dateTo) {
      const createdAt: Record<string, Date> = {};

      if (filters.dateFrom) {
        createdAt.gte = new Date(filters.dateFrom);
      }

      if (filters.dateTo) {
        createdAt.lte = new Date(filters.dateTo);
      }

      where.createdAt = createdAt;
    }

    // Execute count and findMany queries in parallel for performance
    const [prismaEvents, total] = await Promise.all([
      this.prisma.complianceEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit || 50,
        skip: filters.offset || 0,
      }),
      this.prisma.complianceEvent.count({ where }),
    ]);

    // Transform Prisma entities to API format
    const events = prismaEvents.map(toApiComplianceEvent);

    this.logger.log(
      `Found ${events.length} events (total: ${total}) for org=${organizationId}`,
    );

    return { events, total };
  }
}

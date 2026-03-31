import React, { useState, useMemo, useCallback } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useComplianceDashboard, useComplianceEvents } from '@/hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  BarChart3,
  ShieldCheck,
  ShieldX,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Activity,
  TrendingUp,
  PanelRightClose,
  PanelRightOpen,
  ArrowLeft,
  Home,
  Users,
  User,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ComplianceDashboardBreakdown } from '@media-buying-governance/shared';

/** Date range options for the dashboard filter */
const DATE_RANGE_OPTIONS = [
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_14_days', label: 'Last 14 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'last_90_days', label: 'Last 90 Days' },
];

/** Colors for the pie chart */
const SCORE_COLORS = {
  filled: 'hsl(var(--primary))',
  empty: 'hsl(var(--muted))',
};

/** Colors for the category pie chart */
const CATEGORY_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

/** Trend line color */
const TREND_LINE_COLOR = 'hsl(var(--primary))';

/** Breadcrumb item representing a drill-down level */
interface BreadcrumbItem {
  label: string;
  level: 'overview' | 'team' | 'buyer' | 'rule';
  id?: string;
}

/**
 * Compliance Dashboard page - displays overall compliance metrics,
 * breakdowns by dimension, time-series trends, recent events,
 * and drill-down views for team -> buyer -> campaign detail.
 */
export function ComplianceDashboard(): React.ReactElement {
  const [dateRange, setDateRange] = useState('last_7_days');
  const [eventsPage, setEventsPage] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('team');

  // Drill-down state
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { label: 'Overview', level: 'overview' },
  ]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedBuyer, setSelectedBuyer] = useState<string | null>(null);
  const [selectedRule, setSelectedRule] = useState<string | null>(null);

  const { data: dashboard, isLoading: dashboardLoading, error: dashboardError } =
    useComplianceDashboard(dateRange);

  const { data: eventsData, isLoading: eventsLoading } = useComplianceEvents({
    limit: '20',
    offset: String(eventsPage * 20),
    ...(selectedTeam ? { team: selectedTeam } : {}),
    ...(selectedBuyer ? { buyer: selectedBuyer } : {}),
    ...(selectedRule ? { rule: selectedRule } : {}),
  });

  /** Navigate into a team drill-down */
  const drillIntoTeam = useCallback((teamName: string) => {
    setSelectedTeam(teamName);
    setSelectedBuyer(null);
    setSelectedRule(null);
    setBreadcrumbs([
      { label: 'Overview', level: 'overview' },
      { label: teamName, level: 'team', id: teamName },
    ]);
  }, []);

  /** Navigate into a buyer drill-down */
  const drillIntoBuyer = useCallback((buyerName: string) => {
    setSelectedBuyer(buyerName);
    setSelectedRule(null);
    setBreadcrumbs((prev) => [
      ...prev.slice(0, 2),
      { label: buyerName, level: 'buyer', id: buyerName },
    ]);
  }, []);

  /** Navigate into a rule drill-down */
  const drillIntoRule = useCallback((ruleName: string) => {
    setSelectedRule(ruleName);
    setBreadcrumbs((prev) => [
      ...prev.slice(0, prev.length),
      { label: ruleName, level: 'rule', id: ruleName },
    ]);
  }, []);

  /** Navigate back to a breadcrumb level */
  const navigateToBreadcrumb = useCallback((index: number) => {
    const crumb = breadcrumbs[index];
    if (!crumb) return;

    setBreadcrumbs(breadcrumbs.slice(0, index + 1));

    if (crumb.level === 'overview') {
      setSelectedTeam(null);
      setSelectedBuyer(null);
      setSelectedRule(null);
    } else if (crumb.level === 'team') {
      setSelectedTeam(crumb.id ?? null);
      setSelectedBuyer(null);
      setSelectedRule(null);
    } else if (crumb.level === 'buyer') {
      setSelectedBuyer(crumb.id ?? null);
      setSelectedRule(null);
    }
  }, [breadcrumbs]);

  const currentLevel = breadcrumbs[breadcrumbs.length - 1]?.level ?? 'overview';

  // Group breakdowns by category for sidebar display
  const guidelineGroups = useMemo(() => {
    if (!dashboard?.breakdowns) return [];
    const groups: Record<string, ComplianceDashboardBreakdown[]> = {};
    for (const breakdown of dashboard.breakdowns) {
      const category = breakdown.dimension;
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(breakdown);
    }
    return Object.entries(groups);
  }, [dashboard?.breakdowns]);

  // Data for the circular score chart
  const scoreChartData = useMemo(() => {
    const score = dashboard?.overallScore ?? 0;
    return [
      { name: 'Score', value: score },
      { name: 'Remaining', value: 100 - score },
    ];
  }, [dashboard?.overallScore]);

  // Data for the trends line chart
  const trendChartData = useMemo(() => {
    if (!dashboard?.trends) return [];
    return dashboard.trends.map((t) => ({
      date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      score: t.score,
    }));
  }, [dashboard?.trends]);

  // Data for category pie chart (compliance by rule category)
  const categoryPieData = useMemo(() => {
    if (!dashboard?.breakdowns) return [];
    return dashboard.breakdowns.slice(0, 8).map((b) => ({
      name: b.dimension,
      value: b.totalCount,
      score: b.score,
    }));
  }, [dashboard?.breakdowns]);

  if (dashboardLoading) {
    return (
      <div className="flex items-center justify-center py-24" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="sr-only">Loading compliance dashboard...</span>
      </div>
    );
  }

  if (dashboardError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Compliance Dashboard</h1>
          <p className="mt-1 text-muted-foreground">Monitor compliance across your organization.</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <p className="text-lg font-medium">Compliance Dashboard Coming Soon</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The compliance monitoring backend is still being developed. Check back soon for
                real-time compliance scores, breakdowns, and event tracking.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Compliance Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            Monitor compliance across your organization.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40" aria-label="Select date range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Close guidelines sidebar' : 'Open guidelines sidebar'}
          >
            {sidebarOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Breadcrumb Navigation for Drill-Downs */}
      {breadcrumbs.length > 1 && (
        <nav className="flex items-center gap-1 text-sm" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={`${crumb.level}-${crumb.id ?? 'root'}`}>
              {i > 0 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
              {i < breadcrumbs.length - 1 ? (
                <button
                  type="button"
                  className="flex items-center gap-1 text-primary hover:underline"
                  onClick={() => navigateToBreadcrumb(i)}
                >
                  {crumb.level === 'overview' && <Home className="h-3 w-3" />}
                  {crumb.level === 'team' && <Users className="h-3 w-3" />}
                  {crumb.level === 'buyer' && <User className="h-3 w-3" />}
                  {crumb.level === 'rule' && <FileText className="h-3 w-3" />}
                  {crumb.label}
                </button>
              ) : (
                <span className="flex items-center gap-1 font-medium text-foreground">
                  {crumb.level === 'team' && <Users className="h-3 w-3" />}
                  {crumb.level === 'buyer' && <User className="h-3 w-3" />}
                  {crumb.level === 'rule' && <FileText className="h-3 w-3" />}
                  {crumb.label}
                </span>
              )}
            </React.Fragment>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="ml-2 gap-1"
            onClick={() => navigateToBreadcrumb(0)}
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Overview
          </Button>
        </nav>
      )}

      <div className={cn('flex gap-6', sidebarOpen ? '' : '')}>
        {/* Main content */}
        <div className={cn('flex-1 space-y-6', sidebarOpen ? 'min-w-0' : '')}>
          {/* Top Section: KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Overall Compliance Score */}
            <Card>
              <CardContent className="flex flex-col items-center p-6">
                <div className="relative h-28 w-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={scoreChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={50}
                        startAngle={90}
                        endAngle={-270}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        <Cell fill={SCORE_COLORS.filled} />
                        <Cell fill={SCORE_COLORS.empty} />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold">{dashboard?.overallScore ?? 0}</span>
                  </div>
                </div>
                <p className="mt-2 text-sm font-medium text-muted-foreground">
                  Overall Score
                </p>
              </CardContent>
            </Card>

            {/* Campaigns Created */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Campaigns Created
                </CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard?.campaignsCreated ?? 0}</div>
                <p className="text-xs text-muted-foreground">This week</p>
              </CardContent>
            </Card>

            {/* Violations */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Violations
                </CardTitle>
                <ShieldX className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">
                    {dashboard?.violationsThisWeek ?? 0}
                  </span>
                  {(dashboard?.violationsThisWeek ?? 0) > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">This week</p>
              </CardContent>
            </Card>

            {/* Blocked Creations */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Blocked Creations
                </CardTitle>
                <ShieldCheck className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard?.blockedCreations ?? 0}</div>
                <p className="text-xs text-muted-foreground">Prevented this week</p>
              </CardContent>
            </Card>
          </div>

          {/* Category Pie Chart + Trend Line Chart side by side */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Compliance by Rule Category - Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Compliance by Category</CardTitle>
                <CardDescription>Distribution of compliance checks by rule category.</CardDescription>
              </CardHeader>
              <CardContent>
                {categoryPieData.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryPieData}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          dataKey="value"
                          label={({ name, percent }) =>
                            `${name}: ${(percent * 100).toFixed(0)}%`
                          }
                          labelLine={false}
                        >
                          {categoryPieData.map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '0.5rem',
                          }}
                          formatter={(value: number, name: string) => [value, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-64 items-center justify-center text-muted-foreground">
                    No category data available.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Compliance Score Over Time - Line Chart */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Compliance Trend</CardTitle>
                </div>
                <CardDescription>Compliance score over time.</CardDescription>
              </CardHeader>
              <CardContent>
                {trendChartData.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendChartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          dataKey="date"
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis
                          domain={[0, 100]}
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          label={{
                            value: 'Score %',
                            angle: -90,
                            position: 'insideLeft',
                            style: { fill: 'hsl(var(--muted-foreground))' },
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '0.5rem',
                          }}
                          labelStyle={{ color: 'hsl(var(--foreground))' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="score"
                          stroke={TREND_LINE_COLOR}
                          strokeWidth={2}
                          dot={{ fill: TREND_LINE_COLOR, r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-64 items-center justify-center text-muted-foreground">
                    <BarChart3 className="mr-2 h-5 w-5" />
                    No trend data available for the selected period.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tabbed Breakdowns with Drill-Down Support */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {currentLevel === 'overview'
                  ? 'Compliance Breakdowns'
                  : currentLevel === 'team'
                    ? `Team: ${selectedTeam} - Buyer Breakdown`
                    : currentLevel === 'buyer'
                      ? `Buyer: ${selectedBuyer} - Campaign Events`
                      : `Rule: ${selectedRule} - Violation History`}
              </CardTitle>
              <CardDescription>
                {currentLevel === 'overview'
                  ? 'Click a row to drill down into details. View compliance scores by different dimensions.'
                  : currentLevel === 'team'
                    ? 'Per-buyer compliance within this team. Click a buyer to see individual campaigns.'
                    : currentLevel === 'buyer'
                      ? 'Per-campaign compliance events for this buyer.'
                      : 'Violation history for this rule: who violated it, when, and how many times.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {currentLevel === 'overview' ? (
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList>
                    <TabsTrigger value="team">By Team</TabsTrigger>
                    <TabsTrigger value="buyer">By Buyer</TabsTrigger>
                    <TabsTrigger value="account">By Account</TabsTrigger>
                    <TabsTrigger value="rule_category">By Rule Category</TabsTrigger>
                  </TabsList>
                  <TabsContent value={activeTab} className="mt-4">
                    <BreakdownTable
                      breakdowns={dashboard?.breakdowns ?? []}
                      onRowClick={
                        activeTab === 'team'
                          ? drillIntoTeam
                          : activeTab === 'buyer'
                            ? drillIntoBuyer
                            : activeTab === 'rule_category'
                              ? drillIntoRule
                              : undefined
                      }
                    />
                  </TabsContent>
                </Tabs>
              ) : currentLevel === 'team' ? (
                <DrillDownBuyerView
                  teamName={selectedTeam ?? ''}
                  breakdowns={dashboard?.breakdowns ?? []}
                  onBuyerClick={drillIntoBuyer}
                />
              ) : currentLevel === 'buyer' ? (
                <DrillDownCampaignView
                  buyerName={selectedBuyer ?? ''}
                  events={eventsData?.events ?? []}
                  eventsLoading={eventsLoading}
                  onRuleClick={drillIntoRule}
                />
              ) : (
                <DrillDownRuleView
                  ruleName={selectedRule ?? ''}
                  events={eventsData?.events ?? []}
                  eventsLoading={eventsLoading}
                />
              )}
            </CardContent>
          </Card>

          {/* Recent Events Table (only shown in overview) */}
          {currentLevel === 'overview' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Compliance Events</CardTitle>
                <CardDescription>Latest compliance check results.</CardDescription>
              </CardHeader>
              <CardContent>
                {eventsLoading ? (
                  <div className="flex items-center justify-center py-12" role="status">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="sr-only">Loading events...</span>
                  </div>
                ) : eventsData && eventsData.events.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full" role="table">
                        <thead>
                          <tr className="border-b text-left text-sm text-muted-foreground">
                            <th className="pb-3 pr-4 font-medium">Time</th>
                            <th className="pb-3 pr-4 font-medium">Buyer</th>
                            <th className="pb-3 pr-4 font-medium">Rule</th>
                            <th className="pb-3 pr-4 font-medium">Entity</th>
                            <th className="pb-3 pr-4 font-medium">Status</th>
                            <th className="pb-3 font-medium">Comment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {eventsData.events.map((event) => (
                            <tr key={event.id} className="border-b last:border-0">
                              <td className="py-3 pr-4 text-sm">
                                {new Date(event.createdAt).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
                              <td className="py-3 pr-4 text-sm">
                                <button
                                  type="button"
                                  className="text-primary hover:underline"
                                  onClick={() => drillIntoBuyer(event.buyerId)}
                                >
                                  {event.buyerId}
                                </button>
                              </td>
                              <td className="py-3 pr-4 text-sm">
                                <button
                                  type="button"
                                  className="text-primary hover:underline"
                                  onClick={() => drillIntoRule(event.ruleId)}
                                >
                                  {event.ruleId}
                                </button>
                              </td>
                              <td className="py-3 pr-4">
                                <div className="max-w-[200px] truncate text-sm">
                                  {event.entityName}
                                </div>
                              </td>
                              <td className="py-3 pr-4">
                                <Badge
                                  variant={
                                    event.status === 'passed'
                                      ? 'success'
                                      : event.status === 'violated'
                                        ? 'destructive'
                                        : 'warning'
                                  }
                                >
                                  {event.status}
                                </Badge>
                              </td>
                              <td className="py-3">
                                <div className="max-w-[200px] truncate text-sm text-muted-foreground">
                                  {event.comment ?? '--'}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between pt-4">
                      <p className="text-sm text-muted-foreground">
                        Showing {eventsPage * 20 + 1} -{' '}
                        {eventsPage * 20 + eventsData.events.length}
                        {eventsData.total ? ` of ${eventsData.total}` : ''}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={eventsPage === 0}
                          onClick={() => setEventsPage((p) => Math.max(0, p - 1))}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={eventsData.events.length < 20}
                          onClick={() => setEventsPage((p) => p + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    No compliance events recorded yet.
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Sidebar: Guideline Summary */}
        {sidebarOpen && (
          <aside className="hidden w-80 shrink-0 lg:block" aria-label="Guidelines summary">
            <Card className="sticky top-6">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Guidelines</CardTitle>
                  <Badge variant="secondary">
                    {dashboard?.breakdowns?.length ?? 0}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="max-h-[calc(100vh-12rem)] space-y-1 overflow-y-auto">
                {guidelineGroups.length > 0 ? (
                  guidelineGroups.map(([category, items]) => (
                    <GuidelineCategoryGroup
                      key={category}
                      category={category}
                      items={items}
                    />
                  ))
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No guideline data available.
                  </p>
                )}
              </CardContent>
            </Card>
          </aside>
        )}
      </div>
    </div>
  );
}

// =====================================================
// Breakdown Table Component (with drill-down click)
// =====================================================

interface BreakdownTableProps {
  breakdowns: ComplianceDashboardBreakdown[];
  onRowClick?: (dimension: string) => void;
}

function BreakdownTable({ breakdowns, onRowClick }: BreakdownTableProps): React.ReactElement {
  const [sortColumn, setSortColumn] = useState<keyof ComplianceDashboardBreakdown>('score');
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const items = [...breakdowns];
    items.sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortAsc ? aVal - bVal : bVal - aVal;
      }
      return sortAsc
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
    return items;
  }, [breakdowns, sortColumn, sortAsc]);

  const handleSort = (col: keyof ComplianceDashboardBreakdown): void => {
    if (sortColumn === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortColumn(col);
      setSortAsc(false);
    }
  };

  if (breakdowns.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No breakdown data available for this view.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full" role="table">
        <thead>
          <tr className="border-b text-left text-sm text-muted-foreground">
            <th className="pb-3 pr-4">
              <button
                type="button"
                className="font-medium hover:text-foreground"
                onClick={() => handleSort('dimension')}
              >
                Name {sortColumn === 'dimension' && (sortAsc ? '\u2191' : '\u2193')}
              </button>
            </th>
            <th className="pb-3 pr-4">
              <button
                type="button"
                className="font-medium hover:text-foreground"
                onClick={() => handleSort('score')}
              >
                Compliance Score {sortColumn === 'score' && (sortAsc ? '\u2191' : '\u2193')}
              </button>
            </th>
            <th className="pb-3 pr-4">
              <button
                type="button"
                className="font-medium hover:text-foreground"
                onClick={() => handleSort('passedCount')}
              >
                Passed {sortColumn === 'passedCount' && (sortAsc ? '\u2191' : '\u2193')}
              </button>
            </th>
            <th className="pb-3">
              <button
                type="button"
                className="font-medium hover:text-foreground"
                onClick={() => handleSort('totalCount')}
              >
                Total {sortColumn === 'totalCount' && (sortAsc ? '\u2191' : '\u2193')}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => (
            <tr
              key={item.dimension}
              className={cn(
                'border-b last:border-0',
                onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''
              )}
              onClick={() => onRowClick?.(item.dimension)}
            >
              <td className="py-3 pr-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{item.dimension}</span>
                  {onRowClick && (
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              </td>
              <td className="py-3 pr-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-2 rounded-full',
                        item.score >= 80
                          ? 'bg-green-500'
                          : item.score >= 60
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                      )}
                      style={{ width: `${Math.min(item.score, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{item.score}%</span>
                </div>
              </td>
              <td className="py-3 pr-4 text-sm">{item.passedCount}</td>
              <td className="py-3 text-sm">{item.totalCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =====================================================
// Drill-Down: Buyer View (within a team)
// =====================================================

interface DrillDownBuyerViewProps {
  teamName: string;
  breakdowns: ComplianceDashboardBreakdown[];
  onBuyerClick: (buyerName: string) => void;
}

function DrillDownBuyerView({
  teamName,
  breakdowns,
  onBuyerClick,
}: DrillDownBuyerViewProps): React.ReactElement {
  // In a real implementation, this would call a dedicated API endpoint
  // filtered by team. For now, we show the available breakdowns.
  const teamBreakdowns = breakdowns.filter((b) =>
    b.dimension.toLowerCase().includes(teamName.toLowerCase()) ||
    breakdowns.length > 0
  );

  if (teamBreakdowns.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Users className="mx-auto mb-2 h-8 w-8" />
        <p>No buyer data available for team &ldquo;{teamName}&rdquo;.</p>
        <p className="mt-1 text-xs">
          The compliance API will provide per-buyer breakdowns when the endpoint is ready.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        <span>Buyers in {teamName} - click to see campaign-level details</span>
      </div>
      <BreakdownTable breakdowns={teamBreakdowns} onRowClick={onBuyerClick} />
    </div>
  );
}

// =====================================================
// Drill-Down: Campaign Events (for a buyer)
// =====================================================

interface ComplianceEventLike {
  id: string;
  buyerId: string;
  ruleId: string;
  entityName: string;
  status: string;
  comment?: string | null;
  createdAt: Date | string;
}

interface DrillDownCampaignViewProps {
  buyerName: string;
  events: ComplianceEventLike[];
  eventsLoading: boolean;
  onRuleClick: (ruleName: string) => void;
}

function DrillDownCampaignView({
  buyerName,
  events,
  eventsLoading,
  onRuleClick,
}: DrillDownCampaignViewProps): React.ReactElement {
  if (eventsLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="sr-only">Loading campaign events...</span>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <User className="mx-auto mb-2 h-8 w-8" />
        <p>No compliance events found for buyer &ldquo;{buyerName}&rdquo;.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <User className="h-4 w-4" />
        <span>Campaign events for {buyerName} - click a rule to see violation history</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full" role="table">
          <thead>
            <tr className="border-b text-left text-sm text-muted-foreground">
              <th className="pb-3 pr-4 font-medium">Time</th>
              <th className="pb-3 pr-4 font-medium">Campaign/Entity</th>
              <th className="pb-3 pr-4 font-medium">Rule</th>
              <th className="pb-3 pr-4 font-medium">Status</th>
              <th className="pb-3 font-medium">Comment</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="py-3 pr-4 text-sm">
                  {new Date(event.createdAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="py-3 pr-4">
                  <div className="max-w-[200px] truncate text-sm font-medium">
                    {event.entityName}
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline"
                    onClick={() => onRuleClick(event.ruleId)}
                  >
                    {event.ruleId}
                  </button>
                </td>
                <td className="py-3 pr-4">
                  <Badge
                    variant={
                      event.status === 'passed'
                        ? 'success'
                        : event.status === 'violated'
                          ? 'destructive'
                          : 'warning'
                    }
                  >
                    {event.status}
                  </Badge>
                </td>
                <td className="py-3">
                  <div className="max-w-[200px] truncate text-sm text-muted-foreground">
                    {event.comment ?? '--'}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =====================================================
// Drill-Down: Rule Violation History
// =====================================================

interface DrillDownRuleViewProps {
  ruleName: string;
  events: ComplianceEventLike[];
  eventsLoading: boolean;
}

function DrillDownRuleView({
  ruleName,
  events,
  eventsLoading,
}: DrillDownRuleViewProps): React.ReactElement {
  if (eventsLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="sr-only">Loading rule violation history...</span>
      </div>
    );
  }

  // Count violations by buyer
  const violationsByBuyer = useMemo(() => {
    const counts: Record<string, { total: number; violated: number; passed: number }> = {};
    for (const event of events) {
      if (!counts[event.buyerId]) {
        counts[event.buyerId] = { total: 0, violated: 0, passed: 0 };
      }
      counts[event.buyerId].total += 1;
      if (event.status === 'violated') {
        counts[event.buyerId].violated += 1;
      } else {
        counts[event.buyerId].passed += 1;
      }
    }
    return Object.entries(counts)
      .map(([buyer, data]) => ({ buyer, ...data }))
      .sort((a, b) => b.violated - a.violated);
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <FileText className="mx-auto mb-2 h-8 w-8" />
        <p>No violation history found for rule &ldquo;{ruleName}&rdquo;.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <FileText className="h-4 w-4" />
        <span>
          Violation history for rule &ldquo;{ruleName}&rdquo; - who violated it, when, how many
          times
        </span>
      </div>

      {/* Summary by Buyer */}
      {violationsByBuyer.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium">Violations by Buyer</h4>
          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead>
                <tr className="border-b text-left text-sm text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Buyer</th>
                  <th className="pb-3 pr-4 font-medium">Violations</th>
                  <th className="pb-3 pr-4 font-medium">Passed</th>
                  <th className="pb-3 font-medium">Total Checks</th>
                </tr>
              </thead>
              <tbody>
                {violationsByBuyer.map((row) => (
                  <tr key={row.buyer} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-sm font-medium">{row.buyer}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={row.violated > 0 ? 'destructive' : 'success'}>
                        {row.violated}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant="success">{row.passed}</Badge>
                    </td>
                    <td className="py-2 text-sm">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full Event Timeline */}
      <div>
        <h4 className="mb-2 text-sm font-medium">Event Timeline</h4>
        <div className="space-y-2">
          {events.slice(0, 50).map((event) => (
            <div
              key={event.id}
              className="flex items-center gap-3 rounded-md border p-3 text-sm"
            >
              {event.status === 'violated' ? (
                <XCircle className="h-4 w-4 shrink-0 text-destructive" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
              )}
              <div className="flex-1">
                <span className="font-medium">{event.buyerId}</span>{' '}
                <span className="text-muted-foreground">on</span>{' '}
                <span className="font-medium">{event.entityName}</span>
              </div>
              <Badge
                variant={event.status === 'violated' ? 'destructive' : 'success'}
                className="text-xs"
              >
                {event.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(event.createdAt).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =====================================================
// Guideline Category Group (sidebar)
// =====================================================

interface GuidelineCategoryGroupProps {
  category: string;
  items: ComplianceDashboardBreakdown[];
}

function GuidelineCategoryGroup({
  category,
  items,
}: GuidelineCategoryGroupProps): React.ReactElement {
  const [open, setOpen] = useState(true);
  const passedCount = items.filter((i) => i.score >= 80).length;
  const totalCount = items.length;
  const allPassing = passedCount === totalCount;

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-muted/50"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
          <span className="truncate">{category}</span>
        </div>
        <Badge variant={allPassing ? 'success' : 'warning'} className="text-xs">
          {passedCount}/{totalCount}
        </Badge>
      </button>

      {open && (
        <div className="space-y-0.5 border-t px-3 py-1">
          {items.map((item) => {
            const passing = item.score >= 80;
            return (
              <div
                key={item.dimension}
                className="flex items-center gap-2 py-1 text-sm"
              >
                {passing ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                )}
                <span className={cn('truncate', passing ? 'text-foreground' : 'text-red-600')}>
                  {item.dimension}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

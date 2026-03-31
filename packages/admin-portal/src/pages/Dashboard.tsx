import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRules } from '@/hooks/useApi';
import { useAccounts } from '@/hooks/useApi';
import { useTeams } from '@/hooks/useApi';
import {
  Shield,
  Building2,
  Users,
  BarChart3,
  Plus,
  ArrowRight,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

/**
 * Dashboard page - summary of key metrics and quick links
 */
export function Dashboard(): React.ReactElement {
  const { data: rules, isLoading: rulesLoading, isError: rulesError } = useRules();
  const { data: accounts, isLoading: accountsLoading, isError: accountsError } = useAccounts();
  const { data: teams, isLoading: teamsLoading, isError: teamsError } = useTeams();

  const isLoading = rulesLoading || accountsLoading || teamsLoading;
  const hasError = rulesError || accountsError || teamsError;

  const stats = [
    {
      label: 'Active Rules',
      value: rules?.filter((r) => r.enabled).length ?? 0,
      total: rules?.length ?? 0,
      icon: Shield,
      href: '/rules',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Ad Accounts',
      value: accounts?.filter((a) => a.active).length ?? 0,
      total: accounts?.length ?? 0,
      icon: Building2,
      href: '/accounts',
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'Teams',
      value: teams?.length ?? 0,
      total: teams?.length ?? 0,
      icon: Users,
      href: '/teams',
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      label: 'Compliance',
      value: '--',
      total: null,
      icon: BarChart3,
      href: '/compliance',
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Overview of your media buying governance platform.
        </p>
      </div>

      {/* Error Banner */}
      {hasError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">
              Some data failed to load. The numbers below may be incomplete.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.href} to={stat.href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <div className={`rounded-md p-2 ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    {stat.total !== null && (
                      <p className="text-xs text-muted-foreground">
                        {stat.value} active of {stat.total} total
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-4 text-xl font-semibold">Quick Actions</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-md bg-blue-50 p-3">
                <Plus className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium">Create Rule</h3>
                <p className="text-sm text-muted-foreground">
                  Define a new governance rule
                </p>
              </div>
              <Button asChild variant="ghost" size="icon" aria-label="Create new rule">
                <Link to="/rules/new">
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-md bg-green-50 p-3">
                <Plus className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium">Naming Template</h3>
                <p className="text-sm text-muted-foreground">
                  Create a naming convention
                </p>
              </div>
              <Button asChild variant="ghost" size="icon" aria-label="Create naming template">
                <Link to="/naming-templates/new">
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-md bg-orange-50 p-3">
                <BarChart3 className="h-5 w-5 text-orange-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium">View Compliance</h3>
                <p className="text-sm text-muted-foreground">
                  Check compliance dashboard
                </p>
              </div>
              <Button asChild variant="ghost" size="icon" aria-label="View compliance dashboard">
                <Link to="/compliance">
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useRules, useDeleteRule } from '@/hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Shield, Pencil, Trash2 } from 'lucide-react';
import { EnforcementMode, RuleType, Platform } from '@media-buying-governance/shared';

/** Human-readable labels for rule types */
const ruleTypeLabels: Record<string, string> = {
  [RuleType.NAMING_CONVENTION]: 'Naming Convention',
  [RuleType.BUDGET_ENFORCEMENT]: 'Budget Enforcement',
  [RuleType.TARGETING_CONSTRAINT]: 'Targeting Constraint',
  [RuleType.PLACEMENT_ENFORCEMENT]: 'Placement Enforcement',
  [RuleType.BRAND_SAFETY]: 'Brand Safety',
  [RuleType.TAXONOMY_COMPLIANCE]: 'Taxonomy Compliance',
  [RuleType.BIDDING_STRATEGY]: 'Bidding Strategy',
  [RuleType.SCHEDULE_ENFORCEMENT]: 'Schedule Enforcement',
  [RuleType.TRACKING_VALIDATION]: 'Tracking Validation',
  [RuleType.CREATIVE_VALIDATION]: 'Creative Validation',
  [RuleType.CUSTOM_FIELD]: 'Custom Field',
};

/** Enforcement badge variant mapping */
const enforcementVariants: Record<string, 'destructive' | 'warning' | 'default' | 'secondary'> = {
  [EnforcementMode.BLOCKING]: 'destructive',
  [EnforcementMode.WARNING]: 'warning',
  [EnforcementMode.COMMENT_REQUIRED]: 'default',
  [EnforcementMode.SECOND_APPROVER]: 'secondary',
};

/** Platform labels */
const platformLabels: Record<string, string> = {
  [Platform.META]: 'Meta',
  [Platform.GOOGLE_ADS]: 'Google Ads',
  [Platform.ALL]: 'All',
};

/**
 * Safely format platforms list from a rule's scope.
 * Handles cases where scope or platforms may be null/undefined/non-array.
 */
function formatPlatforms(rule: { scope?: { platforms?: unknown } }): string {
  try {
    const platforms = rule.scope?.platforms;
    if (!Array.isArray(platforms) || platforms.length === 0) {
      return 'All';
    }
    return platforms
      .map((p: string) => platformLabels[p] ?? p)
      .join(', ');
  } catch {
    return 'Unknown';
  }
}

/**
 * Safely format enforcement mode label.
 */
function formatEnforcement(enforcement: string | undefined | null): string {
  if (!enforcement) return 'Unknown';
  return enforcement.replace(/_/g, ' ');
}

/**
 * Rules list page - displays all governance rules
 */
export function Rules(): React.ReactElement {
  const { data: rules, isLoading, error } = useRules();
  const deleteRule = useDeleteRule();

  const handleDelete = async (id: string, name: string): Promise<void> => {
    if (!window.confirm(`Are you sure you want to delete the rule "${name}"?`)) return;
    try {
      await deleteRule.mutateAsync(id);
      toast.success(`Rule "${name}" deleted.`);
    } catch {
      toast.error('Failed to delete rule.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Rules</h1>
          <p className="mt-1 text-muted-foreground">
            Manage governance rules for media buying.
          </p>
        </div>
        <Button asChild className="gap-2" aria-label="Create new rule">
          <Link to="/rules/new">
            <Plus className="h-4 w-4" />
            Create Rule
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="sr-only">Loading rules...</span>
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-destructive">Failed to load rules. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {rules && rules.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Shield className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No rules created yet.</p>
            <Button asChild className="gap-2">
              <Link to="/rules/new">
                <Plus className="h-4 w-4" />
                Create your first rule
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {rules && rules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {rules.length} Rule{rules.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full" role="table">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Name</th>
                    <th className="pb-3 pr-4 font-medium">Type</th>
                    <th className="pb-3 pr-4 font-medium">Platform</th>
                    <th className="pb-3 pr-4 font-medium">Enforcement</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <div>
                          <p className="font-medium">{rule.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {rule.description ?? ''}
                          </p>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline">
                          {ruleTypeLabels[rule.ruleType] ?? rule.ruleType ?? 'Unknown'}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant="secondary" className="text-xs">
                          {formatPlatforms(rule)}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          variant={
                            enforcementVariants[rule.enforcement ?? ''] ?? 'default'
                          }
                        >
                          {formatEnforcement(rule.enforcement)}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={rule.enabled ? 'success' : 'secondary'}>
                          {rule.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="gap-1"
                            aria-label={`Edit rule ${rule.name}`}
                          >
                            <Link to={`/rules/${rule.id}/edit`}>
                              <Pencil className="h-3 w-3" />
                              Edit
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(rule.id, rule.name)}
                            disabled={deleteRule.isPending}
                            aria-label={`Delete rule ${rule.name}`}
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

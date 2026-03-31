import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  History,
  RotateCcw,
  ChevronRight,
  Clock,
  User,
  GitBranch,
  Plus,
  Minus,
  Edit3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** Rule version entry returned by the API */
interface RuleVersion {
  id: string;
  ruleId: string;
  version: number;
  snapshot: Record<string, unknown>;
  changedBy: string;
  changedByEmail?: string;
  changeType: 'created' | 'updated' | 'restored';
  changeSummary?: string;
  createdAt: string;
}

/** Diff item for comparing versions */
interface DiffItem {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  type: 'added' | 'removed' | 'modified';
}

const versionKeys = {
  list: (ruleId: string) => ['rule-versions', ruleId] as const,
};

/** Fetch rule version history */
function useRuleVersions(ruleId: string) {
  return useQuery({
    queryKey: versionKeys.list(ruleId),
    queryFn: async (): Promise<RuleVersion[]> => {
      try {
        const { data } = await apiClient.get<RuleVersion[]>(
          `/admin/rules/${ruleId}/versions`
        );
        return data;
      } catch {
        // API may not exist yet
        return [];
      }
    },
    enabled: !!ruleId,
  });
}

/**
 * Compute a diff between two version snapshots.
 * Compares top-level and nested fields, producing a list of changes.
 */
function computeDiff(
  oldSnap: Record<string, unknown>,
  newSnap: Record<string, unknown>
): DiffItem[] {
  const diffs: DiffItem[] = [];
  const allKeys = new Set([...Object.keys(oldSnap), ...Object.keys(newSnap)]);

  for (const key of allKeys) {
    // Skip metadata fields that always change
    if (key === 'metadata' || key === 'updatedAt') continue;

    const oldVal = oldSnap[key];
    const newVal = newSnap[key];
    const oldStr = JSON.stringify(oldVal);
    const newStr = JSON.stringify(newVal);

    if (oldVal === undefined && newVal !== undefined) {
      diffs.push({ field: key, oldValue: undefined, newValue: newVal, type: 'added' });
    } else if (oldVal !== undefined && newVal === undefined) {
      diffs.push({ field: key, oldValue: oldVal, newValue: undefined, type: 'removed' });
    } else if (oldStr !== newStr) {
      diffs.push({ field: key, oldValue: oldVal, newValue: newVal, type: 'modified' });
    }
  }

  return diffs;
}

/**
 * Format a value for display in the diff viewer.
 */
function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '(empty)';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value, null, 2);
}

interface RuleVersionHistoryProps {
  /** The rule ID to show version history for */
  ruleId: string;
}

/**
 * Rule Version History component - shows a timeline of all versions,
 * a diff viewer between versions, and the ability to restore a previous version.
 */
export function RuleVersionHistory({ ruleId }: RuleVersionHistoryProps): React.ReactElement {
  const qc = useQueryClient();
  const { data: versions, isLoading } = useRuleVersions(ruleId);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState('timeline');

  // Restore mutation
  const restoreVersion = useMutation({
    mutationFn: async (versionNumber: number) => {
      const { data } = await apiClient.post(`/admin/rules/${ruleId}/versions/${versionNumber}/restore`);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: versionKeys.list(ruleId) });
      void qc.invalidateQueries({ queryKey: ['rules', ruleId] });
      toast.success('Rule restored to selected version.');
    },
    onError: () => {
      toast.error('Failed to restore version. The API endpoint may not be available yet.');
    },
  });

  // Compute diff between selected versions
  const diff = useMemo(() => {
    if (!versions || versions.length < 2) return [];
    if (selectedVersion === null || compareVersion === null) return [];

    const oldVer = versions.find((v) => v.version === compareVersion);
    const newVer = versions.find((v) => v.version === selectedVersion);

    if (!oldVer || !newVer) return [];

    return computeDiff(
      oldVer.snapshot as Record<string, unknown>,
      newVer.snapshot as Record<string, unknown>
    );
  }, [versions, selectedVersion, compareVersion]);

  // Auto-select latest two versions for comparison
  const sortedVersions = useMemo(
    () => [...(versions ?? [])].sort((a, b) => b.version - a.version),
    [versions]
  );

  const handleVersionSelect = (version: number): void => {
    if (selectedVersion === version) {
      setSelectedVersion(null);
      setCompareVersion(null);
    } else if (selectedVersion === null) {
      setSelectedVersion(version);
      // Auto-select previous version for comparison
      const prevVersion = sortedVersions.find((v) => v.version < version);
      if (prevVersion) {
        setCompareVersion(prevVersion.version);
      }
    } else {
      setCompareVersion(selectedVersion);
      setSelectedVersion(version);
    }
  };

  const handleRestore = (version: number): void => {
    if (!window.confirm(`Restore rule to version ${version}? This will create a new version with the old configuration.`)) {
      return;
    }
    restoreVersion.mutate(version);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="sr-only">Loading version history...</span>
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <History className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <p className="text-lg font-medium">No Version History</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Version history will be available once the rule versioning API is implemented.
              Each save will create a new version entry.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="timeline" className="gap-1">
            <Clock className="h-3 w-3" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="diff" className="gap-1">
            <GitBranch className="h-3 w-3" />
            Compare Versions
          </TabsTrigger>
        </TabsList>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="mt-4">
          <div className="space-y-0">
            {sortedVersions.map((version, index) => {
              const isLatest = index === 0;
              const isSelected = selectedVersion === version.version;

              return (
                <div
                  key={version.id}
                  className="relative flex gap-4 pb-6"
                >
                  {/* Timeline line */}
                  {index < sortedVersions.length - 1 && (
                    <div className="absolute left-[15px] top-8 h-full w-px bg-border" />
                  )}

                  {/* Timeline dot */}
                  <div
                    className={cn(
                      'relative z-10 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2',
                      isLatest
                        ? 'border-primary bg-primary text-primary-foreground'
                        : isSelected
                          ? 'border-primary bg-primary/10'
                          : 'border-muted-foreground/30 bg-background'
                    )}
                  >
                    <span className="text-xs font-bold">v{version.version}</span>
                  </div>

                  {/* Version content */}
                  <div
                    className={cn(
                      'flex-1 rounded-md border p-4 transition-colors',
                      isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Version {version.version}</span>
                          {isLatest && (
                            <Badge variant="success" className="text-xs">Current</Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {version.changeType}
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {version.changedByEmail ?? version.changedBy}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(version.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {version.changeSummary && (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {version.changeSummary}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => handleVersionSelect(version.version)}
                        >
                          {isSelected ? 'Deselect' : 'Select'}
                        </Button>
                        {!isLatest && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-xs"
                            onClick={() => handleRestore(version.version)}
                            disabled={restoreVersion.isPending}
                          >
                            <RotateCcw className="h-3 w-3" />
                            Restore
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* Diff Tab */}
        <TabsContent value="diff" className="mt-4">
          {selectedVersion !== null && compareVersion !== null ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline">v{compareVersion}</Badge>
                <ChevronRight className="h-4 w-4" />
                <Badge variant="default">v{selectedVersion}</Badge>
                <span className="text-muted-foreground">
                  {diff.length} change{diff.length !== 1 ? 's' : ''} detected
                </span>
              </div>

              {diff.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No differences found between these versions.
                </div>
              ) : (
                <div className="space-y-2">
                  {diff.map((item) => (
                    <div
                      key={item.field}
                      className={cn(
                        'rounded-md border p-3',
                        item.type === 'added'
                          ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
                          : item.type === 'removed'
                            ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
                            : 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {item.type === 'added' ? (
                          <Plus className="h-3 w-3 text-green-600" />
                        ) : item.type === 'removed' ? (
                          <Minus className="h-3 w-3 text-red-600" />
                        ) : (
                          <Edit3 className="h-3 w-3 text-yellow-600" />
                        )}
                        <span className="font-mono text-sm font-medium">{item.field}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            item.type === 'added'
                              ? 'text-green-700'
                              : item.type === 'removed'
                                ? 'text-red-700'
                                : 'text-yellow-700'
                          )}
                        >
                          {item.type}
                        </Badge>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {item.type !== 'added' && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Before</p>
                            <pre className="mt-1 max-h-32 overflow-auto rounded bg-background p-2 text-xs">
                              {formatValue(item.oldValue)}
                            </pre>
                          </div>
                        )}
                        {item.type !== 'removed' && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">After</p>
                            <pre className="mt-1 max-h-32 overflow-auto rounded bg-background p-2 text-xs">
                              {formatValue(item.newValue)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <GitBranch className="mx-auto mb-2 h-8 w-8" />
              <p>Select two versions from the Timeline tab to compare them.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

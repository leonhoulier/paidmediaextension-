import React, { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Webhook,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** Webhook entity returned by the API */
interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Webhook delivery log entry */
interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  url: string;
  statusCode: number | null;
  success: boolean;
  requestBody: string;
  responseBody?: string;
  error?: string;
  attemptedAt: string;
  duration: number;
}

/** Available webhook event types */
const WEBHOOK_EVENTS = [
  { value: 'rule.created', label: 'Rule Created' },
  { value: 'rule.updated', label: 'Rule Updated' },
  { value: 'rule.deleted', label: 'Rule Deleted' },
  { value: 'compliance.violated', label: 'Compliance Violated' },
  { value: 'compliance.blocked', label: 'Compliance Blocked' },
  { value: 'approval.requested', label: 'Approval Requested' },
  { value: 'approval.resolved', label: 'Approval Resolved' },
  { value: 'account.created', label: 'Account Created' },
  { value: 'team.updated', label: 'Team Updated' },
];

// Query keys
const webhookKeys = {
  list: ['webhooks'] as const,
  deliveries: (webhookId?: string) => ['webhooks', 'deliveries', webhookId] as const,
};

/** Fetch all webhooks */
function useWebhooks() {
  return useQuery({
    queryKey: webhookKeys.list,
    queryFn: async (): Promise<WebhookConfig[]> => {
      try {
        const { data } = await apiClient.get<WebhookConfig[]>('/admin/webhooks');
        return data;
      } catch {
        // API endpoint may not exist yet - return empty array
        return [];
      }
    },
  });
}

/** Fetch webhook delivery logs */
function useWebhookDeliveries(webhookId?: string) {
  return useQuery({
    queryKey: webhookKeys.deliveries(webhookId),
    queryFn: async (): Promise<WebhookDelivery[]> => {
      try {
        const params = webhookId ? { webhookId } : {};
        const { data } = await apiClient.get<WebhookDelivery[]>('/admin/webhooks/deliveries', {
          params,
        });
        return data;
      } catch {
        return [];
      }
    },
    enabled: true,
  });
}

/**
 * Webhook Configuration Page - CRUD for webhook URLs,
 * test button, and delivery log viewer.
 */
export function WebhookSettings(): React.ReactElement {
  const qc = useQueryClient();
  const { data: webhooks, isLoading } = useWebhooks();
  const { data: deliveries, isLoading: deliveriesLoading } = useWebhookDeliveries();

  // Form state for creating/editing webhooks
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formUrl, setFormUrl] = useState('');
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [formActive, setFormActive] = useState(true);

  // Create webhook mutation
  const createWebhook = useMutation({
    mutationFn: async (payload: { url: string; events: string[]; active: boolean }) => {
      const { data } = await apiClient.post<WebhookConfig>('/admin/webhooks', payload);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: webhookKeys.list });
      toast.success('Webhook created successfully.');
      resetForm();
    },
    onError: () => {
      toast.error('Failed to create webhook. The API endpoint may not be available yet.');
    },
  });

  // Update webhook mutation
  const updateWebhook = useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string;
      url: string;
      events: string[];
      active: boolean;
    }) => {
      const { data } = await apiClient.put<WebhookConfig>(`/admin/webhooks/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: webhookKeys.list });
      toast.success('Webhook updated successfully.');
      resetForm();
    },
    onError: () => {
      toast.error('Failed to update webhook.');
    },
  });

  // Delete webhook mutation
  const deleteWebhook = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/webhooks/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: webhookKeys.list });
      toast.success('Webhook deleted.');
    },
    onError: () => {
      toast.error('Failed to delete webhook.');
    },
  });

  // Test webhook mutation
  const testWebhook = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post<{ success: boolean; statusCode: number }>(
        `/admin/webhooks/${id}/test`
      );
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Test webhook delivered successfully (HTTP ${data.statusCode}).`);
      } else {
        toast.error(`Test webhook failed (HTTP ${data.statusCode}).`);
      }
      void qc.invalidateQueries({ queryKey: webhookKeys.deliveries() });
    },
    onError: () => {
      toast.error('Failed to send test webhook. The API endpoint may not be available yet.');
    },
  });

  const resetForm = useCallback(() => {
    setEditingId(null);
    setShowForm(false);
    setFormUrl('');
    setFormEvents([]);
    setFormActive(true);
  }, []);

  const startEdit = useCallback((webhook: WebhookConfig) => {
    setEditingId(webhook.id);
    setShowForm(true);
    setFormUrl(webhook.url);
    setFormEvents(webhook.events);
    setFormActive(webhook.active);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!formUrl.trim()) {
        toast.error('Please enter a webhook URL.');
        return;
      }
      if (formEvents.length === 0) {
        toast.error('Please select at least one event.');
        return;
      }

      const payload = { url: formUrl.trim(), events: formEvents, active: formActive };

      if (editingId) {
        updateWebhook.mutate({ id: editingId, ...payload });
      } else {
        createWebhook.mutate(payload);
      }
    },
    [formUrl, formEvents, formActive, editingId, createWebhook, updateWebhook]
  );

  const toggleEvent = useCallback((event: string) => {
    setFormEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  }, []);

  const handleDelete = useCallback(
    (id: string, url: string) => {
      if (!window.confirm(`Delete webhook for "${url}"?`)) return;
      deleteWebhook.mutate(id);
    },
    [deleteWebhook]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Webhooks</h1>
          <p className="mt-1 text-muted-foreground">
            Configure webhook endpoints to receive real-time event notifications.
          </p>
        </div>
        {!showForm && (
          <Button className="gap-2" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Add Webhook
          </Button>
        )}
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {editingId ? 'Edit Webhook' : 'New Webhook'}
            </CardTitle>
            <CardDescription>
              Enter the URL and select which events should trigger a delivery.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="webhook-url">Payload URL</Label>
                <Input
                  id="webhook-url"
                  type="url"
                  placeholder="https://example.com/webhooks/mbg"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Events</Label>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {WEBHOOK_EVENTS.map((evt) => (
                    <label
                      key={evt.value}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors',
                        formEvents.includes(evt.value)
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted/50'
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-muted-foreground"
                        checked={formEvents.includes(evt.value)}
                        onChange={() => toggleEvent(evt.value)}
                      />
                      {evt.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor="webhook-active">Active</Label>
                <input
                  id="webhook-active"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  disabled={createWebhook.isPending || updateWebhook.isPending}
                >
                  {(createWebhook.isPending || updateWebhook.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {editingId ? 'Update Webhook' : 'Create Webhook'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="sr-only">Loading webhooks...</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && webhooks && webhooks.length === 0 && !showForm && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Webhook className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <p className="text-lg font-medium">No Webhooks Configured</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a webhook endpoint to receive real-time notifications about rule changes,
                compliance events, and approvals.
              </p>
            </div>
            <Button className="gap-2" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              Add Your First Webhook
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Webhook List */}
      {webhooks && webhooks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {webhooks.length} Webhook{webhooks.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className="flex items-start justify-between rounded-md border p-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Webhook className="h-4 w-4 text-muted-foreground" />
                    <code className="text-sm font-medium">{webhook.url}</code>
                    <Badge variant={webhook.active ? 'success' : 'secondary'}>
                      {webhook.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {webhook.events.map((evt) => (
                      <Badge key={evt} variant="outline" className="text-xs">
                        {evt}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(webhook.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() =>
                      testWebhook.mutate(webhook.id)
                    }
                    disabled={testWebhook.isPending}
                    aria-label={`Test webhook ${webhook.url}`}
                  >
                    <Send className="h-3 w-3" />
                    Test
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() => startEdit(webhook)}
                    aria-label={`Edit webhook ${webhook.url}`}
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(webhook.id, webhook.url)}
                    disabled={deleteWebhook.isPending}
                    aria-label={`Delete webhook ${webhook.url}`}
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Delivery Log */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Delivery Log</CardTitle>
              <CardDescription>
                Recent webhook delivery attempts and their status.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => void qc.invalidateQueries({ queryKey: webhookKeys.deliveries() })}
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {deliveriesLoading ? (
            <div className="flex items-center justify-center py-8" role="status">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="sr-only">Loading delivery log...</span>
            </div>
          ) : deliveries && deliveries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full" role="table">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Event</th>
                    <th className="pb-3 pr-4 font-medium">URL</th>
                    <th className="pb-3 pr-4 font-medium">HTTP Code</th>
                    <th className="pb-3 pr-4 font-medium">Duration</th>
                    <th className="pb-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((delivery) => (
                    <tr key={delivery.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        {delivery.success ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline" className="text-xs">
                          {delivery.event}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <code className="max-w-[200px] truncate text-xs">
                          {delivery.url}
                        </code>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          variant={
                            delivery.statusCode && delivery.statusCode < 300
                              ? 'success'
                              : 'destructive'
                          }
                          className="text-xs"
                        >
                          {delivery.statusCode ?? 'N/A'}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-sm">
                        {delivery.duration}ms
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {new Date(delivery.attemptedAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <Clock className="mx-auto mb-2 h-8 w-8" />
              <p>No delivery attempts recorded yet.</p>
              <p className="mt-1 text-xs">
                Deliveries will appear here when webhooks are triggered or tested.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

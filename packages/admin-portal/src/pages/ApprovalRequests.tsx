import React, { useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  useApprovalRequests,
  useApproveRequest,
  useRejectRequest,
} from '@/hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';
import type { ApprovalRequest } from '@media-buying-governance/shared';

type TabValue = 'pending' | 'approved' | 'rejected' | 'all';

/**
 * Approval Requests Inbox Page
 * Where approvers can view and respond to approval requests
 */
export function ApprovalRequests(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabValue>('pending');
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [comment, setComment] = useState('');

  // Lazy-load only the active tab's data (prevents unnecessary parallel requests)
  const { data: currentRequests = [], isLoading } = useApprovalRequests(
    activeTab === 'all' ? undefined : activeTab
  );

  // Also fetch pending count for the badge (lightweight, always needed)
  const { data: pendingRequests } = useApprovalRequests('pending');

  const approveRequest = useApproveRequest();
  const rejectRequest = useRejectRequest();

  // Badge count for pending tab
  const pendingCount = pendingRequests?.length || 0;

  /** Open detail dialog for a request */
  const openDetailDialog = useCallback((request: ApprovalRequest) => {
    setSelectedRequest(request);
    setComment('');
    setDetailDialogOpen(true);
  }, []);

  /** Close detail dialog */
  const closeDetailDialog = useCallback(() => {
    setDetailDialogOpen(false);
    setSelectedRequest(null);
    setComment('');
  }, []);

  /** Handle approve action */
  const handleApprove = useCallback(() => {
    if (!selectedRequest) return;

    approveRequest.mutate(
      { id: selectedRequest.id, comment: comment.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Approval request approved');
          closeDetailDialog();
        },
        onError: () => {
          toast.error('Failed to approve request');
        },
      }
    );
  }, [selectedRequest, comment, approveRequest, closeDetailDialog]);

  /** Handle reject action */
  const handleReject = useCallback(() => {
    if (!selectedRequest) return;

    if (!comment.trim()) {
      toast.error('Comment is required for rejection');
      return;
    }

    rejectRequest.mutate(
      { id: selectedRequest.id, comment: comment.trim() },
      {
        onSuccess: () => {
          toast.success('Approval request rejected');
          closeDetailDialog();
        },
        onError: () => {
          toast.error('Failed to reject request');
        },
      }
    );
  }, [selectedRequest, comment, rejectRequest, closeDetailDialog]);

  /** Parse campaign snapshot */
  const parseCampaignSnapshot = useCallback((snapshot: Record<string, unknown>) => {
    return snapshot;
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Approval Requests</h1>
        <p className="mt-1 text-muted-foreground">
          Review and respond to pending approval requests.
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            Pending
            {pendingCount > 0 && (
              <Badge variant="destructive" className="ml-1">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {activeTab === 'pending'
                  ? 'Pending Requests'
                  : activeTab === 'approved'
                    ? 'Approved Requests'
                    : activeTab === 'rejected'
                      ? 'Rejected Requests'
                      : 'All Requests'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12" role="status">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="sr-only">Loading requests...</span>
                </div>
              ) : currentRequests.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No {activeTab} requests found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full" role="table">
                    <thead>
                      <tr className="border-b text-left text-sm text-muted-foreground">
                        <th className="pb-3 pr-4 font-medium">Timestamp</th>
                        <th className="pb-3 pr-4 font-medium">Requester</th>
                        <th className="pb-3 pr-4 font-medium">Account</th>
                        <th className="pb-3 pr-4 font-medium">Rule</th>
                        <th className="pb-3 pr-4 font-medium">Campaign</th>
                        <th className="pb-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentRequests.map((request) => {
                        const snapshot = parseCampaignSnapshot(request.entitySnapshot);
                        const campaignName =
                          (snapshot.name as string) ||
                          (snapshot.campaignName as string) ||
                          'Unknown Campaign';

                        return (
                          <tr
                            key={request.id}
                            className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                            onClick={() => openDetailDialog(request)}
                          >
                            <td className="py-3 pr-4 text-sm">
                              {new Date(request.requestedAt).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="py-3 pr-4 text-sm">{request.buyerId}</td>
                            <td className="py-3 pr-4 text-sm">{request.organizationId}</td>
                            <td className="py-3 pr-4 text-sm">{request.ruleId}</td>
                            <td className="py-3 pr-4">
                              <div className="max-w-[200px] truncate text-sm">
                                {campaignName}
                              </div>
                            </td>
                            <td className="py-3">
                              <Badge
                                variant={
                                  request.status === 'approved'
                                    ? 'success'
                                    : request.status === 'rejected'
                                      ? 'destructive'
                                      : 'warning'
                                }
                              >
                                {request.status === 'pending' && <Clock className="mr-1 h-3 w-3" />}
                                {request.status === 'approved' && (
                                  <CheckCircle className="mr-1 h-3 w-3" />
                                )}
                                {request.status === 'rejected' && (
                                  <XCircle className="mr-1 h-3 w-3" />
                                )}
                                {request.status}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Approval Request Details</DialogTitle>
            <DialogDescription>
              {selectedRequest?.status === 'pending'
                ? 'Review the request and approve or reject it.'
                : 'View details of this approval request.'}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4 py-4">
              {/* Requester Info */}
              <div className="grid gap-2">
                <Label className="font-semibold">Requester</Label>
                <p className="text-sm text-muted-foreground">{selectedRequest.buyerId}</p>
              </div>

              {/* Rule */}
              <div className="grid gap-2">
                <Label className="font-semibold">Rule Violated</Label>
                <p className="text-sm text-muted-foreground">{selectedRequest.ruleId}</p>
              </div>

              {/* Campaign Snapshot */}
              <div className="grid gap-2">
                <Label className="font-semibold">Campaign Details</Label>
                <div className="rounded-md border bg-muted/50 p-3">
                  <pre className="max-h-64 overflow-auto text-xs">
                    {JSON.stringify(selectedRequest.entitySnapshot, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Requested At */}
              <div className="grid gap-2">
                <Label className="font-semibold">Requested At</Label>
                <p className="text-sm text-muted-foreground">
                  {new Date(selectedRequest.requestedAt).toLocaleString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>

              {/* If resolved, show resolution details */}
              {selectedRequest.status !== 'pending' && (
                <>
                  <div className="grid gap-2">
                    <Label className="font-semibold">Status</Label>
                    <Badge
                      variant={
                        selectedRequest.status === 'approved' ? 'success' : 'destructive'
                      }
                      className="w-fit"
                    >
                      {selectedRequest.status === 'approved' && (
                        <CheckCircle className="mr-1 h-3 w-3" />
                      )}
                      {selectedRequest.status === 'rejected' && (
                        <XCircle className="mr-1 h-3 w-3" />
                      )}
                      {selectedRequest.status}
                    </Badge>
                  </div>

                  {selectedRequest.resolvedAt && (
                    <div className="grid gap-2">
                      <Label className="font-semibold">Resolved At</Label>
                      <p className="text-sm text-muted-foreground">
                        {new Date(selectedRequest.resolvedAt).toLocaleString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  )}

                  {selectedRequest.comment && (
                    <div className="grid gap-2">
                      <Label className="font-semibold">Comment</Label>
                      <p className="text-sm text-muted-foreground">{selectedRequest.comment}</p>
                    </div>
                  )}
                </>
              )}

              {/* If pending, show action fields */}
              {selectedRequest.status === 'pending' && (
                <div className="grid gap-2">
                  <Label htmlFor="comment">
                    Comment {selectedRequest.status === 'pending' && '(required for rejection)'}
                  </Label>
                  <Textarea
                    id="comment"
                    placeholder="Add a comment explaining your decision..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={4}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {selectedRequest?.status === 'pending' ? (
              <>
                <Button
                  variant="outline"
                  onClick={closeDetailDialog}
                  disabled={approveRequest.isPending || rejectRequest.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={approveRequest.isPending || rejectRequest.isPending}
                >
                  {rejectRequest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {rejectRequest.isPending ? 'Rejecting...' : 'Reject'}
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={approveRequest.isPending || rejectRequest.isPending}
                >
                  {approveRequest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {approveRequest.isPending ? 'Approving...' : 'Approve'}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={closeDetailDialog}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

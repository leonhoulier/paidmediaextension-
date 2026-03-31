/**
 * API Client for Extension
 *
 * Provides methods for making authenticated API requests from the extension
 * to the backend. Uses the extension token stored in chrome.storage.local.
 *
 * @module api/client
 */

import type {
  PostApprovalRequestRequest,
  PostApprovalRequestResponse,
} from '@media-buying-governance/shared';
import { ApprovalStatus } from '@media-buying-governance/shared';
import { logger } from '../utils/logger.js';

/** Default API base URL */
const DEFAULT_API_BASE = 'http://localhost:3000';

/**
 * Get the API base URL from storage or use default
 */
async function getApiBase(): Promise<string> {
  try {
    const result = await chrome.storage.local.get('apiBaseUrl');
    return (result.apiBaseUrl as string) || DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

/**
 * Get the extension token from chrome.storage.local
 *
 * @returns The extension token or null if not set
 */
async function getExtensionToken(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get('extensionToken');
    return (result.extensionToken as string) || null;
  } catch {
    logger.error('Failed to read extension token from storage');
    return null;
  }
}

/**
 * Make an authenticated API request with token in header
 *
 * @param path - API path (e.g., '/api/v1/extension/approval/request')
 * @param options - Fetch options (method, body, etc.)
 * @returns Parsed JSON response
 */
export async function fetchWithToken<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token = await getExtensionToken();
  if (!token) {
    throw new Error('No extension token found. Please pair the extension first.');
  }

  const apiBase = await getApiBase();
  const url = new URL(path, apiBase);

  const response = await fetch(url.toString(), {
    ...options,
    headers: {
      'X-Extension-Token': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `API request failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  // Handle empty responses (e.g., DELETE requests)
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/**
 * Create an approval request
 *
 * POST /api/v1/extension/approval/request
 *
 * @param data - Request data (ruleId, approverId, campaignSnapshot)
 * @returns Response with request ID, status, and approver info
 */
export async function createApprovalRequest(data: {
  ruleId: string;
  approverId: string;
  campaignSnapshot: Record<string, unknown>;
}): Promise<{ id: string; status: string; approverName: string; approverEmail?: string }> {
  const requestBody: PostApprovalRequestRequest = {
    ruleId: data.ruleId,
    entitySnapshot: data.campaignSnapshot,
  };

  const response = await fetchWithToken<PostApprovalRequestResponse>(
    '/api/v1/extension/approval/request',
    {
      method: 'POST',
      body: JSON.stringify(requestBody),
    }
  );

  // Backend returns requestId, fetch additional info about approver
  // For now, we'll need to get approver name from the rule or make an additional API call
  // Simplified: return basic info
  return {
    id: response.requestId,
    status: 'pending',
    approverName: 'Approver', // TODO: Get from rule or separate API call
    approverEmail: undefined,
  };
}

/**
 * Get approval request status (for polling)
 *
 * GET /api/v1/extension/approval/requests/:id
 *
 * @param id - Approval request ID
 * @returns Current status of the approval request
 */
export async function getApprovalRequestStatus(id: string): Promise<{
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  comment?: string;
}> {
  const response = await fetchWithToken<{
    id: string;
    status: ApprovalStatus;
    comment?: string;
  }>(`/api/v1/extension/approval/requests/${id}`);

  return {
    id: response.id,
    status: response.status as 'pending' | 'approved' | 'rejected',
    comment: response.comment,
  };
}

/**
 * Cancel an approval request
 *
 * DELETE /api/v1/extension/approval/requests/:id
 *
 * @param id - Approval request ID
 */
export async function cancelApprovalRequest(id: string): Promise<void> {
  await fetchWithToken<void>(`/api/v1/extension/approval/requests/${id}`, {
    method: 'DELETE',
  });
}

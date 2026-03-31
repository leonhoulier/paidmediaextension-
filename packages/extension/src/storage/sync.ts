/**
 * Rule Sync Module
 *
 * Handles fetching rules from the backend API and synchronizing
 * the local IndexedDB cache. Uses the extension token stored in
 * chrome.storage.local for authentication.
 */

import type {
  GetRulesResponse,
  GetRulesVersionResponse,
} from '@media-buying-governance/shared';
import { logger } from '../utils/logger.js';
import {
  getRules,
  setRules,
  invalidateCache,
  getCachedVersion,
} from './rule-cache.js';

/** Backend API base URL. Configured during extension pairing. */
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
 * The token is set during the pairing/login flow when the buyer
 * first activates the extension.
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
 * Make an authenticated API request
 *
 * @param path - API path (e.g., '/api/v1/rules')
 * @param params - URL search params
 * @returns Parsed JSON response
 */
async function apiRequest<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const token = await getExtensionToken();
  if (!token) {
    throw new Error('No extension token found. Please pair the extension first.');
  }

  const apiBase = await getApiBase();
  const url = new URL(path, apiBase);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-Extension-Token': token,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}`
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Fetch rules from the backend API for a specific account
 *
 * @param accountId - The ad account ID
 * @returns Rules response including rules, naming templates, and version
 */
export async function fetchRulesFromAPI(
  accountId: string
): Promise<GetRulesResponse> {
  logger.info(`Fetching rules from API for account ${accountId}`);

  const data = await apiRequest<GetRulesResponse>('/api/v1/rules', {
    account_id: accountId,
  });

  logger.info(
    `Fetched ${data.rules.length} rules, ${data.namingTemplates.length} templates (version: ${data.version})`
  );

  return data;
}

/**
 * Check if the rules version has changed on the backend
 *
 * @param accountId - The ad account ID
 * @returns Object indicating whether an update is needed
 */
export async function checkRulesVersion(
  accountId: string
): Promise<{ needsUpdate: boolean; remoteVersion: string }> {
  const remoteData = await apiRequest<GetRulesVersionResponse>(
    '/api/v1/rules/version',
    { account_id: accountId }
  );

  const cachedVersion = await getCachedVersion(accountId);
  const needsUpdate = cachedVersion !== remoteData.version;

  if (needsUpdate) {
    logger.info(
      `Rules version changed for account ${accountId}: ${cachedVersion} -> ${remoteData.version}`
    );
  }

  return { needsUpdate, remoteVersion: remoteData.version };
}

/**
 * Full sync flow: check version, fetch if changed, update cache
 *
 * This is the primary entry point for rule synchronization.
 * Called by the service worker on alarm and on demand.
 *
 * @param accountId - The ad account ID to sync
 * @returns The synced rules data, or cached data if no update needed
 */
export async function syncRules(
  accountId: string
): Promise<GetRulesResponse | null> {
  try {
    // First check if we have a valid cache
    const cached = await getRules(accountId);
    if (cached) {
      // Check if version changed
      try {
        const { needsUpdate } = await checkRulesVersion(accountId);
        if (!needsUpdate) {
          logger.debug(`Rules up to date for account ${accountId}`);
          return cached;
        }
      } catch (err) {
        // If version check fails (e.g., offline), use cache
        logger.warn('Version check failed, using cached rules:', err);
        return cached;
      }
    }

    // Fetch fresh rules
    const freshData = await fetchRulesFromAPI(accountId);

    // Update cache
    await setRules(accountId, {
      rules: freshData.rules,
      namingTemplates: freshData.namingTemplates,
      version: freshData.version,
    });

    return freshData;
  } catch (err) {
    logger.error(`Failed to sync rules for account ${accountId}:`, err);

    // Fall back to expired cache if available
    const staleCache = await getRules(accountId);
    if (staleCache) {
      logger.warn('Using stale cached rules as fallback');
      return staleCache;
    }

    return null;
  }
}

/**
 * Force refresh: invalidate cache and re-fetch rules
 *
 * Called when the user clicks "Force Refresh" in the popup.
 *
 * @param accountId - The ad account ID to refresh
 */
export async function forceRefresh(
  accountId: string
): Promise<GetRulesResponse | null> {
  logger.info(`Force refreshing rules for account ${accountId}`);
  await invalidateCache(accountId);
  return syncRules(accountId);
}

/**
 * Store extension token during pairing
 *
 * @param token - The extension token received during login
 */
export async function setExtensionToken(token: string): Promise<void> {
  await chrome.storage.local.set({ extensionToken: token });
  logger.info('Extension token stored');
}

/**
 * Store organization info during pairing
 *
 * @param orgName - Organization name
 * @param orgId - Organization ID
 */
export async function setOrganizationInfo(
  orgName: string,
  orgId: string
): Promise<void> {
  await chrome.storage.local.set({ orgName, orgId });
  logger.info(`Organization set: ${orgName} (${orgId})`);
}

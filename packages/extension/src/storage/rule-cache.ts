/**
 * Rule Cache - IndexedDB storage for cached rules
 *
 * Stores rules fetched from the backend API in IndexedDB with a TTL of 5 minutes.
 * This provides offline-capable rule evaluation and reduces API calls.
 *
 * IndexedDB Schema:
 * - Store: "rules"
 * - Key: accountId (string)
 * - Value: { rules, namingTemplates, version, lastFetched }
 */

import type { Rule, NamingTemplate } from '@media-buying-governance/shared';
import { logger } from '../utils/logger.js';

const DB_NAME = 'governance-rules';
const DB_VERSION = 1;
const STORE_NAME = 'rules';

/** Time-to-live for cached rules: 5 minutes */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Shape of cached rule data stored in IndexedDB
 */
export interface CachedRulesData {
  accountId: string;
  rules: Rule[];
  namingTemplates: NamingTemplate[];
  version: string;
  lastFetched: number;
}

/**
 * Open the IndexedDB database, creating the object store if needed
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'accountId' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      logger.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Get cached rules for a specific ad account
 *
 * Returns null if the cache is expired or missing.
 *
 * @param accountId - The ad account ID to look up
 * @returns Cached rules data or null if not found/expired
 */
export async function getRules(
  accountId: string
): Promise<Omit<CachedRulesData, 'accountId' | 'lastFetched'> | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(accountId);

      request.onsuccess = () => {
        const data = request.result as CachedRulesData | undefined;
        if (!data) {
          resolve(null);
          return;
        }

        // Check TTL
        const age = Date.now() - data.lastFetched;
        if (age > CACHE_TTL_MS) {
          logger.debug(`Cache expired for account ${accountId} (age: ${age}ms)`);
          resolve(null);
          return;
        }

        resolve({
          rules: data.rules,
          namingTemplates: data.namingTemplates,
          version: data.version,
        });
      };

      request.onerror = () => {
        logger.error('Failed to read from cache:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    logger.error('Error accessing rule cache:', err);
    return null;
  }
}

/**
 * Store rules in the cache for a specific ad account
 *
 * @param accountId - The ad account ID
 * @param data - The rules data to cache
 */
export async function setRules(
  accountId: string,
  data: { rules: Rule[]; namingTemplates: NamingTemplate[]; version: string }
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const cached: CachedRulesData = {
        accountId,
        rules: data.rules,
        namingTemplates: data.namingTemplates,
        version: data.version,
        lastFetched: Date.now(),
      };

      const request = store.put(cached);

      request.onsuccess = () => {
        logger.debug(`Cached ${data.rules.length} rules for account ${accountId}`);
        resolve();
      };

      request.onerror = () => {
        logger.error('Failed to write to cache:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    logger.error('Error writing rule cache:', err);
  }
}

/**
 * Invalidate cached rules for a specific ad account
 *
 * @param accountId - The ad account ID to invalidate
 */
export async function invalidateCache(accountId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(accountId);

      request.onsuccess = () => {
        logger.debug(`Cache invalidated for account ${accountId}`);
        resolve();
      };

      request.onerror = () => {
        logger.error('Failed to invalidate cache:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    logger.error('Error invalidating rule cache:', err);
  }
}

/**
 * Invalidate all cached rules
 */
export async function invalidateAllCaches(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        logger.debug('All rule caches invalidated');
        resolve();
      };

      request.onerror = () => {
        logger.error('Failed to clear cache:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    logger.error('Error clearing rule cache:', err);
  }
}

/**
 * Get the cached version string for an account (without checking TTL)
 *
 * @param accountId - The ad account ID
 * @returns The cached version string or null
 */
export async function getCachedVersion(accountId: string): Promise<string | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(accountId);

      request.onsuccess = () => {
        const data = request.result as CachedRulesData | undefined;
        resolve(data?.version ?? null);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch {
    return null;
  }
}

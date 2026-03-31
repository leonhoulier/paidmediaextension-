/**
 * Remote Eval Batcher
 *
 * Collects multiple field evaluation queries and batches them into a single
 * postMessage round-trip to the MAIN world eval bridge. This is critical
 * for performance when a campaign form has dozens of fields.
 *
 * Usage:
 *   const batcher = new RemoteEvalBatcher();
 *   const results = await batcher.query([
 *     { field: 'campaign.name', method: 'elementValue', selector: 'input[aria-label*="Campaign name"]' },
 *     { field: 'campaign.budget', method: 'elementValue', selector: '.budget-input' },
 *   ]);
 *   // results = { 'campaign.name': 'My Campaign', 'campaign.budget': '5000' }
 */

import type { RemoteEvalQuery, RemoteEvalResult } from '@media-buying-governance/shared';
import { logger } from '../utils/logger.js';

/** Timeout for waiting for eval results (ms) */
const QUERY_TIMEOUT_MS = 5000;

/** Counter for generating unique query IDs */
let queryCounter = 0;

/**
 * A single field query to be batched
 */
export interface FieldQuery {
  /** Field path identifier (e.g., 'campaign.name') */
  field: string;
  /** Getter method to use in the eval bridge */
  method: 'elementText' | 'elementValue' | 'elementAttribute' | 'FindReact' | 'FindContexts' | 'elementExists' | 'elementTextAll' | 'elementChecked' | 'elementStyle' | 'selectedOptionText';
  /** CSS selector for the target element */
  selector?: string;
  /** Attribute name (for elementAttribute/elementStyle) */
  attribute?: string;
}

/**
 * Result of a batched query
 */
export interface BatchQueryResult {
  /** Field values keyed by field path */
  results: Record<string, unknown>;
  /** Errors keyed by field path */
  errors: Record<string, string>;
}

/**
 * Remote Eval Batcher
 *
 * Manages communication with the MAIN world eval bridge via postMessage.
 * Supports concurrent batched queries with independent timeouts.
 */
export class RemoteEvalBatcher {
  /** Pending promises waiting for eval results */
  private pending = new Map<
    string,
    {
      resolve: (result: BatchQueryResult) => void;
      reject: (error: Error) => void;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  >();

  /** Whether the message listener is attached */
  private listening = false;

  constructor() {
    this.attachListener();
  }

  /**
   * Send a batch of field queries to the eval bridge and wait for results
   *
   * @param queries - Array of field queries to evaluate
   * @returns Promise that resolves with field values and errors
   */
  async query(queries: FieldQuery[]): Promise<BatchQueryResult> {
    if (queries.length === 0) {
      return { results: {}, errors: {} };
    }

    const queryId = this.generateQueryId();

    return new Promise<BatchQueryResult>((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pending.delete(queryId);
        const fieldNames = queries.map((q) => q.field).join(', ');
        logger.warn(`Eval query timed out after ${QUERY_TIMEOUT_MS}ms for fields: ${fieldNames}`);
        // Resolve with empty results instead of rejecting (graceful degradation)
        resolve({ results: {}, errors: { _timeout: `Query timed out after ${QUERY_TIMEOUT_MS}ms` } });
      }, QUERY_TIMEOUT_MS);

      // Store the pending promise
      this.pending.set(queryId, { resolve, reject, timeoutId });

      // Send the query to the MAIN world
      const message: RemoteEvalQuery = {
        type: 'evalQuery.governance',
        queryId,
        getters: queries.map((q) => ({
          field: q.field,
          method: q.method as RemoteEvalQuery['getters'][0]['method'],
          selector: q.selector,
          attribute: q.attribute,
        })),
      };

      window.postMessage(message, '*');
      logger.debug(`Sent eval query ${queryId} with ${queries.length} getters`);
    });
  }

  /**
   * Convenience method: query a single field
   */
  async queryOne(fieldQuery: FieldQuery): Promise<unknown> {
    const result = await this.query([fieldQuery]);
    return result.results[fieldQuery.field] ?? null;
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    if (this.listening) {
      window.removeEventListener('message', this.handleMessage);
      this.listening = false;
    }

    // Reject all pending queries
    for (const [queryId, entry] of this.pending) {
      clearTimeout(entry.timeoutId);
      entry.reject(new Error('Batcher destroyed'));
      this.pending.delete(queryId);
    }
  }

  /**
   * Attach the message listener for eval results
   */
  private attachListener(): void {
    if (this.listening) return;
    window.addEventListener('message', this.handleMessage);
    this.listening = true;
  }

  /**
   * Handle incoming eval results from the MAIN world
   */
  private handleMessage = (event: MessageEvent): void => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== 'evalResult.governance') return;

    const { queryId, results, errors } = event.data as RemoteEvalResult;

    const entry = this.pending.get(queryId);
    if (!entry) {
      logger.debug(`Received eval result for unknown query: ${queryId}`);
      return;
    }

    // Clear timeout and resolve
    clearTimeout(entry.timeoutId);
    this.pending.delete(queryId);

    logger.debug(
      `Eval result received for query ${queryId}: ${Object.keys(results).length} results, ${Object.keys(errors).length} errors`
    );

    entry.resolve({ results, errors });
  };

  /**
   * Generate a unique query ID
   */
  private generateQueryId(): string {
    queryCounter++;
    return `gov_${Date.now()}_${queryCounter}`;
  }
}

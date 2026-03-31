/**
 * Platform Adapter Factory
 *
 * Re-exports the PlatformAdapter interface from @media-buying-governance/shared
 * and provides a factory function for creating platform-specific adapter instances.
 *
 * The factory uses dynamic imports to load only the adapter needed for the
 * current platform, keeping the initial bundle size small.
 *
 * **For Meta and Google Adapter teammates:**
 * Your adapter must implement the PlatformAdapter interface from
 * @media-buying-governance/shared. See the stub files in meta/ and google/
 * directories for the skeleton to fill in.
 */

import {
  Platform,
  type PlatformAdapter,
  type ExtensionContext,
  type InjectionPoint,
} from '@media-buying-governance/shared';
import { logger } from '../utils/logger.js';

// Re-export shared types for convenience
export type { PlatformAdapter, ExtensionContext, InjectionPoint };
export { Platform };

/**
 * Runtime type guard to verify an object implements the PlatformAdapter interface
 *
 * @param adapter - The object to check
 * @returns true if the object has all required PlatformAdapter methods
 */
export function isValidAdapter(adapter: unknown): adapter is PlatformAdapter {
  if (!adapter || typeof adapter !== 'object') return false;

  const obj = adapter as Record<string, unknown>;

  return (
    typeof obj.platform === 'string' &&
    typeof obj.detectContext === 'function' &&
    typeof obj.extractFieldValues === 'function' &&
    typeof obj.getInjectionPoint === 'function' &&
    typeof obj.interceptCreation === 'function' &&
    typeof obj.observeFieldChanges === 'function' &&
    typeof obj.cleanup === 'function'
  );
}

/**
 * Create a platform adapter for the detected platform
 *
 * Uses dynamic imports to load only the needed adapter code.
 * This keeps the initial injector.js bundle small and loads
 * platform-specific code on demand.
 *
 * @param platform - The detected platform
 * @returns A PlatformAdapter instance for the platform
 * @throws Error if the platform is unknown or adapter fails to load
 */
export async function createPlatformAdapter(
  platform: Platform
): Promise<PlatformAdapter> {
  logger.info(`Loading adapter for platform: ${platform}`);

  let adapter: PlatformAdapter;

  switch (platform) {
    case Platform.META: {
      const { MetaAdapter } = await import('./meta/meta-adapter.js');
      adapter = new MetaAdapter();
      break;
    }

    case Platform.GOOGLE_ADS: {
      const { GoogleAdsAdapter } = await import('./google/google-adapter.js');
      adapter = new GoogleAdsAdapter();
      break;
    }

    default:
      throw new Error(`Unknown platform: ${platform}`);
  }

  if (!isValidAdapter(adapter)) {
    throw new Error(`Invalid adapter implementation for platform: ${platform}`);
  }

  logger.info(`Adapter loaded for ${platform}`);
  return adapter;
}

/**
 * React hook for evaluating feature flags in the admin portal.
 *
 * Uses Split.io under the hood with a 30-second cache TTL.
 * Re-evaluates the flag on each render (cache prevents excessive SDK calls).
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const showNewDashboard = useFeatureFlag('enable-new-dashboard');
 *   return showNewDashboard ? <NewDashboard /> : <OldDashboard />;
 * }
 * ```
 */

import { useState, useEffect } from 'react';
import { getFlag, isEnabled } from '@/instrumentation/feature-flags';

/**
 * Hook that returns the treatment string for a feature flag.
 *
 * @param flagName - The feature flag name
 * @returns The flag treatment string (e.g., 'on', 'off', 'control')
 */
export function useFeatureFlag(flagName: string): string {
  const [treatment, setTreatment] = useState<string>(() => getFlag(flagName));

  useEffect(() => {
    // Re-evaluate every 30 seconds to pick up changes
    const interval = setInterval(() => {
      const newTreatment = getFlag(flagName);
      setTreatment(newTreatment);
    }, 30_000);

    // Also evaluate immediately in case the SDK just became ready
    const newTreatment = getFlag(flagName);
    setTreatment(newTreatment);

    return () => clearInterval(interval);
  }, [flagName]);

  return treatment;
}

/**
 * Hook that returns a boolean for whether a feature flag is enabled.
 *
 * Convenience wrapper around useFeatureFlag that checks for treatment === 'on'.
 *
 * @param flagName - The feature flag name
 * @returns true if the flag treatment is 'on'
 */
export function useFeatureFlagEnabled(flagName: string): boolean {
  const treatment = useFeatureFlag(flagName);
  return treatment === 'on';
}

export { isEnabled };

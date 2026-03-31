/**
 * Debounce utility for rate-limiting function calls
 *
 * Used primarily for debouncing compliance event reporting
 * (max 1 event per second per field) and DOM observation callbacks.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Creates a debounced version of the provided function.
 * The function will only be invoked after `delayMs` milliseconds
 * have elapsed since the last call.
 *
 * @param fn - The function to debounce
 * @param delayMs - Delay in milliseconds (default: 1000ms)
 * @returns A debounced version of the function with a cancel method
 */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delayMs = 1000
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: any[]) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, delayMs);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}

/**
 * Creates a throttled version of the provided function.
 * The function will be invoked at most once every `intervalMs` milliseconds.
 *
 * @param fn - The function to throttle
 * @param intervalMs - Minimum interval between calls in milliseconds
 * @returns A throttled version of the function
 */
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  intervalMs: number
): T & { cancel: () => void } {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const throttled = ((...args: any[]) => {
    const now = Date.now();
    const elapsed = now - lastCall;

    if (elapsed >= intervalMs) {
      lastCall = now;
      fn(...args);
    } else if (timeoutId === null) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        fn(...args);
      }, intervalMs - elapsed);
    }
  }) as T & { cancel: () => void };

  throttled.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return throttled;
}

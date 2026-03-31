import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFeatureFlag, useFeatureFlagEnabled } from '../useFeatureFlag';

/* Mock the feature-flags instrumentation module */
vi.mock('@/instrumentation/feature-flags', () => ({
  getFlag: vi.fn(),
  isEnabled: vi.fn(),
}));

import { getFlag, isEnabled } from '@/instrumentation/feature-flags';

const mockedGetFlag = vi.mocked(getFlag);
const mockedIsEnabled = vi.mocked(isEnabled);

describe('useFeatureFlag', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedGetFlag.mockReturnValue('control');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns the initial flag value', () => {
    mockedGetFlag.mockReturnValue('on');
    const { result } = renderHook(() => useFeatureFlag('my-flag'));
    expect(result.current).toBe('on');
  });

  it('returns "control" when SDK is not ready', () => {
    mockedGetFlag.mockReturnValue('control');
    const { result } = renderHook(() => useFeatureFlag('my-flag'));
    expect(result.current).toBe('control');
  });

  it('calls getFlag with the correct flag name', () => {
    renderHook(() => useFeatureFlag('enable-dashboard'));
    expect(mockedGetFlag).toHaveBeenCalledWith('enable-dashboard');
  });

  it('re-evaluates the flag every 30 seconds', () => {
    mockedGetFlag.mockReturnValue('off');
    const { result } = renderHook(() => useFeatureFlag('my-flag'));
    expect(result.current).toBe('off');

    // Change the mock return value
    mockedGetFlag.mockReturnValue('on');

    // Advance by 30 seconds
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current).toBe('on');
  });

  it('cleans up the interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const { unmount } = renderHook(() => useFeatureFlag('my-flag'));
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('re-evaluates when flagName changes', () => {
    mockedGetFlag.mockImplementation((name) => (name === 'flag-a' ? 'on' : 'off'));

    const { result, rerender } = renderHook(
      ({ name }: { name: string }) => useFeatureFlag(name),
      { initialProps: { name: 'flag-a' } }
    );

    expect(result.current).toBe('on');

    rerender({ name: 'flag-b' });
    expect(result.current).toBe('off');
  });
});

describe('useFeatureFlagEnabled', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedGetFlag.mockReturnValue('control');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns true when treatment is "on"', () => {
    mockedGetFlag.mockReturnValue('on');
    const { result } = renderHook(() => useFeatureFlagEnabled('my-flag'));
    expect(result.current).toBe(true);
  });

  it('returns false when treatment is "off"', () => {
    mockedGetFlag.mockReturnValue('off');
    const { result } = renderHook(() => useFeatureFlagEnabled('my-flag'));
    expect(result.current).toBe(false);
  });

  it('returns false when treatment is "control"', () => {
    mockedGetFlag.mockReturnValue('control');
    const { result } = renderHook(() => useFeatureFlagEnabled('my-flag'));
    expect(result.current).toBe(false);
  });
});

describe('isEnabled (re-exported)', () => {
  it('is re-exported from the hook module', async () => {
    const hookModule = await import('../useFeatureFlag');
    expect(hookModule.isEnabled).toBe(mockedIsEnabled);
  });
});

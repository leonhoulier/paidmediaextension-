import { describe, it, expect } from 'vitest';
import { cn } from '../utils';

describe('cn (class name merger)', () => {
  it('merges simple class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes via clsx', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });

  it('returns empty string for no arguments', () => {
    expect(cn()).toBe('');
  });

  it('handles undefined and null inputs', () => {
    expect(cn('base', undefined, null)).toBe('base');
  });

  it('merges conflicting Tailwind classes (last wins)', () => {
    const result = cn('px-4', 'px-6');
    expect(result).toBe('px-6');
  });

  it('merges conflicting Tailwind colour classes', () => {
    const result = cn('text-red-500', 'text-blue-500');
    expect(result).toBe('text-blue-500');
  });

  it('handles array inputs', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c');
  });

  it('handles object inputs from clsx', () => {
    expect(cn({ hidden: true, block: false })).toBe('hidden');
  });

  it('deduplicates identical classes', () => {
    const result = cn('mt-4', 'mt-4');
    expect(result).toBe('mt-4');
  });

  it('preserves non-conflicting classes', () => {
    const result = cn('px-4 py-2', 'mt-4');
    expect(result).toBe('px-4 py-2 mt-4');
  });
});

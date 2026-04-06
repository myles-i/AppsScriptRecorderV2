import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  formatRelativeDate,
  formatElapsedTime,
  formatDateFull,
} from '../../../src/utils/format';

describe('formatDuration', () => {
  it('formats seconds under a minute', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('formats whole minutes', () => {
    expect(formatDuration(60)).toBe('1:00');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2:05');
  });

  it('formats hours correctly', () => {
    expect(formatDuration(3665)).toBe('1:01:05');
  });

  it('formats zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('pads seconds to two digits', () => {
    expect(formatDuration(65)).toBe('1:05');
  });
});

describe('formatElapsedTime', () => {
  it('formats elapsed seconds under a minute', () => {
    expect(formatElapsedTime(42)).toBe('0:42');
  });

  it('formats elapsed time with hours', () => {
    expect(formatElapsedTime(3723)).toBe('1:02:03');
  });
});

describe('formatRelativeDate', () => {
  it('returns a non-empty string for a valid ISO date', () => {
    const result = formatRelativeDate('2026-04-05T10:30:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatDateFull', () => {
  it('returns a human-readable date string', () => {
    const result = formatDateFull('2026-04-05T10:30:00Z');
    // Should contain year or month name
    expect(result).toMatch(/2026|April|Apr/);
  });
});

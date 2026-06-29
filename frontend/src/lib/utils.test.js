import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatDate, today, startOfWeek, relativeTime, initials, contrastColor } from './utils.js';

describe('formatDate', () => {
  it('returns the LOCAL yyyy-MM-dd (not UTC)', () => {
    // TZ is pinned to America/Chicago in vitest.config.js. A late-evening local
    // time is the NEXT day in UTC — a toISOString()-based impl would return
    // 2026-06-29 here. The correct local impl returns 2026-06-28.
    const d = new Date(2026, 5, 28, 23, 30, 0); // local: 28 Jun 2026 23:30
    expect(formatDate(d)).toBe('2026-06-28');
  });

  it('zero-pads month and day', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('today', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is the local date of "now"', () => {
    vi.setSystemTime(new Date(2026, 2, 9, 8, 0, 0));
    expect(today()).toBe('2026-03-09');
  });
});

describe('startOfWeek', () => {
  it('returns the Sunday of the given date’s week', () => {
    // 2026-06-30 is a Tuesday; its week starts Sunday 2026-06-28.
    expect(startOfWeek(new Date(2026, 5, 30))).toBe('2026-06-28');
  });

  it('returns the same day when given a Sunday', () => {
    expect(startOfWeek(new Date(2026, 5, 28))).toBe('2026-06-28');
  });
});

describe('relativeTime', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('formats minutes/hours/days and "just now"', () => {
    const now = new Date(2026, 5, 28, 12, 0, 0);
    vi.setSystemTime(now);
    const ago = (ms) => new Date(now.getTime() - ms).toISOString();
    expect(relativeTime(ago(30 * 1000))).toBe('just now');
    expect(relativeTime(ago(5 * 60_000))).toBe('5m ago');
    expect(relativeTime(ago(3 * 3_600_000))).toBe('3h ago');
    expect(relativeTime(ago(2 * 86_400_000))).toBe('2d ago');
  });

  it('returns empty string for falsy input', () => {
    expect(relativeTime('')).toBe('');
    expect(relativeTime(null)).toBe('');
  });
});

describe('initials', () => {
  it('takes up to two uppercase initials', () => {
    expect(initials('Sam Smith')).toBe('SS');
    expect(initials('sam')).toBe('S');
    expect(initials('Mary Jane Watson')).toBe('MJ');
    expect(initials('')).toBe('');
  });
});

describe('contrastColor', () => {
  it('returns black on light backgrounds and white on dark', () => {
    expect(contrastColor('#ffffff')).toBe('#000000');
    expect(contrastColor('#000000')).toBe('#ffffff');
    expect(contrastColor('#16a34a')).toBe('#ffffff'); // mid-dark green
  });

  it('falls back to white for non-hex (named) colors — known limitation', () => {
    // People `color` values in the sheet are sometimes named (e.g. "purple").
    // contrastColor expects hex, so it yields white. Documented, not a bug here.
    expect(contrastColor('purple')).toBe('#ffffff');
  });
});

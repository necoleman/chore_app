import { describe, it, expect } from 'vitest';
import { loadBackend } from './harness.js';

describe('date helpers', () => {
  it('daysInMonth / firstOfMonth / daysBetween', () => {
    const { ctx } = loadBackend();
    expect(ctx.daysInMonth(new Date(2026, 1, 10))).toBe(28); // Feb 2026
    expect(ctx.daysInMonth(new Date(2026, 0, 10))).toBe(31); // Jan
    expect(ctx.formatDate(ctx.firstOfMonth(new Date(2026, 5, 28)))).toBe('2026-06-01');
    expect(ctx.daysBetween(new Date(2026, 5, 28), new Date(2026, 5, 21))).toBe(7);
  });
});

describe('effectiveLeadDays (#23)', () => {
  const { ctx } = loadBackend();
  it('per-frequency defaults, interval clamp, and explicit override', () => {
    expect(ctx.effectiveLeadDays({ frequency: 'daily' })).toBe(1);
    expect(ctx.effectiveLeadDays({ frequency: 'once' })).toBe(1);
    expect(ctx.effectiveLeadDays({ frequency: 'weekly' })).toBe(4);
    expect(ctx.effectiveLeadDays({ frequency: 'custom' })).toBe(4);
    expect(ctx.effectiveLeadDays({ frequency: 'monthly' })).toBe(7);
    expect(ctx.effectiveLeadDays({ frequency: 'interval', interval_days: '3' })).toBe(3);
    expect(ctx.effectiveLeadDays({ frequency: 'interval', interval_days: '30' })).toBe(7); // clamp
    expect(ctx.effectiveLeadDays({ frequency: 'weekly', lead_days: 2 })).toBe(2); // override
    expect(ctx.effectiveLeadDays({ frequency: 'monthly', lead_days: '' })).toBe(7); // blank → default
  });
  it('appearOffsetDays is lead − 1', () => {
    expect(ctx.appearOffsetDays({ frequency: 'weekly' })).toBe(3);
    expect(ctx.appearOffsetDays({ frequency: 'daily' })).toBe(0);
  });
});

describe('isScheduledDueDay (calendar predicate)', () => {
  const { ctx } = loadBackend();
  it('matches weekly/custom/monthly/nth-weekday', () => {
    const sunday = new Date(2026, 5, 28);
    const tuesday = new Date(2026, 5, 30);
    expect(ctx.isScheduledDueDay({ frequency: 'daily' }, sunday)).toBe(true);
    expect(ctx.isScheduledDueDay({ frequency: 'weekly', custom_days: '0' }, sunday)).toBe(true);
    expect(ctx.isScheduledDueDay({ frequency: 'weekly', custom_days: '2' }, sunday)).toBe(false);
    expect(ctx.isScheduledDueDay({ frequency: 'custom', custom_days: 'tuesday' }, tuesday)).toBe(true);
    expect(ctx.isScheduledDueDay({ frequency: 'monthly', monthly_day: '30' }, tuesday)).toBe(true);
    // First Friday of June 2026 is the 5th.
    expect(ctx.isScheduledDueDay({ frequency: 'monthly', monthly_week: 1, monthly_weekday: 5 }, new Date(2026, 5, 5))).toBe(true);
  });
});

describe('nextDueForChore (#21/#23 anchor)', () => {
  const { ctx } = loadBackend();
  const nd = (chore, date) => ctx.formatDate(ctx.nextDueForChore(chore, date));
  const TODAY = new Date(2026, 5, 28); // Sunday 2026-06-28

  it('daily: today when fresh, day after last_generated otherwise', () => {
    expect(nd({ frequency: 'daily' }, TODAY)).toBe('2026-06-28');
    expect(nd({ frequency: 'daily', last_generated_date: '2026-06-28' }, TODAY)).toBe('2026-06-29');
  });
  it('weekly: next matching weekday strictly after the last occurrence', () => {
    expect(nd({ frequency: 'weekly', custom_days: '3' }, TODAY)).toBe('2026-07-01'); // next Wed
    expect(nd({ frequency: 'weekly', custom_days: '0', last_generated_date: '2026-06-28' }, TODAY)).toBe('2026-07-05'); // next Sun
  });
  it('interval: last_generated + N, or now when fresh', () => {
    expect(nd({ frequency: 'interval', interval_days: '7' }, TODAY)).toBe('2026-06-28');
    expect(nd({ frequency: 'interval', interval_days: '7', last_generated_date: '2026-06-28' }, TODAY)).toBe('2026-07-05');
  });
  it('once: the once_date, or null once generated', () => {
    expect(nd({ frequency: 'once', once_date: '2026-07-04' }, TODAY)).toBe('2026-07-04');
    expect(ctx.nextDueForChore({ frequency: 'once', once_date: '2026-07-04', last_generated_date: '2026-07-04' }, TODAY)).toBe(null);
  });
  it('start_date defers the first occurrence', () => {
    expect(nd({ frequency: 'daily', start_date: '2026-07-01' }, TODAY)).toBe('2026-07-01');
    expect(nd({ frequency: 'weekly', custom_days: '2', start_date: '2026-08-01' }, TODAY)).toBe('2026-08-04');
  });
});

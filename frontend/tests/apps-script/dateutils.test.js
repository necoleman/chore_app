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
  it('defaults to 1 for every frequency when unset', () => {
    ['daily', 'once', 'weekly', 'custom', 'monthly'].forEach((frequency) => {
      expect(ctx.effectiveLeadDays({ frequency })).toBe(1);
    });
    expect(ctx.effectiveLeadDays({ frequency: 'interval', interval_days: '3' })).toBe(1);
  });
  it('honours an explicit value within range', () => {
    expect(ctx.effectiveLeadDays({ frequency: 'weekly', lead_days: 4 })).toBe(4);
    expect(ctx.effectiveLeadDays({ frequency: 'monthly', lead_days: 7 })).toBe(7);
    expect(ctx.effectiveLeadDays({ frequency: 'interval', interval_days: '10', lead_days: 6 })).toBe(6);
  });
  it('clamps to ≥1 and < the recurrence interval', () => {
    expect(ctx.effectiveLeadDays({ frequency: 'weekly', lead_days: 9 })).toBe(6);   // < 7
    expect(ctx.effectiveLeadDays({ frequency: 'monthly', lead_days: 40 })).toBe(27); // < 28
    expect(ctx.effectiveLeadDays({ frequency: 'interval', interval_days: '3', lead_days: 5 })).toBe(2); // < 3
    expect(ctx.effectiveLeadDays({ frequency: 'interval', interval_days: '3', lead_days: 3 })).toBe(2); // strictly <
    expect(ctx.effectiveLeadDays({ frequency: 'daily', lead_days: 5 })).toBe(1);     // daily always 1
    expect(ctx.effectiveLeadDays({ frequency: 'weekly', lead_days: 0 })).toBe(1);    // > 0
  });
  it('appearOffsetDays is lead − 1', () => {
    expect(ctx.appearOffsetDays({ frequency: 'weekly' })).toBe(0);              // default lead 1
    expect(ctx.appearOffsetDays({ frequency: 'weekly', lead_days: 4 })).toBe(3);
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

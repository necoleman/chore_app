import { describe, it, expect } from 'vitest';
import { scheduledOn, nextDueDate, nextDueLabel, daysUntilDue } from './dueDates.js';
import { formatDate } from './utils.js';

const TODAY = '2026-06-28'; // a Sunday (TZ pinned to America/Chicago in vitest config)

function nd(chore) { return formatDate(nextDueDate(chore, TODAY)); }

describe('nextDueDate', () => {
  it('weekly → next matching weekday', () => {
    // Tuesday = 2; from Sunday 2026-06-28 the next Tuesday is 2026-06-30.
    expect(nd({ frequency: 'weekly', custom_days: '2' })).toBe('2026-06-30');
    // Sunday = 0 → today.
    expect(nd({ frequency: 'weekly', custom_days: '0' })).toBe('2026-06-28');
  });

  it('custom → next listed day', () => {
    expect(nd({ frequency: 'custom', custom_days: 'monday,wednesday' })).toBe('2026-06-29');
  });

  it('monthly → next occurrence of the day (this month or next)', () => {
    expect(nd({ frequency: 'monthly', monthly_day: '30' })).toBe('2026-06-30');
    expect(nd({ frequency: 'monthly', monthly_day: '5' })).toBe('2026-07-05'); // already past in June
  });

  it('interval → from last_generated_date; overdue collapses to today', () => {
    expect(nd({ frequency: 'interval', interval_days: '7', last_generated_date: '2026-06-25' })).toBe('2026-07-02');
    expect(nd({ frequency: 'interval', interval_days: '7', last_generated_date: '2026-06-01' })).toBe('2026-06-28'); // overdue → today
    expect(nd({ frequency: 'interval', interval_days: '7' })).toBe('2026-06-28'); // never run → now
  });

  it('once → once_date, or null once generated', () => {
    expect(nd({ frequency: 'once', once_date: '2026-07-04' })).toBe('2026-07-04');
    expect(nextDueDate({ frequency: 'once', once_date: '2026-07-04', last_generated_date: '2026-07-04' }, TODAY)).toBe(null);
  });

  it('start_date defers the first occurrence', () => {
    // Daily but not starting until July 1.
    expect(nd({ frequency: 'daily', start_date: '2026-07-01' })).toBe('2026-07-01');
    // Weekly Tuesday, but start_date in August → first Tuesday on/after Aug 1 (2026-08-04).
    expect(nd({ frequency: 'weekly', custom_days: '2', start_date: '2026-08-01' })).toBe('2026-08-04');
  });
});

describe('scheduledOn', () => {
  it('monthly clamps to the last day of short months', () => {
    expect(scheduledOn({ frequency: 'monthly', monthly_day: '31' }, new Date(2026, 1, 28))).toBe(true); // Feb 28
  });
});

describe('nextDueLabel', () => {
  it('daily shows nothing', () => {
    expect(nextDueLabel({ frequency: 'daily' }, TODAY)).toBe('');
  });
  it('weekly shows Today or a weekday name', () => {
    expect(nextDueLabel({ frequency: 'weekly', custom_days: '0' }, TODAY)).toBe('Today');
    expect(nextDueLabel({ frequency: 'weekly', custom_days: '2' }, TODAY)).toBe('Tuesday');
  });
  it('monthly far out shows a short date', () => {
    expect(nextDueLabel({ frequency: 'monthly', monthly_day: '5' }, TODAY)).toBe('Jul 5');
  });
});

describe('daysUntilDue (countdown sort)', () => {
  it('daily=0, today=0, future=N, none=Infinity', () => {
    expect(daysUntilDue({ frequency: 'daily' }, TODAY)).toBe(0);
    expect(daysUntilDue({ frequency: 'weekly', custom_days: '0' }, TODAY)).toBe(0);
    expect(daysUntilDue({ frequency: 'weekly', custom_days: '2' }, TODAY)).toBe(2);
    expect(daysUntilDue({ frequency: 'once', once_date: '2026-07-04', last_generated_date: '2026-07-04' }, TODAY)).toBe(Infinity);
  });
});

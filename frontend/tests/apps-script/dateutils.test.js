import { describe, it, expect } from 'vitest';
import { loadBackend } from './harness.js';

// isDueToday(chore, today) — `today` is a JS Date.
function due(chore, date) {
  const { ctx } = loadBackend();
  return ctx.isDueToday(chore, date);
}

describe('isDueToday', () => {
  it('daily is always due', () => {
    expect(due({ frequency: 'daily' }, new Date(2026, 5, 28))).toBe(true);
  });

  it('weekly matches the configured weekday (0=Sun)', () => {
    const sunday = new Date(2026, 5, 28); // Sunday
    expect(due({ frequency: 'weekly', custom_days: '0' }, sunday)).toBe(true);
    expect(due({ frequency: 'weekly', custom_days: '3' }, sunday)).toBe(false);
  });

  it('custom matches comma-separated day names', () => {
    const tuesday = new Date(2026, 5, 30);
    expect(due({ frequency: 'custom', custom_days: 'monday,tuesday' }, tuesday)).toBe(true);
    expect(due({ frequency: 'custom', custom_days: 'monday,friday' }, tuesday)).toBe(false);
  });

  it('monthly: exact day, month-length clamp, and catch-up', () => {
    expect(due({ frequency: 'monthly', monthly_day: '15' }, new Date(2026, 5, 15))).toBe(true);
    // Feb 2026 has 28 days; monthly_day 31 clamps to the 28th.
    expect(due({ frequency: 'monthly', monthly_day: '31' }, new Date(2026, 1, 28))).toBe(true);
    // Catch-up: missed this month, now past the due day, last gen before this month.
    expect(
      due({ frequency: 'monthly', monthly_day: '5', last_generated_date: '2026-05-05' }, new Date(2026, 5, 20))
    ).toBe(true);
    expect(due({ frequency: 'monthly', monthly_day: '15' }, new Date(2026, 5, 14))).toBe(false);
  });

  it('monthly nth-weekday: matches the nth occurrence, plus catch-up', () => {
    // June 2026 Fridays: 5, 12, 19, 26 (June 1 is a Monday).
    const firstFriday = { frequency: 'monthly', monthly_week: 1, monthly_weekday: 5 };
    expect(due(firstFriday, new Date(2026, 5, 5))).toBe(true);   // 1st Friday
    expect(due(firstFriday, new Date(2026, 5, 12))).toBe(false); // 2nd Friday
    const secondFriday = { frequency: 'monthly', monthly_week: 2, monthly_weekday: 5 };
    expect(due(secondFriday, new Date(2026, 5, 12))).toBe(true);
    // Catch-up: missed this month's 2nd Friday, now past it, last gen before this month.
    expect(
      due({ ...secondFriday, last_generated_date: '2026-05-08' }, new Date(2026, 5, 20))
    ).toBe(true);
  });

  it('interval: never-generated due now; elapsed vs not', () => {
    expect(due({ frequency: 'interval', interval_days: '7' }, new Date(2026, 5, 28))).toBe(true);
    expect(
      due({ frequency: 'interval', interval_days: '7', last_generated_date: '2026-06-21' }, new Date(2026, 5, 28))
    ).toBe(true); // exactly 7 days
    expect(
      due({ frequency: 'interval', interval_days: '7', last_generated_date: '2026-06-25' }, new Date(2026, 5, 28))
    ).toBe(false); // only 3 days
  });

  it('once: due on/after once_date, never again once generated', () => {
    expect(due({ frequency: 'once', once_date: '2026-06-28' }, new Date(2026, 5, 28))).toBe(true);
    expect(due({ frequency: 'once', once_date: '2026-06-30' }, new Date(2026, 5, 28))).toBe(false); // future
    expect(due({ frequency: 'once', once_date: '2026-06-20' }, new Date(2026, 5, 28))).toBe(true); // catch-up
    expect(
      due({ frequency: 'once', once_date: '2026-06-20', last_generated_date: '2026-06-20' }, new Date(2026, 5, 28))
    ).toBe(false); // already generated
    expect(due({ frequency: 'once' }, new Date(2026, 5, 28))).toBe(false); // no date
  });

  it('unknown frequency is not due', () => {
    expect(due({ frequency: 'weird' }, new Date(2026, 5, 28))).toBe(false);
  });

  it('start_date defers generation: not due before it, due on/after', () => {
    const chore = { frequency: 'daily', start_date: '2026-07-01' };
    expect(due(chore, new Date(2026, 5, 28))).toBe(false); // before start
    expect(due(chore, new Date(2026, 6, 1))).toBe(true); // on start
    expect(due(chore, new Date(2026, 6, 5))).toBe(true); // after start
  });
});

describe('date helpers', () => {
  it('daysInMonth / firstOfMonth / daysBetween', () => {
    const { ctx } = loadBackend();
    expect(ctx.daysInMonth(new Date(2026, 1, 10))).toBe(28); // Feb 2026
    expect(ctx.daysInMonth(new Date(2026, 0, 10))).toBe(31); // Jan
    expect(ctx.formatDate(ctx.firstOfMonth(new Date(2026, 5, 28)))).toBe('2026-06-01');
    expect(ctx.daysBetween(new Date(2026, 5, 28), new Date(2026, 5, 21))).toBe(7);
  });
});

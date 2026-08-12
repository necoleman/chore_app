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

describe('completedOnLocalDate (#31/#32)', () => {
  const { ctx } = loadBackend();
  // 09:00Z / 23:00Z land on an unambiguous calendar day across realistic host
  // timezones (the harness formatDate uses host-local, mirroring script-tz in prod).
  it('matches a timestamp completed on the given day', () => {
    expect(ctx.completedOnLocalDate('2026-06-28T09:00:00Z', '2026-06-28')).toBe(true);
  });
  it('rejects a timestamp from a different day (including legacy UTC values)', () => {
    expect(ctx.completedOnLocalDate('2026-06-27T09:00:00Z', '2026-06-28')).toBe(false);
    expect(ctx.completedOnLocalDate('2026-06-29T09:00:00Z', '2026-06-28')).toBe(false);
  });
  it('is compared as an instant, so a local-offset timestamp resolves correctly', () => {
    // 09:00 at -05:00 == 14:00Z, still 2026-06-28 in any realistic host tz.
    expect(ctx.completedOnLocalDate('2026-06-28T09:00:00-05:00', '2026-06-28')).toBe(true);
  });
  it('empty or invalid → false', () => {
    expect(ctx.completedOnLocalDate('', '2026-06-28')).toBe(false);
    expect(ctx.completedOnLocalDate(null, '2026-06-28')).toBe(false);
    expect(ctx.completedOnLocalDate('not-a-date', '2026-06-28')).toBe(false);
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

describe('nextDueForChore never schedules into the past', () => {
  const { ctx } = loadBackend();
  const nd = (chore, date) => ctx.formatDate(ctx.nextDueForChore(chore, date));
  const TODAY = new Date(2026, 7, 10); // Monday 2026-08-10

  // `last_generated_date` freezes while a chore is inactive and lags after a
  // missed nightly run. The occurrence "after" a stale cursor is itself in the
  // past, and used to be written straight into due_date — born overdue.
  it('daily: a months-stale cursor resolves to today, not cursor+1', () => {
    expect(nd({ frequency: 'daily', last_generated_date: '2026-02-01' }, TODAY)).toBe('2026-08-10');
  });

  it('weekly: skips to the next scheduled weekday on/after today', () => {
    // Sundays. Cursor stranded in June → next Sunday from today, not 2026-06-07.
    expect(nd({ frequency: 'weekly', custom_days: '0', last_generated_date: '2026-06-01' }, TODAY))
      .toBe('2026-08-16');
  });

  it('custom: honours the weekday set rather than snapping to today', () => {
    // Mon/Wed/Fri — today IS a Monday, so today itself qualifies.
    expect(nd({ frequency: 'custom', custom_days: 'monday,wednesday,friday',
                last_generated_date: '2026-05-15' }, TODAY)).toBe('2026-08-10');
    // Tue/Thu — the next qualifying day after today.
    expect(nd({ frequency: 'custom', custom_days: 'tuesday,thursday',
                last_generated_date: '2026-05-15' }, TODAY)).toBe('2026-08-11');
  });

  it('monthly: lands on the next occurrence of the day-of-month', () => {
    expect(nd({ frequency: 'monthly', monthly_day: '15', last_generated_date: '2026-03-15' }, TODAY))
      .toBe('2026-08-15');
  });

  it('interval: rolls forward by whole intervals, preserving cadence phase', () => {
    // 2026-06-01 + 7n — the first such date on/after 2026-08-10 is 08-10 itself.
    expect(nd({ frequency: 'interval', interval_days: '7', last_generated_date: '2026-06-01' }, TODAY))
      .toBe('2026-08-10');
    // 2026-06-03 + 7n → 08-12, keeping the original weekday rather than snapping to today.
    expect(nd({ frequency: 'interval', interval_days: '7', last_generated_date: '2026-06-03' }, TODAY))
      .toBe('2026-08-12');
  });

  it('interval: a future cursor is left alone', () => {
    expect(nd({ frequency: 'interval', interval_days: '30', last_generated_date: '2026-09-01' }, TODAY))
      .toBe('2026-10-01');
  });

  it('interval: rejects a non-positive interval instead of looping', () => {
    expect(ctx.nextDueForChore({ frequency: 'interval', interval_days: '0' }, TODAY)).toBe(null);
    expect(ctx.nextDueForChore({ frequency: 'interval', interval_days: '-7',
                                 last_generated_date: '2026-06-01' }, TODAY)).toBe(null);
  });

  it('once: a back-dated once_date surfaces today', () => {
    expect(nd({ frequency: 'once', once_date: '2026-07-04' }, TODAY)).toBe('2026-08-10');
  });

  it('start_date still defers past today', () => {
    expect(nd({ frequency: 'daily', start_date: '2026-09-01', last_generated_date: '2026-02-01' }, TODAY))
      .toBe('2026-09-01');
  });

  it('is unaffected by the trigger firing at 00:05 rather than midnight', () => {
    // The nightly trigger runs at 00:05; comparing a timed `today` against a
    // parsed date-only value would otherwise read as "later than today".
    const at0005 = new Date(2026, 7, 10, 0, 5, 0);
    expect(nd({ frequency: 'daily', last_generated_date: '2026-02-01' }, at0005)).toBe('2026-08-10');
    expect(nd({ frequency: 'interval', interval_days: '7', last_generated_date: '2026-06-01' }, at0005))
      .toBe('2026-08-10');
  });
});

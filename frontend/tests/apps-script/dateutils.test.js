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
  // Cadence defaults when unset are covered in the #44 block below.
  it('honours an explicit value within range', () => {
    expect(ctx.effectiveLeadDays({ frequency: 'weekly', weekday_due: '0', lead_days: 4 })).toBe(4);
    expect(ctx.effectiveLeadDays({ frequency: 'monthly', lead_days: 7 })).toBe(7);
    expect(ctx.effectiveLeadDays({ frequency: 'interval', interval_days: '10', lead_days: 6 })).toBe(6);
  });
  it('clamps to ≥1 and < the recurrence interval', () => {
    expect(ctx.effectiveLeadDays({ frequency: 'weekly', weekday_due: '0', lead_days: 9 })).toBe(6);   // < 7
    expect(ctx.effectiveLeadDays({ frequency: 'monthly', lead_days: 40 })).toBe(27); // < 28
    expect(ctx.effectiveLeadDays({ frequency: 'interval', interval_days: '3', lead_days: 5 })).toBe(2); // < 3
    expect(ctx.effectiveLeadDays({ frequency: 'interval', interval_days: '3', lead_days: 3 })).toBe(2); // strictly <
    expect(ctx.effectiveLeadDays({ frequency: 'daily', lead_days: 5 })).toBe(1);     // daily always 1
    // 0 is not a valid lead, so it falls back to the cadence default rather than 1.
    expect(ctx.effectiveLeadDays({ frequency: 'weekly', weekday_due: '0', lead_days: 0 })).toBe(4);
  });
  it('appearOffsetDays is lead − 1', () => {
    expect(ctx.appearOffsetDays({ frequency: 'weekly', weekday_due: '0' })).toBe(3);              // default lead 4
    expect(ctx.appearOffsetDays({ frequency: 'weekly', lead_days: 4 })).toBe(3);
  });
});

describe('isScheduledDueDay (calendar predicate)', () => {
  const { ctx } = loadBackend();
  it('matches weekly / pinned-daily / monthly / nth-weekday', () => {
    const sunday = new Date(2026, 5, 28);
    const tuesday = new Date(2026, 5, 30);
    expect(ctx.isScheduledDueDay({ frequency: 'daily' }, sunday)).toBe(true);
    expect(ctx.isScheduledDueDay({ frequency: 'weekly', weekday_due: '0' }, sunday)).toBe(true);
    expect(ctx.isScheduledDueDay({ frequency: 'weekly', weekday_due: '2' }, sunday)).toBe(false);
    expect(ctx.isScheduledDueDay({ frequency: 'daily', weekday_due: '2' }, tuesday)).toBe(true);
    expect(ctx.isScheduledDueDay({ frequency: 'monthly', monthly_day: '30' }, tuesday)).toBe(true);
    // First Friday of June 2026 is the 5th.
    expect(ctx.isScheduledDueDay({ frequency: 'monthly', monthly_week: 1, weekday_due: '5' }, new Date(2026, 5, 5))).toBe(true);
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
    expect(nd({ frequency: 'weekly', weekday_due: '3' }, TODAY)).toBe('2026-07-01'); // next Wed
    expect(nd({ frequency: 'weekly', weekday_due: '0', last_generated_date: '2026-06-28' }, TODAY)).toBe('2026-07-05'); // next Sun
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
    expect(nd({ frequency: 'weekly', weekday_due: '2', start_date: '2026-08-01' }, TODAY)).toBe('2026-08-04');
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
    expect(nd({ frequency: 'weekly', weekday_due: '0', last_generated_date: '2026-06-01' }, TODAY))
      .toBe('2026-08-16');
  });

  it('daily with pinned weekdays honours the set rather than snapping to today', () => {
    // Mon/Wed/Fri — today IS a Monday, so today itself qualifies.
    expect(nd({ frequency: 'daily', weekday_due: '1,3,5',
                last_generated_date: '2026-05-15' }, TODAY)).toBe('2026-08-10');
    // Tue/Thu — the next qualifying day after today.
    expect(nd({ frequency: 'daily', weekday_due: '2,4',
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

describe('lead_days defaults by cadence (#44)', () => {
  const { ctx } = loadBackend();
  const lead = (chore) => ctx.effectiveLeadDays(chore);

  it('defaults weekly to 4 — Sunday chore appears Thursday', () => {
    expect(lead({ frequency: 'weekly', weekday_due: '0' })).toBe(4);
  });

  it('keeps daily at 1 even when pinned to weekdays (#45)', () => {
    // The reason `custom` was folded into daily: Mon/Fri means done ON those
    // days, so it gets daily's strictness, not weekly's four-day window.
    expect(lead({ frequency: 'daily', weekday_due: '1,5' })).toBe(1);
    expect(lead({ frequency: 'daily', weekday_due: '1,5', lead_days: 4 })).toBe(1);
  });

  it('defaults monthly to 7', () => {
    expect(lead({ frequency: 'monthly', monthly_day: '15' })).toBe(7);
  });

  it('defaults interval to min(N, 7)', () => {
    expect(lead({ frequency: 'interval', interval_days: '90' })).toBe(7);
    expect(lead({ frequency: 'interval', interval_days: '3' })).toBe(2); // capped by N-1
  });

  it('pins daily and once to 1 whatever is set', () => {
    expect(lead({ frequency: 'daily' })).toBe(1);
    expect(lead({ frequency: 'daily', lead_days: 5 })).toBe(1);
    expect(lead({ frequency: 'once' })).toBe(1);
  });

  it('an explicit value still wins, subject to the cap', () => {
    expect(lead({ frequency: 'weekly', weekday_due: '0', lead_days: 2 })).toBe(2);
    expect(lead({ frequency: 'weekly', weekday_due: '0', lead_days: 99 })).toBe(6); // < 7
    expect(lead({ frequency: 'monthly', monthly_day: '15', lead_days: 99 })).toBe(27);
  });

  it('keeps the cap that fixed the v1.3.2 short-interval bug', () => {
    // Lead must stay strictly below the recurrence period, or an occurrence can
    // appear before the previous one has closed.
    expect(lead({ frequency: 'interval', interval_days: '2' })).toBe(1);
    expect(lead({ frequency: 'interval', interval_days: '5' })).toBe(4);
  });

  it('appear offset is lead − 1, so a weekly default shows 3 days early', () => {
    expect(ctx.appearOffsetDays({ frequency: 'weekly', weekday_due: '0' })).toBe(3);
    expect(ctx.appearOffsetDays({ frequency: 'daily' })).toBe(0);
  });
});

describe('weekday_due — one column for every frequency (#45)', () => {
  const { ctx } = loadBackend();
  const nd = (chore, date) => ctx.formatDate(ctx.nextDueForChore(chore, date));
  const TODAY45 = new Date(2026, 7, 10); // Monday 2026-08-10

  it('daily with a blank weekday_due is due every day', () => {
    expect(ctx.isScheduledDueDay({ frequency: 'daily' }, new Date(2026, 7, 11))).toBe(true);
    expect(ctx.isScheduledDueDay({ frequency: 'daily', weekday_due: '' }, new Date(2026, 7, 12))).toBe(true);
  });

  it('daily pinned to weekdays is due only on those days', () => {
    const mt = { frequency: 'daily', weekday_due: '1,4' }; // Mon and Thu
    expect(ctx.isScheduledDueDay(mt, new Date(2026, 7, 10))).toBe(true);  // Monday
    expect(ctx.isScheduledDueDay(mt, new Date(2026, 7, 13))).toBe(true);  // Thursday
    expect(ctx.isScheduledDueDay(mt, new Date(2026, 7, 11))).toBe(false); // Tuesday
  });

  it('parses weekday_due tolerantly and rejects junk', () => {
    expect(ctx.weekdaysDue({ weekday_due: '1, 4 ' })).toEqual([1, 4]);
    expect(ctx.weekdaysDue({ weekday_due: 3 })).toEqual([3]);
    expect(ctx.weekdaysDue({ weekday_due: '' })).toEqual([]);
    expect(ctx.weekdaysDue({})).toEqual([]);
    expect(ctx.weekdaysDue({ weekday_due: '9,-1,abc' })).toEqual([]);
  });

  it('interval snaps forward to the chosen weekday', () => {
    // 2026-06-01 + 70 days = 2026-08-10, a Monday. Snapped to Sunday → 08-16.
    expect(nd({ frequency: 'interval', interval_days: '7', weekday_due: '0',
                last_generated_date: '2026-06-01' }, TODAY45)).toBe('2026-08-16');
  });

  it('interval without weekday_due is unchanged', () => {
    expect(nd({ frequency: 'interval', interval_days: '7',
                last_generated_date: '2026-06-01' }, TODAY45)).toBe('2026-08-10');
  });

  it('does not shift an interval date already on the chosen weekday', () => {
    // 2026-08-10 is a Monday, so snapping to Monday is a no-op.
    expect(nd({ frequency: 'interval', interval_days: '7', weekday_due: '1',
                last_generated_date: '2026-06-01' }, TODAY45)).toBe('2026-08-10');
  });

  it('monthly still resolves nth-weekday from weekday_due', () => {
    // Second Friday of September 2026 is the 11th.
    expect(nd({ frequency: 'monthly', monthly_week: 2, weekday_due: '5',
                last_generated_date: '2026-08-14' }, TODAY45)).toBe('2026-09-11');
  });
});

describe('how weekday snapping interacts with lead days (#45)', () => {
  const { ctx } = loadBackend();

  it('does not change the lead window itself — only when it opens', () => {
    // The window is measured from the due date, so snapping moves the whole
    // thing later rather than shrinking it.
    const chore = { frequency: 'interval', interval_days: '90', weekday_due: '0' };
    expect(ctx.effectiveLeadDays(chore)).toBe(7);           // min(90, 7), unchanged
    expect(ctx.appearOffsetDays(chore)).toBe(6);            // still 6 days early
    expect(ctx.effectiveLeadDays({ frequency: 'interval', interval_days: '90' })).toBe(7);
  });

  it('keeps the cap safe — snapping only ever widens the real gap', () => {
    // The cap exists so an occurrence can't appear before the previous one is
    // due. Snapping pushes the next due date LATER, so a cap computed from the
    // raw interval stays conservative.
    expect(ctx.effectiveLeadDays({ frequency: 'interval', interval_days: '5', weekday_due: '0' })).toBe(4);
    expect(ctx.effectiveLeadDays({ frequency: 'interval', interval_days: '2', weekday_due: '0' })).toBe(1);
  });

  it('WARNING CASE: snapping a short interval effectively makes it weekly', () => {
    // "Every 3 days, on Sundays" can only ever be Sundays — the snap overrides
    // the interval entirely. Documented rather than blocked.
    const nd = (c, d) => ctx.formatDate(ctx.nextDueForChore(c, d));
    const chore = { frequency: 'interval', interval_days: '3', weekday_due: '0',
                    last_generated_date: '2026-08-09' }; // a Sunday
    // 09 + 3 = Aug 12 (Wed) → snapped forward to Sunday Aug 16, i.e. 7 days on.
    expect(nd(chore, new Date(2026, 7, 10))).toBe('2026-08-16');
  });
});

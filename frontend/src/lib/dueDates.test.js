import { describe, it, expect } from 'vitest';
import { scheduledOn, nextDueDate, nextDueLabel, daysUntilDue, dueLabel, daysOverdue, shiftDate } from './dueDates.js';
import { formatDate } from './utils.js';

const TODAY = '2026-06-28'; // a Sunday (TZ pinned to America/Chicago in vitest config)

function nd(chore) { return formatDate(nextDueDate(chore, TODAY)); }

describe('nextDueDate', () => {
  it('weekly → next matching weekday', () => {
    // Tuesday = 2; from Sunday 2026-06-28 the next Tuesday is 2026-06-30.
    expect(nd({ frequency: 'weekly', weekday_due: '2' })).toBe('2026-06-30');
    // Sunday = 0 → today.
    expect(nd({ frequency: 'weekly', weekday_due: '0' })).toBe('2026-06-28');
  });

  it('custom → next listed day', () => {
    expect(nd({ frequency: 'daily', weekday_due: '1,3' })).toBe('2026-06-29');
  });

  it('monthly → next occurrence of the day (this month or next)', () => {
    expect(nd({ frequency: 'monthly', monthly_day: '30' })).toBe('2026-06-30');
    expect(nd({ frequency: 'monthly', monthly_day: '5' })).toBe('2026-07-05'); // already past in June
  });

  it('monthly nth-weekday → next matching occurrence (this month or next)', () => {
    // June 2026: Fridays fall on 5, 12, 19, 26 (June 1 is a Monday).
    // From Sun June 28, the 2nd Friday (June 12) has passed → July's 2nd Friday.
    // July 2026: 1st is Wed, so Fridays are 3, 10, 17, 24 → 2nd = July 10.
    expect(nd({ frequency: 'monthly', monthly_week: 2, weekday_due: '5' })).toBe('2026-07-10');
    // 1st Friday already past in June → July 3.
    expect(nd({ frequency: 'monthly', monthly_week: 1, weekday_due: '5' })).toBe('2026-07-03');
    // 4th Monday: June Mondays 1,8,15,22 → June 22 past → July's 4th Monday (Jul 27).
    expect(nd({ frequency: 'monthly', monthly_week: 4, weekday_due: '1' })).toBe('2026-07-27');
  });

  it('interval → current occurrence when due today, else next grid date (#13)', () => {
    // last_generated_date is the current occurrence's due date. A chore due today
    // (generated on creation) reads "today" — not last+N (the #13 off-by-interval).
    expect(nd({ frequency: 'interval', interval_days: '90', last_generated_date: TODAY })).toBe('2026-06-28');
    // A completed/past occurrence rolls forward by whole intervals to the next.
    expect(nd({ frequency: 'interval', interval_days: '7', last_generated_date: '2026-06-25' })).toBe('2026-07-02');
    expect(nd({ frequency: 'interval', interval_days: '7', last_generated_date: '2026-06-01' })).toBe('2026-06-29'); // 06-01→…→06-29
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
    expect(nd({ frequency: 'weekly', weekday_due: '2', start_date: '2026-08-01' })).toBe('2026-08-04');
  });
});

describe('scheduledOn', () => {
  it('monthly clamps to the last day of short months', () => {
    expect(scheduledOn({ frequency: 'monthly', monthly_day: '31' }, new Date(2026, 1, 28))).toBe(true); // Feb 28
  });

  it('monthly nth-weekday matches only the nth occurrence', () => {
    const firstFriday = { frequency: 'monthly', monthly_week: 1, weekday_due: '5' };
    expect(scheduledOn(firstFriday, new Date(2026, 5, 5))).toBe(true);   // June 5 = 1st Friday
    expect(scheduledOn(firstFriday, new Date(2026, 5, 12))).toBe(false); // June 12 = 2nd Friday
  });
});

describe('nextDueLabel', () => {
  it('daily shows nothing', () => {
    expect(nextDueLabel({ frequency: 'daily' }, TODAY)).toBe('');
  });
  it('weekly shows Today or a weekday name', () => {
    expect(nextDueLabel({ frequency: 'weekly', weekday_due: '0' }, TODAY)).toBe('Today');
    expect(nextDueLabel({ frequency: 'weekly', weekday_due: '2' }, TODAY)).toBe('Tuesday');
  });
  it('monthly far out shows a short date', () => {
    expect(nextDueLabel({ frequency: 'monthly', monthly_day: '5' }, TODAY)).toBe('Jul 5');
  });
});

describe('dueLabel (per-card "Due …" tag)', () => {
  // TODAY = 2026-06-28 (Sunday).
  it('Today / Tomorrow / weekday / short date', () => {
    expect(dueLabel('2026-06-28', TODAY)).toBe('Today');
    expect(dueLabel('2026-06-29', TODAY)).toBe('Tomorrow');
    expect(dueLabel('2026-06-30', TODAY)).toBe('Tuesday'); // 2 days out
    expect(dueLabel('2026-07-10', TODAY)).toBe('Jul 10');  // >6 days → date
  });
  it('overdue (past) dates show a short date', () => {
    expect(dueLabel('2026-06-25', TODAY)).toBe('Jun 25');
  });
});

describe('daysOverdue', () => {
  it('0 for today/future, positive for past', () => {
    expect(daysOverdue('2026-06-28', TODAY)).toBe(0);
    expect(daysOverdue('2026-06-30', TODAY)).toBe(0);
    expect(daysOverdue('2026-06-25', TODAY)).toBe(3);
  });
});

describe('daysUntilDue (countdown sort)', () => {
  it('daily=0, today=0, future=N, none=Infinity', () => {
    expect(daysUntilDue({ frequency: 'daily' }, TODAY)).toBe(0);
    expect(daysUntilDue({ frequency: 'weekly', weekday_due: '0' }, TODAY)).toBe(0);
    expect(daysUntilDue({ frequency: 'weekly', weekday_due: '2' }, TODAY)).toBe(2);
    expect(daysUntilDue({ frequency: 'once', once_date: '2026-07-04', last_generated_date: '2026-07-04' }, TODAY)).toBe(Infinity);
  });
});

describe('shiftDate (backs Push, #50)', () => {
  it('adds whole days', () => {
    expect(shiftDate('2026-06-28', 7)).toBe('2026-07-05');
  });

  it('crosses a month boundary', () => {
    expect(shiftDate('2026-06-30', 7)).toBe('2026-07-07');
  });

  it('crosses a year boundary', () => {
    expect(shiftDate('2026-12-28', 7)).toBe('2027-01-04');
  });

  it('survives the spring-forward DST weekend on the local calendar', () => {
    // US DST starts Sunday 2026-03-08. Adding 7 calendar days must land on the
    // 15th, not the 14th — which is what naive ms arithmetic would give.
    expect(shiftDate('2026-03-06', 7)).toBe('2026-03-13');
    expect(shiftDate('2026-03-08', 7)).toBe('2026-03-15');
  });

  it('tolerates a full timestamp and blank input', () => {
    expect(shiftDate('2026-06-28T00:00:00-05:00', 7)).toBe('2026-07-05');
    expect(shiftDate('', 7)).toBe('');
  });
});

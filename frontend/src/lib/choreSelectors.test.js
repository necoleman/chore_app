import { describe, it, expect } from 'vitest';
import {
  filterTodayAssignments,
  groupKeyFor,
  compareWithinGroup,
  groupByCadence,
  groupByDue,
  groupAssignments,
  splitTodaySections,
  choreState,
  reviewerName,
} from './choreSelectors.js';

const TODAY = '2026-06-28';

function a(over) {
  return {
    assignment_id: Math.random().toString(36).slice(2),
    chore_id: 'c1',
    person_id: null,
    due_date: TODAY,
    status: 'open',
    frequency: 'daily',
    points: 1,
    ...over,
  };
}

describe('filterTodayAssignments', () => {
  it('includes today and overdue unfinished, excludes future', () => {
    const list = [
      a({ assignment_id: 'today-open', due_date: TODAY, status: 'open' }),
      a({ assignment_id: 'overdue-open', due_date: '2026-06-25', status: 'open' }),
      a({ assignment_id: 'future-open', due_date: '2026-07-01', status: 'open' }),
    ];
    const ids = filterTodayAssignments(list, TODAY).map((x) => x.assignment_id);
    expect(ids).toContain('today-open');
    expect(ids).toContain('overdue-open');
    expect(ids).not.toContain('future-open');
  });

  it('includes done/skipped due today; drops stale ones', () => {
    const list = [
      a({ assignment_id: 'done-today', status: 'done' }),
      a({ assignment_id: 'skip-old', due_date: '2026-06-25', status: 'skipped' }),
    ];
    const ids = filterTodayAssignments(list, TODAY).map((x) => x.assignment_id);
    expect(ids).toContain('done-today');
    expect(ids).not.toContain('skip-old');
  });

  it('keeps an overdue chore completed today (#14)', () => {
    const list = [
      a({ assignment_id: 'late', due_date: '2026-06-20', status: 'done', completed_at: `${TODAY}T10:00:00-05:00` }),
    ];
    expect(filterTodayAssignments(list, TODAY).map((x) => x.assignment_id)).toEqual(['late']);
  });

  it('surfaces a future chore once inside its lead window (#23)', () => {
    const list = [a({ assignment_id: 'lead', due_date: '2026-07-01', lead_days: 4 })];
    expect(filterTodayAssignments(list, TODAY)).toHaveLength(1);
  });
});

describe('groupKeyFor (#38)', () => {
  it('routes one-offs before cadence is considered', () => {
    expect(groupKeyFor(a({ is_one_off: true, frequency: 'daily' }))).toBe('oneoff');
    expect(groupKeyFor(a({ assigned_by: 'manual', frequency: 'weekly' }))).toBe('oneoff');
    expect(groupKeyFor(a({ frequency: 'once' }))).toBe('oneoff');
  });

  it('cuts the cadence groups on frequency (#45)', () => {
    expect(groupKeyFor(a({ frequency: 'daily' }))).toBe('daily');
    expect(groupKeyFor(a({ frequency: 'weekly' }))).toBe('weekly');
    expect(groupKeyFor(a({ frequency: 'monthly' }))).toBe('monthly');
    expect(groupKeyFor(a({ frequency: 'interval' }))).toBe('monthly');
  });

  it('puts a daily chore pinned to weekdays under Daily Chores, not Weekend Chores (#45)', () => {
    // The whole point of folding `custom` into daily: Mon/Thu is a discipline,
    // so it groups with the dailies rather than with "sometime this week".
    expect(groupKeyFor(a({ frequency: 'daily', weekday_due: '1,4' }))).toBe('daily');
    expect(groupKeyFor(a({ frequency: 'weekly', weekday_due: '0' }))).toBe('weekly');
  });
});

describe('compareWithinGroup (#38)', () => {
  it('sinks finished items to the bottom', () => {
    const open = a({ assignment_id: 'o', status: 'open' });
    const done = a({ assignment_id: 'd', status: 'done' });
    expect([done, open].sort(compareWithinGroup).map((x) => x.assignment_id)).toEqual(['o', 'd']);
  });

  it('sinks sort_last chores above the finished ones', () => {
    const normal = a({ assignment_id: 'n' });
    const later = a({ assignment_id: 'l', sort_last: true });
    const done = a({ assignment_id: 'd', status: 'done' });
    expect([later, done, normal].sort(compareWithinGroup).map((x) => x.assignment_id))
      .toEqual(['n', 'l', 'd']);
  });

  it('orders by due date, overdue first', () => {
    const late = a({ assignment_id: 'late', due_date: '2026-06-20' });
    const today = a({ assignment_id: 'today', due_date: TODAY });
    const soon = a({ assignment_id: 'soon', due_date: '2026-07-02' });
    expect([soon, today, late].sort(compareWithinGroup).map((x) => x.assignment_id))
      .toEqual(['late', 'today', 'soon']);
  });

  it('breaks ties by points ascending — quick wins first', () => {
    const big = a({ assignment_id: 'big', points: 45 });
    const small = a({ assignment_id: 'small', points: 5 });
    expect([big, small].sort(compareWithinGroup).map((x) => x.assignment_id))
      .toEqual(['small', 'big']);
  });

  it('only consults points when everything else is equal', () => {
    // A cheap chore due later must not outrank an expensive overdue one.
    const cheapLater = a({ assignment_id: 'cheap', points: 1, due_date: '2026-07-01' });
    const dearOverdue = a({ assignment_id: 'dear', points: 99, due_date: '2026-06-20' });
    expect([cheapLater, dearOverdue].sort(compareWithinGroup).map((x) => x.assignment_id))
      .toEqual(['dear', 'cheap']);
  });
});

describe('groupByCadence (#38)', () => {
  it('returns groups in fixed order and omits empty ones', () => {
    const list = [
      a({ assignment_id: 'm', frequency: 'monthly' }),
      a({ assignment_id: 'd', frequency: 'daily' }),
      a({ assignment_id: 'x', is_one_off: true }),
    ];
    expect(groupByCadence(list).map((g) => g.key)).toEqual(['oneoff', 'daily', 'monthly']);
  });

  it('leads with one-offs, because nothing regenerates them', () => {
    const list = [a({ assignment_id: 'd', frequency: 'daily' }), a({ assignment_id: 'x', is_one_off: true })];
    expect(groupByCadence(list)[0].key).toBe('oneoff');
  });

  it('returns nothing for an empty list', () => {
    expect(groupByCadence([])).toEqual([]);
    expect(groupByCadence(undefined)).toEqual([]);
  });
});

describe('splitTodaySections', () => {
  const me = { person_id: 'me', is_admin: true };

  it('splits mine / family / unassigned and groups each by cadence', () => {
    const list = [
      a({ assignment_id: 'mine', person_id: 'me', frequency: 'daily' }),
      a({ assignment_id: 'theirs', person_id: 'you', person_name: 'You', frequency: 'weekly' }),
      a({ assignment_id: 'free', person_id: null, status: 'open', frequency: 'monthly' }),
    ];
    const s = splitTodaySections(list, me, true, TODAY);
    expect(s.mine.flatMap((g) => g.items).map((x) => x.assignment_id)).toEqual(['mine']);
    expect(s.familyGroups[0].person_id).toBe('you');
    expect(s.familyGroups[0].count).toBe(1);
    expect(s.unassigned.flatMap((g) => g.items).map((x) => x.assignment_id)).toEqual(['free']);
  });

  it('surfaces pending items to admins only', () => {
    const list = [a({ assignment_id: 'p', person_id: 'you', status: 'pending_review' })];
    expect(splitTodaySections(list, me, true, TODAY).pendingReview).toHaveLength(1);
    expect(splitTodaySections(list, me, false, TODAY).pendingReview).toHaveLength(0);
  });
});

describe('choreState', () => {
  it('marks an open past-due chore overdue', () => {
    const cs = choreState(a({ due_date: '2026-06-20' }), { person_id: 'me' }, { todayStr: TODAY });
    expect(cs.isOverdue).toBe(true);
  });

  it('does NOT mark a pending_review chore overdue (#38)', () => {
    // The assignee finished on time; the delay is the reviewer's. It also can't
    // be missed — only approved or sent back.
    const cs = choreState(
      a({ due_date: '2026-06-20', status: 'pending_review' }),
      { person_id: 'me' },
      { todayStr: TODAY }
    );
    expect(cs.isOverdue).toBe(false);
    expect(cs.isPending).toBe(true);
  });

  it('lets the assignee undo an unreviewed completion but not an approved one', () => {
    const mine = { person_id: 'me' };
    expect(choreState(a({ person_id: 'me', status: 'done' }), mine, { todayStr: TODAY }).canUncheck).toBe(true);
    expect(
      choreState(a({ person_id: 'me', status: 'done', reviewed_by: 'dad' }), mine, { todayStr: TODAY }).canUncheck
    ).toBe(false);
  });
});

describe('reviewerName', () => {
  it('resolves the reviewer, or null when absent', () => {
    const people = [{ person_id: 'dad', name: 'Dad' }];
    expect(reviewerName(a({ reviewed_by: 'dad' }), people)).toBe('Dad');
    expect(reviewerName(a({}), people)).toBe(null);
  });
});

describe('groupByDue (the Due date sort)', () => {
  const YESTERDAY = '2026-06-27';
  const TOMORROW = '2026-06-29';

  it('cuts into overdue / due today / due soon, in that order', () => {
    const list = [
      a({ due_date: TOMORROW }),
      a({ due_date: YESTERDAY }),
      a({ due_date: TODAY }),
    ];
    expect(groupByDue(list, TODAY).map((g) => g.key)).toEqual([
      'overdue',
      'duetoday',
      'duesoon',
    ]);
  });

  it('omits empty buckets rather than showing a bare heading', () => {
    const list = [a({ due_date: TODAY }), a({ due_date: TODAY })];
    expect(groupByDue(list, TODAY).map((g) => g.key)).toEqual(['duetoday']);
  });

  it('orders the most overdue first', () => {
    const list = [
      a({ assignment_id: 'recent', due_date: '2026-06-26' }),
      a({ assignment_id: 'ancient', due_date: '2026-06-01' }),
    ];
    const overdue = groupByDue(list, TODAY)[0];
    expect(overdue.items.map((x) => x.assignment_id)).toEqual(['ancient', 'recent']);
  });

  it('keeps finished chores in their date bucket but at the bottom', () => {
    const list = [
      a({ assignment_id: 'done', due_date: YESTERDAY, status: 'done' }),
      a({ assignment_id: 'open', due_date: YESTERDAY, status: 'open' }),
    ];
    const overdue = groupByDue(list, TODAY)[0];
    expect(overdue.key).toBe('overdue');
    expect(overdue.items.map((x) => x.assignment_id)).toEqual(['open', 'done']);
  });

  it('regroups the same cards rather than filtering any out', () => {
    const list = [
      a({ frequency: 'daily', due_date: TODAY }),
      a({ frequency: 'weekly', due_date: TOMORROW }),
      a({ frequency: 'monthly', due_date: YESTERDAY }),
    ];
    const byCadence = groupByCadence(list).flatMap((g) => g.items).length;
    const byDue = groupByDue(list, TODAY).flatMap((g) => g.items).length;
    expect(byDue).toBe(list.length);
    expect(byDue).toBe(byCadence);
  });

  it('groupAssignments picks the mode, defaulting to cadence', () => {
    const list = [a({ frequency: 'weekly', due_date: TODAY })];
    expect(groupAssignments(list, 'due', TODAY)[0].key).toBe('duetoday');
    expect(groupAssignments(list, 'default', TODAY)[0].key).toBe('weekly');
  });
});

describe('admin completing on someone else\'s behalf (#53)', () => {
  const ADMIN = { person_id: 'p_rachel', is_admin: true };
  const opts = { showAdminControls: true, readonly: true, todayStr: TODAY };

  it('lets an admin tap a child\'s open chore even in a readonly section', () => {
    const cs = choreState(a({ person_id: 'p_kid', status: 'open' }), ADMIN, opts);
    expect(cs.canCompleteForOther).toBe(true);
    expect(cs.isInteractive).toBe(true);
  });

  it('does not offer it on an unassigned chore — that is a claim, not a favour', () => {
    const cs = choreState(a({ person_id: null, status: 'open' }), ADMIN, opts);
    expect(cs.canCompleteForOther).toBe(false);
  });

  it('does not offer it on the admin\'s own chore', () => {
    const cs = choreState(a({ person_id: 'p_rachel', status: 'open' }), ADMIN, opts);
    expect(cs.canCompleteForOther).toBe(false);
  });

  it('leaves non-admins unable to tap a family card', () => {
    const kid = { person_id: 'p_kid', is_admin: false };
    const cs = choreState(a({ person_id: 'p_other', status: 'open' }), kid, {
      showAdminControls: false, readonly: true, todayStr: TODAY,
    });
    expect(cs.canCompleteForOther).toBe(false);
    expect(cs.isInteractive).toBe(false);
  });

  it('the admin can still undo it afterwards — no reviewer is recorded', () => {
    const cs = choreState(
      a({ person_id: 'p_kid', status: 'done', reviewed_by: '' }), ADMIN, opts
    );
    expect(cs.canUncheck).toBe(true);
  });

  it('but cannot undo one that was genuinely approved', () => {
    const cs = choreState(
      a({ person_id: 'p_kid', status: 'done', reviewed_by: 'p_rachel' }), ADMIN, opts
    );
    expect(cs.canUncheck).toBe(false);
  });
});

describe('a skipped chore stays visible for the rest of the day (#54)', () => {
  const YESTERDAY = '2026-06-27';
  const NOW = `${TODAY}T14:00:00-05:00`;

  it('keeps an OVERDUE chore an admin skipped today', () => {
    const list = [a({
      assignment_id: 'excused',
      due_date: YESTERDAY,
      status: 'skipped',
      reviewed_at: NOW,
    })];
    expect(filterTodayAssignments(list, TODAY).map((x) => x.assignment_id))
      .toEqual(['excused']);
  });

  it('still drops a MISSED occurrence — closed overnight, no reviewer', () => {
    const list = [a({
      assignment_id: 'missed',
      due_date: YESTERDAY,
      status: 'skipped',
      reviewed_at: '',
      points_awarded: -5,
    })];
    expect(filterTodayAssignments(list, TODAY)).toEqual([]);
  });

  it('drops a chore skipped on a PREVIOUS day', () => {
    const list = [a({
      assignment_id: 'old',
      due_date: YESTERDAY,
      status: 'skipped',
      reviewed_at: `${YESTERDAY}T14:00:00-05:00`,
    })];
    expect(filterTodayAssignments(list, TODAY)).toEqual([]);
  });

  it('resolves a legacy UTC reviewed_at to the right local day', () => {
    // 2026-06-29T02:00:00Z is 9pm on the 28th in Central — still "today".
    const list = [a({
      assignment_id: 'utc',
      due_date: YESTERDAY,
      status: 'skipped',
      reviewed_at: '2026-06-29T02:00:00Z',
    })];
    expect(filterTodayAssignments(list, TODAY).map((x) => x.assignment_id))
      .toEqual(['utc']);
  });
});

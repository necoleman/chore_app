import { describe, it, expect } from 'vitest';
import {
  filterTodayAssignments,
  rankAssignment,
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

  it('includes done/skipped only when due today', () => {
    const list = [
      a({ assignment_id: 'done-today', due_date: TODAY, status: 'done' }),
      a({ assignment_id: 'done-old', due_date: '2026-06-25', status: 'done' }),
      a({ assignment_id: 'skip-old', due_date: '2026-06-25', status: 'skipped' }),
    ];
    const ids = filterTodayAssignments(list, TODAY).map((x) => x.assignment_id);
    expect(ids).toEqual(['done-today']);
  });

  it('drops rows without a due date and tolerates empty input', () => {
    expect(filterTodayAssignments([a({ due_date: undefined })], TODAY)).toEqual([]);
    expect(filterTodayAssignments(undefined, TODAY)).toEqual([]);
  });
});

describe('rankAssignment', () => {
  it('orders overdue (0) < today (1) < finished (2)', () => {
    expect(rankAssignment(a({ due_date: '2026-06-25', status: 'open' }), TODAY)).toBe(0);
    expect(rankAssignment(a({ due_date: TODAY, status: 'open' }), TODAY)).toBe(1);
    expect(rankAssignment(a({ due_date: TODAY, status: 'done' }), TODAY)).toBe(2);
  });
});

describe('splitTodaySections', () => {
  const me = { person_id: 'me', is_admin: true };

  it('puts my chores (incl. my pending) in mine, sorted overdue→today→finished', () => {
    const list = [
      a({ assignment_id: 'mine-done', person_id: 'me', status: 'done', due_date: TODAY }),
      a({ assignment_id: 'mine-overdue', person_id: 'me', status: 'open', due_date: '2026-06-25' }),
      a({ assignment_id: 'mine-pending', person_id: 'me', status: 'pending_review', due_date: TODAY }),
    ];
    const { mine } = splitTodaySections(list, me, true, TODAY);
    expect(mine.map((x) => x.assignment_id)).toEqual(['mine-overdue', 'mine-pending', 'mine-done']);
  });

  it('admin pendingReview lists pending; non-admin gets none', () => {
    const list = [a({ person_id: 'kid', status: 'pending_review', due_date: TODAY })];
    expect(splitTodaySections(list, me, true, TODAY).pendingReview).toHaveLength(1);
    expect(splitTodaySections(list, { person_id: 'x' }, false, TODAY).pendingReview).toHaveLength(0);
  });

  it('family excludes pending and groups by person; unassigned is open + no person', () => {
    const list = [
      a({ assignment_id: 'fam-open', person_id: 'kid', person_name: 'Kid', status: 'open', due_date: TODAY }),
      a({ assignment_id: 'fam-pending', person_id: 'kid', status: 'pending_review', due_date: TODAY }),
      a({ assignment_id: 'claimable', person_id: null, status: 'open', due_date: TODAY }),
    ];
    const { familyGroups, unassigned } = splitTodaySections(list, me, true, TODAY);
    const famIds = familyGroups.flatMap((g) => g.items.map((i) => i.assignment_id));
    expect(famIds).toEqual(['fam-open']); // pending excluded
    expect(unassigned.map((x) => x.assignment_id)).toEqual(['claimable']);
  });

  it('sortMode "due" orders my section by due date (finished still last)', () => {
    const list = [
      a({ assignment_id: 'mine-done', person_id: 'me', status: 'done', due_date: TODAY }),
      a({ assignment_id: 'mine-later', person_id: 'me', status: 'open', due_date: '2026-06-27' }),
      a({ assignment_id: 'mine-earlier', person_id: 'me', status: 'open', due_date: '2026-06-25' }),
    ];
    const { mine } = splitTodaySections(list, me, true, TODAY, 'due');
    expect(mine.map((x) => x.assignment_id)).toEqual(['mine-earlier', 'mine-later', 'mine-done']);
  });

  it('sortMode "frequency" orders my section by cadence (finished still last)', () => {
    const list = [
      a({ assignment_id: 'mine-monthly', person_id: 'me', status: 'open', frequency: 'monthly', due_date: '2026-06-25' }),
      a({ assignment_id: 'mine-daily', person_id: 'me', status: 'open', frequency: 'daily', due_date: '2026-06-25' }),
      a({ assignment_id: 'mine-done', person_id: 'me', status: 'done', frequency: 'daily', due_date: TODAY }),
    ];
    const { mine } = splitTodaySections(list, me, true, TODAY, 'frequency');
    expect(mine.map((x) => x.assignment_id)).toEqual(['mine-daily', 'mine-monthly', 'mine-done']);
  });
});

describe('choreState', () => {
  const me = { person_id: 'me' };

  it('open + mine is interactive; future/own done is not', () => {
    expect(choreState(a({ person_id: 'me', status: 'open' }), me, { todayStr: TODAY }).isInteractive).toBe(true);
    expect(choreState(a({ person_id: 'me', status: 'done' }), me, { todayStr: TODAY }).isInteractive).toBe(false);
  });

  it('unassigned open is interactive (claimable)', () => {
    expect(choreState(a({ person_id: null, status: 'open' }), me, { todayStr: TODAY }).isInteractive).toBe(true);
  });

  it('readonly blocks interaction but NOT uncheck (admin can undo family)', () => {
    const done = a({ person_id: 'kid', status: 'done' });
    const st = choreState(done, me, { showAdminControls: true, readonly: true, todayStr: TODAY });
    expect(st.isInteractive).toBe(false);
    expect(st.canUncheck).toBe(true);
  });

  it('canUncheck: true for own done w/o reviewer and pending; false when approved', () => {
    expect(choreState(a({ person_id: 'me', status: 'done' }), me, { todayStr: TODAY }).canUncheck).toBe(true);
    expect(choreState(a({ person_id: 'me', status: 'pending_review' }), me, { todayStr: TODAY }).canUncheck).toBe(true);
    const approved = a({ person_id: 'me', status: 'done', reviewed_by: 'dad' });
    expect(choreState(approved, me, { todayStr: TODAY }).canUncheck).toBe(false);
  });

  it('isOverdue only for unfinished items past due', () => {
    expect(choreState(a({ status: 'open', due_date: '2026-06-25' }), me, { todayStr: TODAY }).isOverdue).toBe(true);
    expect(choreState(a({ status: 'open', due_date: TODAY }), me, { todayStr: TODAY }).isOverdue).toBe(false);
    expect(choreState(a({ status: 'done', due_date: '2026-06-25' }), me, { todayStr: TODAY }).isOverdue).toBe(false);
  });
});

describe('reviewerName', () => {
  const people = [{ person_id: 'dad', name: 'Dad' }];
  it('resolves reviewed_by to a name, else null', () => {
    expect(reviewerName(a({ reviewed_by: 'dad' }), people)).toBe('Dad');
    expect(reviewerName(a({ reviewed_by: 'ghost' }), people)).toBe(null);
    expect(reviewerName(a({ reviewed_by: '' }), people)).toBe(null);
  });
});

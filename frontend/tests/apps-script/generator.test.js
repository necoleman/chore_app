import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadBackend } from './harness.js';

describe('runNightlyGenerator', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 0, 5, 0)); }); // 2026-06-28
  afterEach(() => vi.useRealTimers());

  it('creates an assignment for a due active chore', () => {
    const { ctx, read } = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'TRUE' }],
    });
    ctx.runNightlyGenerator();
    const rows = read('Assignments');
    expect(rows).toHaveLength(1);
    expect(rows[0].chore_id).toBe('c1');
    expect(rows[0].due_date).toBe('2026-06-28');
    expect(rows[0].assigned_by).toBe('auto');
  });

  it('skips inactive chores and does not duplicate an existing assignment for today', () => {
    const { ctx, read } = loadBackend({
      Chores: [
        { chore_id: 'c1', frequency: 'daily', active: 'TRUE' },
        { chore_id: 'c2', frequency: 'daily', active: 'FALSE' },
      ],
      Assignments: [{ assignment_id: 'pre', chore_id: 'c1', due_date: '2026-06-28', status: 'open' }],
    });
    ctx.runNightlyGenerator();
    const rows = read('Assignments');
    expect(rows).toHaveLength(1); // c1 already exists, c2 inactive
    expect(rows[0].assignment_id).toBe('pre');
  });

  it('one-time chore auto-archives (active=false) and stamps last_generated_date', () => {
    const { ctx, read } = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'once', once_date: '2026-06-28', active: 'TRUE' }],
    });
    ctx.runNightlyGenerator();
    expect(read('Assignments')).toHaveLength(1);
    const chore = read('Chores')[0];
    expect(chore.active).toBe(false);
    expect(chore.last_generated_date).toBe('2026-06-28');
  });

  it('interval chore records last_generated_date anchor', () => {
    const { ctx, read } = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'interval', interval_days: '7', active: 'TRUE' }],
    });
    ctx.runNightlyGenerator();
    expect(read('Chores')[0].last_generated_date).toBe('2026-06-28');
  });

  it('notifies when the chore has a default assignee', () => {
    const { ctx, notifications } = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'TRUE', default_assignee: 'kid' }],
    });
    ctx.runNightlyGenerator();
    expect(notifications.some((n) => n[0] === 'assign')).toBe(true);
  });
});

describe('resolveRotationAssignee (#24)', () => {
  const r = (chore) => {
    const { ctx } = loadBackend();
    return ctx.resolveRotationAssignee(chore);
  };
  it('empty list → unassigned', () => expect(r({ default_assignee: '' })).toBe(''));
  it('single person → that person (no rotation)', () =>
    expect(r({ default_assignee: 'p_a', rotation_last: 'p_a' })).toBe('p_a'));
  it('list with no prior pointer → first in line', () =>
    expect(r({ default_assignee: 'p_a,p_b,p_c' })).toBe('p_a'));
  it('advances to the person after rotation_last', () =>
    expect(r({ default_assignee: 'p_a,p_b,p_c', rotation_last: 'p_a' })).toBe('p_b'));
  it('wraps around at the end', () =>
    expect(r({ default_assignee: 'p_a,p_b,p_c', rotation_last: 'p_c' })).toBe('p_a'));
  it('rotation_last dropped from the list → first in line', () =>
    expect(r({ default_assignee: 'p_a,p_b,p_c', rotation_last: 'p_x' })).toBe('p_a'));
  it('trims whitespace around ids', () =>
    expect(r({ default_assignee: 'p_a, p_b , p_c', rotation_last: 'p_a' })).toBe('p_b'));
});

describe('resolveRotationAssignee — vacation skip (#29)', () => {
  const r = (chore, people) => {
    const { ctx } = loadBackend();
    return ctx.resolveRotationAssignee(chore, people);
  };
  const away = (id) => ({ person_id: id, on_vacation: true });

  it('sole assignee on vacation → unclaimed', () =>
    expect(r({ default_assignee: 'p_a' }, [away('p_a')])).toBe(''));
  it('sole assignee not on vacation → that person', () =>
    expect(r({ default_assignee: 'p_a' }, [{ person_id: 'p_a', on_vacation: false }])).toBe('p_a'));
  it('rotation skips the vacationer to the next available person', () =>
    expect(r({ default_assignee: 'p_a,p_b,p_c', rotation_last: 'p_a' }, [away('p_b')])).toBe('p_c'));
  it('rotation wraps past a vacationer at the end', () =>
    expect(r({ default_assignee: 'p_a,p_b,p_c', rotation_last: 'p_b' }, [away('p_c')])).toBe('p_a'));
  it('everyone on vacation → unclaimed', () =>
    expect(r({ default_assignee: 'p_a,p_b' }, [away('p_a'), away('p_b')])).toBe(''));
  it('no people arg behaves exactly as before (no vacations)', () =>
    expect(r({ default_assignee: 'p_a,p_b,p_c', rotation_last: 'p_a' })).toBe('p_b'));
});

describe('runNightlyGenerator — recreate vs rollover (#30)', () => {
  afterEach(() => vi.useRealTimers());

  it('rollover (default): a still-open prior collapses, no second row', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 29, 0, 5, 0)); // 2026-06-29
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', points_total: 10 }],
      Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'TRUE', default_assignee: 'kid', points: 3, last_generated_date: '2026-06-28' }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-28', status: 'open' }],
    });
    ctx.runNightlyGenerator();
    expect(read('Assignments')).toHaveLength(1); // collapsed
  });

  it('recreate: prior stays open, a fresh occurrence is created, and the miss is penalized', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 29, 0, 5, 0)); // 2026-06-29
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', points_total: 10 }],
      Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'TRUE', default_assignee: 'kid', points: 3, recur_mode: 'recreate', last_generated_date: '2026-06-28' }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-28', status: 'open' }],
    });
    ctx.runNightlyGenerator();
    const rows = read('Assignments');
    expect(rows).toHaveLength(2); // both the overdue one and today's
    const a1 = rows.find((r) => r.assignment_id === 'a1');
    expect(a1.status).toBe('open'); // prior left open (overdue)
    expect(a1.missed_count).toBe(1); // the missed occurrence is flagged
    expect(rows.some((r) => r.due_date === '2026-06-29' && r.status === 'open')).toBe(true);
    expect(read('People')[0].points_total).toBe(7); // 10 − 3, the miss penalty applies
  });

  it('recreate: only the just-superseded occurrence is penalized, not older open ones', () => {
    // a1 (06-27) was already penalized on its night; creating 06-29 must penalize
    // only a2 (06-28), the occurrence that just went overdue — one deduction.
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 29, 0, 5, 0)); // 2026-06-29
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', points_total: 10 }],
      Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'TRUE', default_assignee: 'kid', points: 3, recur_mode: 'recreate', last_generated_date: '2026-06-28' }],
      Assignments: [
        { assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-27', status: 'open', missed_count: 1 },
        { assignment_id: 'a2', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-28', status: 'open' },
      ],
    });
    ctx.runNightlyGenerator();
    const rows = read('Assignments');
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.assignment_id === 'a1').missed_count).toBe(1); // unchanged
    expect(rows.find((r) => r.assignment_id === 'a2').missed_count).toBe(1); // newly flagged
    expect(read('People')[0].points_total).toBe(7); // only one deduction (a2)
  });
});

describe('runNightlyGenerator — rotation (#24)', () => {
  afterEach(() => vi.useRealTimers());

  it('first occurrence of a rotating chore goes to the first person and stamps the pointer', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 0, 5, 0)); // 2026-06-28
    const { ctx, read } = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'TRUE', default_assignee: 'p_a,p_b,p_c' }],
    });
    ctx.runNightlyGenerator();
    expect(read('Assignments')[0].person_id).toBe('p_a');
    expect(read('Chores')[0].rotation_last).toBe('p_a');
  });

  it('advances by rotation_last, not the last assignment’s person (reassign-immune)', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 0, 5, 0)); // 2026-06-28
    const { ctx, read } = loadBackend({
      // Pointer says p_a was planned last; yesterday's row was manually reassigned
      // to p_z (off-list). The next occurrence must still follow p_a → p_b.
      Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'TRUE',
                 default_assignee: 'p_a,p_b,p_c', rotation_last: 'p_a', last_generated_date: '2026-06-27' }],
      Assignments: [{ assignment_id: 'y', chore_id: 'c1', due_date: '2026-06-27', status: 'done', person_id: 'p_z' }],
    });
    ctx.runNightlyGenerator();
    const fresh = read('Assignments').find((a) => a.due_date === '2026-06-28');
    expect(fresh.person_id).toBe('p_b');
    expect(read('Chores')[0].rotation_last).toBe('p_b');
  });
});

describe('runNightlyGenerator — lead time (#23)', () => {
  // NOTE: fake timers must be set BEFORE loadBackend — the Apps Script sandbox
  // captures the `Date` binding at load time.
  afterEach(() => vi.useRealTimers());

  it('surfaces a weekly chore early with its real (future) due date', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 6, 2, 0, 5, 0)); // Thu 2026-07-02
    const { ctx, read } = loadBackend({
      // Weekly Sunday (0), lead 4 → appears 3 days early (Thursday).
      Chores: [{ chore_id: 'c1', frequency: 'weekly', custom_days: '0', lead_days: 4, active: 'TRUE' }],
    });
    ctx.runNightlyGenerator();
    const rows = read('Assignments');
    expect(rows).toHaveLength(1);
    expect(rows[0].due_date).toBe('2026-07-05'); // the upcoming Sunday, not today
  });

  it('does not surface before the lead window opens', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 6, 1, 0, 5, 0)); // Wed 2026-07-01
    const { ctx, read } = loadBackend({
      // Sunday due, lead 4 → appears 2026-07-02; on 07-01 it's not time yet.
      Chores: [{ chore_id: 'c1', frequency: 'weekly', custom_days: '0', lead_days: 4, active: 'TRUE' }],
    });
    ctx.runNightlyGenerator();
    expect(read('Assignments')).toHaveLength(0);
  });

  it('default lead is 1 — a weekly chore appears on its due date', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 6, 2, 0, 5, 0)); // Thu 2026-07-02
    const { ctx, read } = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'weekly', custom_days: '0', active: 'TRUE' }], // no lead_days
    });
    ctx.runNightlyGenerator();
    expect(read('Assignments')).toHaveLength(0); // Sunday due, appears only on Sunday
  });

  it('monthly lead 7 appears the prior week', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 6, 9, 0, 5, 0)); // 2026-07-09
    const { ctx, read } = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'monthly', monthly_day: '15', lead_days: 7, active: 'TRUE' }],
    });
    ctx.runNightlyGenerator();
    expect(read('Assignments')[0].due_date).toBe('2026-07-15'); // appears 6 days early
  });

  it('future start_date surfaces within the lead window, not before (#9)', () => {
    // Interval 7 with lead 6 → 5 days early; first due 2026-07-15 → appears 07-10.
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 6, 9, 0, 5, 0)); // 07-09: not yet
    const before = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'interval', interval_days: '7', lead_days: 6, start_date: '2026-07-15', active: 'TRUE' }],
    });
    before.ctx.runNightlyGenerator();
    expect(before.read('Assignments')).toHaveLength(0);

    vi.setSystemTime(new Date(2026, 6, 10, 0, 5, 0)); // 07-10: window opens
    const inWindow = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'interval', interval_days: '7', lead_days: 6, start_date: '2026-07-15', active: 'TRUE' }],
    });
    inWindow.ctx.runNightlyGenerator();
    const rows = inWindow.read('Assignments');
    expect(rows).toHaveLength(1);
    expect(rows[0].due_date).toBe('2026-07-15'); // real due date, appears early
  });

  it('daily with a future start_date waits until that date (lead 1)', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 6, 4, 0, 5, 0)); // 07-04
    const early = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'daily', start_date: '2026-07-05', active: 'TRUE' }],
    });
    early.ctx.runNightlyGenerator();
    expect(early.read('Assignments')).toHaveLength(0);

    vi.setSystemTime(new Date(2026, 6, 5, 0, 5, 0)); // 07-05
    const onStart = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'daily', start_date: '2026-07-05', active: 'TRUE' }],
    });
    onStart.ctx.runNightlyGenerator();
    expect(onStart.read('Assignments')[0].due_date).toBe('2026-07-05');
  });
});

describe('runNightlyGenerator — missed-chore collapse + penalty (#21)', () => {
  // fake timers set before loadBackend (see note above)
  afterEach(() => vi.useRealTimers());

  it('daily: carries the open assignment over, bumps missed_count, deducts points once', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 29, 0, 5, 0)); // Mon 2026-06-29
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', points_total: 10 }],
      Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'TRUE', default_assignee: 'kid', points: 3, last_generated_date: '2026-06-28' }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-28', status: 'open' }],
    });
    ctx.runNightlyGenerator();
    const rows = read('Assignments');
    expect(rows).toHaveLength(1); // collapsed — no duplicate row
    expect(rows[0].assignment_id).toBe('a1');
    expect(rows[0].missed_count).toBe(1);
    expect(read('People')[0].points_total).toBe(7); // 10 − 3
    expect(read('Chores')[0].last_generated_date).toBe('2026-06-29');
  });

  it('a completed occurrence creates a fresh assignment (no penalty)', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 29, 0, 5, 0));
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', points_total: 10 }],
      Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'TRUE', default_assignee: 'kid', points: 3, last_generated_date: '2026-06-28' }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-28', status: 'done' }],
    });
    ctx.runNightlyGenerator();
    const rows = read('Assignments');
    expect(rows).toHaveLength(2); // fresh row for today
    expect(rows.some((r) => r.due_date === '2026-06-29' && r.status === 'open')).toBe(true);
    expect(read('People')[0].points_total).toBe(10); // no penalty
  });

  it('points never go negative on penalty; unassigned carry-over skips the deduction', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 29, 0, 5, 0));
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', points_total: 2 }],
      Chores: [
        { chore_id: 'c1', frequency: 'daily', active: 'TRUE', default_assignee: 'kid', points: 5, last_generated_date: '2026-06-28' },
        { chore_id: 'c2', frequency: 'daily', active: 'TRUE', points: 5, last_generated_date: '2026-06-28' },
      ],
      Assignments: [
        { assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-28', status: 'open' },
        { assignment_id: 'a2', chore_id: 'c2', person_id: '', due_date: '2026-06-28', status: 'open' },
      ],
    });
    ctx.runNightlyGenerator();
    expect(read('People')[0].points_total).toBe(0); // 2 − 5 clamped
    const a2 = read('Assignments').find((r) => r.assignment_id === 'a2');
    expect(a2.missed_count).toBe(1); // still carried over, just no points to deduct
  });

  it('weekly: penalizes once per recurrence, not every night', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 6, 1, 0, 5, 0)); // Wed 07-01, before loadBackend
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', points_total: 10 }],
      Chores: [{ chore_id: 'c1', frequency: 'weekly', custom_days: '0', lead_days: 4, active: 'TRUE', default_assignee: 'kid', points: 2, last_generated_date: '2026-06-28' }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-28', status: 'open' }],
    });

    // Wed 07-01: next Sunday is 07-05, appears 07-02 → nothing yet.
    ctx.runNightlyGenerator();
    expect(read('People')[0].points_total).toBe(10);
    expect(read('Assignments').find((r) => r.assignment_id === 'a1').missed_count || 0).toBe(0);

    // Thu 07-02: recurrence appears while a1 still open → penalty once.
    vi.setSystemTime(new Date(2026, 6, 2, 0, 5, 0));
    ctx.runNightlyGenerator();
    expect(read('People')[0].points_total).toBe(8);
    expect(read('Assignments').find((r) => r.assignment_id === 'a1').missed_count).toBe(1);

    // Fri 07-03: still the same period → no further penalty.
    vi.setSystemTime(new Date(2026, 6, 3, 0, 5, 0));
    ctx.runNightlyGenerator();
    expect(read('People')[0].points_total).toBe(8);
    expect(read('Assignments')).toHaveLength(1); // never duplicated
  });

  it('short interval (default lead 1) hides after completion and penalizes after a full interval', () => {
    // "every 3 days" — no lead_days → lead 1 → appears on the due date. Done 07-06.
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 6, 7, 0, 5, 0)); // 07-07, before loadBackend
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', points_total: 10 }],
      Chores: [{ chore_id: 'c1', frequency: 'interval', interval_days: '3', active: 'TRUE', default_assignee: 'kid', points: 2, last_generated_date: '2026-07-06' }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', due_date: '2026-07-06', status: 'done' }],
    });

    // 07-07 & 07-08: next due 07-09 appears only on 07-09 → nothing yet (no reappear-next-day).
    ctx.runNightlyGenerator();
    expect(read('Assignments')).toHaveLength(1);
    vi.setSystemTime(new Date(2026, 6, 8, 0, 5, 0));
    ctx.runNightlyGenerator();
    expect(read('Assignments')).toHaveLength(1);

    // 07-09: the next occurrence is due → a fresh assignment appears.
    vi.setSystemTime(new Date(2026, 6, 9, 0, 5, 0));
    ctx.runNightlyGenerator();
    const rows = read('Assignments');
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.due_date === '2026-07-09' && r.status === 'open')).toBe(true);
    expect(read('People')[0].points_total).toBe(10); // no penalty (previous was done)
  });
});

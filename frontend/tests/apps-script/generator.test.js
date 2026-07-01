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

describe('runNightlyGenerator — lead time (#23)', () => {
  // NOTE: fake timers must be set BEFORE loadBackend — the Apps Script sandbox
  // captures the `Date` binding at load time.
  afterEach(() => vi.useRealTimers());

  it('surfaces a weekly chore early with its real (future) due date', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 6, 2, 0, 5, 0)); // Thu 2026-07-02
    const { ctx, read } = loadBackend({
      // Weekly Sunday (0), default lead 4 → appears 3 days early (Thursday).
      Chores: [{ chore_id: 'c1', frequency: 'weekly', custom_days: '0', active: 'TRUE' }],
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
      Chores: [{ chore_id: 'c1', frequency: 'weekly', custom_days: '0', active: 'TRUE' }],
    });
    ctx.runNightlyGenerator();
    expect(read('Assignments')).toHaveLength(0);
  });

  it('monthly lead 7 appears the prior week', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 6, 9, 0, 5, 0)); // 2026-07-09
    const { ctx, read } = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'monthly', monthly_day: '15', active: 'TRUE' }],
    });
    ctx.runNightlyGenerator();
    expect(read('Assignments')[0].due_date).toBe('2026-07-15'); // appears 6 days early
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
      Chores: [{ chore_id: 'c1', frequency: 'weekly', custom_days: '0', active: 'TRUE', default_assignee: 'kid', points: 2, last_generated_date: '2026-06-28' }],
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
});

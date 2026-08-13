import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadBackend } from './harness.js';

// The generator now represents a chore with exactly ONE live occurrence, which
// rolls forward on schedule: at the regeneration date the current occurrence is
// CLOSED (as `skipped`, with the points deducted and recorded as a negative
// `points_awarded`) and replaced by a fresh one carrying missed_count + 1.
// Replaces the v1.3.0 rollover collapse and the v1.7.0 recur_mode recreate stack.

describe('runNightlyGenerator basics', () => {
  afterEach(() => vi.useRealTimers());

  const at = (y, m, d) => { vi.useFakeTimers(); vi.setSystemTime(new Date(y, m - 1, d, 0, 5, 0)); };

  it('creates an assignment for a due active chore', () => {
    at(2026, 6, 28);
    const { ctx, read } = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'TRUE' }],
    });
    ctx.runNightlyGenerator();
    const rows = read('Assignments');
    expect(rows).toHaveLength(1);
    expect(rows[0].due_date).toBe('2026-06-28');
    expect(rows[0].assigned_by).toBe('auto');
  });

  it('skips inactive chores and does not duplicate an existing occurrence', () => {
    at(2026, 6, 28);
    const { ctx, read } = loadBackend({
      Chores: [
        { chore_id: 'c1', frequency: 'daily', active: 'TRUE' },
        { chore_id: 'c2', frequency: 'daily', active: 'FALSE' },
      ],
      Assignments: [{ assignment_id: 'pre', chore_id: 'c1', due_date: '2026-06-28', status: 'open' }],
    });
    ctx.runNightlyGenerator();
    expect(read('Assignments')).toHaveLength(1);
  });

  it('one-time chore auto-archives and stamps the anchor', () => {
    at(2026, 6, 28);
    const { ctx, read } = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'once', once_date: '2026-06-28', active: 'TRUE' }],
    });
    ctx.runNightlyGenerator();
    expect(read('Assignments')).toHaveLength(1);
    expect(read('Chores')[0].active).toBe(false);
    expect(read('Chores')[0].last_generated_date).toBe('2026-06-28');
  });

  it('notifies when the chore has a default assignee', () => {
    at(2026, 6, 28);
    const { ctx, notifications } = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'TRUE', default_assignee: 'kid' }],
    });
    ctx.runNightlyGenerator();
    expect(notifications.some((n) => n[0] === 'assign')).toBe(true);
  });
});

describe('roll-forward: closing a missed occurrence', () => {
  afterEach(() => vi.useRealTimers());

  const daily = (extra = {}) => ({
    People: [{ person_id: 'kid', points_total: 10 }],
    Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'TRUE', default_assignee: 'kid',
               points: 3, last_generated_date: '2026-06-27' }],
    Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-27',
                    status: 'open', assigned_by: 'auto', ...extra }],
  });

  it('closes the prior, deducts points, and carries missed_count + 1', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 0, 5, 0));
    const { ctx, read } = loadBackend(daily());
    ctx.runNightlyGenerator();

    const rows = read('Assignments');
    const prior = rows.find((r) => r.assignment_id === 'a1');
    expect(prior.status).toBe('skipped');
    expect(prior.points_awarded).toBe(-3);          // the sign marks it a miss, not an excusal
    expect(read('People')[0].points_total).toBe(7);

    const fresh = rows.find((r) => r.assignment_id !== 'a1');
    expect(fresh.due_date).toBe('2026-06-28');      // never left frozen in the past
    expect(fresh.missed_count).toBe(1);
    expect(fresh.status).toBe('open');
  });

  it('accumulates the miss streak across consecutive misses', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 0, 5, 0));
    const { ctx, read } = loadBackend(daily({ missed_count: 2 }));
    ctx.runNightlyGenerator();
    const fresh = read('Assignments').find((r) => r.assignment_id !== 'a1');
    expect(fresh.missed_count).toBe(3);
  });

  it('costs nobody points when the occurrence was unclaimed, but still counts', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 0, 5, 0));
    const fixture = daily();
    fixture.Assignments[0].person_id = '';
    fixture.Chores[0].default_assignee = '';
    const { ctx, read } = loadBackend(fixture);
    ctx.runNightlyGenerator();

    const rows = read('Assignments');
    expect(rows.find((r) => r.assignment_id === 'a1').status).toBe('skipped');
    expect(rows.find((r) => r.assignment_id === 'a1').points_awarded).toBe('');
    expect(read('People')[0].points_total).toBe(10); // untouched
    expect(rows.find((r) => r.assignment_id !== 'a1').missed_count).toBe(1);
  });

  it('resets the streak to zero after a completion', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 0, 5, 0));
    const { ctx, read } = loadBackend(daily({ status: 'done', missed_count: 4 }));
    ctx.runNightlyGenerator();
    const fresh = read('Assignments').find((r) => r.assignment_id !== 'a1');
    expect(fresh.missed_count).toBe('');            // blank === 0
    expect(read('People')[0].points_total).toBe(10); // nothing deducted
  });

  it('counts an admin skip toward the streak without deducting points', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 0, 5, 0));
    const { ctx, read } = loadBackend(daily({ status: 'skipped', missed_count: 2 }));
    ctx.runNightlyGenerator();
    expect(read('Assignments').find((r) => r.assignment_id !== 'a1').missed_count).toBe(3);
    expect(read('People')[0].points_total).toBe(10);
  });

  it('leaves a pending_review prior alone and creates the next alongside it', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 0, 5, 0));
    const { ctx, read } = loadBackend(daily({ status: 'pending_review', missed_count: 2 }));
    ctx.runNightlyGenerator();

    const rows = read('Assignments');
    const prior = rows.find((r) => r.assignment_id === 'a1');
    expect(prior.status).toBe('pending_review');    // the work was done; nothing to penalize
    expect(read('People')[0].points_total).toBe(10);
    // Carried unchanged, not incremented — the pending work may yet be accepted.
    expect(rows.find((r) => r.assignment_id !== 'a1').missed_count).toBe(2);
  });

  it('ignores manual one-offs entirely', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 0, 5, 0));
    const fixture = daily();
    fixture.Assignments[0].assigned_by = 'manual';
    const { ctx, read } = loadBackend(fixture);
    ctx.runNightlyGenerator();

    const rows = read('Assignments');
    // Never closed, never penalized, never counted.
    expect(rows.find((r) => r.assignment_id === 'a1').status).toBe('open');
    expect(read('People')[0].points_total).toBe(10);
    expect(rows.find((r) => r.assignment_id !== 'a1').missed_count).toBe('');
  });
});

describe('vacation generates unclaimed rather than pausing', () => {
  afterEach(() => vi.useRealTimers());

  it('routes a sole vacationer\'s chore to unclaimed, costing nobody points', () => {
    // Replaces the #34 pause guard: the occurrence is created, so the family can
    // pick it up, and being unclaimed is what protects the vacationer.
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 0, 5, 0));
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', points_total: 10, on_vacation: 'TRUE' }],
      Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'TRUE', default_assignee: 'kid', points: 3 }],
    });
    ctx.runNightlyGenerator();

    const rows = read('Assignments');
    expect(rows).toHaveLength(1);
    expect(rows[0].person_id).toBe('');
    expect(rows[0].due_date).toBe('2026-06-28');
    expect(read('People')[0].points_total).toBe(10);
  });
});

describe('resolveRotationAssignee (#24)', () => {
  const r = (chore, people) => {
    const { ctx } = loadBackend();
    return ctx.resolveRotationAssignee(chore, people || []);
  };
  it('empty list → unassigned', () => expect(r({ default_assignee: '' })).toBe(''));
  it('single person → that person', () =>
    expect(r({ default_assignee: 'p_a', rotation_last: 'p_a' })).toBe('p_a'));
  it('no prior pointer → first in line', () =>
    expect(r({ default_assignee: 'p_a,p_b,p_c' })).toBe('p_a'));
  it('advances past the pointer, wrapping', () => {
    expect(r({ default_assignee: 'p_a,p_b,p_c', rotation_last: 'p_a' })).toBe('p_b');
    expect(r({ default_assignee: 'p_a,p_b,p_c', rotation_last: 'p_c' })).toBe('p_a');
  });
  it('steps past someone on vacation', () =>
    expect(r({ default_assignee: 'p_a,p_b', rotation_last: 'p_a' },
             [{ person_id: 'p_b', on_vacation: 'TRUE' }])).toBe('p_a'));
  it('all on vacation → unclaimed', () =>
    expect(r({ default_assignee: 'p_a,p_b', rotation_last: 'p_a' },
             [{ person_id: 'p_a', on_vacation: 'TRUE' }, { person_id: 'p_b', on_vacation: 'TRUE' }])).toBe(''));
});

describe('stale schedule cursor (last_generated_date)', () => {
  afterEach(() => vi.useRealTimers());

  it('reactivating a long-dormant chore generates for today, not its frozen cursor', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 10, 0, 5, 0)); // Mon 2026-08-10
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', points_total: 50 }],
      Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'FALSE', default_assignee: 'kid',
                 points: 3, last_generated_date: '2026-02-01' }],
    });

    ctx.runNightlyGenerator();
    expect(read('Assignments')).toHaveLength(0);

    ctx.updateRow('Chores', 'chore_id', 'c1', { active: 'TRUE' });
    ctx.invalidateCache('Chores');
    ctx.runNightlyGenerator();

    const rows = read('Assignments');
    expect(rows).toHaveLength(1);
    expect(rows[0].due_date).toBe('2026-08-10');    // not 2026-02-02
    expect(read('People')[0].points_total).toBe(50); // no penalty for dormant months
  });

  it('weekly: a stranded cursor resumes on the next scheduled weekday', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 10, 0, 5, 0)); // Monday
    const { ctx, read } = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'weekly', custom_days: '0', active: 'TRUE',
                 points: 2, last_generated_date: '2026-06-01' }],
    });
    ctx.runNightlyGenerator();
    expect(read('Assignments')).toHaveLength(0);    // next Sunday, not visible yet at lead 1

    vi.setSystemTime(new Date(2026, 7, 16, 0, 5, 0)); // Sunday
    ctx.runNightlyGenerator();
    expect(read('Assignments').map((a) => a.due_date)).toEqual(['2026-08-16']);
  });
});

describe('sortPeriodDays (#38 cadence grouping)', () => {
  const { ctx } = loadBackend();
  it('daily is 1', () => expect(ctx.sortPeriodDays({ frequency: 'daily' })).toBe(1));
  it('weekly is 7', () => expect(ctx.sortPeriodDays({ frequency: 'weekly' })).toBe(7));
  it('monthly is 28', () => expect(ctx.sortPeriodDays({ frequency: 'monthly' })).toBe(28));
  it('interval uses interval_days', () =>
    expect(ctx.sortPeriodDays({ frequency: 'interval', interval_days: '90' })).toBe(90));
  it('custom reflects its real cadence, so M/W/F outranks weekly', () => {
    const mwf = ctx.sortPeriodDays({ frequency: 'custom', custom_days: 'monday,wednesday,friday' });
    expect(mwf).toBeCloseTo(7 / 3);
    expect(mwf).toBeLessThan(ctx.sortPeriodDays({ frequency: 'weekly' }));
  });
  it('does not disturb recurrencePeriodDays, which feeds the lead clamp', () =>
    expect(ctx.recurrencePeriodDays({ frequency: 'custom', custom_days: 'monday,wednesday,friday' })).toBe(7));
});

describe('cursor reconciliation (#41)', () => {
  afterEach(() => vi.useRealTimers());

  it('recovers a chore stranded by the old rollover collapse', () => {
    // The pre-v1.9 collapse advanced last_generated_date while leaving the
    // assignment where it was. The new generator then computed a next occurrence
    // that hadn't come round yet, did nothing, and left the row permanently
    // overdue — it never regenerated at all.
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 13, 0, 5, 0)); // 2026-08-13
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', points_total: 10 }],
      Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'TRUE', default_assignee: 'kid',
                 points: 3, last_generated_date: '2026-08-13' }],   // cursor AHEAD of the row
      Assignments: [{ assignment_id: 'stuck', chore_id: 'c1', person_id: 'kid',
                      due_date: '2026-08-12', status: 'open', assigned_by: 'auto', missed_count: 1 }],
    });

    ctx.runNightlyGenerator();

    const rows = read('Assignments');
    expect(rows.find((a) => a.assignment_id === 'stuck').status).toBe('skipped');
    const fresh = rows.find((a) => a.assignment_id !== 'stuck');
    expect(fresh.due_date).toBe('2026-08-13');   // caught up on the very next run
    expect(fresh.missed_count).toBe(2);
    expect(read('People')[0].points_total).toBe(7);
  });

  it('recovers a chore whose occurrences the old vacation pause consumed', () => {
    // The pause advanced the cursor without creating any row, so days of
    // occurrences simply never existed and there was nothing to hand back.
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 13, 0, 5, 0));
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'claire', points_total: 0 }],  // vacation now over
      Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'TRUE', default_assignee: 'claire',
                 points: 2, last_generated_date: '2026-08-12' }],
      Assignments: [{ assignment_id: 'old', chore_id: 'c1', person_id: 'claire',
                      due_date: '2026-08-04', status: 'done', assigned_by: 'auto' }],
    });

    ctx.runNightlyGenerator();

    const fresh = read('Assignments').find((a) => a.assignment_id !== 'old');
    expect(fresh.due_date).toBe('2026-08-13');
    expect(fresh.person_id).toBe('claire');      // back on her list
    expect(fresh.missed_count).toBe('');         // the paused days aren't held against her
  });

  it('leaves a chore with no assignments alone, so blanking the cursor still rebuilds', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 13, 0, 5, 0));
    const { ctx, read } = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'TRUE', last_generated_date: '2026-08-20' }],
    });
    ctx.runNightlyGenerator();
    // Cursor is in the future and there's nothing to reconcile against, so the
    // chore correctly waits rather than being wound back.
    expect(read('Assignments')).toHaveLength(0);
    expect(read('Chores')[0].last_generated_date).toBe('2026-08-20');
  });

  it('does not touch a cursor that already matches the newest occurrence', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 13, 0, 5, 0));
    const { ctx, read } = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'TRUE', last_generated_date: '2026-08-13' }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', due_date: '2026-08-13',
                      status: 'open', assigned_by: 'auto' }],
    });
    ctx.runNightlyGenerator();
    expect(read('Assignments')).toHaveLength(1);   // steady state: nothing happens
    expect(read('Chores')[0].last_generated_date).toBe('2026-08-13');
  });
});

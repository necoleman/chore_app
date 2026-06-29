import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadBackend } from './harness.js';

describe('actionToday', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 12, 0, 0)); });
  afterEach(() => vi.useRealTimers());

  it('keeps overdue/today unfinished + today-finished, drops old finished; joins chore', () => {
    const { ctx } = loadBackend({
      People: [{ person_id: 'me', name: 'Me' }],
      Chores: [{ chore_id: 'c1', name: 'Dishes', points: 3 }],
      Assignments: [
        { assignment_id: 'today', chore_id: 'c1', person_id: 'me', due_date: '2026-06-28', status: 'open' },
        { assignment_id: 'overdue', chore_id: 'c1', person_id: 'me', due_date: '2026-06-25', status: 'open' },
        { assignment_id: 'doneToday', chore_id: 'c1', person_id: 'me', due_date: '2026-06-28', status: 'done' },
        { assignment_id: 'doneOld', chore_id: 'c1', person_id: 'me', due_date: '2026-06-20', status: 'done' },
      ],
    });
    const ids = ctx.actionToday({}).assignments.map((a) => a.assignment_id);
    expect(ids).toEqual(expect.arrayContaining(['today', 'overdue', 'doneToday']));
    expect(ids).not.toContain('doneOld');
    const t = ctx.actionToday({}).assignments.find((a) => a.assignment_id === 'today');
    expect(t.chore_name).toBe('Dishes');
  });
});

describe('actionComplete', () => {
  it('non-admin + requires approval → pending_review (clears stale review fields)', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', is_admin: 'FALSE' }],
      Chores: [{ chore_id: 'c1', requires_approval: 'TRUE', points: 5 }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', status: 'open', review_note: 'old', reviewed_by: 'dad' }],
    });
    const res = ctx.actionComplete({ assignment_id: 'a1', person_id: 'kid' });
    expect(res.status).toBe('pending_review');
    const row = read('Assignments')[0];
    expect(row.status).toBe('pending_review');
    expect(row.review_note).toBe('');
    expect(row.reviewed_by).toBe('');
  });

  it('admin / no approval → done + points awarded to person', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', is_admin: 'FALSE', points_total: 10 }],
      Chores: [{ chore_id: 'c1', requires_approval: 'FALSE', points: 5 }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', status: 'open' }],
    });
    const res = ctx.actionComplete({ assignment_id: 'a1', person_id: 'kid' });
    expect(res.status).toBe('done');
    expect(read('Assignments')[0].points_awarded).toBe(5);
    expect(read('People')[0].points_total).toBe(15);
  });

  it('throws when the assignment is not open', () => {
    const { ctx } = loadBackend({
      People: [{ person_id: 'kid' }],
      Chores: [{ chore_id: 'c1' }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', status: 'done' }],
    });
    expect(() => ctx.actionComplete({ assignment_id: 'a1', person_id: 'kid' })).toThrow(/not open/);
  });
});

describe('actionApprove / actionReject', () => {
  it('approve marks done, records reviewer, awards points', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', points_total: 0 }, { person_id: 'dad', is_admin: 'TRUE' }],
      Chores: [{ chore_id: 'c1', points: 4 }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', status: 'pending_review' }],
    });
    ctx.actionApprove({ assignment_id: 'a1', admin_person_id: 'dad' });
    const row = read('Assignments')[0];
    expect(row.status).toBe('done');
    expect(row.reviewed_by).toBe('dad');
    expect(read('People').find((p) => p.person_id === 'kid').points_total).toBe(4);
  });

  it('reject reopens with the note (status open, not "rejected")', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'dad' }],
      Chores: [{ chore_id: 'c1' }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', status: 'pending_review' }],
    });
    ctx.actionReject({ assignment_id: 'a1', admin_person_id: 'dad', review_note: 'redo it' });
    const row = read('Assignments')[0];
    expect(row.status).toBe('open');
    expect(row.review_note).toBe('redo it');
    expect(row.reviewed_by).toBe('dad');
  });
});

describe('actionUncomplete', () => {
  it('done (no reviewer) → open and subtracts the awarded points', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', points_total: 8 }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', status: 'done', points_awarded: 5 }],
    });
    ctx.actionUncomplete({ assignment_id: 'a1' });
    const row = read('Assignments')[0];
    expect(row.status).toBe('open');
    expect(row.points_awarded).toBe('');
    expect(read('People')[0].points_total).toBe(3);
  });

  it('pending_review → open (no points change)', () => {
    const { ctx, read } = loadBackend({
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', status: 'pending_review' }],
    });
    ctx.actionUncomplete({ assignment_id: 'a1' });
    expect(read('Assignments')[0].status).toBe('open');
  });

  it('blocks unchecking an approved chore', () => {
    const { ctx } = loadBackend({
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', status: 'done', reviewed_by: 'dad', points_awarded: 5 }],
    });
    expect(() => ctx.actionUncomplete({ assignment_id: 'a1' })).toThrow(/Approved/);
  });

  it('points never go negative (clamped at 0)', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', points_total: 2 }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', status: 'done', points_awarded: 10 }],
    });
    ctx.actionUncomplete({ assignment_id: 'a1' });
    expect(read('People')[0].points_total).toBe(0);
  });
});

describe('actionClaim', () => {
  it('writes the person and marks assigned_by manual', () => {
    const { ctx, read } = loadBackend({
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: '', status: 'open' }],
    });
    ctx.actionClaim({ assignment_id: 'a1', person_id: 'me' });
    const row = read('Assignments')[0];
    expect(row.person_id).toBe('me');
    expect(row.assigned_by).toBe('manual');
  });

  it('throws on missing person_id or unknown assignment (no silent success)', () => {
    const { ctx } = loadBackend({ Assignments: [{ assignment_id: 'a1', chore_id: 'c1', status: 'open' }] });
    expect(() => ctx.actionClaim({ assignment_id: 'a1' })).toThrow(/person_id/);
    expect(() => ctx.actionClaim({ assignment_id: 'nope', person_id: 'me' })).toThrow(/not found/);
  });
});

describe('add/update chore start_date', () => {
  it('actionAddChore persists start_date', () => {
    const { ctx, read } = loadBackend();
    ctx.actionAddChore({ name: 'Paint fence', frequency: 'interval', interval_days: '30', start_date: '2026-07-15' });
    expect(read('Chores')[0].start_date).toBe('2026-07-15');
  });

  it('actionUpdateChore can change start_date', () => {
    const { ctx, read } = loadBackend({ Chores: [{ chore_id: 'c1', name: 'X', start_date: '' }] });
    ctx.actionUpdateChore({ chore_id: 'c1', start_date: '2026-08-01' });
    expect(read('Chores')[0].start_date).toBe('2026-08-01');
  });
});

describe('incrementPoints', () => {
  it('clamps the total at zero on subtraction', () => {
    const { ctx, read } = loadBackend({ People: [{ person_id: 'p', points_total: 2 }] });
    ctx.incrementPoints('p', -10, ctx.getRows('People'));
    expect(read('People')[0].points_total).toBe(0);
  });
});

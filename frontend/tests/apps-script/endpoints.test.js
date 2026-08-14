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

  it('keeps an overdue chore completed today, drops one completed earlier (#14)', () => {
    const { ctx } = loadBackend({
      Chores: [{ chore_id: 'c1', name: 'Dishes' }],
      Assignments: [
        { assignment_id: 'od-done-today', chore_id: 'c1', due_date: '2026-06-20', status: 'done', completed_at: '2026-06-28T09:00:00Z' },
        { assignment_id: 'od-done-earlier', chore_id: 'c1', due_date: '2026-06-20', status: 'done', completed_at: '2026-06-27T09:00:00Z' },
      ],
    });
    const ids = ctx.actionToday({}).assignments.map((a) => a.assignment_id);
    expect(ids).toEqual(['od-done-today']);
  });

  it('includes the chore frequency for color-coding (#18)', () => {
    const { ctx } = loadBackend({
      Chores: [{ chore_id: 'c1', name: 'Dishes', frequency: 'daily' }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', due_date: '2026-06-28', status: 'open' }],
    });
    expect(ctx.actionToday({}).assignments[0].frequency).toBe('daily');
  });

  it('skips "ghost" assignments whose chore no longer exists (#11)', () => {
    const { ctx } = loadBackend({
      Chores: [{ chore_id: 'c1', name: 'Dishes', frequency: 'daily' }],
      Assignments: [
        { assignment_id: 'a1', chore_id: 'c1', due_date: '2026-06-28', status: 'open' },
        { assignment_id: 'ghost', chore_id: 'deleted', due_date: '2026-06-28', status: 'open' },
      ],
    });
    const ids = ctx.actionToday({}).assignments.map((a) => a.assignment_id);
    expect(ids).toEqual(['a1']); // ghost referencing a deleted chore is dropped
  });

  it('includes lead_days (chore) and missed_count (assignment) in the payload', () => {
    const { ctx } = loadBackend({
      Chores: [{ chore_id: 'c1', name: 'Sweep', frequency: 'weekly', lead_days: 4 }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', due_date: '2026-06-28', status: 'open', missed_count: 2 }],
    });
    const row = ctx.actionToday({}).assignments[0];
    expect(row.lead_days).toBe(4);
    expect(row.missed_count).toBe(2);
  });
});

describe('actionChores last_done (#9)', () => {
  it('attaches the most recent done completion per chore', () => {
    const { ctx } = loadBackend({
      Chores: [{ chore_id: 'c1', name: 'Vacuum' }, { chore_id: 'c2', name: 'Trash' }],
      Assignments: [
        { assignment_id: 'a1', chore_id: 'c1', status: 'done', completed_at: '2026-06-20T10:00:00Z' },
        { assignment_id: 'a2', chore_id: 'c1', status: 'done', completed_at: '2026-06-24T10:00:00Z' },
        { assignment_id: 'a3', chore_id: 'c1', status: 'open' },
      ],
    });
    const chores = ctx.actionChores({}).chores;
    expect(chores.find((c) => c.chore_id === 'c1').last_done).toBe('2026-06-24T10:00:00Z');
    expect(chores.find((c) => c.chore_id === 'c2').last_done).toBe('');
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

  // #31/#32: completed_at must carry the script-LOCAL date, not a UTC one, so the
  // Today filter's "completed today" test (completed_at.slice(0,10) === today)
  // matches on the day of completion instead of lingering an extra day.
  it('stamps completed_at with the local date (nowIso is not UTC)', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 21, 30, 0)); // evening
    try {
      const { ctx, read } = loadBackend({
        People: [{ person_id: 'kid', is_admin: 'FALSE', points_total: 0 }],
        Chores: [{ chore_id: 'c1', requires_approval: 'FALSE', points: 1 }],
        Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', status: 'open' }],
      });
      ctx.actionComplete({ assignment_id: 'a1', person_id: 'kid' });
      expect(read('Assignments')[0].completed_at.slice(0, 10)).toBe(ctx.todayStr());
      expect(ctx.nowIso().slice(0, 10)).toBe(ctx.todayStr());
    } finally {
      vi.useRealTimers();
    }
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

  it('rejecting a superseded occurrence closes it as missed and bumps the live one (#38)', () => {
    // Replaces the #25 reconciliation, which reopened the old row and DELETED the
    // new one. A rejection must land exactly as if the chore was never done: the
    // stale occurrence closes with the points deducted, and today's stands.
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'dad' }, { person_id: 'kid', points_total: 10 }],
      Chores: [{ chore_id: 'c1', frequency: 'daily', points: 3 }],
      Assignments: [
        { assignment_id: 'yday', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-27',
          status: 'pending_review', assigned_by: 'auto' },
        { assignment_id: 'today', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-28',
          status: 'open', assigned_by: 'auto', missed_count: 1 },
      ],
    });
    ctx.actionReject({ assignment_id: 'yday', admin_person_id: 'dad', review_note: 'redo' });

    const rows = read('Assignments');
    const yday = rows.find((a) => a.assignment_id === 'yday');
    expect(yday.status).toBe('skipped');       // not reopened — that day is gone
    expect(yday.points_awarded).toBe(-3);
    expect(read('People').find((p) => p.person_id === 'kid').points_total).toBe(7);

    const today = rows.find((a) => a.assignment_id === 'today');
    expect(today.status).toBe('open');         // the fresh occurrence survives
    expect(today.missed_count).toBe(2);
    expect(today.review_note).toBe('redo');    // feedback follows onto the live card
  });

  it('rejecting an occurrence with nothing newer simply reopens it', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'dad' }, { person_id: 'kid', points_total: 10 }],
      Chores: [{ chore_id: 'c1', frequency: 'daily', points: 3 }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-28',
                      status: 'pending_review', assigned_by: 'auto' }],
    });
    ctx.actionReject({ assignment_id: 'a1', admin_person_id: 'dad', review_note: 'redo' });
    const row = read('Assignments')[0];
    expect(row.status).toBe('open');           // still doable today
    expect(read('People').find((p) => p.person_id === 'kid').points_total).toBe(10);
  });

  it('approving a superseded occurrence clears the live miss count (#38)', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'dad' }, { person_id: 'kid', points_total: 0 }],
      Chores: [{ chore_id: 'c1', frequency: 'daily', points: 3 }],
      Assignments: [
        { assignment_id: 'yday', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-27',
          status: 'pending_review', assigned_by: 'auto' },
        { assignment_id: 'today', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-28',
          status: 'open', assigned_by: 'auto', missed_count: 3 },
      ],
    });
    ctx.actionApprove({ assignment_id: 'yday', admin_person_id: 'dad' });
    // The work WAS done, so the streak of misses since the last completion is 0.
    expect(read('Assignments').find((a) => a.assignment_id === 'today').missed_count).toBe('');
    expect(read('People').find((p) => p.person_id === 'kid').points_total).toBe(3);
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
  it('writes the person and re-dates to today, keeping the miss count (#38)', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 12, 0, 0));
    const { ctx, read } = loadBackend({
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: '', due_date: '2026-06-20',
                      status: 'open', assigned_by: 'auto', missed_count: 3 }],
    });
    ctx.actionClaim({ assignment_id: 'a1', person_id: 'me' });
    const row = read('Assignments')[0];
    expect(row.person_id).toBe('me');
    // Taking ownership starts the clock — nobody inherits someone else's lateness.
    expect(row.due_date).toBe('2026-06-28');
    // ...but the record of neglect survives.
    expect(row.missed_count).toBe(3);
    // assigned_by is untouched: it marks manual one-offs now, and claiming an
    // auto occurrence must not reclassify it as one.
    expect(row.assigned_by).toBe('auto');
    vi.useRealTimers();
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

  it('re-anchors an interval chore\'s open assignment when start_date changes (#12)', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 12, 0, 0));
    const { ctx, read } = loadBackend({
      Chores: [{ chore_id: 'c1', name: 'Filter', frequency: 'interval', interval_days: '90',
                 start_date: '2026-06-28', last_generated_date: '2026-06-28', active: true }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'me',
                      due_date: '2026-06-28', status: 'open', assigned_by: 'auto' }],
    });
    ctx.actionUpdateChore({ chore_id: 'c1', frequency: 'interval', start_date: '2026-07-10' });
    const assignments = read('Assignments');
    expect(assignments.length).toBe(1); // moved, not duplicated
    expect(assignments[0].due_date).toBe('2026-07-10');
    expect(read('Chores')[0].last_generated_date).toBe('2026-07-10');
    vi.useRealTimers();
  });

  it('does NOT re-anchor once the interval chore has activity (#12 guard)', () => {
    const { ctx, read } = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'interval', interval_days: '30',
                 start_date: '2026-06-28', last_generated_date: '2026-07-28', active: 'FALSE' }],
      Assignments: [
        { assignment_id: 'a1', chore_id: 'c1', due_date: '2026-06-28', status: 'done', assigned_by: 'auto' },
        { assignment_id: 'a2', chore_id: 'c1', due_date: '2026-07-28', status: 'open', assigned_by: 'auto' },
      ],
    });
    ctx.actionUpdateChore({ chore_id: 'c1', frequency: 'interval', start_date: '2026-08-01' });
    expect(read('Assignments').map((a) => a.due_date)).toEqual(['2026-06-28', '2026-07-28']);
  });

  it('actionAddChore persists monthly nth-weekday fields (#16)', () => {
    const { ctx, read } = loadBackend();
    ctx.actionAddChore({ name: 'Mop', frequency: 'monthly', monthly_week: 2, weekday_due: '5' });
    const row = read('Chores')[0];
    expect(row.monthly_week).toBe(2);
    expect(row.weekday_due).toBe('5');
  });

  it('lead_days round-trips through add and update (#23 groundwork)', () => {
    const { ctx, read } = loadBackend();
    ctx.actionAddChore({ name: 'Sweep', frequency: 'weekly', weekday_due: '0', lead_days: 4 });
    expect(read('Chores')[0].lead_days).toBe(4);
    const choreId = read('Chores')[0].chore_id;
    ctx.actionUpdateChore({ chore_id: choreId, lead_days: 2 });
    expect(read('Chores')[0].lead_days).toBe(2);
  });
});

describe('generate-on-create (#17)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 12, 0, 0)); });
  afterEach(() => vi.useRealTimers());

  it('actionAddChore generates today’s assignment when the chore is due today', () => {
    const { ctx, read } = loadBackend();
    ctx.actionAddChore({ name: 'Dishes', frequency: 'daily', default_assignee: 'me' });
    const rows = read('Assignments');
    expect(rows.length).toBe(1);
    expect(rows[0].due_date).toBe('2026-06-28');
    expect(rows[0].status).toBe('open');
  });

  it('actionAddChore does NOT generate when not yet in the lead window', () => {
    const { ctx, read } = loadBackend();
    // Weekly Wednesday (3), lead_days 1 (no early window); 2026-06-28 is Sunday,
    // next Wednesday is 2026-07-01 → appears only on its due date → not yet.
    ctx.actionAddChore({ name: 'Laundry', frequency: 'weekly', weekday_due: '3', lead_days: 1 });
    expect(read('Assignments').length).toBe(0);
  });

  it('actionAddChore surfaces a weekly chore early within its lead window (#23)', () => {
    const { ctx, read } = loadBackend();
    // Weekly Wednesday (3) with lead_days 4 → appears 3 days early. From Sunday
    // 2026-06-28, next Wednesday 2026-07-01 is within the window → created now,
    // but with the real (future) due date.
    ctx.actionAddChore({ name: 'Laundry', frequency: 'weekly', weekday_due: '3', lead_days: 4 });
    const rows = read('Assignments');
    expect(rows.length).toBe(1);
    expect(rows[0].due_date).toBe('2026-07-01');
    expect(rows[0].status).toBe('open');
  });

  it('quick-add (once + today) generates an assignment for the creator and archives the chore (#19)', () => {
    const { ctx, read } = loadBackend();
    ctx.actionAddChore({
      name: 'Water plants', frequency: 'once', once_date: '2026-06-28',
      default_assignee: 'me', points: 1, requires_approval: false, active: true,
    });
    const assignments = read('Assignments');
    expect(assignments.length).toBe(1);
    expect(assignments[0].person_id).toBe('me');
    expect(assignments[0].due_date).toBe('2026-06-28');
    expect(assignments[0].status).toBe('open');
    // One-time chore auto-archives so it lands in Manage Chores → Inactive.
    const chore = read('Chores')[0];
    expect(chore.active).toBe(false);
    expect(chore.last_generated_date).toBe('2026-06-28');
  });
});

describe('actionRegisterToken', () => {
  it('saves the token and reports its length', () => {
    const { ctx, read } = loadBackend({ People: [{ person_id: 'me', name: 'Me' }] });
    const res = ctx.actionRegisterToken({ person_id: 'me', fcm_token: 'abc123' });
    expect(res.success).toBe(true);
    expect(res.token_length).toBe(6);
    expect(read('People')[0].fcm_token).toBe('abc123');
  });

  it('throws when no People row matches (surfaces the silent no-op)', () => {
    const { ctx } = loadBackend({ People: [{ person_id: 'me' }] });
    expect(() => ctx.actionRegisterToken({ person_id: 'ghost', fcm_token: 'x' }))
      .toThrow(/No People row/);
  });

  it('requires both person_id and fcm_token', () => {
    const { ctx } = loadBackend({ People: [{ person_id: 'me' }] });
    expect(() => ctx.actionRegisterToken({ person_id: 'me' })).toThrow(/required/);
    expect(() => ctx.actionRegisterToken({ fcm_token: 'x' })).toThrow(/required/);
  });
});

describe('incrementPoints', () => {
  it('clamps the total at zero on subtraction', () => {
    const { ctx, read } = loadBackend({ People: [{ person_id: 'p', points_total: 2 }] });
    ctx.incrementPoints('p', -10, ctx.getRows('People'));
    expect(read('People')[0].points_total).toBe(0);
  });
});

describe('actionSetVacation (#29)', () => {
  it('turning ON flags the person and moves their OPEN assignments to unclaimed', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', name: 'Kid' }],
      Chores: [{ chore_id: 'c1', name: 'Dishes' }],
      Assignments: [
        { assignment_id: 'open1', chore_id: 'c1', person_id: 'kid', status: 'open', due_date: '2026-06-28' },
        { assignment_id: 'done1', chore_id: 'c1', person_id: 'kid', status: 'done', due_date: '2026-06-28' },
      ],
    });
    const res = ctx.actionSetVacation({ person_id: 'kid', on_vacation: true });
    expect(res.on_vacation).toBe(true);
    expect(read('People')[0].on_vacation).toBe(true);
    const rows = read('Assignments');
    expect(rows.find((a) => a.assignment_id === 'open1').person_id).toBe(''); // unclaimed
    expect(rows.find((a) => a.assignment_id === 'done1').person_id).toBe('kid'); // done left alone
  });

  it('turning OFF re-homes unclaimed open chores this person is a default for', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', name: 'Kid', on_vacation: true }],
      Chores: [
        { chore_id: 'c1', name: 'Dishes', default_assignee: 'kid' },        // sole default
        { chore_id: 'c2', name: 'Trash', default_assignee: 'kid,dad' },      // shared/rotation
      ],
      Assignments: [
        { assignment_id: 'a1', chore_id: 'c1', person_id: '', status: 'open', due_date: '2026-06-28' },
        { assignment_id: 'a2', chore_id: 'c2', person_id: '', status: 'open', due_date: '2026-06-28' },
      ],
    });
    ctx.actionSetVacation({ person_id: 'kid', on_vacation: false });
    expect(read('People')[0].on_vacation).toBe(false);
    const rows = read('Assignments');
    expect(rows.find((a) => a.assignment_id === 'a1').person_id).toBe('kid'); // re-homed
    expect(rows.find((a) => a.assignment_id === 'a2').person_id).toBe('');    // rotation stays unclaimed
  });

  it('throws for an unknown person, requires person_id', () => {
    const { ctx } = loadBackend({ People: [{ person_id: 'kid' }] });
    expect(() => ctx.actionSetVacation({ person_id: 'ghost', on_vacation: true })).toThrow(/No People row/);
    expect(() => ctx.actionSetVacation({ on_vacation: true })).toThrow(/required/);
  });
});

describe('actionResetRotation (#33)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 12, 0, 0)); }); // 2026-06-28
  afterEach(() => vi.useRealTimers());

  it('reassigns current (open, not-overdue) assignments to the first person and resets the pointer', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'p_a' }, { person_id: 'p_b' }, { person_id: 'p_c' }],
      Chores: [{ chore_id: 'c1', name: 'Trash', default_assignee: 'p_a,p_b,p_c', rotation_last: 'p_b' }],
      Assignments: [
        { assignment_id: 'cur', chore_id: 'c1', person_id: 'p_c', status: 'open', due_date: '2026-06-30' }, // future → current
        { assignment_id: 'today', chore_id: 'c1', person_id: 'p_c', status: 'open', due_date: '2026-06-28' }, // today → current
      ],
    });
    const res = ctx.actionResetRotation({ chore_id: 'c1' });
    expect(res.first_person).toBe('p_a');
    const rows = read('Assignments');
    expect(rows.find((a) => a.assignment_id === 'cur').person_id).toBe('p_a');
    expect(rows.find((a) => a.assignment_id === 'today').person_id).toBe('p_a');
    expect(read('Chores')[0].rotation_last).toBe('p_a'); // next occurrence → p_b
  });

  it('leaves overdue open assignments untouched', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'p_a' }, { person_id: 'p_b' }],
      Chores: [{ chore_id: 'c1', default_assignee: 'p_a,p_b', rotation_last: 'p_a' }],
      Assignments: [
        { assignment_id: 'overdue', chore_id: 'c1', person_id: 'p_b', status: 'open', due_date: '2026-06-25' },
      ],
    });
    ctx.actionResetRotation({ chore_id: 'c1' });
    expect(read('Assignments')[0].person_id).toBe('p_b'); // overdue untouched
  });

  it('throws for a non-rotation chore and requires chore_id', () => {
    const { ctx } = loadBackend({
      Chores: [{ chore_id: 'c1', default_assignee: 'p_a' }],
    });
    expect(() => ctx.actionResetRotation({ chore_id: 'c1' })).toThrow(/not a rotation/);
    expect(() => ctx.actionResetRotation({ chore_id: 'ghost' })).toThrow(/No Chores row/);
    expect(() => ctx.actionResetRotation({})).toThrow(/required/);
  });
});

describe('interval chores anchor on the completion date', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0)); });
  afterEach(() => vi.useRealTimers());

  const intervalChore = () => ({
    People: [{ person_id: 'kid', points_total: 0 }],
    Chores: [{ chore_id: 'c1', frequency: 'interval', interval_days: '90', points: 5,
               last_generated_date: '2026-06-01', active: 'TRUE' }],
    Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid',
                    due_date: '2026-06-01', status: 'open' }],
  });

  it('re-anchors to today when completed late, so the next one is a full interval out', () => {
    const { ctx, read } = loadBackend(intervalChore());
    ctx.actionComplete({ assignment_id: 'a1', person_id: 'kid' });
    expect(read('Chores')[0].last_generated_date).toBe('2026-08-10');
  });

  it('leaves calendar frequencies locked to their calendar', () => {
    const fixture = intervalChore();
    fixture.Chores[0].frequency = 'daily';
    const { ctx, read } = loadBackend(fixture);
    ctx.actionComplete({ assignment_id: 'a1', person_id: 'kid' });
    expect(read('Chores')[0].last_generated_date).toBe('2026-06-01'); // untouched
  });

  it('approve anchors on when the work was done, not when it was reviewed', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', points_total: 0 }, { person_id: 'admin', is_admin: 'TRUE' }],
      Chores: [{ chore_id: 'c1', frequency: 'interval', interval_days: '30', points: 5,
                 last_generated_date: '2026-06-01', active: 'TRUE' }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-01',
                      status: 'pending_review', completed_at: '2026-08-08T10:00:00-05:00' }],
    });
    ctx.actionApprove({ assignment_id: 'a1', admin_person_id: 'admin' });
    expect(read('Chores')[0].last_generated_date).toBe('2026-08-08');
  });

  it('uncomplete puts the anchor back on the occurrence due date', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', points_total: 5 }],
      Chores: [{ chore_id: 'c1', frequency: 'interval', interval_days: '90', points: 5,
                 last_generated_date: '2026-08-10', active: 'TRUE' }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-01',
                      status: 'done', points_awarded: 5 }],
    });
    ctx.actionUncomplete({ assignment_id: 'a1' });
    expect(read('Chores')[0].last_generated_date).toBe('2026-06-01');
  });
});

describe('ending vacation re-dates stale rows', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0)); });
  afterEach(() => vi.useRealTimers());

  it('re-homes an overdue row at today with a clean count, leaving current rows alone', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'p1', name: 'Sam', on_vacation: 'TRUE' }],
      Chores: [{ chore_id: 'c1', default_assignee: 'p1' }, { chore_id: 'c2', default_assignee: 'p1' }],
      Assignments: [
        { assignment_id: 'stale', chore_id: 'c1', person_id: '', due_date: '2026-07-01',
          status: 'open', missed_count: 4 },
        { assignment_id: 'current', chore_id: 'c2', person_id: '', due_date: '2026-08-15',
          status: 'open' },
      ],
    });

    ctx.actionSetVacation({ person_id: 'p1', on_vacation: false });
    const rows = read('Assignments');

    const stale = rows.find((a) => a.assignment_id === 'stale');
    expect(stale.person_id).toBe('p1');
    expect(stale.due_date).toBe('2026-08-10'); // no phantom month-long backlog
    expect(stale.missed_count).toBe(4);        // the record of neglect survives (#38)

    const current = rows.find((a) => a.assignment_id === 'current');
    expect(current.person_id).toBe('p1');
    expect(current.due_date).toBe('2026-08-15'); // already current — left as-is
  });
});

describe('rejecting a chore while its owner is away', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0)); });
  afterEach(() => vi.useRealTimers());

  const fixture = (onVacation) => ({
    People: [
      { person_id: 'kid', name: 'Kid', on_vacation: onVacation },
      { person_id: 'admin', name: 'Admin', is_admin: 'TRUE' },
    ],
    Chores: [{ chore_id: 'c1', frequency: 'weekly', weekday_due: '0' }],
    Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', due_date: '2026-08-09',
                    status: 'pending_review', completed_at: '2026-08-09T10:00:00-05:00' }],
  });

  it('parks it in unclaimed rather than stranding it on their list', () => {
    const { ctx, read } = loadBackend(fixture('TRUE'));
    const res = ctx.actionReject({ assignment_id: 'a1', admin_person_id: 'admin', review_note: 'redo' });
    const row = read('Assignments')[0];
    expect(row.status).toBe('open');
    expect(row.person_id).toBe('');
    expect(res.person_id).toBe(null);      // client clears the card immediately
    expect(res.person_name).toBe(null);
  });

  it('keeps the assignee when they are not away', () => {
    const { ctx, read } = loadBackend(fixture(''));
    const res = ctx.actionReject({ assignment_id: 'a1', admin_person_id: 'admin', review_note: 'redo' });
    expect(read('Assignments')[0].person_id).toBe('kid');
    expect(res.person_id).toBeUndefined();
  });
});

describe('actionSkip excuses without a penalty (#38)', () => {
  it('closes the occurrence, deducts nothing, and records who excused it', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 12, 0, 0));
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', points_total: 10 }, { person_id: 'dad', is_admin: 'TRUE' }],
      Chores: [{ chore_id: 'c1', frequency: 'daily', points: 3 }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'kid',
                      due_date: '2026-06-28', status: 'open', assigned_by: 'auto' }],
    });
    ctx.actionSkip({ assignment_id: 'a1', admin_person_id: 'dad' });

    const row = read('Assignments')[0];
    expect(row.status).toBe('skipped');
    expect(row.points_awarded).toBe('');   // no deduction — that absence IS the marker
    expect(row.reviewed_by).toBe('dad');
    expect(read('People').find((p) => p.person_id === 'kid').points_total).toBe(10);
    vi.useRealTimers();
  });
});

describe('actionAssign creates a one-off outside the recurrence (#39)', () => {
  it('creates an assignment due today marked manual, without touching the schedule', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 12, 0, 0));
    const { ctx, read } = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'weekly', weekday_due: '0', active: 'TRUE',
                 last_generated_date: '2026-06-21' }],
    });
    ctx.actionAssign({ chore_id: 'c1', person_id: 'kid' });

    const row = read('Assignments')[0];
    expect(row.due_date).toBe('2026-06-28');
    expect(row.assigned_by).toBe('manual');
    // The id carries a random suffix so it can never collide with the
    // generator's chore_id_YYYYMMDD.
    expect(row.assignment_id).not.toBe('c1_20260628');
    // The chore's own cursor is untouched.
    expect(read('Chores')[0].last_generated_date).toBe('2026-06-21');
    vi.useRealTimers();
  });

  it('accepts an unassigned one-off', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 12, 0, 0));
    const { ctx, read } = loadBackend({ Chores: [{ chore_id: 'c1', frequency: 'daily' }] });
    ctx.actionAssign({ chore_id: 'c1' });
    expect(read('Assignments')[0].person_id).toBe('');
    vi.useRealTimers();
  });
});

describe('actionLeaderboard (#38)', () => {
  it('sums the windows from the log and takes all-time from points_total', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 12, 0, 0)); // Sun 2026-06-28
    const { ctx } = loadBackend({
      People: [{ person_id: 'kid', name: 'Kid', points_total: 500, streak_current: 3, streak_best: 9 }],
      Chores: [{ chore_id: 'c1' }],
      Assignments: [
        { assignment_id: 'a1', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-28',
          status: 'done', completed_at: '2026-06-28T09:00:00-05:00', points_awarded: 5 },
        { assignment_id: 'a2', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-15',
          status: 'done', completed_at: '2026-06-15T09:00:00-05:00', points_awarded: 7 },
        { assignment_id: 'a3', chore_id: 'c1', person_id: 'kid', due_date: '2026-05-02',
          status: 'done', completed_at: '2026-05-02T09:00:00-05:00', points_awarded: 100 },
        // A miss records its penalty as a negative, so windows net out losses.
        { assignment_id: 'a4', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-20',
          status: 'skipped', points_awarded: -2 },
      ],
    });

    const row = ctx.actionLeaderboard({}).leaderboard[0];
    expect(row.points_today).toBe(5);
    expect(row.points_week).toBe(5);              // week starts Sunday 06-28
    expect(row.points_month).toBe(10);            // 5 + 7 − 2, excludes May
    expect(row.points_all).toBe(500);             // running total, immune to archiving
    expect(row.streak_best).toBe(9);
    vi.useRealTimers();
  });
});

describe('recomputeStreak (#38)', () => {
  it('rebuilds from the log rather than zeroing, and stops at the first unresolved day', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 12, 0, 0)); // today 06-28
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', streak_current: 12, streak_best: 12 }],
      Assignments: [
        { assignment_id: 'd1', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-27', status: 'done' },
        { assignment_id: 'd2', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-26', status: 'skipped' },
        { assignment_id: 'd3', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-25', status: 'open' },
        { assignment_id: 'd4', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-24', status: 'done' },
      ],
    });

    // 06-27 done, 06-26 excused (both count), 06-25 still open → break.
    expect(ctx.recomputeStreak('kid')).toBe(2);
    expect(read('People')[0].streak_current).toBe(2);
    expect(read('People')[0].streak_best).toBe(12); // records aren't clawed back
    vi.useRealTimers();
  });

  it('counts a pending_review day, since the assignee finished on time', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 28, 12, 0, 0));
    const { ctx } = loadBackend({
      People: [{ person_id: 'kid' }],
      Assignments: [
        { assignment_id: 'd1', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-27', status: 'pending_review' },
        { assignment_id: 'd2', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-26', status: 'done' },
      ],
    });
    expect(ctx.recomputeStreak('kid')).toBe(2);
    vi.useRealTimers();
  });
});

describe('vacation return recovers rotation chores too', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 13, 12, 0, 0)); });
  afterEach(() => vi.useRealTimers());

  it('re-homes a rotation chore, not just sole-assignee ones', () => {
    // Turning vacation ON unclaims ALL of their open rows regardless of how the
    // chore is assigned, so a sole-only rule recovered a strict subset and left
    // every rotation chore orphaned in the unclaimed pile.
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'neal', name: 'Neal', on_vacation: 'TRUE' }],
      Chores: [
        { chore_id: 'solo', default_assignee: 'neal' },
        { chore_id: 'rot', default_assignee: 'neal,claire' },
      ],
      Assignments: [
        { assignment_id: 'a1', chore_id: 'solo', person_id: '', due_date: '2026-08-01', status: 'open' },
        { assignment_id: 'a2', chore_id: 'rot', person_id: '', due_date: '2026-08-01', status: 'open' },
      ],
    });

    ctx.actionSetVacation({ person_id: 'neal', on_vacation: false });
    const rows = read('Assignments');
    expect(rows.find((a) => a.assignment_id === 'a1').person_id).toBe('neal');
    expect(rows.find((a) => a.assignment_id === 'a2').person_id).toBe('neal');
    // Both re-dated to today — nobody returns to a deadline that already passed.
    expect(rows.every((a) => a.due_date === '2026-08-13')).toBe(true);
  });

  it('leaves alone a chore they are not a default assignee of', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'neal', on_vacation: 'TRUE' }],
      Chores: [{ chore_id: 'other', default_assignee: 'claire' }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'other', person_id: '', due_date: '2026-08-01', status: 'open' }],
    });
    ctx.actionSetVacation({ person_id: 'neal', on_vacation: false });
    expect(read('Assignments')[0].person_id).toBe('');
  });
});

describe('a stranded prior is closed even when the current occurrence exists', () => {
  afterEach(() => vi.useRealTimers());

  it('closes it and moves the miss count onto the live row', () => {
    // Can't arise in steady state, but a transition or hand-edited sheet can
    // leave both rows present — and the early return used to skip the close,
    // leaving the old one open forever.
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 13, 0, 5, 0));
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'kid', points_total: 10 }],
      Chores: [{ chore_id: 'c1', frequency: 'daily', active: 'TRUE', default_assignee: 'kid',
                 points: 3, last_generated_date: '2026-08-12' }],
      Assignments: [
        { assignment_id: 'stuck', chore_id: 'c1', person_id: 'kid', due_date: '2026-08-11',
          status: 'open', assigned_by: 'auto', missed_count: 1 },
        { assignment_id: 'live', chore_id: 'c1', person_id: 'kid', due_date: '2026-08-13',
          status: 'open', assigned_by: 'auto' },
      ],
    });
    ctx.runNightlyGenerator();

    const rows = read('Assignments');
    expect(rows.find((a) => a.assignment_id === 'stuck').status).toBe('skipped');
    expect(read('People')[0].points_total).toBe(7);
    expect(rows.find((a) => a.assignment_id === 'live').missed_count).toBe(2);
    expect(rows).toHaveLength(2);   // nothing duplicated
  });
});

describe('Add: one-off vs assign-early (#43)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 3, 12, 0, 0)); }); // Aug 3
  afterEach(() => vi.useRealTimers());

  const monthly = () => ({
    People: [{ person_id: 'kid', points_total: 0 }],
    Chores: [{ chore_id: 'c1', frequency: 'monthly', monthly_day: '25', points: 5,
               active: 'TRUE', last_generated_date: '2026-07-25' }],
  });

  it('one-off creates an EXTRA due today, leaving the schedule untouched', () => {
    const { ctx, read } = loadBackend(monthly());
    ctx.actionAssign({ chore_id: 'c1', person_id: 'kid' });
    const row = read('Assignments')[0];
    expect(row.due_date).toBe('2026-08-03');
    expect(row.assigned_by).toBe('manual');
    expect(read('Chores')[0].last_generated_date).toBe('2026-07-25'); // cursor untouched
  });

  it('early surfaces the REAL next occurrence, keeping its true due date', () => {
    const { ctx, read } = loadBackend(monthly());
    ctx.actionAssign({ chore_id: 'c1', person_id: 'kid', mode: 'early' });
    const row = read('Assignments')[0];
    expect(row.due_date).toBe('2026-08-25');    // not today — it is that occurrence
    expect(row.assigned_by).toBe('auto_early');
    // Bringing it forward consumes the slot, so the chore CANNOT re-trigger on
    // the 25th — the September occurrence is next.
    expect(read('Chores')[0].last_generated_date).toBe('2026-08-25');
  });

  it('an early occurrence done on the 3rd does not re-trigger on the 25th', () => {
    const { ctx, read } = loadBackend(monthly());
    const id = ctx.actionAssign({ chore_id: 'c1', person_id: 'kid', mode: 'early' }).assignment_id;
    ctx.actionComplete({ assignment_id: id, person_id: 'kid' });

    vi.setSystemTime(new Date(2026, 7, 25, 0, 5, 0)); // the original due date
    ctx.runNightlyGenerator();

    const rows = read('Assignments');
    expect(rows).toHaveLength(1);                 // nothing new appeared
    expect(rows[0].status).toBe('done');
    expect(read('People')[0].points_total).toBe(5);
  });

  it('the generator does not duplicate an occurrence already brought forward', () => {
    const { ctx, read } = loadBackend(monthly());
    ctx.actionAssign({ chore_id: 'c1', person_id: 'kid', mode: 'early' });
    vi.setSystemTime(new Date(2026, 7, 25, 0, 5, 0));
    ctx.runNightlyGenerator();
    expect(read('Assignments')).toHaveLength(1);
  });

  it('refuses to bring forward an occurrence that already exists', () => {
    const { ctx } = loadBackend(monthly());
    ctx.actionAssign({ chore_id: 'c1', person_id: 'kid', mode: 'early' });
    expect(() => ctx.actionAssign({ chore_id: 'c1', person_id: 'kid', mode: 'early' }))
      .toThrow(/already on the list/);
  });

  it('an early occurrence is treated as part of the recurrence, not a one-off', () => {
    const { ctx } = loadBackend();
    expect(ctx.isOneOffAssignment({ assigned_by: 'auto_early' })).toBe(false);
    expect(ctx.isOneOffAssignment({ assigned_by: 'manual' })).toBe(true);
    expect(ctx.isOneOffAssignment({ assigned_by: 'auto' })).toBe(false);
    expect(ctx.isOneOffAssignment({})).toBe(false); // blank: safer as part of the recurrence
  });

  it('widens the visible lead window so an early occurrence actually shows', () => {
    // Without this the row exists but the Today filter hides it until its real
    // appear date — created and invisible.
    const { ctx } = loadBackend(monthly());
    ctx.actionAssign({ chore_id: 'c1', person_id: 'kid', mode: 'early' });
    const card = ctx.actionToday({}).assignments[0];
    expect(card.due_date).toBe('2026-08-25');
    expect(card.lead_days).toBe(23);   // Aug 3 .. Aug 25 inclusive
  });
});

describe('migrateWeekdayDue (#45)', () => {
  it('converts custom to daily, moves weekly and monthly weekdays across', () => {
    const { ctx, read } = loadBackend({
      Chores: [
        { chore_id: 'cust', frequency: 'custom', custom_days: 'monday,thursday', lead_days: 4 },
        { chore_id: 'wk', frequency: 'weekly', custom_days: '0' },
        { chore_id: 'mo', frequency: 'monthly', monthly_week: 2, monthly_weekday: 5 },
        { chore_id: 'day', frequency: 'daily' },
      ],
    });
    const res = ctx.migrateWeekdayDue();
    const rows = read('Chores');
    const by = (id) => rows.find((c) => c.chore_id === id);

    // custom becomes DAILY — "Mon and Thu" is a discipline, so it takes daily's
    // tight lead rather than weekly's window.
    expect(by('cust').frequency).toBe('daily');
    expect(by('cust').weekday_due).toBe('1,4');
    expect(by('cust').lead_days).toBe(''); // was set against weekly's 4-day window

    expect(by('wk').weekday_due).toBe('0');
    expect(by('wk').frequency).toBe('weekly');
    expect(by('mo').weekday_due).toBe('5');
    expect(by('day').weekday_due).toBe(''); // nothing to convert
    expect(res.migrated).toBe(3);
  });

  it('is a no-op on a second run', () => {
    const { ctx, read } = loadBackend({
      Chores: [{ chore_id: 'cust', frequency: 'custom', custom_days: 'monday' }],
    });
    ctx.migrateWeekdayDue();
    expect(ctx.migrateWeekdayDue().migrated).toBe(0);
    expect(read('Chores')[0].weekday_due).toBe('1');
  });

  it('skips unreadable rows rather than guessing', () => {
    const { ctx, read } = loadBackend({
      Chores: [
        { chore_id: 'bad', frequency: 'custom', custom_days: 'someday' },
        { chore_id: 'ok', frequency: 'weekly', custom_days: '3' },
      ],
    });
    expect(ctx.migrateWeekdayDue().migrated).toBe(1);
    expect(read('Chores').find((c) => c.chore_id === 'bad').frequency).toBe('custom');
  });
});

describe('re-anchoring an interval chore honours weekday_due (#45)', () => {
  it('snaps the new start_date instead of writing it raw', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0));
    const { ctx, read } = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'interval', interval_days: '90', weekday_due: '0',
                 start_date: '2026-08-10', last_generated_date: '2026-08-10', active: true }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'me',
                      due_date: '2026-08-10', status: 'open', assigned_by: 'auto' }],
    });
    // Sept 15 2026 is a Tuesday; the chore is Sundays-only, so it must land on
    // Sept 20 rather than the date typed in.
    ctx.actionUpdateChore({ chore_id: 'c1', frequency: 'interval', start_date: '2026-09-15' });
    expect(read('Assignments')[0].due_date).toBe('2026-09-20');
    expect(read('Chores')[0].last_generated_date).toBe('2026-09-20');
    vi.useRealTimers();
  });

  it('leaves the date alone when no weekday is set', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0));
    const { ctx, read } = loadBackend({
      Chores: [{ chore_id: 'c1', frequency: 'interval', interval_days: '90',
                 start_date: '2026-08-10', last_generated_date: '2026-08-10', active: true }],
      Assignments: [{ assignment_id: 'a1', chore_id: 'c1', person_id: 'me',
                      due_date: '2026-08-10', status: 'open', assigned_by: 'auto' }],
    });
    ctx.actionUpdateChore({ chore_id: 'c1', frequency: 'interval', start_date: '2026-09-15' });
    expect(read('Assignments')[0].due_date).toBe('2026-09-15');
    vi.useRealTimers();
  });
});

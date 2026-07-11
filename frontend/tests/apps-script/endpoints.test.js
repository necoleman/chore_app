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

  it('rejecting a daily pending deletes a newer OPEN occurrence (#25a)', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'dad' }],
      Chores: [{ chore_id: 'c1', frequency: 'daily' }],
      Assignments: [
        { assignment_id: 'yday', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-27', status: 'pending_review' },
        { assignment_id: 'today', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-28', status: 'open' },
      ],
    });
    ctx.actionReject({ assignment_id: 'yday', admin_person_id: 'dad', review_note: 'redo' });
    const ids = read('Assignments').map((a) => a.assignment_id);
    expect(ids).toContain('yday');       // reopened, now overdue
    expect(ids).not.toContain('today');  // newer open occurrence removed
    expect(read('Assignments').find((a) => a.assignment_id === 'yday').status).toBe('open');
  });

  it('rejecting a daily pending leaves a newer done/pending occurrence (#25b)', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'dad' }],
      Chores: [{ chore_id: 'c1', frequency: 'daily' }],
      Assignments: [
        { assignment_id: 'yday', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-27', status: 'pending_review' },
        { assignment_id: 'today', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-28', status: 'done' },
      ],
    });
    ctx.actionReject({ assignment_id: 'yday', admin_person_id: 'dad', review_note: 'redo' });
    const ids = read('Assignments').map((a) => a.assignment_id);
    expect(ids).toContain('today');      // work already done — untouched
  });

  it('reject reconciliation only fires for daily chores (weekly untouched)', () => {
    const { ctx, read } = loadBackend({
      People: [{ person_id: 'dad' }],
      Chores: [{ chore_id: 'c1', frequency: 'weekly' }],
      Assignments: [
        { assignment_id: 'wk1', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-21', status: 'pending_review' },
        { assignment_id: 'wk2', chore_id: 'c1', person_id: 'kid', due_date: '2026-06-28', status: 'open' },
      ],
    });
    ctx.actionReject({ assignment_id: 'wk1', admin_person_id: 'dad', review_note: 'redo' });
    const ids = read('Assignments').map((a) => a.assignment_id);
    expect(ids).toContain('wk2');        // non-daily: left to the generator's collapse
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
    ctx.actionAddChore({ name: 'Mop', frequency: 'monthly', monthly_week: 2, monthly_weekday: 5 });
    const row = read('Chores')[0];
    expect(row.monthly_week).toBe(2);
    expect(row.monthly_weekday).toBe(5);
  });

  it('lead_days round-trips through add and update (#23 groundwork)', () => {
    const { ctx, read } = loadBackend();
    ctx.actionAddChore({ name: 'Sweep', frequency: 'weekly', custom_days: '0', lead_days: 4 });
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
    ctx.actionAddChore({ name: 'Laundry', frequency: 'weekly', custom_days: '3', lead_days: 1 });
    expect(read('Assignments').length).toBe(0);
  });

  it('actionAddChore surfaces a weekly chore early within its lead window (#23)', () => {
    const { ctx, read } = loadBackend();
    // Weekly Wednesday (3) with lead_days 4 → appears 3 days early. From Sunday
    // 2026-06-28, next Wednesday 2026-07-01 is within the window → created now,
    // but with the real (future) due date.
    ctx.actionAddChore({ name: 'Laundry', frequency: 'weekly', custom_days: '3', lead_days: 4 });
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

  it('turning OFF re-homes unclaimed open chores whose SOLE default is this person', () => {
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

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

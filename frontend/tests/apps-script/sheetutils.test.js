import { describe, it, expect } from 'vitest';
import { loadBackend } from './harness.js';

describe('getRows date normalization', () => {
  it('midnight Date → yyyy-MM-dd; datetime → full ISO; skips empty rows', () => {
    const { ctx } = loadBackend({
      Assignments: [
        { assignment_id: 'a1', due_date: new Date(2026, 5, 28, 0, 0, 0), completed_at: new Date(2026, 5, 28, 9, 30, 15) },
      ],
    });
    const rows = ctx.getRows('Assignments');
    expect(rows).toHaveLength(1);
    expect(rows[0].due_date).toBe('2026-06-28'); // midnight normalized
    expect(rows[0].completed_at).toBe('2026-06-28T09:30:15'); // datetime kept
  });

  it('returns [] when only headers exist', () => {
    const { ctx } = loadBackend({ People: [] });
    expect(ctx.getRows('People')).toEqual([]);
  });
});

describe('appendRow / updateRow', () => {
  it('appendRow maps object → columns by header (missing keys blank)', () => {
    const { ctx, read } = loadBackend();
    ctx.appendRow('Locations', { location: 'Garage' });
    expect(read('Locations')).toEqual([{ location: 'Garage' }]);
  });

  it('updateRow returns true when found and writes the fields', () => {
    const { ctx, read } = loadBackend({ People: [{ person_id: 'p1', points_total: 0 }] });
    const ok = ctx.updateRow('People', 'person_id', 'p1', { points_total: 9 });
    expect(ok).toBe(true);
    expect(read('People')[0].points_total).toBe(9);
  });

  it('updateRow returns false when the key is not found', () => {
    const { ctx } = loadBackend({ People: [{ person_id: 'p1' }] });
    expect(ctx.updateRow('People', 'person_id', 'nope', { points_total: 1 })).toBe(false);
  });
});

describe('cache + generateId', () => {
  it('getCachedRows caches until invalidated', () => {
    const { ctx } = loadBackend({ Locations: [{ location: 'Kitchen' }] });
    expect(ctx.getCachedRows('Locations')).toHaveLength(1);
    ctx.appendRow('Locations', { location: 'Garage' }); // bypasses cache
    expect(ctx.getCachedRows('Locations')).toHaveLength(1); // still cached
    ctx.invalidateCache('Locations');
    expect(ctx.getCachedRows('Locations')).toHaveLength(2); // fresh read
  });

  it('generateId has the prefix and an 8-char suffix', () => {
    const { ctx } = loadBackend();
    const id = ctx.generateId('m');
    expect(id).toMatch(/^m_[0-9a-z]{8}$/i);
  });
});

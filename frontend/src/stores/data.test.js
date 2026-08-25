import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

// Mock the network layer and the toast/ui module before importing the store.
vi.mock('../api/client.js', () => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('./ui.js', () => ({ showToast: vi.fn() }));

import { get as apiGet, post } from '../api/client.js';
import { showToast } from './ui.js';
import {
  assignments,
  people,
  completeAssignment,
  claimAssignment,
  uncompleteAssignment,
  rejectAssignment,
  reassignAssignment,
  quickAddChore,
  bumpAssignment,
  completeAssignment,
} from './data.js';
import { today } from '../lib/utils.js';

function seed(list, peopleList = []) {
  assignments.set(list);
  people.set(peopleList);
}

beforeEach(() => {
  vi.clearAllMocks();
  assignments.set([]);
  people.set([]);
});

describe('completeAssignment', () => {
  it('optimistically marks done then applies the server result', async () => {
    seed([{ assignment_id: 'x', status: 'open' }]);
    post.mockResolvedValueOnce({ status: 'done', points_awarded: 3 });
    await completeAssignment('x', 'me');
    expect(post).toHaveBeenCalledWith('complete', { assignment_id: 'x', person_id: 'me' });
    const row = get(assignments).find((a) => a.assignment_id === 'x');
    expect(row.status).toBe('done');
    expect(row.points_awarded).toBe(3);
  });

  it('rolls back and toasts on failure', async () => {
    seed([{ assignment_id: 'x', status: 'open' }]);
    post.mockRejectedValueOnce(new Error('boom'));
    await completeAssignment('x', 'me');
    expect(get(assignments)[0].status).toBe('open'); // reverted
    expect(showToast).toHaveBeenCalled();
  });
});

describe('claimAssignment', () => {
  it('fills person name + color optimistically (the blank-logo fix)', async () => {
    seed(
      [{ assignment_id: 'x', status: 'open', person_id: null }],
      [{ person_id: 'me', name: 'Me', color: '#123456' }]
    );
    post.mockResolvedValueOnce({ success: true });
    await claimAssignment('x', 'me');
    const row = get(assignments)[0];
    expect(row.person_id).toBe('me');
    expect(row.person_name).toBe('Me');
    expect(row.person_color).toBe('#123456');
  });

  it('rolls back to unassigned on failure', async () => {
    seed([{ assignment_id: 'x', status: 'open', person_id: null }], [{ person_id: 'me', name: 'Me' }]);
    post.mockRejectedValueOnce(new Error('nope'));
    await claimAssignment('x', 'me');
    expect(get(assignments)[0].person_id).toBe(null);
    expect(showToast).toHaveBeenCalled();
  });
});

describe('uncompleteAssignment', () => {
  it('posts uncomplete and refreshes from the server on success', async () => {
    seed([{ assignment_id: 'x', status: 'done' }]);
    post.mockResolvedValueOnce({ status: 'open' });
    // refresh() calls apiGet('today')
    apiGet.mockResolvedValueOnce({ assignments: [{ assignment_id: 'x', status: 'open' }], people: [] });
    await uncompleteAssignment('x');
    expect(post).toHaveBeenCalledWith('uncomplete', { assignment_id: 'x' });
    expect(apiGet).toHaveBeenCalledWith('today');
    expect(get(assignments)[0].status).toBe('open');
  });

  it('rolls back and toasts the server error message on failure', async () => {
    seed([{ assignment_id: 'x', status: 'done' }]);
    post.mockRejectedValueOnce(new Error('Approved chores cannot be unchecked'));
    await uncompleteAssignment('x');
    expect(get(assignments)[0].status).toBe('done');
    expect(showToast).toHaveBeenCalledWith('Approved chores cannot be unchecked');
  });
});

describe('reassignAssignment', () => {
  it('resolves the new person name/color optimistically', async () => {
    seed([{ assignment_id: 'x', status: 'open', person_id: 'me' }], [{ person_id: 'kid', name: 'Kid', color: '#abc' }]);
    post.mockResolvedValueOnce({ success: true });
    await reassignAssignment('x', 'kid', 'me');
    const row = get(assignments)[0];
    expect(row.person_id).toBe('kid');
    expect(row.person_name).toBe('Kid');
  });

  it('clears the person when making a chore unclaimed (empty person_id)', async () => {
    seed([{ assignment_id: 'x', status: 'open', person_id: 'me', person_name: 'Me' }], []);
    post.mockResolvedValueOnce({ success: true });
    await reassignAssignment('x', '', 'me');
    const row = get(assignments)[0];
    expect(row.person_id).toBe('');
    expect(row.person_name).toBe(null);
    expect(post).toHaveBeenCalledWith('reassign', { assignment_id: 'x', person_id: '', admin_person_id: 'me' });
  });
});

describe('quickAddChore (#19)', () => {
  it('posts a one-time chore due today assigned to the creator, then refreshes', async () => {
    post.mockResolvedValueOnce({ chore_id: 'c_x', success: true });
    apiGet.mockResolvedValueOnce({ assignments: [{ assignment_id: 'a1', status: 'open' }], people: [] });
    const ok = await quickAddChore('  Water plants  ', 'me');
    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledWith('add_chore', {
      name: 'Water plants', // trimmed
      frequency: 'once',
      once_date: today(),
      default_assignee: 'me',
      points: 1,
      requires_approval: false,
      active: true,
    });
    expect(apiGet).toHaveBeenCalledWith('today'); // refresh pulled the new assignment
    expect(get(assignments)[0].assignment_id).toBe('a1');
  });

  it('admin can quick-add unclaimed (empty person_id)', async () => {
    post.mockResolvedValueOnce({ chore_id: 'c_x', success: true });
    apiGet.mockResolvedValueOnce({ assignments: [], people: [] });
    await quickAddChore('Sweep porch', '');
    expect(post).toHaveBeenCalledWith('add_chore', expect.objectContaining({ default_assignee: '' }));
  });

  it('rejects an empty name without hitting the network', async () => {
    const ok = await quickAddChore('   ', 'me');
    expect(ok).toBe(false);
    expect(post).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Name is required');
  });

  it('returns false and toasts on server failure', async () => {
    post.mockRejectedValueOnce(new Error('boom'));
    const ok = await quickAddChore('Dishes', 'me');
    expect(ok).toBe(false);
    expect(showToast).toHaveBeenCalledWith('boom');
  });
});

describe('rejectAssignment', () => {
  it('optimistically reopens with the review note', async () => {
    seed([{ assignment_id: 'x', status: 'pending_review' }]);
    post.mockResolvedValueOnce({ status: 'open', review_note: 'redo it' });
    await rejectAssignment('x', 'admin', 'redo it');
    expect(post).toHaveBeenCalledWith('reject', { assignment_id: 'x', admin_person_id: 'admin', review_note: 'redo it' });
    const row = get(assignments)[0];
    expect(row.status).toBe('open');
    expect(row.review_note).toBe('redo it');
  });
});

describe('bumpAssignment (#52)', () => {
  // Helper: a date `n` days from today, as yyyy-MM-dd.
  function dayOffset(n) {
    const d = new Date(today() + 'T00:00:00');
    d.setDate(d.getDate() + n);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  it('keeps a pushed monthly chore on the list — its appear date is today', async () => {
    // Due yesterday, lead 7. Push lands it 6 days out, which appears TODAY.
    seed([{ assignment_id: 'm', due_date: dayOffset(-1), lead_days: 7, status: 'open' }]);
    post.mockResolvedValueOnce({ success: true });
    await bumpAssignment('m', dayOffset(6), 'admin');
    const row = get(assignments).find((a) => a.assignment_id === 'm');
    expect(row).toBeDefined();
    expect(row.due_date).toBe(dayOffset(6));
    expect(row._optimistic).toBe(false);
  });

  it('drops a chore moved beyond its lead window', async () => {
    seed([{ assignment_id: 'm', due_date: today(), lead_days: 7, status: 'open' }]);
    post.mockResolvedValueOnce({ success: true });
    await bumpAssignment('m', dayOffset(30), 'admin');
    expect(get(assignments).find((a) => a.assignment_id === 'm')).toBeUndefined();
  });

  it('drops a pushed WEEKLY chore — a 4-day lead cannot reach 6 days out', async () => {
    seed([{ assignment_id: 'w', due_date: dayOffset(-1), lead_days: 4, status: 'open' }]);
    post.mockResolvedValueOnce({ success: true });
    await bumpAssignment('w', dayOffset(6), 'admin');
    expect(get(assignments).find((a) => a.assignment_id === 'w')).toBeUndefined();
  });

  it('restores the row when the server rejects a still-visible move', async () => {
    seed([{ assignment_id: 'm', due_date: dayOffset(-1), lead_days: 7, status: 'open' }]);
    post.mockRejectedValueOnce(new Error('nope'));
    await bumpAssignment('m', dayOffset(6), 'admin');
    const row = get(assignments).find((a) => a.assignment_id === 'm');
    expect(row.due_date).toBe(dayOffset(-1));
    expect(showToast).toHaveBeenCalled();
  });

  it('re-inserts the row when the server rejects a move that removed it', async () => {
    seed([{ assignment_id: 'm', due_date: today(), lead_days: 7, status: 'open' }]);
    post.mockRejectedValueOnce(new Error('nope'));
    await bumpAssignment('m', dayOffset(30), 'admin');
    expect(get(assignments).find((a) => a.assignment_id === 'm')).toBeDefined();
  });
});

describe('completeAssignment on another person\'s behalf (#53)', () => {
  it('omits admin_person_id when you complete your own chore', async () => {
    seed([{ assignment_id: 'x', person_id: 'me', status: 'open' }]);
    post.mockResolvedValueOnce({ status: 'done', points_awarded: 3 });
    await completeAssignment('x', 'me', 'me');
    expect(post).toHaveBeenCalledWith('complete', { assignment_id: 'x', person_id: 'me' });
  });

  it('sends admin_person_id when an admin completes for a child', async () => {
    seed([{ assignment_id: 'x', person_id: 'p_kid', status: 'open' }]);
    post.mockResolvedValueOnce({ status: 'done', points_awarded: 3 });
    apiGet.mockResolvedValue({ assignments: [], people: [] });
    await completeAssignment('x', 'p_kid', 'p_rachel');
    expect(post).toHaveBeenCalledWith('complete', {
      assignment_id: 'x',
      person_id: 'p_kid',
      admin_person_id: 'p_rachel',
    });
  });

  it('credits the child, not the admin', async () => {
    seed([{ assignment_id: 'x', person_id: 'p_kid', status: 'open' }]);
    post.mockResolvedValueOnce({ status: 'done', person_id: 'p_kid', points_awarded: 3 });
    apiGet.mockResolvedValue({ assignments: [], people: [] });
    await completeAssignment('x', 'p_kid', 'p_rachel');
    expect(post.mock.calls[0][1].person_id).toBe('p_kid');
  });
});

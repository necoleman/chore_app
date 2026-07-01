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

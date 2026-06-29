import { writable, get } from 'svelte/store';
import { get as apiGet, post } from '../api/client.js';
import { showToast } from './ui.js';
import { today } from '../lib/utils.js';

export const assignments = writable([]);
export const people = writable([]);
export const lastUpdated = writable(null);
export const isRefreshing = writable(false);

let pollTimer = null;

export async function refresh() {
  isRefreshing.set(true);
  try {
    const data = await apiGet('today');
    assignments.set(data.assignments ?? []);
    people.set(data.people ?? []);
    lastUpdated.set(new Date());
  } catch (e) {
    showToast('Could not load chores — check your connection', 'error');
  } finally {
    isRefreshing.set(false);
  }
}

export function startPolling(intervalMs = 30_000) {
  stopPolling();
  refresh();
  pollTimer = setInterval(refresh, intervalMs);
}

export function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ─── Optimistic mutation helpers ──────────────────────────────────────────────

function updateAssignment(assignment_id, patch) {
  assignments.update((list) =>
    list.map((a) => (a.assignment_id === assignment_id ? { ...a, ...patch } : a))
  );
}

function rollbackAssignment(assignment_id, previous) {
  assignments.update((list) =>
    list.map((a) => (a.assignment_id === assignment_id ? previous : a))
  );
}

function getAssignment(assignment_id) {
  return get(assignments).find((a) => a.assignment_id === assignment_id) ?? null;
}

export async function completeAssignment(assignment_id, person_id) {
  const prev = getAssignment(assignment_id);
  // Optimistic: guess the final state. The server will return the real status.
  updateAssignment(assignment_id, { status: 'done', _optimistic: true });
  try {
    const result = await post('complete', { assignment_id, person_id });
    updateAssignment(assignment_id, { ...result, _optimistic: false });
  } catch (e) {
    rollbackAssignment(assignment_id, prev);
    showToast('Could not mark done — try again');
  }
}

export async function uncompleteAssignment(assignment_id) {
  const prev = getAssignment(assignment_id);
  updateAssignment(assignment_id, { status: 'open', _optimistic: true });
  try {
    await post('uncomplete', { assignment_id });
    // Points totals changed for the person — refresh to resync people + assignments.
    await refresh();
  } catch (e) {
    rollbackAssignment(assignment_id, prev);
    showToast(e.message || 'Could not uncheck — try again');
  }
}

export async function skipAssignment(assignment_id) {
  const prev = getAssignment(assignment_id);
  updateAssignment(assignment_id, { status: 'skipped', _optimistic: true });
  try {
    await post('skip', { assignment_id });
    updateAssignment(assignment_id, { _optimistic: false });
  } catch (e) {
    rollbackAssignment(assignment_id, prev);
    showToast('Could not skip — try again');
  }
}

export async function claimAssignment(assignment_id, person_id) {
  const prev = getAssignment(assignment_id);
  // Set the person's name + color optimistically too, otherwise the avatar
  // renders as a blank gray circle until the next refresh.
  const person = get(people).find((p) => p.person_id === person_id);
  updateAssignment(assignment_id, {
    person_id,
    person_name: person?.name ?? null,
    person_color: person?.color ?? null,
    _optimistic: true,
  });
  try {
    await post('claim', { assignment_id, person_id });
    updateAssignment(assignment_id, { _optimistic: false });
  } catch (e) {
    rollbackAssignment(assignment_id, prev);
    showToast(e.message || 'Could not claim — try again');
  }
}

export async function approveAssignment(assignment_id, admin_person_id) {
  const prev = getAssignment(assignment_id);
  updateAssignment(assignment_id, { status: 'done', _optimistic: true });
  try {
    const result = await post('approve', { assignment_id, admin_person_id });
    updateAssignment(assignment_id, { ...result, _optimistic: false });
  } catch (e) {
    rollbackAssignment(assignment_id, prev);
    showToast('Could not approve — try again');
  }
}

export async function rejectAssignment(assignment_id, admin_person_id, review_note = '') {
  const prev = getAssignment(assignment_id);
  updateAssignment(assignment_id, { status: 'open', completed_at: null, review_note, _optimistic: true });
  try {
    const result = await post('reject', { assignment_id, admin_person_id, review_note });
    updateAssignment(assignment_id, { ...result, _optimistic: false });
  } catch (e) {
    rollbackAssignment(assignment_id, prev);
    showToast('Could not reject — try again');
  }
}

export async function reassignAssignment(assignment_id, person_id, admin_person_id) {
  const prev = getAssignment(assignment_id);
  // Resolve name/color optimistically so the card updates immediately. An empty
  // person_id clears them — i.e. "make unclaimed" moves the card to the
  // unclaimed bucket right away.
  const person = person_id ? get(people).find((p) => p.person_id === person_id) : null;
  updateAssignment(assignment_id, {
    person_id,
    person_name: person?.name ?? null,
    person_color: person?.color ?? null,
    _optimistic: true,
  });
  try {
    await post('reassign', { assignment_id, person_id, admin_person_id });
    updateAssignment(assignment_id, { _optimistic: false });
  } catch (e) {
    rollbackAssignment(assignment_id, prev);
    showToast('Could not reassign — try again');
  }
}

export async function bumpAssignment(assignment_id, due_date, admin_person_id) {
  const prev = getAssignment(assignment_id);
  // If bumped to a future date, remove from today's view optimistically.
  const todayISO = today();
  if (due_date !== todayISO) {
    assignments.update((list) => list.filter((a) => a.assignment_id !== assignment_id));
  } else {
    updateAssignment(assignment_id, { due_date, _optimistic: true });
  }
  try {
    await post('bump', { assignment_id, due_date, admin_person_id });
  } catch (e) {
    // Re-insert or roll back
    if (due_date !== todayISO) {
      assignments.update((list) => [...list, prev]);
    } else {
      rollbackAssignment(assignment_id, prev);
    }
    showToast('Could not reschedule — try again');
  }
}

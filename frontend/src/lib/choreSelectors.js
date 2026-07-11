// Pure selectors for chore/assignment view logic.
//
// This logic was lifted verbatim from Today.svelte and ChoreCard.svelte so it
// can be unit-tested directly (the components delegate to these functions inside
// their reactive `$:` blocks). Keep these pure — no stores, no side effects.

import { appearDate } from './dueDates.js';

// Assignments to show on the Today screen for a given local date string (yyyy-MM-dd):
// finished items show when due today, plus a chore *completed* today stays on
// the list (greyed, at the bottom) for the rest of the day even if it was
// overdue when checked off (#14). Unfinished items (open/pending_review/rejected)
// show once they've entered their lead window (#23) — i.e. their appear date
// (due − leadgrace) has arrived — which includes overdue items but hides
// not-yet-appeared future ones. Legacy rows without lead_days fall back to lead
// 1, i.e. appear on their due date (prior behavior).
export function filterTodayAssignments(assignments, todayStr) {
  return (assignments ?? []).filter((a) => {
    const d = a.due_date?.slice(0, 10);
    if (!d) return false;
    if (a.status === 'done' || a.status === 'skipped') {
      if (d === todayStr) return true;
      return a.status === 'done' && a.completed_at?.slice(0, 10) === todayStr;
    }
    return appearDate(d, a.lead_days) <= todayStr;
  });
}

// Sort rank: unfinished above finished; among unfinished, overdue first.
export function rankAssignment(a, todayStr) {
  const finished = a.status === 'done' || a.status === 'skipped';
  if (finished) return 2;
  return a.due_date?.slice(0, 10) < todayStr ? 0 : 1;
}

// Frequency ordering for the "Frequency" sort (mirrors ChoresAdmin).
const FREQ_ORDER = { daily: 0, weekly: 1, custom: 2, monthly: 3, interval: 4, once: 5 };

// Comparator for within-section ordering (#22). Every mode keeps finished items
// last (via rankAssignment); 'default' keeps overdue-first then orders by due
// date ascending so future chores sink to the bottom of each person's list
// (#27); 'due' sorts by due date ascending; 'frequency' by the cadence order.
export function makeSectionComparator(sortMode, todayStr) {
  const byRank = (x, y) => rankAssignment(x, todayStr) - rankAssignment(y, todayStr);
  const byDue = (x, y) => (x.due_date || '').localeCompare(y.due_date || '');
  if (sortMode === 'frequency') {
    return (x, y) => byRank(x, y) || ((FREQ_ORDER[x.frequency] ?? 9) - (FREQ_ORDER[y.frequency] ?? 9));
  }
  // 'default' and 'due' both rank then order by due date ascending (#27).
  return (x, y) => byRank(x, y) || byDue(x, y);
}

// Segment an already-sorted assignment list into "Today" (overdue or due today)
// and "Due soon" (not yet due) buckets (#28). A card is "due soon" only when it
// is unfinished and its due date is still in the future; overdue, due-today, and
// finished-today items all stay in "today". Order within each bucket is preserved
// from the input, so every sort mode keeps working.
export function partitionByDue(items, todayStr) {
  const today = [];
  const soon = [];
  for (const a of items ?? []) {
    const finished = a.status === 'done' || a.status === 'skipped';
    const future = !finished && a.due_date?.slice(0, 10) > todayStr;
    (future ? soon : today).push(a);
  }
  return { today, soon };
}

// Split today's assignments into the Today screen's sections.
export function splitTodaySections(assignments, currentUser, isAdmin, todayStr, sortMode = 'default') {
  const todays = filterTodayAssignments(assignments, todayStr);
  const byStatus = makeSectionComparator(sortMode, todayStr);
  const myId = currentUser?.person_id;

  const pendingReview = isAdmin
    ? todays.filter((a) => a.status === 'pending_review')
    : [];

  // Includes the user's own pending_review chores (amber "Waiting for review").
  const mine = todays.filter((a) => a.person_id === myId).sort(byStatus);

  const familyAssignments = todays.filter(
    (a) => a.person_id && a.person_id !== myId && a.status !== 'pending_review'
  );
  const familyByPerson = familyAssignments.reduce((acc, a) => {
    const key = a.person_id;
    if (!acc[key]) acc[key] = { name: a.person_name, color: a.person_color, items: [] };
    acc[key].items.push(a);
    return acc;
  }, {});
  const familyGroups = Object.values(familyByPerson).map((g) => ({
    ...g,
    items: [...g.items].sort(byStatus),
  }));

  const unassigned = todays
    .filter((a) => !a.person_id && a.status === 'open')
    .sort(byStatus);

  return { pendingReview, mine, familyGroups, unassigned };
}

// Derived state for a single chore card.
export function choreState(
  assignment,
  currentUser,
  { showAdminControls = false, readonly = false, todayStr } = {}
) {
  const status = assignment.status;
  const isOpen = status === 'open';
  const isPending = status === 'pending_review';
  const isDone = status === 'done';
  const isSkipped = status === 'skipped';
  const isRejected = status === 'rejected';
  const isMine = assignment.person_id === currentUser?.person_id;
  const isUnassigned = !assignment.person_id;

  const due = assignment.due_date?.slice(0, 10);
  const isOverdue = (isOpen || isPending || isRejected) && !!due && !!todayStr && due < todayStr;

  // Admin sees approve/reject inline (not in overflow) for pending items.
  const showApproveReject = showAdminControls && isPending;
  const isInteractive = !readonly && (isOpen || isRejected) && (isMine || isUnassigned);
  // The assignee (or an admin) can undo a done/pending chore, unless it's been
  // approved (done with a reviewer recorded). Not gated on readonly so admins
  // can undo family members' cards.
  const canUncheck =
    (isMine || showAdminControls) && ((isDone && !assignment.reviewed_by) || isPending);

  return {
    isOpen, isPending, isDone, isSkipped, isRejected, isMine, isUnassigned,
    isOverdue, showApproveReject, isInteractive, canUncheck,
  };
}

// Resolve the name of the reviewer who sent a chore back, if any.
export function reviewerName(assignment, people) {
  if (!assignment.reviewed_by) return null;
  return (people ?? []).find((p) => p.person_id === assignment.reviewed_by)?.name ?? null;
}

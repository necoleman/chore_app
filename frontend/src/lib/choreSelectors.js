// Pure selectors for chore/assignment view logic.
//
// This logic was lifted verbatim from Today.svelte and ChoreCard.svelte so it
// can be unit-tested directly (the components delegate to these functions inside
// their reactive `$:` blocks). Keep these pure — no stores, no side effects.

import { appearDate, localDateOf } from './dueDates.js';

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
      return a.status === 'done' && localDateOf(a.completed_at) === todayStr;
    }
    return appearDate(d, a.lead_days) <= todayStr;
  });
}

// ─── Cadence grouping (#38) ───────────────────────────────────────────────────
//
// A person's list is split into four groups rather than colour-coded, because a
// heading states things in words and needs no legend. Order is fixed:
//
//   One-off → Daily Chores → Weekly Chores → Monthly/Longterm
//
// One-offs lead because nothing regenerates them. A missed daily chore returns
// tomorrow by itself; a missed one-off just sits wherever it was filed, and it
// exists precisely because somebody asked for it specially.
// The labels name each group's cadence. Order still runs soonest-first, so the
// list reads as an urgency ramp even though the words describe rhythm.
//
// "Daily Chores" covers daily chores pinned to specific weekdays too (#45): the
// group is the daily-cadence bucket, and a Mon/Thu chore belongs in it because
// pinning means "due on those days", not "sometime this week".
//
// Worth knowing if these get revisited: an earlier set used deadline words
// ("This week", "Monthly and occasional"), which read as *not now* for cards that
// were up right now — everything visible on Today is inside its lead window, so
// it is due within days. Cadence words avoid that trap; the Due date sort is
// where deadline words belong, and it has its own headings below.
export const GROUPS = [
  { key: 'oneoff',  label: 'One-off' },
  { key: 'daily',   label: 'Daily Chores' },
  { key: 'weekly',  label: 'Weekly Chores' },
  { key: 'monthly', label: 'Monthly/Longterm' },
];

// Which group an assignment belongs to. One-offs are routed by *what they are* —
// a manual assignment or a `once` chore — before cadence is considered at all.
//
// Everything else keys straight off `frequency` (#45). A daily chore pinned to
// Mon/Thu belongs under Daily Chores, because that's what pinning it means: due
// on those days, not "sometime this week". The old computed-period approach would
// have filed it under Weekly Chores.
export function groupKeyFor(a) {
  if (a.is_one_off || String(a.assigned_by || '').startsWith('manual') || a.frequency === 'once') {
    return 'oneoff';
  }
  if (a.frequency === 'daily') return 'daily';
  if (a.frequency === 'weekly') return 'weekly';
  return 'monthly'; // monthly and interval
}

// Comparator within a group. Keys in order:
//   1. finished (done/skipped) sink to the bottom
//   2. sort_last chores (e.g. after dinner) sink above those
//   3. due date ascending — overdue first, then today, then lead-window futures
//   4. points ascending — quick wins first; pure tiebreaker
export function compareWithinGroup(x, y) {
  const finished = (a) => (a.status === 'done' || a.status === 'skipped' ? 1 : 0);
  const later = (a) => (a.sort_last ? 1 : 0);
  return (
    finished(x) - finished(y) ||
    later(x) - later(y) ||
    (x.due_date || '').localeCompare(y.due_date || '') ||
    (Number(x.points) || 0) - (Number(y.points) || 0)
  );
}

// ─── Due-date grouping (the "Due date" sort option) ───────────────────────────
//
// The alternative view re-cuts the SAME cards into date buckets instead of
// cadence ones. Cards keep their cadence stripe and frequency chip either way —
// ChoreCard derives those from the assignment, not from the group it sits in —
// so this reads as the same list regrouped, not a different screen.
//
// Note the two modes now differ ONLY in how they group. They used to share the
// grouping and differ in comparator, which made "Due date" nearly a no-op: within
// a cadence group the default comparator already sorted by due date, so the only
// visible effect was that `sort_last` chores stopped sinking.
export const DUE_GROUPS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'duetoday', label: 'Due today' },
  { key: 'duesoon', label: 'Due soon' },
];

// Bucket by due date against the local today. A row with no due date sorts with
// the future ones rather than being dropped.
export function dueGroupKeyFor(a, todayStr) {
  const due = a.due_date?.slice(0, 10);
  if (!due) return 'duesoon';
  if (due < todayStr) return 'overdue';
  if (due === todayStr) return 'duetoday';
  return 'duesoon';
}

function buildGroups(defs, keyOf, items) {
  const buckets = {};
  for (const a of items ?? []) {
    (buckets[keyOf(a)] ??= []).push(a);
  }
  return defs
    .filter((g) => buckets[g.key]?.length)
    .map((g) => ({ ...g, items: [...buckets[g.key]].sort(compareWithinGroup) }));
}

// Split a person's assignments into the ordered, non-empty cadence groups.
// Returns [{ key, label, items }] — groups with nothing in them are omitted so
// the screen never shows an empty heading.
export function groupByCadence(items) {
  return buildGroups(GROUPS, groupKeyFor, items);
}

// The same, cut by due date. Finished chores still sink within their bucket, so
// a completed-but-overdue chore stays greyed out under Overdue.
export function groupByDue(items, todayStr) {
  return buildGroups(DUE_GROUPS, (a) => dueGroupKeyFor(a, todayStr), items);
}

export function groupAssignments(items, sortMode, todayStr) {
  return sortMode === 'due' ? groupByDue(items, todayStr) : groupByCadence(items);
}

// Split today's assignments into the Today screen's sections.
export function splitTodaySections(assignments, currentUser, isAdmin, todayStr, sortMode = 'default') {
  const todays = filterTodayAssignments(assignments, todayStr);
  const myId = currentUser?.person_id;

  const pendingReview = isAdmin
    ? todays.filter((a) => a.status === 'pending_review')
    : [];

  // Includes the user's own pending_review chores (amber "Waiting for review").
  const mine = groupAssignments(
    todays.filter((a) => a.person_id === myId),
    sortMode,
    todayStr
  );

  const familyAssignments = todays.filter(
    (a) => a.person_id && a.person_id !== myId && a.status !== 'pending_review'
  );
  const familyByPerson = familyAssignments.reduce((acc, a) => {
    const key = a.person_id;
    if (!acc[key]) acc[key] = { person_id: key, name: a.person_name, color: a.person_color, items: [] };
    acc[key].items.push(a);
    return acc;
  }, {});
  const familyGroups = Object.values(familyByPerson).map((g) => ({
    ...g,
    count: g.items.length,
    groups: groupAssignments(g.items, sortMode, todayStr),
  }));

  const unassigned = groupAssignments(
    todays.filter((a) => !a.person_id && a.status === 'open'),
    sortMode,
    todayStr
  );

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
  // `pending_review` is deliberately excluded: the assignee finished on time and
  // the delay is the reviewer's, so the card must not read as though they're
  // late. It also can't be missed — only approved or sent back.
  const isOverdue = (isOpen || isRejected) && !!due && !!todayStr && due < todayStr;

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

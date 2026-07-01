// ─── Nightly assignment generator ────────────────────────────────────────────

function runNightlyGenerator() {
  var today = new Date();

  var chores = getRows('Chores');
  var allAssignments = getRows('Assignments');
  var people = getRows('People');

  chores.forEach(function(chore) {
    processChoreGeneration(chore, today, allAssignments, people);
  });

  invalidateCache('Assignments');
  invalidateCache('Chores');
  invalidateCache('People');
  Logger.log('Nightly generator done for ' + formatDate(today));
}

// ─── Single-chore generation / carry-over ─────────────────────────────────────
//
// Surfaces (or carries over) one chore's assignment. Shared by the nightly
// generator and by add/update-chore (#17). Handles lead-time early appearance
// (#23) and the missed-chore collapse + points penalty (#21):
//
//   • Nothing happens until today reaches the next occurrence's appear date
//     (due − (leadDays − 1)), or its start_date.
//   • If that occurrence already has an assignment, we only advance the anchor.
//   • If a PRIOR occurrence is still open when the next one appears, we DON'T
//     create a second row — we deduct the chore's points from the assignee
//     (once per recurrence), bump `missed_count`, and advance the anchor.
//   • Otherwise we create the assignment with due_date = the real due date
//     (which may be in the future during the lead window).
//
// `allAssignments` is the current Assignments rows (mutated in place so repeat
// calls in the same run dedupe). `people` is the People rows (for the penalty).
// Does NOT invalidate caches — callers do that once after their batch.
// Returns the new assignment_id, or null when nothing was created.
function processChoreGeneration(chore, today, allAssignments, people) {
  var active = chore.active === true || chore.active === 'TRUE';
  if (!active) return null;

  // Hard start guard: nothing appears before start_date (even in the lead window).
  if (chore.start_date && formatDate(today) < chore.start_date) return null;

  var nextDue = nextDueForChore(chore, today);
  if (!nextDue) return null;

  // Not yet within the lead window for this occurrence.
  var appearDate = addDaysDate(nextDue, -appearOffsetDays(chore));
  if (formatDate(today) < formatDate(appearDate)) return null;

  var nextDueISO = formatDate(nextDue);
  var mine = allAssignments.filter(function(a) { return a.chore_id === chore.chore_id; });

  // Already have this occurrence — just record the anchor and stop.
  var existing = mine.find(function(a) { return a.due_date === nextDueISO; });
  if (existing) {
    stampLastGenerated(chore, nextDueISO);
    return null;
  }

  // A prior occurrence is still open → collapse + penalize instead of duplicating.
  var openPrior = mine.find(function(a) { return a.status === 'open' && a.due_date < nextDueISO; });
  if (openPrior) {
    var points = parseInt(chore.points, 10) || 0;
    if (points > 0 && openPrior.person_id) {
      incrementPoints(openPrior.person_id, -points, people);
    }
    var missed = (parseInt(openPrior.missed_count, 10) || 0) + 1;
    updateRow('Assignments', 'assignment_id', openPrior.assignment_id, { missed_count: missed });
    openPrior.missed_count = missed;
    stampLastGenerated(chore, nextDueISO);
    return null;
  }

  // Fresh occurrence — create the assignment (due_date may be in the future).
  var assignmentId = chore.chore_id + '_' + nextDueISO.replace(/-/g, '');
  appendRow('Assignments', {
    assignment_id: assignmentId,
    chore_id: chore.chore_id,
    person_id: chore.default_assignee || '',
    due_date: nextDueISO,
    status: 'open',
    assigned_by: 'auto',
  });
  // Reflect the new row locally so later calls in this run dedupe against it.
  allAssignments.push({
    assignment_id: assignmentId,
    chore_id: chore.chore_id,
    person_id: chore.default_assignee || '',
    due_date: nextDueISO,
    status: 'open',
  });

  var choreUpdates = { last_generated_date: nextDueISO };
  if (chore.frequency === 'once') choreUpdates.active = false; // one-and-done
  updateRow('Chores', 'chore_id', chore.chore_id, choreUpdates);
  chore.last_generated_date = nextDueISO;

  if (chore.default_assignee) {
    sendAssignmentNotification(assignmentId, chore.default_assignee);
  }
  return assignmentId;
}

// Advance the chore's occurrence anchor (idempotent).
function stampLastGenerated(chore, dueISO) {
  if (chore.last_generated_date === dueISO) return;
  updateRow('Chores', 'chore_id', chore.chore_id, { last_generated_date: dueISO });
  chore.last_generated_date = dueISO;
}

// Generates on demand for a single chore_id (used after add/update-chore, #17)
// so a chore that appears today surfaces immediately instead of waiting for the
// nightly run. Idempotent via the same occurrence/anchor logic.
function generateTodayForChore(choreId) {
  var chore = getRows('Chores').find(function(c) { return c.chore_id === choreId; });
  if (!chore) return null;

  var today = new Date();
  var allAssignments = getRows('Assignments');
  var people = getRows('People');

  var assignmentId = processChoreGeneration(chore, today, allAssignments, people);

  invalidateCache('Assignments');
  invalidateCache('Chores');
  invalidateCache('People');
  return assignmentId;
}

// ─── Nightly assignment generator ────────────────────────────────────────────

// Chores are processed one at a time, each isolated from the others.
//
// This used to be a bare forEach, so ANY failure — one malformed chore, or the
// six-minute execution ceiling — killed the whole run, and every chore after it
// in sheet order silently stopped generating. It failed invisibly: the app just
// showed fewer chores, with nothing to say why, and which ones survived depended
// on where in the sheet the run happened to die (#59).
//
// A try/catch cannot stop a timeout — Apps Script terminates the execution
// outright — so this handles the two causes differently. Per-chore catching
// contains a bad chore, and the progress log below is what makes a timeout
// legible: the last "generator:" line names how far the run got, so a truncated
// log is itself the diagnosis.
function runNightlyGenerator() {
  var started = new Date();
  var today = started;

  var chores = getRows('Chores');
  var allAssignments = getRows('Assignments');
  var people = getRows('People');

  var created = 0;
  var failed = 0;

  chores.forEach(function(chore, i) {
    try {
      if (processChoreGeneration(chore, today, allAssignments, people)) created++;
    } catch (err) {
      failed++;
      Logger.log('generator: FAILED on ' + chore.chore_id + ' (#' + (i + 1) + ') — ' +
                 (err && err.message ? err.message : err));
    }
    // Heartbeat every 10 chores, so a run killed by the time limit leaves a
    // record of where it stopped rather than nothing at all.
    if ((i + 1) % 10 === 0) {
      Logger.log('generator: ' + (i + 1) + '/' + chores.length + ' chores, ' +
                 Math.round((new Date() - started) / 1000) + 's elapsed');
    }
  });

  invalidateCache('Assignments');
  invalidateCache('Chores');
  invalidateCache('People');

  Logger.log('generator: DONE for ' + formatDate(today) + ' — ' + chores.length +
             ' chores, ' + created + ' created, ' + failed + ' failed, ' +
             Math.round((new Date() - started) / 1000) + 's total');
}

// ─── Single-chore generation / roll-forward ───────────────────────────────────
//
// Surfaces one chore's next occurrence. Shared by the nightly generator and by
// add/update-chore (#17).
//
// A chore is represented by exactly ONE live occurrence at a time, which rolls
// forward on schedule (#35/#38):
//
//   • Nothing happens until today reaches the occurrence's appear date
//     (due − (leadDays − 1)), or its start_date.
//   • If that occurrence already has an assignment, we only advance the anchor.
//   • If a PRIOR occurrence is still open when the next one appears, it is
//     CLOSED as missed — its assignee loses the chore's points (recorded on the
//     row as a negative `points_awarded` so History can tell a miss from an
//     excusal) — and the fresh occurrence inherits `missed_count + 1`.
//   • A prior occurrence in `pending_review` is left alone: the work was done and
//     is awaiting a parent, so there is nothing to penalize. The next occurrence
//     is created alongside it, carrying the miss count unchanged.
//
// This replaces the v1.3.0 rollover collapse and the v1.7.0 `recur_mode` recreate
// stack. Neither survives: rollover left the prior open and created nothing,
// recreate left it open AND stacked. The roll-forward closes it and replaces it,
// so a missed occurrence's due date is never frozen in the past.
//
// `allAssignments` is the current Assignments rows (mutated in place so repeat
// calls in the same run dedupe). `people` is the People rows (for the penalty).
// Does NOT invalidate caches — callers do that once after their batch.
// Returns the new assignment_id, or null when nothing was created.
function processChoreGeneration(chore, today, allAssignments, people) {
  var active = chore.active === true || chore.active === 'TRUE';
  if (!active) return null;

  // Only AUTO occurrences participate in the recurrence. Manual one-offs from the
  // "Add" button live outside it entirely (#39) — they are never closed, rolled
  // forward, penalized, or counted toward the chore's miss streak.
  var mine = allAssignments.filter(function(a) {
    return a.chore_id === chore.chore_id && !isOneOffAssignment(a);
  });

  // Reconcile the cursor against reality BEFORE trusting it (#41).
  //
  // `last_generated_date` is meant to equal the due date of the newest auto
  // occurrence, but it can drift AHEAD of the rows: the pre-v1.9 rollover
  // collapse advanced it while leaving the assignment where it was, and the old
  // vacation pause advanced it without creating a row at all. A hand-edited
  // sheet does the same.
  //
  // When it's ahead, `nextDueForChore` returns an occurrence that hasn't come
  // round yet, the appear gate blocks, and the generator does nothing — leaving
  // the live row stranded as permanently overdue and never regenerating. So
  // trust the rows over the cursor and wind it back to the newest occurrence.
  // (A chore with no rows at all is left alone: blanking the cursor is the
  // documented way to force a rebuild, and that must keep working.)
  var newest = mine.reduce(function(latest, a) {
    return (!latest || a.due_date > latest.due_date) ? a : latest;
  }, null);
  if (newest && chore.last_generated_date &&
      String(chore.last_generated_date).slice(0, 10) > String(newest.due_date).slice(0, 10)) {
    stampLastGenerated(chore, String(newest.due_date).slice(0, 10));
  }

  // `start_date` is the first occurrence's DUE date — nextDueForChore clamps to
  // it — and the lead window below may surface the chore a few days earlier (#9).
  var nextDue = nextDueForChore(chore, today);
  if (!nextDue) return null;

  // Not yet within the lead window for this occurrence.
  var appearDate = addDaysDate(nextDue, -appearOffsetDays(chore));
  if (formatDate(today) < formatDate(appearDate)) return null;

  var nextDueISO = formatDate(nextDue);

  // Close out the occurrence being superseded. `pending_review` is deliberately
  // excluded: that work is done and awaiting review, so the next occurrence is
  // created alongside it and the miss count carries unchanged.
  var prior = mine.find(function(a) { return a.status === 'open' && a.due_date < nextDueISO; });

  // Already have this occurrence — record the anchor and stop. But close any
  // stranded prior FIRST: an occurrence older than the current one is finished
  // with either way, and returning early used to leave it open forever. That
  // can't arise in steady state (one live occurrence at a time) but it does
  // after a messy transition or a hand-edited sheet.
  var existing = mine.find(function(a) { return a.due_date === nextDueISO; });
  if (existing) {
    if (prior) {
      var stranded = closeMissedOccurrence(chore, prior, people);
      updateRow('Assignments', 'assignment_id', existing.assignment_id, { missed_count: stranded });
      existing.missed_count = stranded;
    }
    stampLastGenerated(chore, nextDueISO);
    return null;
  }

  // Resolve who gets this occurrence — rotating through `default_assignee` when
  // it holds a comma-delimited list (#24), skipping anyone on vacation (#29).
  // A sole assignee on vacation resolves to '' and the occurrence generates as
  // UNCLAIMED, so the rest of the family can pick it up. Unclaimed occurrences
  // roll forward like any other but cost nobody points, which is what protects
  // the vacationer — no pause guard is needed (this replaces #34).
  var assignee = resolveRotationAssignee(chore, people);

  var carriedMisses = 0;
  if (prior) {
    carriedMisses = closeMissedOccurrence(chore, prior, people);
  } else {
    // No open prior — inherit the streak from the most recent closed occurrence
    // so a run of misses keeps counting, and a completion resets it to 0.
    carriedMisses = missesToCarry(mine, nextDueISO);
  }

  var assignmentId = chore.chore_id + '_' + nextDueISO.replace(/-/g, '');

  // The id encodes the due date, so two occurrences of one chore on the same
  // date collide. The schedule alone can't produce that — but ANYTHING that
  // moves a due date leaves the ORIGINAL date in the id, and then a later
  // occurrence can mint an id that already exists. The `existing` check above
  // misses it because that compares due dates, not ids.
  //
  // Note this is reachable through ordinary use, not just a hand-edited sheet:
  // `actionBump` backs both **Move date** and **Push**, and neither rewrites the
  // id. Move an occurrence off its date and the id it was born with is left
  // free for the schedule to hand out again. That is exactly how the live case
  // arose — an occurrence moved from the 23rd to the 18th, then the genuine
  // 23rd occurrence generated on top of its abandoned id.
  //
  // A duplicate is close to invisible and very hard to diagnose: the older row is
  // usually closed and filtered off Today, so you see one card — but every lookup
  // uses find(), which takes the FIRST match. Completing the live occurrence then
  // hits the stale twin and fails with "Assignment is not open", every time,
  // for that chore only (#58).
  if (allAssignments.some(function(a) { return a.assignment_id === assignmentId; })) {
    assignmentId = assignmentId + '_' + Utilities.getUuid().slice(0, 4);
    Logger.log('Duplicate assignment id for ' + chore.chore_id + ' on ' + nextDueISO +
               ' — created as ' + assignmentId + '. Check for a hand-edited due_date.');
  }

  appendRow('Assignments', {
    assignment_id: assignmentId,
    chore_id: chore.chore_id,
    person_id: assignee,
    due_date: nextDueISO,
    status: 'open',
    assigned_by: 'auto',
    missed_count: carriedMisses || '',
  });
  // Reflect the new row locally so later calls in this run dedupe against it.
  allAssignments.push({
    assignment_id: assignmentId,
    chore_id: chore.chore_id,
    person_id: assignee,
    due_date: nextDueISO,
    status: 'open',
    assigned_by: 'auto',
    missed_count: carriedMisses,
  });

  var choreUpdates = { last_generated_date: nextDueISO };
  // Advance the rotation pointer to whoever we just planned to assign, so the
  // sequence is immune to manual reassignment (which changes the assignment's
  // person_id but not this pointer).
  if (assignee) choreUpdates.rotation_last = assignee;
  if (chore.frequency === 'once') choreUpdates.active = false; // one-and-done
  updateRow('Chores', 'chore_id', chore.chore_id, choreUpdates);
  chore.last_generated_date = nextDueISO;
  if (assignee) chore.rotation_last = assignee;

  if (assignee) {
    sendAssignmentNotification(assignmentId, assignee);
  }
  return assignmentId;
}

// Close an occurrence that was never done: mark it `skipped`, deduct the chore's
// points from its assignee (clamped ≥0 by incrementPoints) and record the
// deduction on the row as a NEGATIVE `points_awarded`. That sign is what lets
// History tell an automatic miss from an admin excusal, which records no points.
//
// Unclaimed occurrences cost nobody points — there is no owner to charge — but
// they are still closed and still advance the miss streak, so a neglected chore
// visibly accumulates.
//
// Returns the miss count the SUCCEEDING occurrence should carry.
function closeMissedOccurrence(chore, assignment, people) {
  var points = parseInt(chore.points, 10) || 0;
  var updates = { status: 'skipped' };

  if (points > 0 && assignment.person_id) {
    incrementPoints(assignment.person_id, -points, people);
    updates.points_awarded = -points;
  }

  updateRow('Assignments', 'assignment_id', assignment.assignment_id, updates);
  assignment.status = 'skipped';

  return (parseInt(assignment.missed_count, 10) || 0) + 1;
}

// The miss count a fresh occurrence should start from when no open prior was
// closed. Looks at the most recent occurrence before `nextDueISO`:
//   • completed (`done`) → 0, the streak is broken by doing the chore
//   • closed unfinished (`skipped`, whether missed or excused) → its count + 1
//   • still `pending_review` → its count unchanged; the work may yet be accepted,
//     and `actionReject` applies the miss if it is sent back instead
//   • nothing at all → 0
function missesToCarry(mine, nextDueISO) {
  var prev = mine
    .filter(function(a) { return a.due_date < nextDueISO; })
    .reduce(function(latest, a) {
      return (!latest || a.due_date > latest.due_date) ? a : latest;
    }, null);

  if (!prev) return 0;
  var count = parseInt(prev.missed_count, 10) || 0;
  if (prev.status === 'done') return 0;
  if (prev.status === 'pending_review') return count;
  return count + 1;
}

// Resolve the assignee for a fresh occurrence, rotating through the chore's
// `default_assignee` when it's a comma-delimited list of person_ids (#24):
//
//   • 0 people → '' (unassigned / claimable).
//   • 1 person → that person (no rotation).
//   • 2+ → the person AFTER `rotation_last` in the list (wrapping). When
//     `rotation_last` is empty (first ever) or no longer in the list, we fall
//     back to the first person in line.
//
// Anyone flagged on vacation (#29) is skipped: a sole assignee on vacation makes
// the chore unclaimed, and a rotation steps past vacationers to the next
// available person (all on vacation → unclaimed).
//
// Rotation state lives in the `rotation_last` column — never read from the
// previous assignment's person_id — so a manual reassignment doesn't move the
// order: the next occurrence still goes to whoever would have gotten it.
function resolveRotationAssignee(chore, people) {
  var onVacation = {};
  (people || []).forEach(function(p) {
    if (p.on_vacation === true || p.on_vacation === 'TRUE') onVacation[p.person_id] = true;
  });

  var list = String(chore.default_assignee || '')
    .split(',')
    .map(function(s) { return s.trim(); })
    .filter(function(s) { return s.length > 0; });

  if (list.length === 0) return '';
  if (list.length === 1) return onVacation[list[0]] ? '' : list[0];

  // Walk forward from just after rotation_last (or the start, when the pointer
  // is empty/dropped), returning the first person who isn't on vacation.
  var idx = list.indexOf(chore.rotation_last);
  var start = idx === -1 ? 0 : (idx + 1) % list.length;
  for (var i = 0; i < list.length; i++) {
    var cand = list[(start + i) % list.length];
    if (!onVacation[cand]) return cand;
  }
  return ''; // everyone on vacation → unclaimed
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

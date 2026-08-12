// ─── Streak maintenance ───────────────────────────────────────────────────────
//
// Runs at 11pm, judging the day that is still in progress — it has to run while
// `todayStr()` still returns the day being graded. That leaves a gap: the
// generator rolls the day over at 3am, so a chore finished between 11pm and 3am
// still avoids its points penalty but arrives too late for the streak. This is
// known and deliberate — 11pm is the intended cutoff, chores being meant for
// daytime. Don't "harmonize" the two jobs onto one schedule without asking.

// A day counts toward the streak when every assignment due that day was
// resolved. Resolution means:
//
//   • `done`          — completed and, if it needed review, accepted
//   • `pending_review` — finished on time and waiting on a parent. The assignee
//     did their part; the delay is the reviewer's, so it must not cost them the
//     streak. If the review later rejects it, `actionReject` calls
//     `recomputeStreak` to take the credit back.
//   • `skipped`       — either excused by an admin or closed as missed. An
//     excusal costs no points and must not cost a streak either.
//
// Anything still `open` at the cutoff breaks the day.
function isStreakSatisfied(assignment) {
  var s = assignment.status;
  return s === 'done' || s === 'pending_review' || s === 'skipped';
}

function runStreakMaintenance() {
  var todayISO = todayStr();
  var assignments = getRows('Assignments').filter(function(a) {
    return a.due_date === todayISO;
  });
  var people = getRows('People');

  people.forEach(function(person) {
    var mine = assignments.filter(function(a) {
      return a.person_id === person.person_id;
    });

    // No assignments today — no change to streak
    if (mine.length === 0) return;

    var allResolved = mine.every(isStreakSatisfied);

    var current = parseInt(person.streak_current, 10) || 0;
    var best = parseInt(person.streak_best, 10) || 0;

    var newCurrent = allResolved ? current + 1 : 0;
    var newBest = Math.max(best, newCurrent);

    updateRow('People', 'person_id', person.person_id, {
      streak_current: newCurrent,
      streak_best: newBest,
    });
  });

  invalidateCache('People');
  Logger.log('Streak maintenance done for ' + todayISO);
}

// Rebuild `streak_current` from the assignment log, walking backwards from
// yesterday until a day fails. Called when a rejection retracts credit the streak
// was already given for a pending chore (#38).
//
// Recomputing rather than zeroing matters: someone twelve days into a streak who
// has Monday sent back on Wednesday should land on the days they genuinely
// earned since, not on nothing. Days on which the person had no assignments are
// transparent — they neither extend nor break a streak, matching
// runStreakMaintenance's "no assignments today, no change" rule.
//
// `streak_best` is deliberately left alone; a record already set isn't clawed
// back retroactively.
function recomputeStreak(personId) {
  var mine = getRows('Assignments').filter(function(a) { return a.person_id === personId; });

  var byDate = {};
  mine.forEach(function(a) {
    var d = String(a.due_date || '').slice(0, 10);
    if (!d) return;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(a);
  });

  // Today is still in progress and is scored by the 11pm job, so start at
  // yesterday — otherwise an unfinished chore due today would read as a break.
  var cursor = addDaysDate(parseISODate(todayStr()), -1);
  var streak = 0;

  for (var i = 0; i < 400; i++) {
    var key = formatDate(cursor);
    var rows = byDate[key];
    if (rows && rows.length > 0) {
      if (!rows.every(isStreakSatisfied)) break;
      streak++;
    }
    cursor = addDaysDate(cursor, -1);
  }

  updateRow('People', 'person_id', personId, { streak_current: streak });
  return streak;
}

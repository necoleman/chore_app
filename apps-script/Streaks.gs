// ─── Streak maintenance ───────────────────────────────────────────────────────

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

    // Streak only counts if every assignment is fully accepted (status = done).
    // pending_review does NOT count — a parent must approve first.
    var allDone = mine.every(function(a) { return a.status === 'done'; });

    var current = parseInt(person.streak_current, 10) || 0;
    var best = parseInt(person.streak_best, 10) || 0;

    var newCurrent = allDone ? current + 1 : 0;
    var newBest = Math.max(best, newCurrent);

    updateRow('People', 'person_id', person.person_id, {
      streak_current: newCurrent,
      streak_best: newBest,
    });
  });

  invalidateCache('People');
  Logger.log('Streak maintenance done for ' + todayISO);
}

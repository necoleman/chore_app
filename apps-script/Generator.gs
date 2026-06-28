// ─── Nightly assignment generator ────────────────────────────────────────────

function runNightlyGenerator() {
  var today = new Date();
  var todayISO = formatDate(today);

  var chores = getRows('Chores');
  var existingToday = getRows('Assignments').filter(function(a) {
    return a.due_date === todayISO;
  });

  // Index existing assignments by chore_id to detect duplicates.
  // Note: there may be multiple assignments for the same chore (e.g. manual
  // assign + auto), so we track all of them.
  var existingChoreIds = {};
  existingToday.forEach(function(a) {
    existingChoreIds[a.chore_id] = true;
  });

  chores.forEach(function(chore) {
    var active = chore.active === true || chore.active === 'TRUE';
    if (!active) return;

    // Skip if already generated for today
    if (existingChoreIds[chore.chore_id]) return;

    if (!isDueToday(chore, today)) return;

    // Create the assignment row
    var assignmentId = chore.chore_id + '_' + todayISO.replace(/-/g, '');
    appendRow('Assignments', {
      assignment_id: assignmentId,
      chore_id: chore.chore_id,
      person_id: chore.default_assignee || '',
      due_date: todayISO,
      status: 'open',
      assigned_by: 'auto',
    });

    // Update last_generated_date for monthly/interval/once chores so catch-up
    // logic has an accurate anchor point for the next run. One-time ("once")
    // chores also auto-archive (active=false) so they leave the active list.
    if (chore.frequency === 'monthly' || chore.frequency === 'interval' || chore.frequency === 'once') {
      var choreUpdates = { last_generated_date: todayISO };
      if (chore.frequency === 'once') choreUpdates.active = false;
      updateRow('Chores', 'chore_id', chore.chore_id, choreUpdates);
    }

    // Send immediate push notification if the chore has a default assignee.
    if (chore.default_assignee) {
      sendAssignmentNotification(assignmentId, chore.default_assignee);
    }
  });

  invalidateCache('Assignments');
  invalidateCache('Chores');
  Logger.log('Nightly generator done for ' + todayISO);
}

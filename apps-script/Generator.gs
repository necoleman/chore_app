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
    generateAssignmentIfDue(chore, today, existingChoreIds);
  });

  invalidateCache('Assignments');
  invalidateCache('Chores');
  Logger.log('Nightly generator done for ' + todayISO);
}

// ─── Single-chore generation ─────────────────────────────────────────────────
//
// Generates today's assignment for one chore if it is active and due. Shared by
// the nightly generator and by add/update-chore so a chore that becomes due
// today surfaces immediately instead of waiting for the next nightly run.
//
// `existingChoreIds` maps chore_id → true for chores already assigned today, to
// avoid duplicates. It is optional; when omitted the caller is responsible for
// having checked (the nightly generator always passes it).
//
// Returns the new assignment_id, or null if nothing was generated. Does NOT
// invalidate caches — callers do that once after their batch.
function generateAssignmentIfDue(chore, today, existingChoreIds) {
  var active = chore.active === true || chore.active === 'TRUE';
  if (!active) return null;

  // Skip if already generated for today.
  if (existingChoreIds && existingChoreIds[chore.chore_id]) return null;

  if (!isDueToday(chore, today)) return null;

  var todayISO = formatDate(today);
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

  return assignmentId;
}

// Generates today's assignment for a single chore_id on demand (used after
// add/update-chore). Reads current Assignments to dedupe against anything
// already scheduled today, then invalidates caches if it created a row.
function generateTodayForChore(choreId) {
  var chore = getRows('Chores').find(function(c) { return c.chore_id === choreId; });
  if (!chore) return null;

  var today = new Date();
  var todayISO = formatDate(today);
  var existingChoreIds = {};
  getRows('Assignments').forEach(function(a) {
    if (a.due_date === todayISO) existingChoreIds[a.chore_id] = true;
  });

  var assignmentId = generateAssignmentIfDue(chore, today, existingChoreIds);
  if (assignmentId) {
    invalidateCache('Assignments');
    invalidateCache('Chores');
  }
  return assignmentId;
}

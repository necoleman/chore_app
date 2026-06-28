// ─── GET: today ───────────────────────────────────────────────────────────────

function actionToday(params) {
  var assignments = getCachedRows('Assignments');
  var chores = getCachedRows('Chores');
  var people = getCachedRows('People');

  var today = todayStr();

  // Index chores and people for O(1) lookup
  var choreMap = {};
  chores.forEach(function(c) { choreMap[c.chore_id] = c; });
  var personMap = {};
  people.forEach(function(p) { personMap[p.person_id] = p; });

  // Finished items (done/skipped) only for today, so the UI can show them as
  // completed. Non-terminal items (open/pending_review/rejected) persist
  // regardless of date so overdue chores stay on Today until resolved or bumped.
  var relevant = assignments.filter(function(a) {
    if (a.status === 'skipped' || a.status === 'done') {
      return a.due_date === today;
    }
    return true;
  });

  var result = relevant.map(function(a) {
    var chore = choreMap[a.chore_id] || {};
    var person = a.person_id ? (personMap[a.person_id] || {}) : {};
    return {
      assignment_id:    a.assignment_id,
      chore_id:         a.chore_id,
      chore_name:       chore.name || '',
      location:         chore.location || '',
      description:      chore.description || '',
      points:           chore.points || 0,
      requires_approval: chore.requires_approval === true || chore.requires_approval === 'TRUE',
      person_id:        a.person_id || null,
      person_name:      person.name || null,
      person_color:     person.color || null,
      due_date:         a.due_date,
      status:           a.status,
      completed_at:     a.completed_at || null,
      points_awarded:   a.points_awarded || null,
      assigned_by:      a.assigned_by,
      reviewed_by:      a.reviewed_by || null,
      reviewed_at:      a.reviewed_at || null,
      review_note:      a.review_note || null,
    };
  });

  return { assignments: result, people: people };
}

function getWeekStart() {
  var now = new Date();
  var day = now.getDay();
  var weekStart = new Date(now);
  weekStart.setDate(now.getDate() - day);
  return formatDate(weekStart);
}

// ─── GET: people ──────────────────────────────────────────────────────────────

function actionPeople(params) {
  return { people: getRows('People') };
}

// ─── GET: chores ──────────────────────────────────────────────────────────────

function actionChores(params) {
  return { chores: getRows('Chores') };
}

// ─── GET: locations ───────────────────────────────────────────────────────────

function actionLocations(params) {
  return { locations: getRows('Locations') };
}

// ─── GET: history ─────────────────────────────────────────────────────────────

function actionHistory(params) {
  var limit = parseInt(params.limit || '50', 10);
  var personFilter = params.person_id || null;

  var assignments = getRows('Assignments');
  var chores = getRows('Chores');
  var people = getRows('People');

  var choreMap = {};
  chores.forEach(function(c) { choreMap[c.chore_id] = c; });
  var personMap = {};
  people.forEach(function(p) { personMap[p.person_id] = p; });

  var terminal = ['done', 'skipped', 'rejected'];
  var filtered = assignments.filter(function(a) {
    if (terminal.indexOf(a.status) === -1) return false;
    if (personFilter && a.person_id !== personFilter) return false;
    return true;
  });

  // Sort descending by completed_at (or due_date as fallback)
  filtered.sort(function(a, b) {
    var ta = a.completed_at || a.due_date || '';
    var tb = b.completed_at || b.due_date || '';
    return tb.localeCompare(ta);
  });

  var result = filtered.slice(0, limit).map(function(a) {
    var chore = choreMap[a.chore_id] || {};
    var person = a.person_id ? (personMap[a.person_id] || {}) : {};
    return {
      assignment_id: a.assignment_id,
      chore_name:    chore.name || '',
      location:      chore.location || '',
      person_name:   person.name || null,
      person_color:  person.color || null,
      due_date:      a.due_date,
      status:        a.status,
      completed_at:  a.completed_at || null,
      points_awarded: a.points_awarded || null,
      review_note:   a.review_note || null,
    };
  });

  return { history: result };
}

// ─── POST: complete ───────────────────────────────────────────────────────────

function actionComplete(body) {
  var assignmentId = body.assignment_id;
  var personId = body.person_id;

  var assignments = getRows('Assignments');
  var assignment = assignments.find(function(a) { return a.assignment_id === assignmentId; });
  if (!assignment) throw new Error('Assignment not found');
  if (assignment.status !== 'open') throw new Error('Assignment is not open');

  var chores = getRows('Chores');
  var chore = chores.find(function(c) { return c.chore_id === assignment.chore_id; });
  if (!chore) throw new Error('Chore not found');

  var people = getRows('People');
  var person = people.find(function(p) { return p.person_id === personId; });
  if (!person) throw new Error('Person not found');

  var requiresApproval = chore.requires_approval === true || chore.requires_approval === 'TRUE';
  var isAdmin = person.is_admin === true || person.is_admin === 'TRUE';
  var now = nowIso();

  if (requiresApproval && !isAdmin) {
    updateRow('Assignments', 'assignment_id', assignmentId, {
      status: 'pending_review',
      completed_at: now,
      person_id: personId,
      // Clear any review fields lingering from a previous reject so a later
      // auto-done isn't mistaken for "approved" by the uncheck rule.
      reviewed_by: '',
      reviewed_at: '',
      review_note: '',
    });
    invalidateCache('Assignments');
    return { status: 'pending_review', completed_at: now };
  } else {
    var points = parseInt(chore.points, 10) || 0;
    updateRow('Assignments', 'assignment_id', assignmentId, {
      status: 'done',
      completed_at: now,
      person_id: personId,
      points_awarded: points,
      reviewed_by: '',
      reviewed_at: '',
      review_note: '',
    });
    incrementPoints(personId, points, people);
    invalidateCache('Assignments');
    invalidateCache('People');
    return { status: 'done', completed_at: now, points_awarded: points };
  }
}

// ─── POST: approve ────────────────────────────────────────────────────────────

function actionApprove(body) {
  var assignmentId = body.assignment_id;
  var adminPersonId = body.admin_person_id;

  var assignments = getRows('Assignments');
  var assignment = assignments.find(function(a) { return a.assignment_id === assignmentId; });
  if (!assignment) throw new Error('Assignment not found');
  if (assignment.status !== 'pending_review') throw new Error('Assignment is not pending review');

  var chores = getRows('Chores');
  var chore = chores.find(function(c) { return c.chore_id === assignment.chore_id; });
  var points = chore ? (parseInt(chore.points, 10) || 0) : 0;

  var now = nowIso();
  updateRow('Assignments', 'assignment_id', assignmentId, {
    status: 'done',
    points_awarded: points,
    reviewed_by: adminPersonId,
    reviewed_at: now,
  });

  if (assignment.person_id) {
    var people = getRows('People');
    incrementPoints(assignment.person_id, points, people);
    invalidateCache('People');
  }

  invalidateCache('Assignments');
  return { status: 'done', points_awarded: points, reviewed_at: now };
}

// ─── POST: reject ─────────────────────────────────────────────────────────────

function actionReject(body) {
  var assignmentId = body.assignment_id;
  var adminPersonId = body.admin_person_id;
  var reviewNote = body.review_note || '';

  var assignments = getRows('Assignments');
  var assignment = assignments.find(function(a) { return a.assignment_id === assignmentId; });
  if (!assignment) throw new Error('Assignment not found');
  if (assignment.status !== 'pending_review') throw new Error('Assignment is not pending review');

  var now = nowIso();
  updateRow('Assignments', 'assignment_id', assignmentId, {
    status: 'open',
    completed_at: '',
    reviewed_by: adminPersonId,
    reviewed_at: now,
    review_note: reviewNote,
  });

  invalidateCache('Assignments');
  return { status: 'open', review_note: reviewNote, reviewed_at: now };
}

// ─── POST: uncomplete (undo a mistaken check) ─────────────────────────────────
//
// Reverts a done/pending_review assignment back to open and removes any points
// that were awarded. Approved chores (status done with reviewed_by set) cannot
// be unchecked.

function actionUncomplete(body) {
  var assignmentId = body.assignment_id;

  var assignments = getRows('Assignments');
  var assignment = assignments.find(function(a) { return a.assignment_id === assignmentId; });
  if (!assignment) throw new Error('Assignment not found');

  if (assignment.status === 'done' && assignment.reviewed_by) {
    throw new Error('Approved chores cannot be unchecked');
  }
  if (assignment.status !== 'done' && assignment.status !== 'pending_review') {
    throw new Error('Only completed chores can be unchecked');
  }

  var awarded = parseInt(assignment.points_awarded, 10) || 0;
  if (awarded > 0 && assignment.person_id) {
    var people = getRows('People');
    incrementPoints(assignment.person_id, -awarded, people);
    invalidateCache('People');
  }

  updateRow('Assignments', 'assignment_id', assignmentId, {
    status: 'open',
    completed_at: '',
    points_awarded: '',
  });

  invalidateCache('Assignments');
  return { status: 'open', completed_at: null, points_awarded: null };
}

// ─── POST: skip ───────────────────────────────────────────────────────────────

function actionSkip(body) {
  var assignmentId = body.assignment_id;
  updateRow('Assignments', 'assignment_id', assignmentId, { status: 'skipped' });
  invalidateCache('Assignments');
  return { status: 'skipped' };
}

// ─── POST: claim ──────────────────────────────────────────────────────────────

function actionClaim(body) {
  var assignmentId = body.assignment_id;
  var personId = body.person_id;
  if (!personId) throw new Error('person_id required');
  var found = updateRow('Assignments', 'assignment_id', assignmentId, {
    person_id: personId,
    assigned_by: 'manual',
  });
  if (!found) throw new Error('Assignment not found: ' + assignmentId);
  invalidateCache('Assignments');
  return { success: true };
}

// ─── POST: assign (manual assignment creation) ────────────────────────────────

function actionAssign(body) {
  var choreId = body.chore_id;
  var personId = body.person_id || '';
  var dueDate = body.due_date || todayStr();

  var assignmentId = choreId + '_' + dueDate.replace(/-/g, '') + '_' + generateId('m').slice(-6);
  appendRow('Assignments', {
    assignment_id: assignmentId,
    chore_id: choreId,
    person_id: personId,
    due_date: dueDate,
    status: 'open',
    assigned_by: 'manual',
  });
  invalidateCache('Assignments');
  return { assignment_id: assignmentId, success: true };
}

// ─── POST: reassign ───────────────────────────────────────────────────────────

function actionReassign(body) {
  var assignmentId = body.assignment_id;
  var personId = body.person_id;
  var adminPersonId = body.admin_person_id;

  var now = nowIso();
  updateRow('Assignments', 'assignment_id', assignmentId, {
    person_id: personId,
    last_modified_by: adminPersonId,
    last_modified_at: now,
  });
  invalidateCache('Assignments');

  // Push notification to newly assigned person
  sendAssignmentNotification(assignmentId, personId);

  return { success: true, last_modified_at: now };
}

// ─── POST: bump ───────────────────────────────────────────────────────────────

function actionBump(body) {
  var assignmentId = body.assignment_id;
  var dueDate = body.due_date;
  var adminPersonId = body.admin_person_id;

  var now = nowIso();
  updateRow('Assignments', 'assignment_id', assignmentId, {
    due_date: dueDate,
    last_modified_by: adminPersonId,
    last_modified_at: now,
  });
  invalidateCache('Assignments');

  // Push notification to the person about rescheduling
  var assignments = getRows('Assignments');
  var assignment = assignments.find(function(a) { return a.assignment_id === assignmentId; });
  if (assignment && assignment.person_id) {
    sendBumpNotification(assignment.person_id, assignment.chore_id, dueDate);
  }

  return { success: true, due_date: dueDate, last_modified_at: now };
}

// ─── POST: add_chore ──────────────────────────────────────────────────────────

function actionAddChore(body) {
  var slug = (body.name || 'chore').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20);
  var choreId = 'c_' + slug + '_' + Utilities.getUuid().slice(0, 6);

  appendRow('Chores', {
    chore_id: choreId,
    name: body.name,
    location: body.location || '',
    description: body.description || '',
    points: body.points || 1,
    frequency: body.frequency || 'daily',
    custom_days: body.custom_days || '',
    monthly_day: body.monthly_day || '',
    interval_days: body.interval_days || '',
    once_date: body.once_date || '',
    last_generated_date: '',
    default_assignee: body.default_assignee || '',
    requires_approval: body.requires_approval === true || body.requires_approval === 'true' ? true : false,
    active: true,
  });
  invalidateCache('Chores');
  return { chore_id: choreId, success: true };
}

// ─── POST: update_chore ───────────────────────────────────────────────────────

function actionUpdateChore(body) {
  var choreId = body.chore_id;
  if (!choreId) throw new Error('chore_id required');

  var updates = {};
  var allowed = ['name', 'location', 'description', 'points', 'frequency', 'custom_days',
                 'monthly_day', 'interval_days', 'once_date', 'default_assignee', 'requires_approval', 'active'];
  allowed.forEach(function(field) {
    if (body.hasOwnProperty(field)) updates[field] = body[field];
  });

  updateRow('Chores', 'chore_id', choreId, updates);
  invalidateCache('Chores');
  return { success: true };
}

// ─── POST: register_token ─────────────────────────────────────────────────────

function actionRegisterToken(body) {
  var personId = body.person_id;
  var fcmToken = body.fcm_token;
  if (!personId || !fcmToken) throw new Error('person_id and fcm_token required');
  updateRow('People', 'person_id', personId, { fcm_token: fcmToken });
  invalidateCache('People');
  return { success: true };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function incrementPoints(personId, points, people) {
  if (!points) return; // allow negative (undo); skip only a no-op zero
  var person = people.find(function(p) { return p.person_id === personId; });
  if (!person) return;
  var current = parseInt(person.points_total, 10) || 0;
  updateRow('People', 'person_id', personId, { points_total: Math.max(0, current + points) });
}

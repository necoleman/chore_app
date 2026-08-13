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
    // Skip "ghost" assignments whose chore no longer exists (#11) — e.g. the
    // chore row was deleted from the sheet. (Inactive chores are NOT skipped:
    // one-time chores auto-archive but their assignment must still show.)
    if (!choreMap[a.chore_id]) return false;
    if (a.status === 'skipped' || a.status === 'done') {
      if (a.due_date === today) return true;
      // A chore COMPLETED today stays on Today (greyed, at the bottom) for the
      // rest of the day even if it was overdue when checked off (#14). Compare
      // the completion INSTANT converted to the script timezone — not a raw
      // string slice — so legacy UTC timestamps (written before the #31 fix)
      // and new local-offset ones both resolve to the correct local day.
      return a.status === 'done' && completedOnLocalDate(a.completed_at, today);
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
      frequency:        chore.frequency || '',
      lead_days:        chore.name ? effectiveLeadDays(chore) : '',
      // Cadence in days, for the Today screen's grouping/ordering (#38).
      period_days:      chore.name ? sortPeriodDays(chore) : 1,
      // Sinks to the end of its cadence group, e.g. after-dinner chores (#40).
      sort_last:        chore.sort_last === true || chore.sort_last === 'TRUE',
      // Manual one-offs sit outside the recurrence and are grouped separately.
      is_one_off:       a.assigned_by === 'manual' || chore.frequency === 'once',
      points:           chore.points || 0,
      requires_approval: chore.requires_approval === true || chore.requires_approval === 'TRUE',
      person_id:        a.person_id || null,
      missed_count:     a.missed_count || 0,
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
  var chores = getRows('Chores');

  // Compute "last done" per chore (#9): the most recent completion among done
  // assignments, keyed by chore_id. Uses completed_at, falling back to due_date.
  var lastDone = {};
  getRows('Assignments').forEach(function(a) {
    if (a.status !== 'done') return;
    var when = a.completed_at || a.due_date || '';
    if (!when) return;
    if (!lastDone[a.chore_id] || when > lastDone[a.chore_id]) {
      lastDone[a.chore_id] = when;
    }
  });

  var result = chores.map(function(c) {
    var row = {};
    for (var k in c) { if (c.hasOwnProperty(k)) row[k] = c[k]; }
    row.last_done = lastDone[c.chore_id] || '';
    return row;
  });

  return { chores: result };
}

// ─── GET: locations ───────────────────────────────────────────────────────────

function actionLocations(params) {
  return { locations: getRows('Locations') };
}

// ─── GET: leaderboard ─────────────────────────────────────────────────────────
//
// Point totals per person over four windows, in one call so the UI's window
// toggle never refetches (#38).
//
// The short windows are summed from the Assignments log, bucketed by when the
// work actually happened (`completed_at`, falling back to `due_date` — the same
// rule actionHistory sorts by). A missed occurrence records its penalty as a
// negative `points_awarded`, so these net out losses automatically.
//
// All time deliberately uses the running `points_total` instead: it's a tally
// rather than a query, so archiving old Assignments rows (see spec §9) can't
// truncate it. Note it is floored at 0 by incrementPoints, so it can read
// slightly higher than a true sum of the log.
function actionLeaderboard(params) {
  var people = getRows('People');
  var assignments = getRows('Assignments');

  var today = todayStr();
  var weekStart = getWeekStart();
  var monthStart = today.slice(0, 8) + '01';

  var totals = {};
  people.forEach(function(p) { totals[p.person_id] = { today: 0, week: 0, month: 0 }; });

  assignments.forEach(function(a) {
    if (!a.person_id || !totals[a.person_id]) return;
    var pts = parseInt(a.points_awarded, 10);
    if (!pts) return;
    var when = String(a.completed_at || a.due_date || '').slice(0, 10);
    if (!when) return;
    if (when >= monthStart) totals[a.person_id].month += pts;
    if (when >= weekStart) totals[a.person_id].week += pts;
    if (when === today) totals[a.person_id].today += pts;
  });

  var result = people.map(function(p) {
    var t = totals[p.person_id] || { today: 0, week: 0, month: 0 };
    return {
      person_id:      p.person_id,
      name:           p.name,
      color:          p.color,
      is_admin:       p.is_admin === true || p.is_admin === 'TRUE',
      on_vacation:    p.on_vacation === true || p.on_vacation === 'TRUE',
      streak_current: parseInt(p.streak_current, 10) || 0,
      streak_best:    parseInt(p.streak_best, 10) || 0,
      points_today:   t.today,
      points_week:    t.week,
      points_month:   t.month,
      points_all:     parseInt(p.points_total, 10) || 0,
    };
  });

  return { leaderboard: result };
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
    if (!choreMap[a.chore_id]) return false; // skip ghosts of deleted chores (#11)
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
      // Who approved, sent back, or excused it. Lets History distinguish an admin
      // skip ("Skipped by Rachel") from an automatic miss, which has no reviewer
      // and carries a negative points_awarded instead.
      reviewer_name: a.reviewed_by ? ((personMap[a.reviewed_by] || {}).name || null) : null,
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
    anchorIntervalOnCompletion(assignment.chore_id, todayStr());
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

  // The occurrence may have been superseded while it sat waiting — the generator
  // creates the next one alongside a pending row rather than blocking on review.
  // Approving establishes that the chore WAS completed, so the miss streak resets
  // on whatever occurrence is now live; otherwise someone who did the work on time
  // keeps seeing "missed 3×" purely because the review was slow (#38).
  var live = liveOccurrence(assignment.chore_id, assignmentId);
  if (live && (parseInt(live.missed_count, 10) || 0) !== 0) {
    updateRow('Assignments', 'assignment_id', live.assignment_id, { missed_count: '' });
  }

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

  // Anchor on when the work was actually done, not when the admin got around to
  // reviewing it — an approval three days later must not push the cadence out.
  anchorIntervalOnCompletion(
    assignment.chore_id,
    String(assignment.completed_at || '').slice(0, 10) || todayStr()
  );

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
  var updates = {
    status: 'open',
    completed_at: '',
    reviewed_by: adminPersonId,
    reviewed_at: now,
    review_note: reviewNote,
  };

  // Sending a chore back to someone who is away leaves it stranded on their list
  // aging all trip — turning vacation ON only sweeps rows that were already open,
  // so a later reject slips past it. Park it in unclaimed instead, exactly as the
  // vacation sweep would have; the vacation-off re-home returns it to them.
  var owner = assignment.person_id
    ? getRows('People').find(function(p) { return p.person_id === assignment.person_id; })
    : null;
  if (owner && (owner.on_vacation === true || owner.on_vacation === 'TRUE')) {
    updates.person_id = '';
  }

  // A rejection must land exactly as if the chore had simply never been done
  // (#38). Whether that's still actionable depends on timing:
  //
  //   • Not superseded (same day) — reopen it, still doable. Nothing is deducted;
  //     the normal nightly close handles it if it stays undone.
  //   • Superseded — a newer occurrence already exists, so this one is history.
  //     Close it as missed with the points deducted, bump the live occurrence's
  //     miss count, and leave that fresh occurrence alone. The assignee simply
  //     does today's.
  //
  // This replaces the #25 newer-occurrence deletion, which reopened the old row
  // and deleted the new one — the opposite reconciliation.
  var live = liveOccurrence(assignment.chore_id, assignmentId);
  if (live) {
    var chore = getRows('Chores').find(function(c) { return c.chore_id === assignment.chore_id; });
    var points = chore ? (parseInt(chore.points, 10) || 0) : 0;

    updates.status = 'skipped';
    updates.completed_at = '';
    if (points > 0 && assignment.person_id) {
      incrementPoints(assignment.person_id, -points, getRows('People'));
      updates.points_awarded = -points;
      invalidateCache('People');
    }

    // Carry the feedback onto the live card. The closed row is off the Today
    // screen, so a note left only there is never read — the assignee would just
    // watch points disappear with no explanation.
    updateRow('Assignments', 'assignment_id', live.assignment_id, {
      missed_count: (parseInt(live.missed_count, 10) || 0) + 1,
      review_note: reviewNote,
      reviewed_by: adminPersonId,
      reviewed_at: now,
    });
  }

  updateRow('Assignments', 'assignment_id', assignmentId, updates);

  // Pending occurrences count toward the streak, so retracting one has to undo
  // the credit it was given. Rebuild from the log rather than zeroing, so days
  // genuinely earned since aren't discarded (#38).
  if (assignment.person_id) {
    recomputeStreak(assignment.person_id);
    invalidateCache('People');
  }

  invalidateCache('Assignments');
  var result = { status: updates.status, review_note: reviewNote, reviewed_at: now };
  // If it was unclaimed above, clear the denormalized person fields too — the
  // client merges this response into the card, and leaving them set would keep
  // showing the vacationing owner until the next 30s poll.
  if (updates.hasOwnProperty('person_id')) {
    result.person_id = null;
    result.person_name = null;
    result.person_color = null;
  }
  return result;
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

  // Undo the completion re-anchor: put the cursor back on this occurrence's own
  // due date, which is what the generator stamped when it created the row.
  anchorIntervalOnCompletion(assignment.chore_id, String(assignment.due_date || '').slice(0, 10));

  invalidateCache('Assignments');
  return { status: 'open', completed_at: null, points_awarded: null };
}

// ─── POST: skip ───────────────────────────────────────────────────────────────

// Any admin can excuse any chore — their own, someone else's, or an unclaimed
// one. Closes the occurrence exactly as a miss does, EXCEPT that no points are
// deducted: the row carries no `points_awarded`, and that absence is what
// distinguishes an excusal from a miss in History (#38).
//
// The occurrence still counts toward the chore's miss streak — the next
// generated one inherits count + 1 via `missesToCarry` — because the chore
// genuinely wasn't done. `reviewed_by`/`reviewed_at` record who excused it.
//
// For a recurring chore the next occurrence arrives on its normal regeneration
// date. For a manual one-off there is no next occurrence, so skipping is simply
// how you clear an ad-hoc request you've changed your mind about.
function actionSkip(body) {
  var assignmentId = body.assignment_id;
  var adminPersonId = body.admin_person_id || '';

  var assignment = getRows('Assignments')
    .find(function(a) { return a.assignment_id === assignmentId; });
  if (!assignment) throw new Error('Assignment not found');

  updateRow('Assignments', 'assignment_id', assignmentId, {
    status: 'skipped',
    reviewed_by: adminPersonId,
    reviewed_at: nowIso(),
  });
  invalidateCache('Assignments');
  return { status: 'skipped' };
}

// ─── POST: claim ──────────────────────────────────────────────────────────────

function actionClaim(body) {
  var assignmentId = body.assignment_id;
  var personId = body.person_id;
  if (!personId) throw new Error('person_id required');

  var assignment = getRows('Assignments')
    .find(function(a) { return a.assignment_id === assignmentId; });
  if (!assignment) throw new Error('Assignment not found: ' + assignmentId);

  var updates = { person_id: personId };
  // Taking ownership restarts the clock (#38): the due date becomes today, so
  // whoever picks the chore up gets a real deadline rather than inheriting
  // somebody else's lateness. `missed_count` deliberately survives — the date is
  // the current expectation, the counter is the record of neglect.
  var today = todayStr();
  if (String(assignment.due_date || '').slice(0, 10) !== today) updates.due_date = today;

  updateRow('Assignments', 'assignment_id', assignmentId, updates);
  invalidateCache('Assignments');
  return { success: true, due_date: updates.due_date || assignment.due_date };
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

  var assignment = getRows('Assignments')
    .find(function(a) { return a.assignment_id === assignmentId; });
  if (!assignment) throw new Error('Assignment not found: ' + assignmentId);

  var now = nowIso();
  var updates = {
    person_id: personId,
    last_modified_by: adminPersonId,
    last_modified_at: now,
  };

  // Same rule as claiming (#38): handing a chore to someone resets its due date
  // to today, so they aren't given a deadline that has already passed. Applies
  // whether it came from unclaimed or from another person. Skipped when clearing
  // the assignee — an unclaimed chore keeps its date and keeps ageing.
  var today = todayStr();
  if (personId && String(assignment.due_date || '').slice(0, 10) !== today) {
    updates.due_date = today;
  }

  updateRow('Assignments', 'assignment_id', assignmentId, updates);
  invalidateCache('Assignments');

  // Push notification to newly assigned person
  if (personId) sendAssignmentNotification(assignmentId, personId);

  return { success: true, last_modified_at: now, due_date: updates.due_date || assignment.due_date };
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
    monthly_week: body.monthly_week || '',
    monthly_weekday: (body.monthly_weekday === 0 || body.monthly_weekday) ? body.monthly_weekday : '',
    interval_days: body.interval_days || '',
    once_date: body.once_date || '',
    start_date: body.start_date || '',
    lead_days: (body.lead_days === 0 || body.lead_days) ? body.lead_days : '',
    sort_last: body.sort_last === true || body.sort_last === 'true' ? true : false,
    last_generated_date: '',
    default_assignee: body.default_assignee || '',
    requires_approval: body.requires_approval === true || body.requires_approval === 'true' ? true : false,
    active: true,
  });
  invalidateCache('Chores');

  // If the chore is due today, generate its assignment now so it shows up on
  // Today immediately instead of waiting for the nightly generator (#17).
  generateTodayForChore(choreId);

  return { chore_id: choreId, success: true };
}

// ─── POST: update_chore ───────────────────────────────────────────────────────

function actionUpdateChore(body) {
  var choreId = body.chore_id;
  if (!choreId) throw new Error('chore_id required');

  var existing = getRows('Chores').find(function(c) { return c.chore_id === choreId; });
  var oldStart = existing ? existing.start_date : '';
  var oldFreq = existing ? existing.frequency : '';

  var updates = {};
  var allowed = ['name', 'location', 'description', 'points', 'frequency', 'custom_days',
                 'monthly_day', 'monthly_week', 'monthly_weekday', 'interval_days', 'once_date',
                 'start_date', 'lead_days', 'sort_last', 'default_assignee', 'requires_approval', 'active'];
  allowed.forEach(function(field) {
    if (body.hasOwnProperty(field)) updates[field] = body[field];
  });

  updateRow('Chores', 'chore_id', choreId, updates);
  invalidateCache('Chores');

  // If an interval chore's first-due date (start_date) changed and it hasn't
  // been acted on yet, re-anchor the outstanding assignment to the new date so
  // the Today due date tracks the edit instead of stranding the old one (#12).
  var newFreq = body.hasOwnProperty('frequency') ? body.frequency : oldFreq;
  if (newFreq === 'interval' && body.hasOwnProperty('start_date') &&
      body.start_date && body.start_date !== oldStart) {
    reanchorIntervalAssignment(choreId, body.start_date);
  }

  // Editing frequency/day/start_date may make the chore due today; surface it
  // immediately. The same-day dedupe in the generator keeps this idempotent (#17).
  generateTodayForChore(choreId);

  return { success: true };
}

// Move an interval chore's single still-open, auto-generated assignment to a new
// due date (its new start_date) and re-anchor last_generated_date to match, so
// changing the "first due date" updates Today (#12). No-op if the chore has any
// completion history (more than one assignment, or a manual/non-open one) — we
// never reschedule work someone may already have started.
function reanchorIntervalAssignment(choreId, newDue) {
  var mine = getRows('Assignments').filter(function(a) { return a.chore_id === choreId; });
  if (mine.length !== 1) return;
  var a = mine[0];
  if (a.status !== 'open' || a.assigned_by !== 'auto') return;
  updateRow('Assignments', 'assignment_id', a.assignment_id, { due_date: newDue });
  updateRow('Chores', 'chore_id', choreId, { last_generated_date: newDue });
  invalidateCache('Assignments');
  invalidateCache('Chores');
}

// ─── POST: register_token ─────────────────────────────────────────────────────

function actionRegisterToken(body) {
  var personId = body.person_id;
  var fcmToken = body.fcm_token;
  if (!personId || !fcmToken) throw new Error('person_id and fcm_token required');

  // updateRow silently no-ops when the person_id row (or the fcm_token column)
  // isn't found, which previously let a failed write report success and leave
  // the sheet blank. Surface it instead so the client shows an error toast.
  var found = updateRow('People', 'person_id', personId, { fcm_token: fcmToken });
  if (!found) throw new Error('No People row for person_id: ' + personId);

  invalidateCache('People');
  return { success: true, token_length: String(fcmToken).length };
}

// ─── POST: set_vacation (admin toggles a person on/off vacation, #29) ──────────
//
// Turning vacation ON: flag the person and move all of their currently OPEN
// assignments to unclaimed (person_id=''), so no one is stuck waiting on someone
// who's away. Pending/done/skipped work is left alone. The generator separately
// routes their default/rotation chores to unclaimed while the flag is set.
//
// Turning vacation OFF: clear the flag and immediately re-home the assignments
// that belong to them — every currently-unclaimed OPEN assignment whose chore's
// SOLE default assignee is this person goes back to them. Shared/rotating chores
// stay unclaimed (the rotation picks them up again on the next occurrence). This
// is a targeted re-home, not a full generation run, so nothing is pulled forward.
function actionSetVacation(body) {
  var personId = body.person_id;
  if (!personId) throw new Error('person_id required');
  var onVacation = body.on_vacation === true || body.on_vacation === 'true' || body.on_vacation === 'TRUE';

  var found = updateRow('People', 'person_id', personId, { on_vacation: onVacation });
  if (!found) throw new Error('No People row for person_id: ' + personId);
  invalidateCache('People');

  if (onVacation) {
    getRows('Assignments').forEach(function(a) {
      if (a.person_id === personId && a.status === 'open') {
        updateRow('Assignments', 'assignment_id', a.assignment_id, { person_id: '' });
      }
    });
  } else {
    // Chores this person is a default assignee of — either the sole one, or a
    // member of a rotation. Originally sole-only, which orphaned every rotation
    // chore: turning vacation ON unclaims ALL of their open rows regardless of
    // how the chore is assigned, so a sole-only rule recovered a strict subset
    // and the rest sat unclaimed forever.
    var isDefaultFor = {};
    getRows('Chores').forEach(function(c) {
      var list = String(c.default_assignee || '')
        .split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      if (list.indexOf(personId) !== -1) isDefaultFor[c.chore_id] = true;
    });
    var today = todayStr();
    getRows('Assignments').forEach(function(a) {
      if (!a.person_id && a.status === 'open' && isDefaultFor[a.chore_id]) {
        var updates = { person_id: personId };
        // Same rule as claim/reassign (#38): taking ownership re-dates to today,
        // so nobody returns to a deadline that passed while they were away. The
        // miss count is kept — the date is the current expectation, the counter
        // is the record that the chore went undone.
        if (String(a.due_date || '').slice(0, 10) < today) {
          updates.due_date = today;
        }
        updateRow('Assignments', 'assignment_id', a.assignment_id, updates);
      }
    });
  }

  invalidateCache('Assignments');
  return { success: true, on_vacation: onVacation };
}

// ─── POST: reset_rotation (admin resets a rotating chore to the top, #33) ───────
//
// Reset a rotating chore (`default_assignee` = comma-list of 2+ person_ids) back
// to the first person in the list: reassign every CURRENT (open, not-overdue)
// assignment of the chore to list[0], and set the rotation pointer to list[0] so
// the *next* generated occurrence goes to list[1] (a clean restart). Overdue open
// assignments (due_date < today) are deliberately left untouched.
function actionResetRotation(body) {
  var choreId = body.chore_id;
  if (!choreId) throw new Error('chore_id required');

  var chore = getRows('Chores').find(function(c) { return c.chore_id === choreId; });
  if (!chore) throw new Error('No Chores row for chore_id: ' + choreId);

  var list = String(chore.default_assignee || '')
    .split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  if (list.length < 2) throw new Error('Chore is not a rotation: ' + choreId);

  var firstPerson = list[0];
  var today = todayStr();

  getRows('Assignments').forEach(function(a) {
    if (a.chore_id === choreId && a.status === 'open' && a.due_date >= today) {
      updateRow('Assignments', 'assignment_id', a.assignment_id, { person_id: firstPerson });
    }
  });
  updateRow('Chores', 'chore_id', choreId, { rotation_last: firstPerson });

  invalidateCache('Assignments');
  invalidateCache('Chores');
  return { success: true, first_person: firstPerson };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

// The chore's current live occurrence — the newest auto row that hasn't reached a
// terminal state — optionally excluding one assignment_id (the one being acted
// on). Manual one-offs are excluded: they sit outside the recurrence, so they are
// never the occurrence a review reconciles against.
//
// Used by approve/reject, which may land days after the occurrence they concern
// has already been superseded by the nightly roll-forward.
function liveOccurrence(choreId, excludeAssignmentId) {
  return getRows('Assignments')
    .filter(function(a) {
      return a.chore_id === choreId
        && a.assignment_id !== excludeAssignmentId
        && a.assigned_by !== 'manual'
        && (a.status === 'open' || a.status === 'pending_review');
    })
    .reduce(function(latest, a) {
      return (!latest || a.due_date > latest.due_date) ? a : latest;
    }, null);
}

function incrementPoints(personId, points, people) {
  if (!points) return; // allow negative (undo); skip only a no-op zero
  var person = people.find(function(p) { return p.person_id === personId; });
  if (!person) return;
  var current = parseInt(person.points_total, 10) || 0;
  updateRow('People', 'person_id', personId, { points_total: Math.max(0, current + points) });
}

// Re-anchor an INTERVAL chore's schedule cursor to `dateISO` (the completion
// date). "Every 90 days" means 90 days from when the chore was actually done —
// otherwise doing it 30 days late leaves the next occurrence only 60 days out,
// because the cursor is stamped with the occurrence's due date at generation.
//
// Interval only: calendar frequencies (daily/weekly/custom/monthly/once) must
// stay locked to their calendar, so completing one early or late must not shift
// the cadence. No-op for anything else.
function anchorIntervalOnCompletion(choreId, dateISO) {
  if (!dateISO) return; // never blank the cursor — that would regenerate from scratch
  var chore = getRows('Chores').find(function(c) { return c.chore_id === choreId; });
  if (!chore || chore.frequency !== 'interval') return;
  // Idempotent, like stampLastGenerated — completing on the due date is the common
  // case and shouldn't cost a sheet write.
  if (String(chore.last_generated_date || '').slice(0, 10) === dateISO) return;
  updateRow('Chores', 'chore_id', choreId, { last_generated_date: dateISO });
  invalidateCache('Chores');
}

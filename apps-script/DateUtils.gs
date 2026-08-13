// ─── Date utilities ──────────────────────────────────────────────────────────

var DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function firstOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function daysBetween(a, b) {
  var msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((a.getTime() - b.getTime()) / msPerDay);
}

/**
 * Date of the nth (1–4) occurrence of a weekday (0=Sun…6=Sat) in a given month.
 * We disregard the 5th occurrence per issue #16, so n is expected 1–4.
 */
function nthWeekdayOfMonth(year, month, weekday, n) {
  var first = new Date(year, month, 1);
  var offset = (weekday - first.getDay() + 7) % 7; // days until first such weekday
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

// True when the monthly chore uses the nth-weekday sub-mode (#16) rather than a
// fixed day-of-month. Both fields must be present.
function usesNthWeekday(chore) {
  return chore.monthly_week !== '' && chore.monthly_week != null &&
         chore.monthly_weekday !== '' && chore.monthly_weekday != null;
}

// True when a stored timestamp (ISO datetime, UTC or with an offset) falls on
// `todayISO` in the script timezone. Parses the instant and reformats it locally
// so both legacy UTC `completed_at` values (written before the #31 fix) and new
// local-offset ones resolve to the correct local day. Empty/invalid → false.
function completedOnLocalDate(timestamp, todayISO) {
  if (!timestamp) return false;
  var d = new Date(timestamp);
  if (isNaN(d.getTime())) return false;
  return formatDate(d) === todayISO;
}

// ─── Lead-time / next-occurrence scheduling (v1.3.0, #21 + #23) ───────────────

/** Parse a `yyyy-MM-dd` (or ISO) string into a local Date at midnight. */
function parseISODate(str) {
  var p = String(str).slice(0, 10).split('-');
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
}

function addDaysDate(date, n) {
  var d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

// Pure calendar predicate: is `date` a scheduled DUE day for this chore?
// (daily/weekly/custom/monthly only — no start_date, catch-up, or lead.)
function isScheduledDueDay(chore, date) {
  var freq = chore.frequency;
  if (freq === 'daily') return true;
  if (freq === 'weekly') return date.getDay() === parseInt(chore.custom_days, 10);
  if (freq === 'custom') {
    var days = (chore.custom_days || '').toLowerCase().split(',').map(function(d) { return d.trim(); });
    return days.indexOf(DAY_NAMES[date.getDay()]) !== -1;
  }
  if (freq === 'monthly') {
    var targetDay;
    if (usesNthWeekday(chore)) {
      var week = parseInt(chore.monthly_week, 10);
      var wd = parseInt(chore.monthly_weekday, 10);
      if (!week || isNaN(wd)) return false;
      targetDay = nthWeekdayOfMonth(date.getFullYear(), date.getMonth(), wd, week).getDate();
    } else {
      var md = parseInt(chore.monthly_day, 10);
      if (!md) return false;
      targetDay = Math.min(md, daysInMonth(date));
    }
    return date.getDate() === targetDay;
  }
  return false;
}

// The recurrence period in days — used to keep the lead window shorter than the
// interval so occurrences never overlap. (custom uses the 7-day weekly cycle;
// monthly uses 28, the shortest month, to stay safe across months.)
function recurrencePeriodDays(chore) {
  switch (chore.frequency) {
    case 'weekly':
    case 'custom':
      return 7;
    case 'monthly':
      return 28;
    case 'interval':
      return parseInt(chore.interval_days, 10) || 1;
    default: // daily, once — no meaningful interval
      return 1;
  }
}

// The chore's true cadence in days, used ONLY for grouping and ordering the
// Today screen (#38). Deliberately separate from `recurrencePeriodDays` above:
// that one reports a flat 7 for `custom` because it feeds the lead-window clamp,
// where treating M/W/F as a 2-day cycle would squash the lead window. Here we
// want the real cadence, so a thrice-weekly chore sorts above a weekly one.
//
// Not consulted for one-offs — manual assignments and `once` chores bypass
// cadence grouping entirely.
function sortPeriodDays(chore) {
  switch (chore.frequency) {
    case 'daily':
      return 1;
    case 'custom':
      var days = String(chore.custom_days || '')
        .split(',').map(function(s) { return s.trim(); }).filter(Boolean).length;
      return days > 0 ? 7 / days : 7;
    case 'weekly':
      return 7;
    case 'monthly':
      return 28;
    case 'interval':
      return parseInt(chore.interval_days, 10) || 7;
    default:
      return 1;
  }
}

// The lead window (#23): how many days the chore is visible before it goes
// overdue, so it appears `lead − 1` days before its due date. Rules: at least 1,
// strictly less than the recurrence interval, and **defaults to 1** (early
// appearance is opt-in per chore via the `lead_days` column). Daily/once are
// always 1 (they appear on the due date).
function effectiveLeadDays(chore) {
  var raw = parseInt(chore.lead_days, 10);
  var lead = (raw && raw >= 1) ? raw : 1;         // > 0, default 1
  var period = recurrencePeriodDays(chore);
  var maxLead = period > 1 ? period - 1 : 1;      // < interval (daily/once → 1)
  return Math.min(lead, maxLead);
}

// Days before the due date the assignment first appears (lead window − 1).
function appearOffsetDays(chore) {
  return effectiveLeadDays(chore) - 1;
}

// The due date of the NEXT occurrence to schedule — strictly after the last
// generated one (anchored on `last_generated_date`), or the first occurrence if
// never generated. Respects `start_date`. Returns a Date, or null if none.
//
// Never returns a date before today. `last_generated_date` is a schedule cursor,
// and it can fall arbitrarily far behind reality — it freezes entirely while a
// chore is inactive, and a missed nightly run leaves it a day short. Without the
// clamp, the occurrence "after" a stale cursor is itself in the past and gets
// written straight into `due_date`, so the assignment is born overdue and the
// cursor only creeps forward one occurrence per nightly run. Clamping collapses
// any backlog in a single run. Mirrors the frontend's `nextDueDate`
// (lib/dueDates.js), which has always rolled forward to today.
function nextDueForChore(chore, today) {
  var freq = chore.frequency;
  var lastGen = chore.last_generated_date ? parseISODate(chore.last_generated_date) : null;
  var start = chore.start_date ? parseISODate(chore.start_date) : null;
  // Midnight-normalized "today". The nightly trigger fires at 00:05, so comparing
  // against the raw `today` (which carries a time) would read as later than a
  // parsed date-only value for the same calendar day.
  var todayMid = parseISODate(formatDate(today));

  if (freq === 'once') {
    if (chore.last_generated_date) return null;   // one-and-done
    if (!chore.once_date) return null;
    var once = parseISODate(chore.once_date);
    // A back-dated once_date (hand-entered, or a chore added after the fact)
    // surfaces today rather than as an already-overdue row.
    return once.getTime() < todayMid.getTime() ? todayMid : once;
  }

  if (freq === 'interval') {
    var n = parseInt(chore.interval_days, 10);
    if (!n || n < 1) return null;
    if (!lastGen) return (start && start.getTime() > todayMid.getTime()) ? start : todayMid;
    // Advance by whole intervals so the cadence keeps its phase, rather than
    // snapping to today and resetting it.
    var due = addDaysDate(lastGen, n);
    while (due.getTime() < todayMid.getTime()) due = addDaysDate(due, n);
    return due;
  }

  // Calendar frequencies: scan forward from the day after the last occurrence
  // (or the first eligible day) for the next scheduled due day.
  var from = lastGen ? addDaysDate(lastGen, 1) : todayMid;
  if (from.getTime() < todayMid.getTime()) from = todayMid;
  if (start && start.getTime() > from.getTime()) from = start;
  if (freq === 'daily') return from;
  for (var i = 0; i < 400; i++) {
    var d = addDaysDate(from, i);
    if (isScheduledDueDay(chore, d)) return d;
  }
  return null;
}

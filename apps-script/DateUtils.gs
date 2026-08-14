// ─── Date utilities ──────────────────────────────────────────────────────────

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

// `weekday_due` as an array of weekday numbers (0 = Sunday). One column serving
// every frequency (#45):
//
//   daily    — blank means EVERY day; a list pins it to those days
//   weekly   — a single day
//   monthly  — a single day, paired with `monthly_week` for "second Sunday"
//   interval — a single day to land on after the interval elapses
//
// Replaces `custom_days` (which held a bare number for weekly but day *names*
// for custom — two formats in one column) and `monthly_weekday`. Always numbers
// now; most frequencies simply use a list of one.
function weekdaysDue(chore) {
  return String(chore.weekday_due == null ? '' : chore.weekday_due)
    .split(',')
    .map(function(d) { return parseInt(String(d).trim(), 10); })
    .filter(function(n) { return !isNaN(n) && n >= 0 && n <= 6; });
}

// True when the monthly chore uses the nth-weekday sub-mode (#16) rather than a
// fixed day-of-month. Needs both the week ordinal and a weekday.
function usesNthWeekday(chore) {
  return chore.monthly_week !== '' && chore.monthly_week != null &&
         weekdaysDue(chore).length > 0;
}

// True when a stored timestamp (ISO datetime, UTC or with an offset) falls on
// `todayISO` in the script timezone. Parses the instant and reformats it locally
// so both legacy UTC `completed_at` values (written before the #31 fix) and new
// local-offset ones resolve to the correct local day. Empty/invalid → false.
function completedOnLocalDate(timestamp, todayISO) {
  return localDateOf(timestamp) === todayISO;
}

// A comparable instant for an assignment: when the work happened. Uses the
// parsed completion timestamp, falling back to the due date at local midnight
// for rows that never had one — a missed occurrence, say. Returns 0 when there
// is nothing to compare.
//
// Exists because `completed_at` appears in three shapes across a long-lived
// sheet (legacy UTC, local-offset ISO, date-only), and comparing those as
// strings is not meaningful.
function completionInstant(a) {
  if (a.completed_at) {
    var d = new Date(a.completed_at);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  var due = String(a.due_date || '').slice(0, 10);
  return due ? parseISODate(due).getTime() : 0;
}

// The local calendar date (yyyy-MM-dd, script timezone) a stored timestamp falls
// on, or '' when there isn't one. Parsing the instant and reformatting is what
// makes legacy UTC values resolve to the right local day — slicing the raw
// string reads an evening completion as the following date.
function localDateOf(timestamp) {
  if (!timestamp) return '';
  var d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  return formatDate(d);
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
// (daily/weekly/monthly only — no start_date, catch-up, or lead.)
function isScheduledDueDay(chore, date) {
  var freq = chore.frequency;
  var days = weekdaysDue(chore);

  // Daily means "expected on these days" (#45). Blank is every day; a list pins
  // it, which is what the old `custom` frequency did — but as DAILY, so it keeps
  // daily's tight lead of 1 and its Every-day grouping. That's the point of the
  // merge: a Mon/Thu chore is a discipline, not a "sometime this week".
  if (freq === 'daily') return days.length === 0 || days.indexOf(date.getDay()) !== -1;

  if (freq === 'weekly') return days.length > 0 && days.indexOf(date.getDay()) !== -1;

  if (freq === 'monthly') {
    var targetDay;
    if (usesNthWeekday(chore)) {
      var week = parseInt(chore.monthly_week, 10);
      if (!week) return false;
      targetDay = nthWeekdayOfMonth(date.getFullYear(), date.getMonth(), days[0], week).getDate();
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
// interval so occurrences never overlap. (monthly uses 28, the shortest month,
// to stay safe across months.)
function recurrencePeriodDays(chore) {
  switch (chore.frequency) {
    case 'weekly':
      return 7;
    case 'monthly':
      return 28;
    case 'interval':
      return parseInt(chore.interval_days, 10) || 1;
    default: // daily, once — no meaningful interval
      return 1;
  }
}

// The default lead window when `lead_days` is blank, by cadence (#44). Bigger
// jobs get more runway: a weekly chore due Sunday surfaces on Thursday, a
// monthly one about a week ahead. Daily and once are pinned to 1 — they appear
// on the day, and there is nothing meaningful to see them ahead of.
//
// Daily keeps that 1 even when `weekday_due` pins it to specific days (#45).
// That's deliberate and is the whole reason the old `custom` frequency was
// folded into daily: "Mon and Thu" means done ON those days, so it gets daily's
// strictness rather than weekly's generous window.
//
// These were the original v1.3.0 defaults. v1.3.2 flattened them all to 1 while
// fixing a short-interval bug (a chore reappearing the next day and being
// penalized about a day after its due date rather than after a full interval).
// That bug was actually fixed by the `maxLead` cap below, which is independent —
// so the defaults are restored here and the cap keeps the fix.
function defaultLeadDays(chore) {
  switch (chore.frequency) {
    case 'weekly':
      return 4;
    case 'monthly':
      return 7;
    case 'interval':
      return Math.min(parseInt(chore.interval_days, 10) || 1, 7);
    default: // daily, once
      return 1;
  }
}

// The lead window (#23): how many days the chore is visible before it goes
// overdue, so it appears `lead − 1` days before its due date. Rules: at least 1,
// strictly less than the recurrence interval, and defaulting by cadence when the
// `lead_days` column is blank. Daily/once are always 1 (they appear on the due
// date). An explicit `lead_days` always wins, subject to the cap.
function effectiveLeadDays(chore) {
  var raw = parseInt(chore.lead_days, 10);
  var lead = (raw && raw >= 1) ? raw : defaultLeadDays(chore);
  var period = recurrencePeriodDays(chore);
  var maxLead = period > 1 ? period - 1 : 1;      // < interval (daily/once → 1)
  return Math.min(lead, maxLead);
}

// Days before the due date the assignment first appears (lead window − 1).
function appearOffsetDays(chore) {
  return effectiveLeadDays(chore) - 1;
}

// Roll a computed interval due date forward to the next `weekday_due`, so a
// long-cadence chore can be made to land on (say) a Sunday (#45). Blank means no
// snapping. Only interval chores use this — the calendar frequencies already
// derive their weekday from the schedule itself.
//
// Note this makes the cadence DRIFT: the cursor is stamped with the snapped date,
// so each cycle starts from it and the schedule slides later by however far the
// snap reached — up to 6 days, compounding. Chosen deliberately: the interval is
// specified as counting from the due date that actually appears.
function snapToWeekday(date, chore) {
  var days = weekdaysDue(chore);
  if (days.length === 0) return date;
  var offset = (days[0] - date.getDay() + 7) % 7;
  return offset === 0 ? date : addDaysDate(date, offset);
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
    if (!lastGen) {
      var first = (start && start.getTime() > todayMid.getTime()) ? start : todayMid;
      return snapToWeekday(first, chore);
    }
    // Advance by whole intervals so the cadence keeps its phase, rather than
    // snapping to today and resetting it.
    var due = addDaysDate(lastGen, n);
    while (due.getTime() < todayMid.getTime()) due = addDaysDate(due, n);
    return snapToWeekday(due, chore);
  }

  // Calendar frequencies: scan forward from the day after the last occurrence
  // (or the first eligible day) for the next scheduled due day.
  var from = lastGen ? addDaysDate(lastGen, 1) : todayMid;
  if (from.getTime() < todayMid.getTime()) from = todayMid;
  if (start && start.getTime() > from.getTime()) from = start;
  // Daily with no `weekday_due` is due every day, so the first eligible day wins.
  // With weekdays pinned it falls through to the scan below, like weekly/monthly.
  if (freq === 'daily' && weekdaysDue(chore).length === 0) return from;
  for (var i = 0; i < 400; i++) {
    var d = addDaysDate(from, i);
    if (isScheduledDueDay(chore, d)) return d;
  }
  return null;
}

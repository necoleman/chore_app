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

/**
 * Returns true if the chore is due today (or is overdue, for monthly/interval).
 * `chore` is a row object from the Chores tab.
 * `today` is a Date object.
 */
function isDueToday(chore, today) {
  var freq = chore.frequency;

  // First-due date: never generate before the chore's start_date.
  if (chore.start_date && formatDate(today) < chore.start_date) return false;

  if (freq === 'daily') return true;

  if (freq === 'once') {
    if (chore.last_generated_date) return false;        // already generated → never again
    if (!chore.once_date) return false;
    return formatDate(today) >= chore.once_date;         // due on/after the target date (catch-up)
  }

  if (freq === 'weekly') {
    var choreDay = parseInt(chore.custom_days, 10); // store weekday as 0–6
    return today.getDay() === choreDay;
  }

  if (freq === 'custom') {
    var days = (chore.custom_days || '').toLowerCase().split(',').map(function(d) { return d.trim(); });
    return days.indexOf(DAY_NAMES[today.getDay()]) !== -1;
  }

  if (freq === 'monthly') {
    var targetDay; // the day-of-month this chore is due in `today`'s month

    if (usesNthWeekday(chore)) {
      // nth-weekday sub-mode (#16), e.g. "second Friday".
      var week = parseInt(chore.monthly_week, 10);
      var weekday = parseInt(chore.monthly_weekday, 10);
      if (!week || isNaN(weekday)) return false;
      targetDay = nthWeekdayOfMonth(today.getFullYear(), today.getMonth(), weekday, week).getDate();
    } else {
      var monthlyDay = parseInt(chore.monthly_day, 10);
      if (!monthlyDay) return false;
      targetDay = Math.min(monthlyDay, daysInMonth(today)); // clamp to month length
    }

    if (today.getDate() === targetDay) return true;

    // Catch-up: if last_generated_date is before the first of this month
    // and we're past when it should have run, generate it now.
    if (chore.last_generated_date) {
      var lastGen = new Date(chore.last_generated_date);
      if (lastGen < firstOfMonth(today) && today.getDate() >= targetDay) return true;
    }
    return false;
  }

  if (freq === 'interval') {
    var intervalDays = parseInt(chore.interval_days, 10);
    if (!intervalDays) return false;
    if (!chore.last_generated_date) return true; // never generated → due now
    var lastGen = new Date(chore.last_generated_date);
    return daysBetween(today, lastGen) >= intervalDays;
  }

  return false;
}

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
 * Returns true if the chore is due today (or is overdue, for monthly/interval).
 * `chore` is a row object from the Chores tab.
 * `today` is a Date object.
 */
function isDueToday(chore, today) {
  var freq = chore.frequency;

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
    var monthlyDay = parseInt(chore.monthly_day, 10);
    if (!monthlyDay) return false;
    var clampedDay = Math.min(monthlyDay, daysInMonth(today));

    if (today.getDate() === clampedDay) return true;

    // Catch-up: if last_generated_date is before the first of this month
    // and we're past when it should have run, generate it now.
    if (chore.last_generated_date) {
      var lastGen = new Date(chore.last_generated_date);
      if (lastGen < firstOfMonth(today) && today.getDate() >= clampedDay) return true;
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

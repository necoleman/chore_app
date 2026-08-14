// Pure "next due date" computation for the Manage Chores screen.
//
// Mirrors the backend cadence (calendar-based, ignoring overdue "catch-up") so
// the UI can show and sort by when a chore is next scheduled. Unit-tested in
// dueDates.test.js.
import { formatDate, today } from './utils.js';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseLocalDate(str) {
  const [y, m, d] = String(str).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}
// Date of the nth (1–4) occurrence of a weekday (0=Sun…6=Sat) in a month (#16).
function nthWeekdayOfMonth(year, month, weekday, n) {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}
// Mirrors the backend's weekdaysDue (#45): one `weekday_due` column serving
// every frequency, holding comma-separated weekday numbers (0 = Sunday).
function weekdaysDue(chore) {
  return String(chore.weekday_due == null ? '' : chore.weekday_due)
    .split(',')
    .map((d) => parseInt(String(d).trim(), 10))
    .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6);
}

function usesNthWeekday(chore) {
  return chore.monthly_week !== '' && chore.monthly_week != null && weekdaysDue(chore).length > 0;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function diffDays(a, b) {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}
function shortDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Calendar predicate: is the chore scheduled on this date (for the recurring
// calendar frequencies)? Interval/once are handled directly in nextDueDate.
export function scheduledOn(chore, date) {
  const days = weekdaysDue(chore);
  switch (chore.frequency) {
    case 'daily':
      // Blank weekday_due means every day; a list pins it to those days (#45).
      return days.length === 0 || days.includes(date.getDay());
    case 'weekly':
      return days.length > 0 && days.includes(date.getDay());
    case 'monthly': {
      if (usesNthWeekday(chore)) {
        const week = parseInt(chore.monthly_week, 10);
        if (!week) return false;
        const target = nthWeekdayOfMonth(date.getFullYear(), date.getMonth(), days[0], week);
        return date.getDate() === target.getDate();
      }
      const md = parseInt(chore.monthly_day, 10);
      if (!md) return false;
      return date.getDate() === Math.min(md, daysInMonth(date));
    }
    default:
      return false;
  }
}

// Mirrors the backend's snapToWeekday: roll an interval due date forward to the
// chosen weekday, so a long-cadence chore lands on (say) a Sunday.
function snapToWeekday(date, chore) {
  const days = weekdaysDue(chore);
  if (days.length === 0) return date;
  return addDays(date, (days[0] - date.getDay() + 7) % 7);
}

// The next date (>= today) the chore is scheduled, or null if none/finished.
export function nextDueDate(chore, todayStr = today()) {
  const todayDate = parseLocalDate(todayStr);
  const start = chore.start_date ? parseLocalDate(chore.start_date) : null;
  const effStart = start && start > todayDate ? start : todayDate;
  const freq = chore.frequency;

  if (freq === 'once') {
    if (chore.last_generated_date) return null; // already generated → never again
    if (!chore.once_date) return null;
    const od = parseLocalDate(chore.once_date);
    return od > todayDate ? od : todayDate; // overdue/today → today
  }

  if (freq === 'interval') {
    const n = parseInt(chore.interval_days, 10);
    if (!n) return null;
    if (!chore.last_generated_date) return snapToWeekday(effStart, chore);
    // last_generated_date is the current occurrence's due date. Advance by whole
    // intervals to the first occurrence on/after today, so a chore due today
    // reads "Today" (not last+N) and a past one rolls to its next date (#13).
    let d = parseLocalDate(chore.last_generated_date);
    while (d < todayDate) d = addDays(d, n);
    return snapToWeekday(d, chore);
  }

  if (freq === 'daily' && weekdaysDue(chore).length === 0) return effStart;

  if (freq === 'daily' || freq === 'weekly' || freq === 'monthly') {
    let d = new Date(effStart);
    for (let i = 0; i < 400; i++) {
      if (scheduledOn(chore, d)) return d;
      d = addDays(d, 1);
    }
  }
  return null;
}

// Friendly label for the Chores screen. '' for every-day chores (and when none).
export function nextDueLabel(chore, todayStr = today()) {
  if (chore.frequency === 'daily' && weekdaysDue(chore).length === 0) return '';
  const d = nextDueDate(chore, todayStr);
  if (!d) return '';
  const dStr = formatDate(d);
  if (dStr === todayStr) return 'Today';
  const diff = diffDays(d, parseLocalDate(todayStr));
  if (diff === 1) return 'Tomorrow';
  if (chore.frequency === 'weekly') return WEEKDAY_FULL[d.getDay()];
  if (diff > 1 && diff <= 6) return WEEKDAY_FULL[d.getDay()];
  return shortDate(d);
}

// The date an assignment first appears on Today: due_date minus the lead window
// (leadDays − 1 days early; leadDays is the effective value sent by the backend,
// defaulting to 1 = appears on its due date). Returns a yyyy-MM-dd string.
export function appearDate(dueStr, leadDays) {
  const lead = parseInt(leadDays, 10);
  const offset = lead && lead > 1 ? lead - 1 : 0;
  return formatDate(addDays(parseLocalDate(dueStr), -offset));
}

// Friendly label for a specific assignment's due date, shown on every Today
// card. Today/Tomorrow, a weekday name for the next few days, otherwise a short
// date. Past dates (overdue) fall through to the short date, e.g. "Jun 28".
export function dueLabel(dueStr, todayStr = today()) {
  if (!dueStr) return '';
  const d = parseLocalDate(dueStr);
  const diff = diffDays(d, parseLocalDate(todayStr));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff <= 6) return WEEKDAY_FULL[d.getDay()];
  return shortDate(d);
}

// Whole days an assignment is past due (0 if due today or in the future).
export function daysOverdue(dueStr, todayStr = today()) {
  if (!dueStr) return 0;
  return Math.max(0, diffDays(parseLocalDate(todayStr), parseLocalDate(dueStr)));
}

// Format a stored date/datetime string (YYYY-MM-DD or ISO) as e.g. "Jun 24".
// Returns '' for empty/invalid input. Used for the "Last done" tag (#9).
export function shortDateStr(str) {
  if (!str) return '';
  const d = parseLocalDate(str);
  if (Number.isNaN(d.getTime())) return '';
  return shortDate(d);
}

// Number of days until next due — for the "countdown" sort. Infinity = none.
export function daysUntilDue(chore, todayStr = today()) {
  if (chore.frequency === 'daily' && weekdaysDue(chore).length === 0) return 0;
  const d = nextDueDate(chore, todayStr);
  if (!d) return Infinity;
  return Math.max(0, diffDays(d, parseLocalDate(todayStr)));
}

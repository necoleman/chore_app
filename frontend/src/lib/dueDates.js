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
  switch (chore.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return date.getDay() === parseInt(chore.custom_days, 10);
    case 'custom': {
      const days = (chore.custom_days || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
      return days.includes(DAY_NAMES[date.getDay()]);
    }
    case 'monthly': {
      const md = parseInt(chore.monthly_day, 10);
      if (!md) return false;
      return date.getDate() === Math.min(md, daysInMonth(date));
    }
    default:
      return false;
  }
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
    if (!chore.last_generated_date) return effStart; // first occurrence
    const next = addDays(parseLocalDate(chore.last_generated_date), n);
    return next > todayDate ? next : todayDate; // overdue → due now
  }

  if (freq === 'daily') return effStart;

  if (freq === 'weekly' || freq === 'custom' || freq === 'monthly') {
    let d = new Date(effStart);
    for (let i = 0; i < 400; i++) {
      if (scheduledOn(chore, d)) return d;
      d = addDays(d, 1);
    }
  }
  return null;
}

// Friendly label for the Chores screen. '' for daily (and when none).
export function nextDueLabel(chore, todayStr = today()) {
  if (chore.frequency === 'daily') return '';
  const d = nextDueDate(chore, todayStr);
  if (!d) return '';
  const dStr = formatDate(d);
  if (dStr === todayStr) return 'Today';
  const diff = diffDays(d, parseLocalDate(todayStr));
  if (diff === 1) return 'Tomorrow';
  if (chore.frequency === 'weekly' || chore.frequency === 'custom') return WEEKDAY_FULL[d.getDay()];
  if (diff > 1 && diff <= 6) return WEEKDAY_FULL[d.getDay()];
  return shortDate(d);
}

// Number of days until next due — for the "countdown" sort. Infinity = none.
export function daysUntilDue(chore, todayStr = today()) {
  if (chore.frequency === 'daily') return 0;
  const d = nextDueDate(chore, todayStr);
  if (!d) return Infinity;
  return Math.max(0, diffDays(d, parseLocalDate(todayStr)));
}

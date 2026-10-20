// Which scheduling fields the generator actually READS, per frequency.
//
// The scheduling model is sparse: each frequency consults a few columns and
// ignores the rest. A value left behind by a previous frequency choice is
// therefore silently inert — no error, no warning, and nothing in the sheet to
// hint at it. A real example from the live sheet: a monthly chore carrying
// `interval_days = 90`, which reads as "four times a year" while the generator
// runs it twelve times, because the monthly branch never looks at that column.
//
// This table is the single source of truth for that, mirroring DateUtils.gs:
//   • isScheduledDueDay   — weekday_due / monthly_day / monthly_week
//   • nextDueForChore     — interval_days, once_date, start_date
//   • usesNthWeekday      — the monthly sub-mode discriminator
//   • snapToWeekday       — weekday_due on interval chores
//   • effectiveLeadDays   — lead_days, clamped to < the recurrence period
//
// Two cases are worth spelling out because they are easy to get wrong:
//   • `lead_days` is DEAD on daily and once. recurrencePeriodDays() returns 1
//     for both, so effectiveLeadDays() clamps any value to 1. (The v1.10
//     migration cleared lead_days on converted custom chores for this reason.)
//   • `start_date` is dead on once — the `once` branch of nextDueForChore
//     returns once_date (or today) without consulting it.

// Column name → the label the chore editor shows for it.
export const SCHEDULE_FIELD_LABELS = {
  weekday_due: 'Weekday',
  monthly_day: 'Day of month',
  monthly_week: 'Week of month',
  interval_days: 'Every how many days',
  once_date: 'Date',
  start_date: 'Start date',
  lead_days: 'Days visible before overdue',
};

export const SCHEDULE_FIELDS = Object.keys(SCHEDULE_FIELD_LABELS);

// How each frequency reads in a warning ("… but monthly chores ignore it").
const FREQUENCY_LABELS = {
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
  interval: 'every-N-days',
  once: 'one-time',
};

// The fields each frequency reads AT ALL. Monthly lists both sub-modes' fields;
// which of them is live depends on the nth-weekday discriminator, handled by
// ignoredScheduleFields() below.
const FIELDS_READ = {
  daily: ['weekday_due', 'start_date'],
  weekly: ['weekday_due', 'start_date', 'lead_days'],
  monthly: ['weekday_due', 'monthly_day', 'monthly_week', 'start_date', 'lead_days'],
  interval: ['weekday_due', 'interval_days', 'start_date', 'lead_days'],
  once: ['once_date'],
};

// Pre-v1.10 columns. The migration (migrateWeekdayDue in Endpoints.gs) folded
// them into `weekday_due` and nothing has read them since; per the README they
// stay in the sheet until the migration has bedded in. Neither add_chore nor
// update_chore will write them — both have field allowlists that omit them —
// and the editor strips them from its payload too, so an edit can never
// resurrect a stale value regardless of what the backend allows.
export const LEGACY_SCHEDULE_FIELDS = ['custom_days', 'monthly_weekday'];

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

/** The scheduling fields this frequency reads. Unknown frequency → none. */
export function fieldsReadBy(frequency) {
  return FIELDS_READ[frequency] ?? [];
}

/** Does `frequency` read `field` at all? (Ignores the monthly sub-mode.) */
export function isFieldRead(frequency, field) {
  return fieldsReadBy(frequency).includes(field);
}

/**
 * `weekday_due` as weekday numbers (0 = Sunday). Mirrors weekdaysDue() in
 * DateUtils.gs — one column serving every frequency, as a comma list.
 */
export function parseWeekdays(value) {
  return String(value == null ? '' : value)
    .split(',')
    .map((d) => parseInt(String(d).trim(), 10))
    .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6);
}

/**
 * Mirrors usesNthWeekday() in DateUtils.gs: monthly runs in nth-weekday mode
 * ("second Friday") only when BOTH the week ordinal and a weekday are present.
 * Otherwise it falls back to monthly_day.
 */
export function usesNthWeekday(chore) {
  return !isBlank(chore.monthly_week) && parseWeekdays(chore.weekday_due).length > 0;
}

/**
 * Every field that holds a value the generator will ignore, as
 * `{ field, label, value, message }`. Sub-mode aware: a monthly chore pinned to
 * "second Friday" ignores monthly_day, and one with only half of the
 * nth-weekday pair falls back to monthly_day, leaving the half-pair inert.
 */
export function ignoredScheduleFields(chore) {
  const freq = chore.frequency;
  const freqLabel = FREQUENCY_LABELS[freq] ?? String(freq);
  const read = fieldsReadBy(freq);
  const out = [];

  const push = (field, message) =>
    out.push({ field, label: SCHEDULE_FIELD_LABELS[field], value: String(chore[field]).trim(), message });

  for (const field of SCHEDULE_FIELDS) {
    if (isBlank(chore[field]) || read.includes(field)) continue;
    push(
      field,
      `${field} ("${SCHEDULE_FIELD_LABELS[field]}") is set to ${String(chore[field]).trim()}, ` +
        `but ${freqLabel} chores ignore it — it will have no effect.`,
    );
  }

  if (freq === 'monthly') {
    if (usesNthWeekday(chore)) {
      if (!isBlank(chore.monthly_day)) {
        push(
          'monthly_day',
          `monthly_day ("Day of month") is set to ${String(chore.monthly_day).trim()}, but this chore ` +
            'is scheduled by day of the week (monthly_week + weekday_due) — it will have no effect.',
        );
      }
    } else {
      // Not nth-weekday mode, so monthly_day wins and a lone half of the pair
      // does nothing. Only warn about the half that is actually set.
      if (!isBlank(chore.monthly_week)) {
        push(
          'monthly_week',
          `monthly_week ("Week of month") is set to ${String(chore.monthly_week).trim()} but no weekday is ` +
            'set, so it will have no effect — this chore uses monthly_day instead.',
        );
      } else if (!isBlank(chore.weekday_due)) {
        push(
          'weekday_due',
          `weekday_due ("Weekday") is set to ${String(chore.weekday_due).trim()} but monthly_week is not, ` +
            'so it will have no effect — this chore uses monthly_day instead.',
        );
      }
    }
  }

  return out;
}

// Fields to clear when the USER changes a chore's frequency: everything the new
// frequency ignores outright. Each belongs to exactly one cadence, so changing
// cadence makes it stale by the user's own action, and each is a single control
// away from being re-entered — the same bargain the editor already makes when
// the Every-day toggle drops a daily chore's pinned weekdays.
//
// Deliberately limited to a frequency change the user makes in the editor.
// Merely OPENING a chore that already carries a stray value WARNS instead:
// rewriting someone's schedule as a side effect of looking at it is worse than
// telling them about it, and the leftover is inert until they act on it.
//
// The monthly sub-mode is left out on purpose. Which of monthly_day /
// monthly_week + weekday_due is live depends on the discriminator rather than
// on the frequency, so clearing either one on a change INTO monthly would be
// guessing; ignoredScheduleFields() warns about that case and the editor's
// Day-of-month / Day-of-week toggle clears it when the user picks a mode.
export function fieldsClearedOnFrequencyChange(frequency) {
  const read = fieldsReadBy(frequency);
  return SCHEDULE_FIELDS.filter((f) => !read.includes(f));
}

/**
 * A copy of `chore` with the fields its frequency ignores blanked out. Only
 * touches keys that are already present, so it never invents a column on a
 * partial object (update_chore writes whatever fields the payload carries).
 */
export function clearIgnoredScheduleFields(chore) {
  const next = { ...chore };
  for (const field of fieldsClearedOnFrequencyChange(chore.frequency)) {
    if (field in next) next[field] = '';
  }
  return next;
}

/** A copy of `chore` without the pre-v1.10 columns, so a save can't echo them back. */
export function stripLegacyScheduleFields(chore) {
  const next = { ...chore };
  for (const field of LEGACY_SCHEDULE_FIELDS) delete next[field];
  return next;
}

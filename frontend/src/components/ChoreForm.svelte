<script>
  import { post } from '../api/client.js';
  import { showToast } from '../stores/ui.js';
  import { portal } from '../lib/portal.js';
  import {
    ignoredScheduleFields,
    clearIgnoredScheduleFields,
    stripLegacyScheduleFields,
    parseWeekdays,
    usesNthWeekday,
  } from '../lib/scheduleFields.js';

  export let chore = null; // null = create mode
  export let people = [];
  export let locations = [];
  export let initialName = ''; // prefill the name in create mode (from search)
  export let onSave;
  export let onClose;


  let form = chore
    ? { ...chore }
    : {
        name: initialName,
        location: '',
        description: '',
        points: 1,
        frequency: 'daily',
        weekday_due: '',
        monthly_day: '',
        monthly_week: '',
        interval_days: '',
        once_date: '',
        start_date: '',
        lead_days: '',
        sort_last: false,
        default_assignee: '',
        requires_approval: false,
        active: true,
      };

  // `sort_last` is set in the spreadsheet, not here — there's no control for it
  // in the editor. Normalised and carried on `form` regardless so that saving a
  // chore round-trips the value instead of silently clearing a flag someone set
  // in the sheet.
  form.sort_last = form.sort_last === true || form.sort_last === 'TRUE';

  // A rotation is a comma-delimited list of person_ids (#24). It can't be
  // represented by the single-choice <select> below: no option matches, so the
  // field would render BLANK and picking anyone would replace the whole rotation
  // with one person. Show it read-only instead — the value round-trips through
  // save untouched, and there's simply no control present to break it. Creating
  // and re-ordering rotations remains a sheet operation.
  $: isRotation = String(form.default_assignee || '').includes(',');
  $: rotationLabel = String(form.default_assignee || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => people.find((p) => p.person_id === id)?.name ?? id)
    .join(' → ');

  // Show the chore's current location even if it's no longer in the managed list
  // (e.g. a legacy value), so editing never silently drops it.
  $: locationOptions =
    form.location && !locations.some((l) => l.location === form.location)
      ? [{ location: form.location }, ...locations]
      : locations;

  let saving = false;

  // Daily's pinned weekdays, read out of `weekday_due` (#45).
  let selectedDays = parseWeekdays(form.weekday_due);

  // Ensure a weekly chore always has a valid 0–6 weekday so the <select> and the
  // stored value agree (a blank/leftover value would show Sunday but save empty).
  // Guarded so it only fills a missing value — never overwrites a real choice.
  // Only daily can hold MULTIPLE weekdays. Switching a pinned daily ("1,4") to
  // any other frequency would otherwise leave a list behind: the single-choice
  // select matches nothing and renders blank, while the stored value still says
  // Monday — so an interval chore would silently snap to Mondays despite the
  // field reading "Any day". Trim to the first entry.
  $: if (form.frequency !== 'daily' && String(form.weekday_due ?? '').includes(',')) {
    form.weekday_due = String(form.weekday_due).split(',')[0].trim();
  }

  // Weekly additionally needs exactly one weekday — blank would save a chore
  // that never generates.
  $: if (form.frequency === 'weekly' && !/^[0-6]$/.test(String(form.weekday_due))) {
    form.weekday_due = '0';
  }

  // Lead window (#23) applies to non-daily / non-once cadences. It defaults to 1
  // (appears on the due date) and must be ≥1 and < the recurrence interval.
  const LEAD_FREQS = ['weekly', 'monthly', 'interval'];
  $: intervalDaysSet = /^\d+$/.test(String(form.interval_days ?? '').trim());

  $: leadMax =
    form.frequency === 'monthly'
      ? 27
      : form.frequency === 'interval'
        ? Math.max(1, (parseInt(form.interval_days, 10) || 2) - 1)
        : 6; // weekly (7-day cycle)

  // The default the backend will apply if this is left blank — mirrors
  // defaultLeadDays() in DateUtils.gs. Shown so the placeholder and the hint
  // agree with what actually happens.
  $: defaultLeadHint =
    form.frequency === 'monthly'
      ? 7
      : form.frequency === 'interval'
        ? Math.min(parseInt(form.interval_days, 10) || 7, 7)
        : 4; // weekly

  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const WEEK_ORDINALS = [
    { value: 1, label: 'First' },
    { value: 2, label: 'Second' },
    { value: 3, label: 'Third' },
    { value: 4, label: 'Fourth' },
  ];

  // `monthly_week` is the discriminator for nth-weekday mode; the weekday itself
  // now lives in the shared `weekday_due` (#45). Coerce the ordinal to a number
  // so it matches the numeric <option> values (Svelte binds with ===), and keep
  // weekday_due a STRING everywhere so it round-trips consistently.
  const hasNth = usesNthWeekday(form);
  if (hasNth) form.monthly_week = parseInt(form.monthly_week, 10);
  if (form.weekday_due != null) form.weekday_due = String(form.weekday_due);

  // Monthly sub-mode (#16): 'day' = day-of-month, 'weekday' = nth weekday.
  let monthlyMode = hasNth ? 'weekday' : 'day';

  // Keep only the fields for the active sub-mode so the backend discriminator
  // (both nth-weekday fields present ⇒ nth-weekday) stays unambiguous.
  function setMonthlyMode(mode) {
    monthlyMode = mode;
    if (mode === 'day') {
      form.monthly_week = '';
      form.weekday_due = '';
    } else {
      form.monthly_day = '';
      if (form.monthly_week === '' || form.monthly_week == null) form.monthly_week = 1;
      if (!/^[0-6]$/.test(String(form.weekday_due))) form.weekday_due = '5'; // Friday
    }
  }

  // Daily's weekday pins (#45). Blank weekday_due means every day; a list pins
  // it to those days, which is what the old `custom` frequency did — but as
  // DAILY, so it keeps daily's tight lead and its Every-day grouping.
  let dailyMode = selectedDays.length > 0 ? 'set' : 'every';

  function setDailyMode(mode) {
    dailyMode = mode;
    if (mode === 'every') {
      selectedDays = [];
      form.weekday_due = '';
    }
  }

  // Synced imperatively, NOT via a reactive `$:` — a reactive sync reads and
  // writes `form`, so it re-fires on any form change and wipes the value (#8).
  function toggleDay(day) {
    selectedDays = selectedDays.includes(day)
      ? selectedDays.filter((d) => d !== day)
      : [...selectedDays, day].sort((a, b) => a - b);
    form.weekday_due = selectedDays.join(',');
  }

  // Scheduling fields the generator will silently ignore (lib/scheduleFields.js).
  //
  // Two halves, and the split is the point. A frequency change the user makes
  // HERE clears the fields the new cadence ignores — they're stale by their own
  // action, and the alternative is a dead value that reads as the chore's
  // intent: a monthly chore still carrying `interval_days = 90` looks like it
  // runs four times a year while the generator runs it twelve. A stray value
  // that was already in the sheet when the editor opened is only WARNED about,
  // because quietly rewriting a schedule as a side effect of opening it to look
  // is worse than saying so.
  let lastFrequency = form.frequency;
  $: if (form.frequency !== lastFrequency) {
    lastFrequency = form.frequency;
    form = clearIgnoredScheduleFields(form);
    // `selectedDays` and `monthlyMode` mirror form fields in local state, so
    // resync them or the controls keep offering days/modes that are no longer
    // stored (a cleared weekday_due with the day buttons still lit).
    selectedDays = parseWeekdays(form.weekday_due);
    dailyMode = selectedDays.length > 0 ? 'set' : 'every';
    monthlyMode = usesNthWeekday(form) ? 'weekday' : 'day';
  }

  $: ignoredFields = ignoredScheduleFields(form);

  function clearIgnoredField(field) {
    form = { ...form, [field]: '' };
    if (field === 'weekday_due') {
      selectedDays = [];
      dailyMode = 'every';
    }
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      showToast('Name is required');
      return;
    }
    // Keep lead_days within 1..<interval. Blank stays blank, which means "use
    // the cadence default" (weekly 4 / monthly 7 / interval min(N,7) / daily 1).
    if (LEAD_FREQS.includes(form.frequency) && form.lead_days !== '' && form.lead_days != null) {
      form.lead_days = Math.min(Math.max(1, parseInt(form.lead_days, 10) || 1), leadMax);
    }
    saving = true;
    try {
      const action = chore ? 'update_chore' : 'add_chore';
      // `form` is spread from the sheet row in edit mode, so it can carry the
      // pre-v1.10 `custom_days` / `monthly_weekday` columns. Nothing reads them
      // and the backend's own allowlists drop them; strip them here too so the
      // editor never sends a value it can't show or explain.
      await post(action, stripLegacyScheduleFields(form));
      showToast(chore ? 'Chore updated' : 'Chore added', 'success');
      onSave();
    } catch (e) {
      showToast(e.message || 'Could not save chore');
    } finally {
      saving = false;
    }
  }
</script>

<div class="backdrop" use:portal on:click|self={onClose}>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <h2 class="sheet-title">{chore ? 'Edit Chore' : 'New Chore'}</h2>

    <form on:submit|preventDefault={handleSubmit} class="form">
      <label class="field">
        <span class="label">Name</span>
        <input type="text" bind:value={form.name} placeholder="Take out trash" class="input" />
      </label>

      <label class="field">
        <span class="label">Location</span>
        <select bind:value={form.location} class="input">
          <option value="">(none)</option>
          {#each locationOptions as loc (loc.location)}
            <option value={loc.location}>{loc.location}</option>
          {/each}
        </select>
      </label>

      <label class="field">
        <span class="label">Description</span>
        <textarea
          bind:value={form.description}
          rows="3"
          placeholder="What does this chore involve?"
          class="input textarea"
        ></textarea>
      </label>

      <label class="field">
        <span class="label">Points</span>
        <input type="number" min="0" max="100" bind:value={form.points} class="input input--sm" />
      </label>

      <label class="field">
        <span class="label">Frequency</span>
        <select bind:value={form.frequency} class="input">
          <option value="daily">Daily (every day, or set days)</option>
          <option value="weekly">Weekly (set day below)</option>
          <option value="monthly">Monthly</option>
          <option value="interval">Every N days</option>
          <option value="once">One-time</option>
        </select>
      </label>

      <!-- The generator reads only some scheduling columns per frequency, so a
           value left over from a previous frequency choice does nothing at all —
           no error, nothing in the sheet to show it. Say so here rather than let
           it read as the chore's cadence. Saving is never blocked: the value is
           already inert, and the chore may be mid-rework. -->
      {#if ignoredFields.length > 0}
        <div class="field">
          <div class="warn">
            <p class="warn-title">Ignored for this frequency</p>
            {#each ignoredFields as f (f.field)}
              <p class="warn-row">
                <span class="warn-text">{f.message}</span>
                <button type="button" class="warn-clear" on:click={() => clearIgnoredField(f.field)}>
                  Clear
                </button>
              </p>
            {/each}
          </div>
        </div>
      {/if}

      {#if form.frequency === 'daily'}
        <div class="field">
          <span class="label">Which days</span>
          <div class="day-grid">
            <button
              type="button"
              class="day-btn"
              class:active={dailyMode === 'every'}
              on:click={() => setDailyMode('every')}
            >
              Every day
            </button>
            <button
              type="button"
              class="day-btn"
              class:active={dailyMode === 'set'}
              on:click={() => setDailyMode('set')}
            >
              Specific days
            </button>
          </div>
          {#if dailyMode === 'set'}
            <div class="day-grid">
              {#each WEEKDAYS as name, i}
                <button
                  type="button"
                  class="day-btn"
                  class:active={selectedDays.includes(i)}
                  on:click={() => toggleDay(i)}
                >
                  {name.slice(0, 3)}
                </button>
              {/each}
            </div>
          {/if}
          <span class="hint">Due on these days and expected that day — no early window.</span>
        </div>
      {/if}

      {#if form.frequency === 'weekly'}
        <label class="field">
          <span class="label">Weekday</span>
          <select bind:value={form.weekday_due} class="input">
            {#each WEEKDAYS as name, i}
              <option value={String(i)}>{name}</option>
            {/each}
          </select>
          <span class="hint">Due once a week — appears several days early.</span>
        </label>
      {/if}

      {#if form.frequency === 'monthly'}
        <div class="field">
          <span class="label">Monthly schedule</span>
          <div class="day-grid">
            <button
              type="button"
              class="day-btn"
              class:active={monthlyMode === 'day'}
              on:click={() => setMonthlyMode('day')}
            >
              Day of month
            </button>
            <button
              type="button"
              class="day-btn"
              class:active={monthlyMode === 'weekday'}
              on:click={() => setMonthlyMode('weekday')}
            >
              Day of week
            </button>
          </div>
        </div>

        {#if monthlyMode === 'day'}
          <label class="field">
            <span class="label">Day of month (1–31)</span>
            <input type="number" min="1" max="31" bind:value={form.monthly_day} class="input input--sm" placeholder="e.g. 15" />
          </label>
        {:else}
          <div class="field">
            <span class="label">Which weekday of the month</span>
            <div class="nth-row">
              <select bind:value={form.monthly_week} class="input">
                {#each WEEK_ORDINALS as w (w.value)}
                  <option value={w.value}>{w.label}</option>
                {/each}
              </select>
              <select bind:value={form.weekday_due} class="input">
                {#each WEEKDAYS as name, i}
                  <option value={String(i)}>{name}</option>
                {/each}
              </select>
            </div>
          </div>
        {/if}
      {/if}

      {#if form.frequency === 'interval'}
        <label class="field">
          <span class="label">Due on (optional)</span>
          <select bind:value={form.weekday_due} class="input">
            <option value="">Any day — exactly N days later</option>
            {#each WEEKDAYS as name, i}
              <option value={String(i)}>{name}</option>
            {/each}
          </select>
          <span class="hint">Lands on the first such day after the interval. The next interval counts from there, so the schedule drifts slightly later each time.</span>
        </label>

        <label class="field">
          <span class="label">Every how many days?</span>
          <input type="number" min="1" bind:value={form.interval_days} class="input input--sm" placeholder="e.g. 90" />
        </label>
      {/if}

      {#if form.frequency === 'once'}
        <label class="field">
          <span class="label">Date</span>
          <input type="date" bind:value={form.once_date} class="input input--sm" />
        </label>
      {/if}

      <!-- One field, two genuinely different meanings, so it says which one.
           For an interval chore it sets the next due date and the interval
           counts on from there. For the calendar frequencies the day comes from
           the chore's own schedule and this is only a "not before" floor. -->
      {#if form.frequency !== 'once'}
        <label class="field">
          <span class="label">
            {form.frequency === 'interval' ? 'Next due date' : 'Start date (optional)'}
          </span>
          <input type="date" bind:value={form.start_date} class="input input--sm" />
          <span class="hint">
            {#if form.frequency === 'interval'}
              When it's next due. The interval counts from this date.
            {:else}
              Don't generate before this. Leave blank to start now.
            {/if}
          </span>
        </label>
      {/if}

      <!-- Hidden until an interval chore has its interval: both the range and the
           default are derived from it, so with it blank the field read
           "(1–1) … every-N-days 1" — nonsense at exactly the moment you're
           reading it. -->
      {#if LEAD_FREQS.includes(form.frequency) && (form.frequency !== 'interval' || intervalDaysSet)}
        <label class="field">
          <span class="label">Days visible before overdue</span>
          <!-- The every-N-days default depends on the interval, so only show a
               concrete number when we're actually on an interval chore. -->
          <span class="hint">
            Leave blank for default: weekly 4, monthly 7, every-N-days
            {form.frequency === 'interval' ? defaultLeadHint : 'up to 7'}.
          </span>
          <input
            type="number"
            min="1"
            max={leadMax}
            bind:value={form.lead_days}
            class="input input--sm"
            placeholder="default {defaultLeadHint}"
          />
        </label>
      {/if}

      {#if form.frequency !== 'once'}
      {/if}

      {#if isRotation}
        <div class="field">
          <span class="label">Default assignee</span>
          <p class="readonly-value">{rotationLabel}</p>
          <span class="hint">Rotates in this order. Edit rotations in the Chores sheet.</span>
        </div>
      {:else}
        <label class="field">
          <span class="label">Default assignee</span>
          <select bind:value={form.default_assignee} class="input">
            <option value="">Unassigned (claimable)</option>
            {#each people as person (person.person_id)}
              <option value={person.person_id}>{person.name}</option>
            {/each}
          </select>
        </label>
      {/if}

      <label class="field field--row">
        <input type="checkbox" bind:checked={form.requires_approval} />
        <span class="label">Requires parent approval</span>
      </label>

      {#if chore}
        <label class="field field--row">
          <input type="checkbox" bind:checked={form.active} />
          <span class="label">Active</span>
        </label>
      {/if}

      <div class="actions">
        <button type="button" class="btn btn--cancel" on:click={onClose}>Cancel</button>
        <button type="submit" class="btn btn--save" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 100dvh;
    background: rgba(0,0,0,0.4);
    display: flex;
    align-items: flex-end;
    z-index: 200;
    overflow-y: auto;
  }

  .sheet {
    background: #fff;
    border-radius: 16px 16px 0 0;
    padding: 12px 20px 0;
    width: 100%;
    max-height: 90dvh;
    overflow-y: auto;
  }

  .sheet-handle {
    width: 40px;
    height: 4px;
    background: #d1d5db;
    border-radius: 2px;
    margin: 0 auto 16px;
  }

  .readonly-value {
    font-size: 15px;
    color: #111827;
    padding: 10px 0 2px;
  }

  .hint {
    font-size: 12px;
    color: #9ca3af;
  }

  .warn {
    border: 1px solid #fcd34d;
    background: #fffbeb;
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .warn-title {
    font-size: 12px;
    font-weight: 700;
    color: #92400e;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .warn-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .warn-text {
    flex: 1;
    font-size: 12px;
    line-height: 1.45;
    color: #78350f;
  }

  .warn-clear {
    flex: none;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid #d97706;
    background: none;
    color: #92400e;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .sheet-title {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 16px;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field--row {
    flex-direction: row;
    align-items: center;
  }

  .label {
    font-size: 13px;
    font-weight: 500;
    color: #374151;
  }

  .input {
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 14px;
    width: 100%;
  }

  .input--sm { width: 100px; }

  .textarea {
    resize: vertical;
    font-family: inherit;
    line-height: 1.4;
  }

  .day-grid {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .nth-row {
    display: flex;
    gap: 8px;
  }

  .day-btn {
    padding: 6px 10px;
    border-radius: 8px;
    border: 1.5px solid #d1d5db;
    background: none;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    text-transform: capitalize;
  }

  .day-btn.active {
    background: #16a34a;
    border-color: #16a34a;
    color: #fff;
  }

  .actions {
    position: sticky;
    bottom: 0;
    display: flex;
    gap: 8px;
    margin-top: 8px;
    padding: 12px 0 calc(8px + env(safe-area-inset-bottom));
    background: #fff;
  }

  .btn {
    flex: 1;
    padding: 13px;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    border: none;
  }

  .btn--cancel { background: #f3f4f6; color: #374151; }
  .btn--save { background: #16a34a; color: #fff; }
  .btn--save:disabled { background: #d1d5db; cursor: not-allowed; }
</style>

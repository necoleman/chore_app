<script>
  import { post } from '../api/client.js';
  import { showToast } from '../stores/ui.js';
  import { portal } from '../lib/portal.js';

  export let chore = null; // null = create mode
  export let people = [];
  export let locations = [];
  export let initialName = ''; // prefill the name in create mode (from search)
  export let onSave;
  export let onClose;

  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  let form = chore
    ? { ...chore }
    : {
        name: initialName,
        location: '',
        description: '',
        points: 1,
        frequency: 'daily',
        custom_days: '',
        monthly_day: '',
        interval_days: '',
        once_date: '',
        default_assignee: '',
        requires_approval: false,
        active: true,
      };

  // Show the chore's current location even if it's no longer in the managed list
  // (e.g. a legacy value), so editing never silently drops it.
  $: locationOptions =
    form.location && !locations.some((l) => l.location === form.location)
      ? [{ location: form.location }, ...locations]
      : locations;

  let saving = false;

  // For custom days — track as checkboxes
  let selectedDays = (form.custom_days || '').split(',').map((d) => d.trim()).filter(Boolean);

  $: form.custom_days = selectedDays.join(',');

  function toggleDay(day) {
    if (selectedDays.includes(day)) {
      selectedDays = selectedDays.filter((d) => d !== day);
    } else {
      selectedDays = [...selectedDays, day];
    }
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      showToast('Name is required');
      return;
    }
    saving = true;
    try {
      const action = chore ? 'update_chore' : 'add_chore';
      await post(action, form);
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
          <option value="daily">Daily</option>
          <option value="weekly">Weekly (set day below)</option>
          <option value="custom">Custom days</option>
          <option value="monthly">Monthly</option>
          <option value="interval">Every N days</option>
          <option value="once">One-time</option>
        </select>
      </label>

      {#if form.frequency === 'custom'}
        <div class="field">
          <span class="label">Days of week</span>
          <div class="day-grid">
            {#each DAYS as day}
              <button
                type="button"
                class="day-btn"
                class:active={selectedDays.includes(day)}
                on:click={() => toggleDay(day)}
              >
                {day.slice(0, 3)}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if form.frequency === 'weekly'}
        <label class="field">
          <span class="label">Weekday (0=Sun, 6=Sat)</span>
          <input type="number" min="0" max="6" bind:value={form.custom_days} class="input input--sm" />
        </label>
      {/if}

      {#if form.frequency === 'monthly'}
        <label class="field">
          <span class="label">Day of month (1–31)</span>
          <input type="number" min="1" max="31" bind:value={form.monthly_day} class="input input--sm" placeholder="e.g. 15" />
        </label>
      {/if}

      {#if form.frequency === 'interval'}
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

      <label class="field">
        <span class="label">Default assignee</span>
        <select bind:value={form.default_assignee} class="input">
          <option value="">Unassigned (claimable)</option>
          {#each people as person (person.person_id)}
            <option value={person.person_id}>{person.name}</option>
          {/each}
        </select>
      </label>

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

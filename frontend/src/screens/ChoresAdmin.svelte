<script>
  import { onMount } from 'svelte';
  import { get as apiGet, post } from '../api/client.js';
  import { showToast } from '../stores/ui.js';
  import { currentUser } from '../stores/user.js';
  import ChoreForm from '../components/ChoreForm.svelte';
  import PersonPicker from '../components/PersonPicker.svelte';
  import { assignChoreToday } from '../stores/data.js';
  import CollapsibleDescription from '../components/CollapsibleDescription.svelte';
  import { today } from '../lib/utils.js';
  import { nextDueLabel, daysUntilDue, shortDateStr } from '../lib/dueDates.js';

  let chores = [];
  let people = [];
  let locations = [];
  let loading = true;
  let error = null;
  let editingChore = null;   // null = not editing, object = edit existing
  let assigningChore = null; // chore awaiting an assignee for a one-off today
  let assignMode = 'oneoff'; // 'oneoff' | 'early' — see ADD_MODES below

  // The screen is open to everyone, but only admins get the chore-authoring
  // controls: creating (+ Add), Edit, and Reset rotation. Non-admins keep the
  // per-row Add button, so they can pull a chore onto Today without being able
  // to define one or change what an existing one is worth.
  //
  // This is presentation only — see actionAddChore/actionUpdateChore, which
  // don't check who is calling. It stops a kid using the app, not a kid using
  // the network tab.
  $: isAdmin = $currentUser?.is_admin;
  $: selfId = $currentUser?.person_id;

  // Two intents behind the Add button (#43):
  //   one-off — an extra due today, leaving the chore's schedule untouched
  //   early   — the real next occurrence surfaced now, keeping its true due date
  // "Early" is the same idea as granting that one occurrence extra lead days, and
  // because bringing it forward consumes its slot, the chore can't re-trigger on
  // the original date.
  const ADD_MODES = [
    { value: 'oneoff', label: 'One-off', hint: 'Extra, due today. Schedule unchanged.' },
    { value: 'early', label: 'Surface early', hint: 'Surface next chore early. Keeps its due date.' },
  ];

  // Daily chores get no choice: they're due today anyway, so there's nothing to
  // bring forward. Add still works as a plain one-off for them.
  $: addModes = assigningChore && assigningChore.frequency !== 'daily' ? ADD_MODES : null;

  // Pre-select whoever would normally get this occurrence: the sole default, or
  // for a rotation the person whose turn is genuinely next. Choosing someone else
  // only writes the assignment row — the chore's own default is never touched.
  function defaultAssigneeFor(c) {
    const list = String(c?.default_assignee || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (list.length === 0) return '';
    if (list.length === 1) return list[0];
    return list[(list.indexOf(c.rotation_last) + 1) % list.length];
  }
  let showAddForm = false;
  let addInitialName = '';    // prefill the new-chore form (from search)
  let searchTerm = '';
  let sortMode = 'default';   // default | location | assignee | periodicity | countdown

  const FREQ_ORDER = { daily: 0, weekly: 1, monthly: 2, interval: 3, once: 4 };

  async function load() {
    loading = true;
    try {
      const [choreData, peopleData, locationData] = await Promise.all([
        apiGet('chores'),
        apiGet('people'),
        apiGet('locations'),
      ]);
      chores = choreData.chores ?? [];
      people = peopleData.people ?? [];
      locations = locationData.locations ?? [];
    } catch (e) {
      error = 'Could not load chores';
    } finally {
      loading = false;
    }
  }

  onMount(load);

  // Pass `q` in explicitly so it appears in the reactive statements below —
  // Svelte only tracks dependencies referenced directly in a `$:` line, not
  // ones read inside a called function's body.
  // Pass `q` and `peopleById` in explicitly so they appear in the reactive
  // statements below — Svelte only tracks dependencies referenced directly in a
  // `$:` line, not ones read inside a called function's body.
  // Map a default_assignee value — a single person_id or a comma-delimited
  // rotation list (#24) — to a display string of names joined with " → ".
  // Returns '' for empty/unclaimed. Unknown ids fall back to the raw id.
  function assigneeLabel(value, peopleById) {
    return String(value || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((id) => peopleById[id]?.name ?? id)
      .join(' → ');
  }

  function matchesSearch(c, q, peopleById) {
    if (!q) return true;
    const assignee = c.default_assignee
      ? assigneeLabel(c.default_assignee, peopleById)
      : 'Unclaimed';
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.location || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      assignee.toLowerCase().includes(q)
    );
  }

  $: peopleById = Object.fromEntries(people.map((p) => [p.person_id, p]));
  $: assigneeName = (value) => assigneeLabel(value, peopleById) || null;
  $: todayStr = today();

  // Sort comparator for the active list (#15). `peopleById`/`todayStr`/`sortMode`
  // are referenced here so Svelte re-sorts when they change.
  function sortChores(list, mode, peopleById, todayStr) {
    if (mode === 'default') return list;
    const arr = [...list];
    if (mode === 'location') {
      arr.sort((a, b) => (a.location || '~').localeCompare(b.location || '~'));
    } else if (mode === 'assignee') {
      // Unclaimed (no default assignee) first, then by assignee name.
      arr.sort((a, b) => {
        const an = a.default_assignee ? assigneeLabel(a.default_assignee, peopleById) : '';
        const bn = b.default_assignee ? assigneeLabel(b.default_assignee, peopleById) : '';
        if (!an && bn) return -1;
        if (an && !bn) return 1;
        return an.localeCompare(bn);
      });
    } else if (mode === 'periodicity') {
      arr.sort((a, b) => (FREQ_ORDER[a.frequency] ?? 9) - (FREQ_ORDER[b.frequency] ?? 9));
    } else if (mode === 'countdown') {
      arr.sort((a, b) => daysUntilDue(a, todayStr) - daysUntilDue(b, todayStr));
    }
    return arr;
  }

  $: q = searchTerm.trim().toLowerCase();
  $: activeChores = sortChores(
    chores.filter((c) => (c.active === true || c.active === 'TRUE') && matchesSearch(c, q, peopleById)),
    sortMode, peopleById, todayStr
  );
  $: inactiveChores = chores.filter(
    (c) => c.active !== true && c.active !== 'TRUE' && matchesSearch(c, q, peopleById)
  );
  $: noResults =
    searchTerm.trim() !== '' && activeChores.length === 0 && inactiveChores.length === 0;

  // Vacation controls moved to the Leaders tab (#38) — easier to reach, and the
  // people list already lives there.

  // Rotation reset (#33): a rotating chore (comma-list default_assignee) can be
  // reset to the top — its current (open, not-overdue) assignments go back to the
  // first person, and the next occurrence restarts the sequence. Handled server-side.
  const isRotation = (c) => String(c.default_assignee || '').includes(',');
  let resetBusy = null; // chore_id being reset

  async function resetRotation(chore) {
    resetBusy = chore.chore_id;
    try {
      await post('reset_rotation', { chore_id: chore.chore_id });
      showToast(`${chore.name} rotation reset`, 'success');
      await load();
    } catch (e) {
      showToast(e.message || 'Could not reset rotation');
    } finally {
      resetBusy = null;
    }
  }

  function openAdd(name = '') {
    addInitialName = name;
    showAddForm = true;
  }

  function afterSave() {
    editingChore = null;
    showAddForm = false;
    addInitialName = '';
    load();
  }
</script>

<div class="screen">
  <header class="header">
    <h1 class="title">{isAdmin ? 'Manage Chores' : 'Chores'}</h1>
    {#if isAdmin}
      <button class="add-btn" on:click={() => openAdd()}>+ Add</button>
    {/if}
  </header>

  {#if loading}
    <p class="loading">Loading…</p>
  {:else if error}
    <p class="error-msg">{error}</p>
  {:else}
    <div class="search-wrap">
      <input
        type="search"
        class="search"
        placeholder="Search name, location, assignee…"
        bind:value={searchTerm}
      />
      <select class="sort" bind:value={sortMode} aria-label="Sort chores">
        <option value="default">Sort: Default</option>
        <option value="location">Sort: Location</option>
        <option value="assignee">Sort: Assignee</option>
        <option value="periodicity">Sort: Periodicity</option>
        <option value="countdown">Sort: Next due</option>
      </select>
    </div>

    {#if activeChores.length > 0}
      <section class="section">
        <h2 class="section-title">Active ({activeChores.length})</h2>
        {#each activeChores as chore (chore.chore_id)}
          <div class="chore-row">
            <div class="chore-info">
              <span class="chore-name">{chore.name}</span>
              <div class="chore-meta">
                <span class="tag">{chore.frequency}</span>
                <span class="tag">{chore.points} pts</span>
                {#if chore.location}
                  <span class="tag tag--location">{chore.location}</span>
                {/if}
                {#if chore.default_assignee}
                  <span class="tag tag--assignee">👤 {assigneeName(chore.default_assignee)}</span>
                {:else}
                  <span class="tag tag--unclaimed">Unclaimed</span>
                {/if}
                {#if nextDueLabel(chore, todayStr)}
                  <span class="tag tag--next">Next: {nextDueLabel(chore, todayStr)}</span>
                {/if}
                {#if chore.last_done}
                  <span class="tag tag--last-done">Last done: {shortDateStr(chore.last_done)}</span>
                {/if}
                {#if chore.requires_approval === true || chore.requires_approval === 'TRUE'}
                  <span class="tag tag--review">Needs approval</span>
                {/if}
              </div>
              <CollapsibleDescription text={chore.description} />
            </div>
            <div class="chore-actions">
              {#if isAdmin && isRotation(chore)}
                <button
                  class="reset-rotation-btn"
                  disabled={resetBusy === chore.chore_id}
                  on:click={() => resetRotation(chore)}
                >Reset rotation</button>
              {/if}
              <button class="add-today-btn" on:click={() => (assigningChore = chore)}>Add</button>
              {#if isAdmin}
                <button class="edit-btn" on:click={() => (editingChore = chore)}>Edit</button>
              {/if}
            </div>
          </div>
        {/each}
      </section>
    {/if}

    {#if inactiveChores.length > 0}
      <section class="section">
        <h2 class="section-title inactive-title">Inactive ({inactiveChores.length})</h2>
        {#each inactiveChores as chore (chore.chore_id)}
          <div class="chore-row chore-row--inactive">
            <div class="chore-info">
              <span class="chore-name">{chore.name}</span>
              {#if chore.location}
                <div class="chore-meta">
                  <span class="tag tag--location">{chore.location}</span>
                </div>
              {/if}
            </div>
            {#if isAdmin}
              <button class="edit-btn" on:click={() => (editingChore = chore)}>Edit</button>
            {/if}
          </div>
        {/each}
      </section>
    {/if}

    {#if noResults}
      <div class="no-results">
        <p class="no-results-text">No chores match “{searchTerm}”.</p>
        {#if isAdmin}
          <button class="add-btn" on:click={() => openAdd(searchTerm.trim())}>
            + Add “{searchTerm.trim()}”
          </button>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<!-- "Add" on a chore row creates an EXTRA assignment due today (#39). It sits
     outside the recurrence — the generator never rolls it forward or penalizes
     it — so the chore's own schedule is untouched. Unassigned is offered for
     "this needs doing sooner than planned but I don't know who'll do it". -->
{#if assigningChore}
  <PersonPicker
    people={isAdmin ? people : people.filter((p) => p.person_id === selfId)}
    selected={isAdmin ? defaultAssigneeFor(assigningChore) : selfId}
    allowUnassigned={isAdmin}
    title="Add this chore"
    modes={addModes}
    bind:selectedMode={assignMode}
    onSelect={async (person) => {
      const target = assigningChore;
      const mode = addModes === null ? 'oneoff' : assignMode;
      assigningChore = null;
      assignMode = 'oneoff';
      await assignChoreToday(target.chore_id, person?.person_id ?? '', mode);
    }}
    onClose={() => { assigningChore = null; assignMode = 'oneoff'; }}
  />
{/if}

{#if showAddForm}
  <ChoreForm
    {people}
    {locations}
    initialName={addInitialName}
    onSave={afterSave}
    onClose={() => { showAddForm = false; addInitialName = ''; }}
  />
{/if}

{#if editingChore}
  <ChoreForm
    chore={editingChore}
    {people}
    {locations}
    onSave={afterSave}
    onClose={() => (editingChore = null)}
  />
{/if}

<style>
  .screen { padding-bottom: 16px; }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 8px;
  }

  .title {
    font-size: 24px;
    font-weight: 700;
    color: #111827;
  }

  .add-btn {
    background: #16a34a;
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .search-wrap { padding: 4px 16px 8px; display: flex; gap: 8px; }

  .search {
    flex: 1;
    min-width: 0;
    border: 1px solid #d1d5db;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 14px;
  }

  .sort {
    border: 1px solid #d1d5db;
    border-radius: 10px;
    padding: 10px 8px;
    font-size: 13px;
    background: #fff;
    flex-shrink: 0;
  }

  .section { padding: 0 16px; margin-bottom: 8px; }

  .section-title {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9ca3af;
    padding: 12px 0 8px;
  }

  .inactive-title { color: #d1d5db; }

  .chore-row {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #fff;
    border-radius: 12px;
    padding: 14px 12px;
    margin-bottom: 8px;
  }

  .chore-row--inactive { opacity: 0.5; }

  .chore-info { flex: 1; display: flex; flex-direction: column; gap: 4px; }

  .chore-name { font-size: 15px; font-weight: 600; color: #111827; }

  .chore-meta { display: flex; gap: 6px; flex-wrap: wrap; }

  .tag {
    font-size: 11px;
    font-weight: 500;
    background: #f3f4f6;
    color: #6b7280;
    padding: 2px 7px;
    border-radius: 8px;
  }

  .tag--review { background: #fef3c7; color: #92400e; }
    .tag--location { background: #e0e7ff; color: #3730a3; }
  .tag--next { background: #ecfeff; color: #0e7490; }
  .tag--last-done { background: #f3f4f6; color: #6b7280; }
  .tag--assignee { background: #dcfce7; color: #166534; }
  .tag--unclaimed { background: #f3f4f6; color: #6b7280; font-style: italic; }

  .chore-actions { display: flex; flex-direction: column; gap: 6px; align-items: stretch; }

  .add-today-btn {
    background: #16a34a;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .edit-btn {
    background: none;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    color: #374151;
  }

  .reset-rotation-btn {
    background: none;
    border: 1px solid #c7d2fe;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    color: #3730a3;
    white-space: nowrap;
  }

  .reset-rotation-btn:disabled { opacity: 0.5; cursor: default; }

  .person-row {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #fff;
    border-radius: 12px;
    padding: 12px;
    margin-bottom: 8px;
  }

  .person-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .person-name { font-size: 15px; font-weight: 600; color: #111827; flex: 1; }


  
  
  .no-results {
    text-align: center;
    padding: 24px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .no-results-text { color: #6b7280; font-size: 14px; }

  .loading, .error-msg {
    text-align: center;
    padding: 40px;
    color: #9ca3af;
    font-size: 14px;
  }

  .error-msg { color: #dc2626; }
</style>

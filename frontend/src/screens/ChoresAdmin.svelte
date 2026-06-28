<script>
  import { onMount } from 'svelte';
  import { get as apiGet } from '../api/client.js';
  import ChoreForm from '../components/ChoreForm.svelte';

  let chores = [];
  let people = [];
  let locations = [];
  let loading = true;
  let error = null;
  let editingChore = null;   // null = not editing, object = edit existing
  let showAddForm = false;
  let addInitialName = '';    // prefill the new-chore form (from search)
  let searchTerm = '';

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
  function matchesSearch(c, q, peopleById) {
    if (!q) return true;
    const assignee = c.default_assignee
      ? (peopleById[c.default_assignee]?.name ?? c.default_assignee)
      : 'Unclaimed';
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.location || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      assignee.toLowerCase().includes(q)
    );
  }

  $: peopleById = Object.fromEntries(people.map((p) => [p.person_id, p]));
  $: assigneeName = (id) => (id ? (peopleById[id]?.name ?? id) : null);

  $: q = searchTerm.trim().toLowerCase();
  $: activeChores = chores.filter(
    (c) => (c.active === true || c.active === 'TRUE') && matchesSearch(c, q, peopleById)
  );
  $: inactiveChores = chores.filter(
    (c) => c.active !== true && c.active !== 'TRUE' && matchesSearch(c, q, peopleById)
  );
  $: noResults =
    searchTerm.trim() !== '' && activeChores.length === 0 && inactiveChores.length === 0;

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
    <h1 class="title">Manage Chores</h1>
    <button class="add-btn" on:click={() => openAdd()}>+ Add</button>
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
                {#if chore.requires_approval === true || chore.requires_approval === 'TRUE'}
                  <span class="tag tag--review">Needs approval</span>
                {/if}
              </div>
            </div>
            <button class="edit-btn" on:click={() => (editingChore = chore)}>Edit</button>
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
            <button class="edit-btn" on:click={() => (editingChore = chore)}>Edit</button>
          </div>
        {/each}
      </section>
    {/if}

    {#if noResults}
      <div class="no-results">
        <p class="no-results-text">No chores match “{searchTerm}”.</p>
        <button class="add-btn" on:click={() => openAdd(searchTerm.trim())}>
          + Add “{searchTerm.trim()}”
        </button>
      </div>
    {/if}
  {/if}
</div>

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

  .search-wrap { padding: 4px 16px 8px; }

  .search {
    width: 100%;
    border: 1px solid #d1d5db;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 14px;
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
  .tag--assignee { background: #dcfce7; color: #166534; }
  .tag--unclaimed { background: #f3f4f6; color: #6b7280; font-style: italic; }

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

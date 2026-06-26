<script>
  import { onMount } from 'svelte';
  import { get as apiGet } from '../api/client.js';
  import ChoreForm from '../components/ChoreForm.svelte';

  let chores = [];
  let people = [];
  let loading = true;
  let error = null;
  let editingChore = null;   // null = not editing, object = edit existing
  let showAddForm = false;

  async function load() {
    loading = true;
    try {
      const [choreData, peopleData] = await Promise.all([
        apiGet('chores'),
        apiGet('people'),
      ]);
      chores = choreData.chores ?? [];
      people = peopleData.people ?? [];
    } catch (e) {
      error = 'Could not load chores';
    } finally {
      loading = false;
    }
  }

  onMount(load);

  $: activeChores = chores.filter((c) => c.active === true || c.active === 'TRUE');
  $: inactiveChores = chores.filter((c) => c.active !== true && c.active !== 'TRUE');

  function afterSave() {
    editingChore = null;
    showAddForm = false;
    load();
  }
</script>

<div class="screen">
  <header class="header">
    <h1 class="title">Manage Chores</h1>
    <button class="add-btn" on:click={() => (showAddForm = true)}>+ Add</button>
  </header>

  {#if loading}
    <p class="loading">Loading…</p>
  {:else if error}
    <p class="error-msg">{error}</p>
  {:else}
    <section class="section">
      <h2 class="section-title">Active ({activeChores.length})</h2>
      {#each activeChores as chore (chore.chore_id)}
        <div class="chore-row">
          <div class="chore-info">
            <span class="chore-name">{chore.name}</span>
            <div class="chore-meta">
              <span class="tag">{chore.frequency}</span>
              <span class="tag">{chore.points} pts</span>
              {#if chore.requires_approval === true || chore.requires_approval === 'TRUE'}
                <span class="tag tag--review">Needs approval</span>
              {/if}
            </div>
          </div>
          <button class="edit-btn" on:click={() => (editingChore = chore)}>Edit</button>
        </div>
      {/each}
    </section>

    {#if inactiveChores.length > 0}
      <section class="section">
        <h2 class="section-title inactive-title">Inactive ({inactiveChores.length})</h2>
        {#each inactiveChores as chore (chore.chore_id)}
          <div class="chore-row chore-row--inactive">
            <div class="chore-info">
              <span class="chore-name">{chore.name}</span>
            </div>
            <button class="edit-btn" on:click={() => (editingChore = chore)}>Edit</button>
          </div>
        {/each}
      </section>
    {/if}
  {/if}
</div>

{#if showAddForm}
  <ChoreForm
    {people}
    onSave={afterSave}
    onClose={() => (showAddForm = false)}
  />
{/if}

{#if editingChore}
  <ChoreForm
    chore={editingChore}
    {people}
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

  .loading, .error-msg {
    text-align: center;
    padding: 40px;
    color: #9ca3af;
    font-size: 14px;
  }

  .error-msg { color: #dc2626; }
</style>

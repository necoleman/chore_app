<script>
  import { onMount } from 'svelte';
  import { get as apiGet } from '../api/client.js';
  import { currentUser } from '../stores/user.js';

  let history = [];
  let people = [];
  let loading = true;
  let error = null;
  let filterPerson = '';

  $: isAdmin = $currentUser?.is_admin;

  async function load() {
    loading = true;
    error = null;
    try {
      const params = filterPerson ? { person_id: filterPerson, limit: '100' } : { limit: '100' };
      const [histData, peopleData] = await Promise.all([
        apiGet('history', params),
        isAdmin ? apiGet('people') : Promise.resolve({ people: [] }),
      ]);
      history = histData.history ?? [];
      if (isAdmin) people = peopleData.people ?? [];
    } catch (e) {
      error = 'Could not load history';
    } finally {
      loading = false;
    }
  }

  onMount(load);

  // Group by due_date
  $: grouped = history.reduce((acc, item) => {
    const key = item.due_date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  $: sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  function statusColor(status) {
    if (status === 'done') return '#16a34a';
    if (status === 'skipped') return '#9ca3af';
    if (status === 'rejected') return '#dc2626';
    return '#6b7280';
  }

  function statusLabel(status) {
    if (status === 'done') return '✓ Done';
    if (status === 'skipped') return '– Skipped';
    if (status === 'rejected') return '✗ Rejected';
    return status;
  }
</script>

<div class="screen">
  <header class="header">
    <h1 class="title">History</h1>
    {#if isAdmin && people.length > 0}
      <select class="filter" bind:value={filterPerson} on:change={load}>
        <option value="">Everyone</option>
        {#each people as p (p.person_id)}
          <option value={p.person_id}>{p.name}</option>
        {/each}
      </select>
    {/if}
  </header>

  {#if loading}
    <p class="status-text">Loading…</p>
  {:else if error}
    <p class="status-text error">{error}</p>
  {:else if history.length === 0}
    <p class="status-text">No history yet.</p>
  {:else}
    {#each sortedDates as date}
      <section class="section">
        <h2 class="date-heading">{date}</h2>
        {#each grouped[date] as item (item.assignment_id)}
          <div class="history-row">
            <span class="status-dot" style="background:{statusColor(item.status)}"></span>
            <div class="row-info">
              <span class="chore-name">{item.chore_name}</span>
              {#if item.person_name}
                <span class="person">{item.person_name}</span>
              {/if}
              {#if item.review_note}
                <span class="review-note">"{item.review_note}"</span>
              {/if}
            </div>
            <div class="row-right">
              <span class="status-label" style="color:{statusColor(item.status)}">
                {statusLabel(item.status)}
              </span>
              {#if item.points_awarded}
                <span class="points">+{item.points_awarded}</span>
              {/if}
            </div>
          </div>
        {/each}
      </section>
    {/each}
  {/if}
</div>

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

  .filter {
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 13px;
    background: #fff;
    color: #374151;
  }

  .section { padding: 0 16px; margin-bottom: 4px; }

  .date-heading {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9ca3af;
    padding: 12px 0 6px;
  }

  .history-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: #fff;
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 6px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 4px;
  }

  .row-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .chore-name {
    font-size: 14px;
    font-weight: 600;
    color: #111827;
  }

  .person {
    font-size: 12px;
    color: #6b7280;
  }

  .review-note {
    font-size: 11px;
    color: #dc2626;
    font-style: italic;
  }

  .row-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }

  .status-label {
    font-size: 12px;
    font-weight: 600;
  }

  .points {
    font-size: 11px;
    color: #16a34a;
    font-weight: 600;
  }

  .status-text {
    text-align: center;
    padding: 40px;
    color: #9ca3af;
    font-size: 14px;
  }

  .error { color: #dc2626; }
</style>

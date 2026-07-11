<script>
  import { onMount, onDestroy } from 'svelte';
  import { assignments, people, isRefreshing, lastUpdated, startPolling, stopPolling, quickAddChore } from '../stores/data.js';
  import { currentUser } from '../stores/user.js';
  import ChoreCard from '../components/ChoreCard.svelte';
  import AssignmentSegments from '../components/AssignmentSegments.svelte';
  import QuickAddChore from '../components/QuickAddChore.svelte';
  import NeedsReviewSection from '../components/NeedsReviewSection.svelte';
  import { relativeTime, today } from '../lib/utils.js';
  import { splitTodaySections } from '../lib/choreSelectors.js';

  $: isAdmin = $currentUser?.is_admin;
  $: todayStr = today();

  let sortMode = 'default'; // default | due | frequency

  // All Today-screen filtering/sorting/grouping lives in the pure selector
  // (unit-tested in lib/choreSelectors.test.js).
  $: sections = splitTodaySections($assignments, $currentUser, isAdmin, todayStr, sortMode);
  $: pendingReview = sections.pendingReview;
  $: myAssignments = sections.mine;
  $: familyGroups = sections.familyGroups;
  $: familyCount = familyGroups.reduce((n, g) => n + g.items.length, 0);
  $: unassigned = sections.unassigned;

  let showQuickAdd = false;

  onMount(() => startPolling());
  onDestroy(() => stopPolling());

  function handleRefresh() {
    import('../stores/data.js').then(({ refresh }) => refresh());
  }
</script>

<div class="screen">
  <header class="header">
    <div class="header-left">
      <h1 class="title">Today</h1>
      {#if $lastUpdated}
        <span class="updated">Updated {relativeTime($lastUpdated.toISOString())}</span>
      {/if}
    </div>
    <div class="header-actions">
      <button class="add-btn" on:click={() => (showQuickAdd = true)}>+ Add</button>
      <button class="refresh-btn" on:click={handleRefresh} disabled={$isRefreshing} aria-label="Refresh">
        <svg class:spinning={$isRefreshing} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
      </button>
    </div>
  </header>

  <div class="sort-wrap">
    <select class="sort" bind:value={sortMode} aria-label="Sort chores">
      <option value="default">Sort: Default</option>
      <option value="due">Sort: Due date</option>
      <option value="frequency">Sort: Frequency</option>
    </select>
  </div>

  <!-- Needs review (admin only) -->
  <NeedsReviewSection pendingItems={pendingReview} />

  <!-- My chores -->
  <section class="section">
    <h2 class="section-title">My Chores</h2>
    {#if myAssignments.length === 0}
      <p class="empty">All done! 🎉</p>
    {:else}
      <AssignmentSegments items={myAssignments} {todayStr} showAdminControls={isAdmin} />
    {/if}
  </section>

  <!-- Family's chores — collapsed into a single dropdown by default (#26) so
       each user sees only their own + unclaimed chores at a glance. -->
  {#if familyGroups.length > 0}
    <section class="section">
      <details class="family-details">
        <summary class="family-summary">
          <span class="section-title family-heading">Family</span>
          <span class="family-count">{familyCount} {familyCount === 1 ? 'chore' : 'chores'}</span>
        </summary>
        {#each familyGroups as group}
          <div class="family-group">
            <span class="family-name">{group.name}</span>
            <AssignmentSegments items={group.items} {todayStr} showAdminControls={isAdmin} readonly={true} />
          </div>
        {/each}
      </details>
    </section>
  {/if}

  <!-- Unassigned / claimable -->
  {#if unassigned.length > 0}
    <section class="section">
      <h2 class="section-title">Available to Claim</h2>
      {#each unassigned as a (a.assignment_id)}
        <ChoreCard assignment={a} showAdminControls={isAdmin} />
      {/each}
    </section>
  {/if}
</div>

{#if showQuickAdd}
  <QuickAddChore
    isAdmin={isAdmin}
    people={$people}
    selfId={$currentUser?.person_id}
    onSubmit={(name, personId) => quickAddChore(name, personId)}
    onClose={() => (showQuickAdd = false)}
  />
{/if}

<style>
  .screen {
    padding-bottom: 16px;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 8px;
  }

  .header-left {
    display: flex;
    flex-direction: column;
  }

  .title {
    font-size: 24px;
    font-weight: 700;
    color: #111827;
  }

  .updated {
    font-size: 11px;
    color: #9ca3af;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
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

  .refresh-btn {
    background: none;
    border: none;
    padding: 8px;
    cursor: pointer;
    color: #6b7280;
    border-radius: 8px;
  }

  .spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .sort-wrap {
    padding: 0 16px 4px;
    display: flex;
    justify-content: flex-end;
  }

  .sort {
    border: 1px solid #d1d5db;
    border-radius: 10px;
    padding: 8px;
    font-size: 13px;
    background: #fff;
  }

  .section {
    padding: 0 16px;
    margin-bottom: 8px;
  }

  .section-title {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9ca3af;
    padding: 12px 0 8px;
  }

  .empty {
    font-size: 14px;
    color: #6b7280;
    text-align: center;
    padding: 20px 0;
  }

  .family-details {
    margin-bottom: 8px;
  }

  .family-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    list-style: none;
    padding: 12px 0 8px;
    user-select: none;
  }

  .family-summary::-webkit-details-marker {
    display: none;
  }

  /* Caret that rotates when the dropdown is open. */
  .family-summary::before {
    content: '';
    width: 6px;
    height: 6px;
    border-right: 2px solid #9ca3af;
    border-bottom: 2px solid #9ca3af;
    transform: rotate(-45deg);
    transition: transform 0.15s ease;
  }

  .family-details[open] .family-summary::before {
    transform: rotate(45deg);
  }

  .family-heading {
    padding: 0;
  }

  .family-count {
    font-size: 12px;
    font-weight: 600;
    color: #9ca3af;
  }

  .family-group {
    margin-bottom: 12px;
  }

  .family-group:first-of-type {
    margin-top: 4px;
  }

  .family-name {
    font-size: 12px;
    font-weight: 600;
    color: #374151;
    display: block;
    margin-bottom: 4px;
  }
</style>

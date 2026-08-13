<script>
  import { onMount, onDestroy } from 'svelte';
  import { assignments, people, isRefreshing, lastUpdated, startPolling, stopPolling, quickAddChore } from '../stores/data.js';
  import { currentUser } from '../stores/user.js';
  import ChoreGroups from '../components/ChoreGroups.svelte';
  import QuickAddChore from '../components/QuickAddChore.svelte';
  import NeedsReviewSection from '../components/NeedsReviewSection.svelte';
  import { relativeTime, today } from '../lib/utils.js';
  import { splitTodaySections } from '../lib/choreSelectors.js';
  import { loadOpen, saveOpen } from '../lib/persistOpen.js';

  $: isAdmin = $currentUser?.is_admin;
  $: todayStr = today();

  // 'frequency' is gone — cadence grouping supersedes it.
  let sortMode = 'default'; // default | due

  // All Today-screen filtering/grouping/sorting lives in the pure selector
  // (unit-tested in lib/choreSelectors.test.js).
  $: sections = splitTodaySections($assignments, $currentUser, isAdmin, todayStr, sortMode);
  $: pendingReview = sections.pendingReview;
  $: myGroups = sections.mine;
  $: myCount = myGroups.reduce((n, g) => n + g.items.length, 0);
  $: familyGroups = sections.familyGroups;
  $: unassigned = sections.unassigned;

  let showQuickAdd = false;

  // Person-level folds are the only ones that survive: they answer "whose chores
  // am I looking at", which is a different question from the cadence groups.
  // Mine open by default, family closed.
  let mineOpen = loadOpen('mine', true);
  $: saveOpen('mine', mineOpen);

  let familyOpen = {};
  function isFamilyOpen(personId) {
    if (!(personId in familyOpen)) familyOpen[personId] = loadOpen(`fam:${personId}`, false);
    return familyOpen[personId];
  }
  function toggleFamily(personId, open) {
    familyOpen[personId] = open;
    saveOpen(`fam:${personId}`, open);
  }

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
    </select>
  </div>

  <!-- Needs review (admin only) -->
  <NeedsReviewSection pendingItems={pendingReview} />

  <!-- My chores -->
  <section class="section">
    <details class="fold" bind:open={mineOpen}>
      <summary class="fold-summary">
        <span class="section-title">My chores</span>
        <span class="fold-count">{myCount} {myCount === 1 ? 'chore' : 'chores'}</span>
      </summary>
      {#if myGroups.length === 0}
        <p class="empty">All done! 🎉</p>
      {:else}
        <ChoreGroups groups={myGroups} showAdminControls={isAdmin} />
      {/if}
    </details>
  </section>

  <!-- One dropdown per family member, so you can open just the person you want -->
  {#if familyGroups.length > 0}
    <section class="section">
      <h2 class="section-title">Family</h2>
      {#each familyGroups as person (person.person_id)}
        <details
          class="fold"
          open={isFamilyOpen(person.person_id)}
          on:toggle={(e) => toggleFamily(person.person_id, e.currentTarget.open)}
        >
          <summary class="fold-summary">
            <span class="fold-name">{person.name}</span>
            <span class="fold-count">{person.count} {person.count === 1 ? 'chore' : 'chores'}</span>
          </summary>
          <ChoreGroups groups={person.groups} showAdminControls={isAdmin} readonly={true} />
        </details>
      {/each}
    </section>
  {/if}

  <!-- Unassigned / claimable -->
  {#if unassigned.length > 0}
    <section class="section">
      <h2 class="section-title">Available to claim</h2>
      <ChoreGroups groups={unassigned} showAdminControls={isAdmin} />
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
    display: block;
  }

  .empty {
    font-size: 14px;
    color: #6b7280;
    text-align: center;
    padding: 20px 0;
  }

  .fold {
    margin-bottom: 4px;
  }

  .fold-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    list-style: none;
    padding: 8px 0;
    user-select: none;
  }

  .fold-summary::-webkit-details-marker {
    display: none;
  }

  /* Caret that rotates when the fold is open. */
  .fold-summary::before {
    content: '';
    width: 6px;
    height: 6px;
    border-right: 2px solid #9ca3af;
    border-bottom: 2px solid #9ca3af;
    transform: rotate(-45deg);
    transition: transform 0.15s ease;
    flex: none;
  }

  .fold[open] .fold-summary::before {
    transform: rotate(45deg);
  }

  .fold-summary .section-title {
    padding: 0;
  }

  .fold-name {
    font-size: 14px;
    font-weight: 600;
    color: #374151;
  }

  .fold-count {
    font-size: 12px;
    font-weight: 600;
    color: #9ca3af;
  }
</style>

<script>
  import { onMount, onDestroy } from 'svelte';
  import { assignments, people, isRefreshing, lastUpdated, startPolling, stopPolling, quickAddChore } from '../stores/data.js';
  import { currentUser } from '../stores/user.js';
  import ChoreGroups from '../components/ChoreGroups.svelte';
  import AfterDinnerTable from '../components/AfterDinnerTable.svelte';
  import PersonPanel from '../components/PersonPanel.svelte';
  import QuickAddChore from '../components/QuickAddChore.svelte';
  import NeedsReviewSection from '../components/NeedsReviewSection.svelte';
  import { relativeTime, today } from '../lib/utils.js';
  import { splitTodaySections, eveningRows } from '../lib/choreSelectors.js';
  import { loadOpen, saveOpen } from '../lib/persistOpen.js';

  $: isAdmin = $currentUser?.is_admin;
  $: todayStr = today();

  // 'frequency' is gone — cadence grouping supersedes it.
  let sortMode = 'default'; // default | due

  // All Today-screen filtering/grouping/sorting lives in the pure selector
  // (unit-tested in lib/choreSelectors.test.js).
  // `$people` is passed in so the family cards follow the People tab's row
  // order rather than whatever order the assignments happened to arrive in.
  $: sections = splitTodaySections($assignments, $currentUser, isAdmin, todayStr, sortMode, $people);
  $: pendingReview = sections.pendingReview;
  $: myGroups = sections.mine;
  $: myCount = myGroups.reduce((n, g) => n + g.items.length, 0);
  $: familyGroups = sections.familyGroups;
  $: unassigned = sections.unassigned;
  $: evening = eveningRows($assignments, todayStr);

  // Read name and colour from the People row rather than the stored session
  // user: `$people` comes fresh from the server, so editing a colour in the
  // sheet takes effect on the next poll instead of needing a re-login.
  $: me = ($people ?? []).find((p) => p.person_id === $currentUser?.person_id);
  $: myPerson = {
    person_id: $currentUser?.person_id,
    name: me?.name ?? $currentUser?.name ?? 'Me',
    color: me?.color ?? $currentUser?.color,
    count: myCount,
    groups: myGroups,
  };

  let showQuickAdd = false;

  // Per-person open/closed state, persisted. Yours opens by default; everyone
  // else's stays shut, so the screen opens on your own chores rather than a
  // wall of five panels.
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
      <option value="default">Sort: Cadence</option>
      <option value="due">Sort: Due date</option>
    </select>
  </div>

  <!-- Needs review (admin only) -->
  <NeedsReviewSection pendingItems={pendingReview} />

  <!-- The evening round, condensed (#61) -->
  <AfterDinnerTable rows={evening} />

  <!-- Your own panel, always first and open by default -->
  <section class="section">
    <PersonPanel
      person={myPerson}
      open={mineOpen}
      showAdminControls={isAdmin}
      {todayStr}
      onToggle={(v) => (mineOpen = v)}
    />
  </section>

  <!-- One panel per family member, all closed by default -->
  {#if familyGroups.length > 0}
    <section class="section">
      <!-- Only drawn while your own chores are showing. Collapsed, there is
           nothing above it to divide, and the rule reads as separating a single
           card from a heading. -->
      {#if mineOpen}
        <div class="family-divider"></div>
      {/if}
      <h2 class="section-title">Family</h2>
      {#each familyGroups as person (person.person_id)}
        <PersonPanel
          {person}
          open={isFamilyOpen(person.person_id)}
          showAdminControls={isAdmin}
          readonly={true}
          {todayStr}
          onToggle={(v) => toggleFamily(person.person_id, v)}
        />
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





  /* Caret that rotates when the fold is open. */




</style>

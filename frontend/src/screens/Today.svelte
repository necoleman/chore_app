<script>
  import { onMount, onDestroy } from 'svelte';
  import { assignments, people, isRefreshing, lastUpdated, startPolling, stopPolling } from '../stores/data.js';
  import { currentUser } from '../stores/user.js';
  import ChoreCard from '../components/ChoreCard.svelte';
  import NeedsReviewSection from '../components/NeedsReviewSection.svelte';
  import { relativeTime, today } from '../lib/utils.js';

  $: isAdmin = $currentUser?.is_admin;
  $: todayStr = today();

  // Finished items (done/skipped) show only for today; unfinished items
  // (open/pending/rejected) include overdue (due in the past) but never future.
  $: todayAssignments = $assignments.filter((a) => {
    const d = a.due_date?.slice(0, 10);
    if (!d) return false;
    if (a.status === 'done' || a.status === 'skipped') return d === todayStr;
    return d <= todayStr;
  });

  // Sort unfinished above finished; among unfinished, overdue first. Stable.
  function rank(a) {
    const finished = a.status === 'done' || a.status === 'skipped';
    if (finished) return 2;
    return a.due_date?.slice(0, 10) < todayStr ? 0 : 1;
  }
  const byStatus = (x, y) => rank(x) - rank(y);

  $: pendingReview = isAdmin
    ? todayAssignments.filter((a) => a.status === 'pending_review')
    : [];

  // Include the user's own pending_review chores so they see an amber
  // "Waiting for review" card (instead of it vanishing until reviewed).
  $: myAssignments = todayAssignments
    .filter((a) => a.person_id === $currentUser?.person_id)
    .sort(byStatus);

  $: familyAssignments = todayAssignments.filter(
    (a) =>
      a.person_id &&
      a.person_id !== $currentUser?.person_id &&
      a.status !== 'pending_review'
  );

  // Group family assignments by person
  $: familyByPerson = familyAssignments.reduce((acc, a) => {
    const key = a.person_id;
    if (!acc[key]) acc[key] = { name: a.person_name, color: a.person_color, items: [] };
    acc[key].items.push(a);
    return acc;
  }, {});

  $: familyGroups = Object.values(familyByPerson).map((g) => ({
    ...g,
    items: [...g.items].sort(byStatus),
  }));

  $: unassigned = todayAssignments.filter((a) => !a.person_id && a.status === 'open');

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
    <button class="refresh-btn" on:click={handleRefresh} disabled={$isRefreshing} aria-label="Refresh">
      <svg class:spinning={$isRefreshing} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
    </button>
  </header>

  <!-- Needs review (admin only) -->
  <NeedsReviewSection pendingItems={pendingReview} />

  <!-- My chores -->
  <section class="section">
    <h2 class="section-title">My Chores</h2>
    {#if myAssignments.length === 0}
      <p class="empty">All done! 🎉</p>
    {:else}
      {#each myAssignments as a (a.assignment_id)}
        <ChoreCard assignment={a} showAdminControls={isAdmin} />
      {/each}
    {/if}
  </section>

  <!-- Family's chores -->
  {#if familyGroups.length > 0}
    <section class="section">
      <h2 class="section-title">Family</h2>
      {#each familyGroups as group}
        <div class="family-group">
          <span class="family-name">{group.name}</span>
          {#each group.items as a (a.assignment_id)}
            <ChoreCard assignment={a} showAdminControls={isAdmin} readonly={true} />
          {/each}
        </div>
      {/each}
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

  .family-group {
    margin-bottom: 12px;
  }

  .family-name {
    font-size: 12px;
    font-weight: 600;
    color: #374151;
    display: block;
    margin-bottom: 4px;
  }
</style>

<script>
  import { onMount } from 'svelte';
  import { get as apiGet, post } from '../api/client.js';
  import { currentUser } from '../stores/user.js';
  import { showToast } from '../stores/ui.js';
  import LeaderboardRow from '../components/LeaderboardRow.svelte';
  import NotificationSettings from '../components/NotificationSettings.svelte';

  // Window totals come from the backend rather than the Today store: that store
  // deliberately drops finished chores from previous days, so the old "+N this
  // week" was only ever counting today (#38). All four figures arrive in one
  // call, so switching windows never refetches.
  const WINDOWS = [
    { key: 'today', label: 'Today', field: 'points_today', unit: 'pts today' },
    { key: 'week', label: 'Week', field: 'points_week', unit: 'pts this week' },
    { key: 'month', label: 'Month', field: 'points_month', unit: 'pts this month' },
    { key: 'all', label: 'All time', field: 'points_all', unit: 'pts all time' },
  ];

  // Default to the week: an all-time board settles into a fixed order nobody can
  // move, which is discouraging for whoever is bottom.
  let windowKey = 'week';
  let rows = [];
  let loading = true;
  let error = null;
  let vacationBusy = null;

  $: isAdmin = $currentUser?.is_admin;
  $: activeWindow = WINDOWS.find((w) => w.key === windowKey) ?? WINDOWS[1];
  $: sorted = [...rows].sort((a, b) => (b[activeWindow.field] ?? 0) - (a[activeWindow.field] ?? 0));

  async function load() {
    loading = true;
    try {
      const data = await apiGet('leaderboard');
      rows = data.leaderboard ?? [];
      error = null;
    } catch (e) {
      error = 'Could not load leaderboard';
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function toggleVacation(person) {
    const next = !person.on_vacation;
    vacationBusy = person.person_id;
    try {
      await post('set_vacation', { person_id: person.person_id, on_vacation: next });
      showToast(next ? `${person.name} is on vacation` : `${person.name} is back`, 'success');
      await load();
    } catch (e) {
      showToast(e.message || 'Could not update vacation status');
    } finally {
      vacationBusy = null;
    }
  }
</script>

<div class="screen">
  <header class="header">
    <h1 class="title">Leaders</h1>
  </header>

  <div class="windows" role="tablist">
    {#each WINDOWS as w (w.key)}
      <button
        class="window-btn"
        class:active={w.key === windowKey}
        role="tab"
        aria-selected={w.key === windowKey}
        on:click={() => (windowKey = w.key)}
      >
        {w.label}
      </button>
    {/each}
  </div>

  {#if loading}
    <p class="loading">Loading…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if rows.length === 0}
    <p class="empty">No people found.</p>
  {:else}
    <section class="section">
      {#each sorted as person, i (person.person_id)}
        <LeaderboardRow
          {person}
          rank={i + 1}
          points={person[activeWindow.field] ?? 0}
          unit={activeWindow.unit}
          allTime={person.points_all ?? 0}
          showAllTime={windowKey !== 'all'}
        />
      {/each}
    </section>
  {/if}

  <!-- Vacation lives here rather than on Manage Chores so it's easier to reach.
       Leaders is in the nav for everyone, so this must be admin-gated — Manage
       Chores was admin-only via the nav and inherited that protection. -->
  {#if isAdmin && rows.length > 0}
    <section class="section">
      <h2 class="section-title">Vacation</h2>
      {#each rows as person (person.person_id)}
        <div class="person-row">
          <span class="person-dot" style="background:{person.color || '#9ca3af'}"></span>
          <span class="person-name">{person.name}</span>
          {#if person.on_vacation}
            <span class="tag tag--vacation">✈ Away</span>
          {/if}
          <button
            class="vacation-btn"
            class:vacation-btn--on={person.on_vacation}
            disabled={vacationBusy === person.person_id}
            on:click={() => toggleVacation(person)}
          >
            {person.on_vacation ? 'End vacation' : 'Set vacation'}
          </button>
        </div>
      {/each}
    </section>
  {/if}

  {#if $currentUser}
    <NotificationSettings personId={$currentUser.person_id} />
  {/if}
</div>

<style>
  .screen {
    padding-bottom: 16px;
  }

  .header {
    padding: 16px 16px 8px;
  }

  .title {
    font-size: 24px;
    font-weight: 700;
    color: #111827;
  }

  .windows {
    display: flex;
    gap: 4px;
    padding: 0 16px 8px;
  }

  .window-btn {
    flex: 1;
    font-size: 12px;
    font-weight: 600;
    padding: 7px 2px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: #fff;
    color: #6b7280;
    cursor: pointer;
  }

  .window-btn.active {
    background: #16a34a;
    border-color: #16a34a;
    color: #fff;
  }

  .section {
    padding: 0 16px;
  }

  .section-title {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9ca3af;
    padding: 16px 0 8px;
  }

  .loading,
  .error,
  .empty {
    text-align: center;
    font-size: 14px;
    color: #6b7280;
    padding: 24px 0;
  }

  .person-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #fff;
    border-radius: 12px;
    padding: 10px 12px;
    margin-bottom: 6px;
  }

  .person-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
  }

  .person-name {
    font-size: 14px;
    font-weight: 500;
    color: #111827;
    flex: 1;
  }

  .tag {
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 6px;
    background: #f3f4f6;
    color: #4b5563;
  }

  .tag--vacation {
    background: #e0f2fe;
    color: #075985;
  }

  .vacation-btn {
    font-size: 12px;
    font-weight: 600;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid #d1d5db;
    background: #fff;
    color: #374151;
    cursor: pointer;
  }

  .vacation-btn--on {
    border-color: #16a34a;
    color: #16a34a;
  }

  .vacation-btn:disabled {
    opacity: 0.5;
  }
</style>

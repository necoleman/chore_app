<script>
  import { onMount } from 'svelte';
  import { get as apiGet } from '../api/client.js';
  import { assignments } from '../stores/data.js';
  import { currentUser } from '../stores/user.js';
  import { startOfWeek } from '../lib/utils.js';
  import LeaderboardRow from '../components/LeaderboardRow.svelte';
  import NotificationSettings from '../components/NotificationSettings.svelte';

  let people = [];
  let loading = true;
  let error = null;

  onMount(async () => {
    try {
      const data = await apiGet('people');
      people = (data.people ?? []).sort((a, b) => (b.points_total ?? 0) - (a.points_total ?? 0));
    } catch (e) {
      error = 'Could not load leaderboard';
    } finally {
      loading = false;
    }
  });

  // Week points derived from the assignments store (already in memory)
  $: weekStart = startOfWeek();
  $: weekPointsByPerson = $assignments.reduce((acc, a) => {
    if (a.due_date >= weekStart && a.points_awarded && a.person_id) {
      acc[a.person_id] = (acc[a.person_id] ?? 0) + (a.points_awarded ?? 0);
    }
    return acc;
  }, {});
</script>

<div class="screen">
  <header class="header">
    <h1 class="title">Leaderboard</h1>
  </header>

  {#if loading}
    <p class="loading">Loading…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if people.length === 0}
    <p class="empty">No people found.</p>
  {:else}
    <section class="section">
      {#each people as person, i (person.person_id)}
        <LeaderboardRow
          {person}
          rank={i + 1}
          weekPoints={weekPointsByPerson[person.person_id] ?? 0}
        />
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

  .section {
    padding: 0 16px;
  }

  .loading, .error, .empty {
    text-align: center;
    padding: 40px 16px;
    color: #9ca3af;
    font-size: 14px;
  }

  .error {
    color: #dc2626;
  }
</style>

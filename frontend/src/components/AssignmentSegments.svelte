<script>
  // Renders a person's assignment list segmented into "Today" (overdue/due today)
  // and a collapsible "Due soon" sub-list (not yet due), per #28. When every card
  // falls in one bucket the labels are hidden and the cards render plainly.
  import ChoreCard from './ChoreCard.svelte';
  import { partitionByDue } from '../lib/choreSelectors.js';
  import { loadOpen, saveOpen } from '../lib/persistOpen.js';

  export let items = [];
  export let todayStr;
  export let showAdminControls = false;
  export let readonly = false;
  // Stable id so the "Due soon" fold remembers its open/closed state per person.
  export let storeKey;

  $: ({ today, soon } = partitionByDue(items, todayStr));
  // Only label the "Today" group when there's also a "Due soon" group to distinguish it.
  $: showTodayLabel = today.length > 0 && soon.length > 0;

  let soonOpen = loadOpen(`soon:${storeKey}`, false);
  $: saveOpen(`soon:${storeKey}`, soonOpen);
</script>

{#if showTodayLabel}
  <span class="seg-label">Today</span>
{/if}
{#each today as a (a.assignment_id)}
  <ChoreCard assignment={a} {showAdminControls} {readonly} />
{/each}

{#if soon.length > 0}
  <details class="soon-details" bind:open={soonOpen}>
    <summary class="soon-summary">
      <span class="seg-label soon-heading">Due soon</span>
      <span class="soon-count">{soon.length}</span>
    </summary>
    {#each soon as a (a.assignment_id)}
      <ChoreCard assignment={a} {showAdminControls} {readonly} />
    {/each}
  </details>
{/if}

<style>
  .seg-label {
    font-size: 15px;
    font-weight: 700;
    color: #4b5563;
    display: block;
    padding: 6px 0 6px 12px;
  }

  .soon-details {
    margin-top: 4px;
  }

  .soon-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    list-style: none;
    padding: 4px 0 4px 12px;
    user-select: none;
  }

  .soon-summary::-webkit-details-marker {
    display: none;
  }

  /* Caret that rotates when the sub-list is open. */
  .soon-summary::before {
    content: '';
    width: 6px;
    height: 6px;
    border-right: 2px solid #6b7280;
    border-bottom: 2px solid #6b7280;
    transform: rotate(-45deg);
    transition: transform 0.15s ease;
    flex: none;
  }

  .soon-details[open] .soon-summary::before {
    transform: rotate(45deg);
  }

  .soon-heading {
    padding: 0;
  }

  .soon-count {
    font-size: 13px;
    font-weight: 600;
    color: #9ca3af;
  }
</style>

<script>
  // A person and their chores as one tinted panel (#61): the card is the header
  // and the chore groups are the body, both drawn from that person's own `color`
  // in the People tab.
  //
  // Replaces the old <details>/<summary> fold, for two reasons. The summary
  // element could only contain the header row, so the daily fact had to sit
  // outside the clickable area; and the name rendered at section-title size,
  // which left it dwarfed by the chore cards and awkward to find again when you
  // wanted to collapse it.
  import ChoreGroups from './ChoreGroups.svelte';
  import { personTints } from '../lib/personColor.js';
  import { factFor } from '../lib/personFacts.js';
  import { initials } from '../lib/utils.js';

  export let person;            // { person_id, name, color, count, groups }
  export let open = false;
  export let showAdminControls = false;
  export let readonly = false;
  export let todayStr;
  export let onToggle = () => {};

  $: tints = personTints(person.color);
  $: fact = factFor(person.person_id, todayStr);
</script>

<div
  class="panel"
  style="--stripe: {tints.stripe}; --header: {tints.header}; --body: {tints.body}; --edge: {tints.border};"
>
  <!-- The whole header is the toggle, not just the chevron: it is the obvious
       large target, and it is what lets the fact live inside the hit area. -->
  <button class="head" on:click={() => onToggle(!open)} aria-expanded={open}>
    <span class="head-top">
      <span class="avatar" style="background: {tints.stripe};" aria-hidden="true">
        {initials(person.name)}
      </span>
      <span class="name">{person.name}</span>
      <span class="count">{person.count} {person.count === 1 ? 'chore' : 'chores'}</span>
      <svg
        class="chev"
        class:chev--open={open}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        width="17"
        height="17"
        aria-hidden="true"
      >
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </span>
    {#if fact}
      <span class="fact">{fact}</span>
    {/if}
  </button>

  {#if open}
    <div class="body">
      {#if person.groups.length === 0}
        <p class="empty">Nothing left today.</p>
      {:else}
        <ChoreGroups groups={person.groups} {showAdminControls} {readonly} />
      {/if}
    </div>
  {/if}
</div>

<style>
  /* The stripe is a 3px left pad with the colour behind it, rather than a
     border or inset shadow: both of those fight border-radius on one side,
     and the stripe has to run the full height of the panel including the
     chore region. */
  .panel {
    background: var(--stripe);
    border: 1px solid var(--edge);
    border-radius: 12px;
    padding-left: 3px;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .head {
    display: block;
    width: 100%;
    text-align: left;
    background: var(--header);
    border: none;
    padding: 11px 13px;
    cursor: pointer;
    font: inherit;
  }

  .head:focus-visible { outline: 2px solid var(--stripe); outline-offset: -2px; }

  .head-top {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }

  .name {
    flex: 1;
    font-size: 19px;
    font-weight: 600;
    color: #111827;
    min-width: 0;
  }

  .count {
    font-size: 12px;
    color: #6b7280;
    flex: none;
  }

  .chev {
    color: #6b7280;
    flex: none;
    transition: transform 0.15s ease;
  }

  .chev--open { transform: rotate(180deg); }

  /* Indented to the name, not the avatar, so it reads as that person's line. */
  .fact {
    display: block;
    font-size: 12.5px;
    line-height: 1.5;
    color: #4b5563;
    padding: 7px 0 0 35px;
  }

  .body {
    background: var(--body);
    border-top: 1px solid var(--edge);
    padding: 10px 11px 12px;
  }

  .empty {
    font-size: 13px;
    color: #6b7280;
    margin: 4px 2px 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .chev { transition: none; }
  }
</style>

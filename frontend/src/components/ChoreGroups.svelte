<script>
  // Renders a person's assignments under their cadence headings (#38), replacing
  // the old AssignmentSegments "Today / Due soon" date split. That fold was
  // near-dead in practice — a card only entered it when lead_days >= 2, and the
  // default has been 1 for every frequency since v1.3.2 — and lead_days is
  // already the per-chore control for when something should become visible, so
  // hiding an appeared chore behind a fold second-guessed a decision the chore
  // had already made.
  //
  // Nothing here folds: all groups render open.
  import ChoreCard from './ChoreCard.svelte';

  export let groups = [];
  export let showAdminControls = false;
  export let readonly = false;
</script>

{#each groups as group (group.key)}
  <div class="group">
    <div class="group-head">
      <span class="dot dot--{group.key}"></span>
      <span class="group-title">{group.label}</span>
      <span class="group-count">{group.items.length}</span>
    </div>
    {#each group.items as a (a.assignment_id)}
      <ChoreCard assignment={a} {showAdminControls} {readonly} />
    {/each}
  </div>
{/each}

<style>
  .group {
    margin-bottom: 4px;
  }

  .group-head {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 10px 2px 6px;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
  }

  /* Warm to cool to neutral reads as an urgency ramp without a legend. */
  /* Daily teal, weekly coral. Keep these in step with the stripe and frequency
     chip in ChoreCard — the three are read as one signal. */
  .dot--oneoff { background: #7f77dd; }
  .dot--daily { background: #1d9e75; }
  .dot--weekly { background: #d85a30; }
  .dot--monthly { background: #888780; }

  .group-title {
    font-size: 13px;
    font-weight: 600;
    color: #374151;
  }

  .group-count {
    font-size: 12px;
    color: #9ca3af;
  }
</style>

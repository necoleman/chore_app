<script>
  // The condensed evening round at the top of Today (#61): chore, who has it,
  // and a tap target. Deliberately bare — no points, location, due date or
  // overflow menu. Everything else about a chore is on its own card below.
  import { completeAssignment } from '../stores/data.js';
  import { currentUser } from '../stores/user.js';

  export let rows = [];

  $: isAdmin = $currentUser?.is_admin;
  $: myId = $currentUser?.person_id;

  // An admin can tick any of them; everyone else only their own. Mirrors the
  // card rules, including Stage 5's check-off-on-someone's-behalf.
  const finished = (a) => a.status === 'done' || a.status === 'skipped';
  function canTick(a) {
    if (finished(a) || a.status === 'pending_review') return false;
    return isAdmin || a.person_id === myId;
  }

  function tick(a) {
    if (!canTick(a)) return;
    completeAssignment(a.assignment_id, a.person_id || myId, myId);
  }
</script>

{#if rows.length > 0}
  <section class="evening">
    <h2 class="evening-title">After Dinner Chores</h2>
    {#each rows as a (a.assignment_id)}
      <div class="row" class:row--done={finished(a)}>
        {#if canTick(a)}
          <button
            class="mark"
            on:click={() => tick(a)}
            aria-label={`Mark ${a.chore_name} done for ${a.person_name || 'them'}`}
          ></button>
        {:else if finished(a)}
          <span class="mark mark--done" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" width="11" height="11">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
        {:else}
          <span class="mark mark--locked" aria-hidden="true"></span>
        {/if}
        <span class="name">{a.chore_name}</span>
        <span class="who">{a.person_name || 'Unclaimed'}</span>
      </div>
    {/each}
  </section>
{/if}

<style>
  /* Shaded and outlined, to set the evening round apart from the person panels
     below it rather than looking like another card in the same stack. */
  .evening {
    margin: 0 16px 18px;
    background: #f3f5f4;
    border: 1px solid #ccd2cf;
    border-radius: 12px;
    padding: 11px 12px 4px;
  }

  .evening-title {
    font-size: 13px;
    font-weight: 600;
    color: #374151;
    margin: 0 1px 8px;
    padding: 0;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 1px;
    border-top: 0.5px solid #dde2e0;
  }

  .row--done { opacity: 0.45; }
  .row--done .name { text-decoration: line-through; }

  /* White against the shading, so an unticked circle still reads as a target. */
  .mark {
    width: 17px;
    height: 17px;
    border-radius: 50%;
    border: 1.5px solid #b4bcb8;
    background: #fff;
    flex: none;
    padding: 0;
    cursor: pointer;
  }

  .mark--locked { cursor: default; opacity: 0.55; }

  .mark--done {
    border-color: transparent;
    background: #1d9e75;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: default;
  }

  button.mark:focus-visible { outline: 2px solid #1d9e75; outline-offset: 2px; }

  .name {
    flex: 1;
    font-size: 14px;
    color: #111827;
    min-width: 0;
  }

  .who {
    font-size: 12px;
    color: #6b7280;
    flex: none;
  }
</style>

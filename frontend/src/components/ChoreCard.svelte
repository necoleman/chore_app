<script>
  import { currentUser } from '../stores/user.js';
  import {
    people,
    completeAssignment,
    claimAssignment,
    approveAssignment,
    rejectAssignment,
    uncompleteAssignment,
  } from '../stores/data.js';
  import CheckAnimation from './CheckAnimation.svelte';
  import PendingReviewBadge from './PendingReviewBadge.svelte';
  import ApproveRejectBar from './ApproveRejectBar.svelte';
  import AdminOverflowMenu from './AdminOverflowMenu.svelte';
  import CollapsibleDescription from './CollapsibleDescription.svelte';
  import { today } from '../lib/utils.js';
  import { dueLabel, daysOverdue } from '../lib/dueDates.js';
  import { choreState, reviewerName as resolveReviewerName, groupKeyFor } from '../lib/choreSelectors.js';
  import { portal } from '../lib/portal.js';

  export let assignment;
  export let showAdminControls = false;
  export let readonly = false;

  let showUncheckConfirm = false;

  // All derived card state lives in the pure selector (unit-tested).
  $: cs = choreState(assignment, $currentUser, { showAdminControls, readonly, todayStr: today() });
  $: ({
    isOpen, isPending, isDone, isSkipped, isRejected, isMine, isUnassigned,
    isOverdue, showApproveReject, isInteractive, canUncheck,
  } = cs);

  // A non-empty review_note only persists on a sent-back, not-yet-redone chore
  // (actionReject sets it; actionComplete clears it). Show it as feedback, named
  // by the reviewer when we can resolve them.
  $: reviewerName = resolveReviewerName(assignment, $people);

  function handleTap() {
    if (!isInteractive) return;
    if (isUnassigned) {
      claimAssignment(assignment.assignment_id, $currentUser.person_id);
    } else {
      completeAssignment(assignment.assignment_id, $currentUser.person_id);
    }
  }

  function confirmUncheck() {
    uncompleteAssignment(assignment.assignment_id);
    showUncheckConfirm = false;
  }

  // Cadence is carried by the group heading, a matching edge stripe, and a
  // matching frequency chip (#38) — not by tinting the whole card, which used to
  // switch off the moment a card went pending/rejected/done and so vanished
  // exactly when the card mattered most. The card background stays free for
  // status.
  $: groupKey = groupKeyFor(assignment);

  // The frequency chip reads "one-off" rather than the underlying chore's
  // cadence: on this card, "weekly" would describe the chore but not the
  // assignment in front of you.
  // "x180 days" rather than "every 180 days" — short enough to stay on one line
  // alongside the points and location chips.
  $: freqLabel =
    groupKey === 'oneoff'
      ? 'one-off'
      : assignment.frequency === 'interval'
        ? `x${assignment.period_days} days`
        : assignment.frequency;
</script>

<div
  class="card card--{groupKey}"
  class:card--done={isDone}
  class:card--skipped={isSkipped}
  class:card--pending={isPending}
  class:card--rejected={isRejected}
>
  <div class="stripe"></div>
  <div class="card-inner">
    {#if isInteractive}
      <button
        type="button"
        class="check-btn"
        on:click={handleTap}
        aria-label={isUnassigned ? 'Claim chore' : 'Mark done'}
      >
        <CheckAnimation status={assignment.status} size={32} />
      </button>
    {:else}
      <CheckAnimation status={assignment.status} size={32} />
    {/if}

    <div class="card-body">
      <p class="chore-name">
        {#if assignment.sort_last}
          <!-- Sinks to the end of its group; the clock marks it on the card so it
               still reads correctly in isolation (#40). -->
          <svg class="later-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Do later in the day">
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 14" />
          </svg>
        {/if}
        {assignment.chore_name}
      </p>

      <!-- No assignee chip: the section the card sits in already says whose it is
           (My chores, or a named Family fold). The one place that isn't true —
           Needs review, which mixes people — has its own markup and shows the
           name itself. -->
      <div class="chips">
        {#if freqLabel}<span class="chip chip--freq">{freqLabel}</span>{/if}
        <span class="chip">{assignment.points} pts</span>
        {#if assignment.location}<span class="chip">{assignment.location}</span>{/if}
      </div>

      <div class="chips">
        {#if !isDone && !isSkipped && assignment.due_date}
          <span class="chip">Due {dueLabel(assignment.due_date, today())}</span>
        {/if}
        {#if isOverdue}
          <span class="chip chip--overdue">Overdue {daysOverdue(assignment.due_date, today())}d</span>
        {/if}
        {#if assignment.missed_count && !isDone && !isSkipped}
          <span class="chip chip--missed">missed {assignment.missed_count}×</span>
        {/if}
      </div>

      <CollapsibleDescription text={assignment.description} />

      {#if isPending && isMine}
        <PendingReviewBadge />
      {/if}

      {#if assignment.review_note}
        <span class="rejection-note">
          Sent back{reviewerName ? ` by ${reviewerName}` : ''}: {assignment.review_note}
        </span>
      {/if}

      {#if isUnassigned && isInteractive}
        <button type="button" class="claim-btn" on:click={handleTap}>Tap to claim</button>
      {:else if isUnassigned}
        <span class="unassigned-label">Tap to claim</span>
      {/if}
    </div>

    <div class="card-right">
      {#if isDone && assignment.points_awarded}
        <span class="points-chip">+{assignment.points_awarded}</span>
      {/if}

      {#if showAdminControls && !showApproveReject && (isOpen || isPending)}
        <AdminOverflowMenu {assignment} />
      {/if}

      {#if canUncheck}
        <button
          class="undo-btn"
          on:click|stopPropagation={() => (showUncheckConfirm = true)}
          aria-label="Uncheck chore"
        >
          Undo
        </button>
      {/if}
    </div>
  </div>
</div>

{#if showUncheckConfirm}
  <div class="modal-backdrop" use:portal on:click|self={() => (showUncheckConfirm = false)}>
    <div class="modal">
      <p class="modal-title">Uncheck "{assignment.chore_name}"?</p>
      <p class="modal-text">This moves it back to your list{assignment.points_awarded ? ' and removes the points' : ''}.</p>
      <div class="modal-actions">
        <button class="btn btn--cancel" on:click={() => (showUncheckConfirm = false)}>Cancel</button>
        <button class="btn btn--uncheck" on:click={confirmUncheck}>Uncheck</button>
      </div>
    </div>
  </div>
{/if}

{#if showApproveReject}
  <ApproveRejectBar
    {assignment}
    onApprove={() => approveAssignment(assignment.assignment_id, $currentUser.person_id)}
    onReject={(note) => rejectAssignment(assignment.assignment_id, $currentUser.person_id, note)}
  />
{/if}

<style>
  /* overflow:hidden keeps the 12px corners while the stripe runs full height —
     a border-left would force square corners instead. */
  .card {
    display: flex;
    background: #fff;
    border-radius: 12px;
    margin-bottom: 8px;
    border: 1.5px solid #f3f4f6;
    overflow: hidden;
    transition: opacity 0.2s;
    min-height: 56px;
  }

  .stripe {
    width: 3px;
    flex: none;
    background: #d1d5db;
  }

  .card--oneoff .stripe { background: #7f77dd; }
  .card--daily .stripe { background: #d85a30; }
  .card--weekly .stripe { background: #1d9e75; }
  .card--monthly .stripe { background: #888780; }

  .card-inner {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 12px;
    flex: 1;
    min-width: 0;
  }

  /* Only the circle is the action target (tap-to-complete/claim). Padded to a
     ~44px tap area for iOS while the visual circle stays 32px. */
  .check-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    padding: 6px;
    margin: -6px;
    line-height: 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    border-radius: 50%;
  }

  .check-btn:active {
    opacity: 0.6;
  }

  .card-body {
    flex: 1;
    min-width: 0;
  }

  .chore-name {
    font-size: 15px;
    font-weight: 500;
    color: #111827;
    margin-bottom: 6px;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .later-icon {
    width: 14px;
    height: 14px;
    color: #9ca3af;
    flex: none;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 4px;
  }

  .chips:empty {
    display: none;
  }

  .chip {
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 6px;
    background: #f3f4f6;
    color: #4b5563;
    white-space: nowrap;
  }

  .card--oneoff .chip--freq { background: #eeedfe; color: #3c3489; }
  .card--daily .chip--freq { background: #faece7; color: #993c1d; }
  .card--weekly .chip--freq { background: #e1f5ee; color: #0f6e56; }
  .card--monthly .chip--freq { background: #f1efe8; color: #444441; }

  .chip--overdue { background: #fcebeb; color: #a32d2d; }
  .chip--missed { background: #faeeda; color: #854f0b; }

  .card--done {
    opacity: 0.5;
  }

  .card--skipped {
    opacity: 0.5;
  }

  .card--pending {
    background: #fffbeb;
    border-color: #fde68a;
  }

  .card--rejected {
    background: #fef2f2;
    border-color: #fecaca;
  }

  .rejection-note {
    display: block;
    font-size: 12px;
    color: #b91c1c;
    margin-top: 6px;
    line-height: 1.4;
  }

  .claim-btn {
    background: none;
    border: none;
    padding: 4px 0 0;
    font-size: 12px;
    font-weight: 600;
    color: #16a34a;
    cursor: pointer;
  }

  .unassigned-label {
    display: block;
    font-size: 12px;
    color: #9ca3af;
    padding-top: 4px;
  }

  .card-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    flex-shrink: 0;
  }

  .points-chip {
    font-size: 13px;
    font-weight: 700;
    color: #16a34a;
  }

  .undo-btn {
    background: none;
    border: none;
    font-size: 12px;
    color: #6b7280;
    cursor: pointer;
    padding: 2px 4px;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 24px;
  }

  .modal {
    background: #fff;
    border-radius: 14px;
    padding: 20px;
    width: 100%;
    max-width: 320px;
  }

  .modal-title {
    font-size: 16px;
    font-weight: 600;
    color: #111827;
    margin-bottom: 6px;
  }

  .modal-text {
    font-size: 13px;
    color: #6b7280;
    margin-bottom: 16px;
  }

  .modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .btn {
    border: none;
    border-radius: 10px;
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn--cancel {
    background: #f3f4f6;
    color: #374151;
  }

  .btn--uncheck {
    background: #dc2626;
    color: #fff;
  }
</style>

<script>
  import { currentUser } from '../stores/user.js';
  import {
    people,
    completeAssignment,
    skipAssignment,
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
  import { initials, contrastColor, today } from '../lib/utils.js';
  import { choreState, reviewerName as resolveReviewerName } from '../lib/choreSelectors.js';
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
</script>

<div
  class="card"
  class:card--done={isDone}
  class:card--skipped={isSkipped}
  class:card--pending={isPending}
  class:card--rejected={isRejected}
>
  {#if isInteractive}
    <button
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
    <div class="chore-name-row">
      <span class="chore-name">{assignment.chore_name}</span>
      {#if assignment.location}
        <span class="location-tag">{assignment.location}</span>
      {/if}
      {#if isOverdue}
        <span class="overdue-tag">Overdue · {assignment.due_date?.slice(5, 10)}</span>
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

    {#if assignment.person_id}
      <div class="person-chip">
        <div
          class="avatar-sm"
          style="background:{assignment.person_color || '#6b7280'};color:{contrastColor(assignment.person_color || '#6b7280')}"
        >
          {initials(assignment.person_name ?? '')}
        </div>
        <span class="person-name-sm">{assignment.person_name ?? ''}</span>
      </div>
    {:else}
      <span class="unassigned-label">Tap to claim</span>
    {/if}
  </div>

  <div class="card-right">
    {#if isDone && assignment.points_awarded}
      <span class="points-chip">+{assignment.points_awarded}</span>
    {:else if isOpen || isPending}
      <span class="points-label">{assignment.points} pts</span>
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
  .card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background: #fff;
    border-radius: 12px;
    padding: 14px 12px;
    margin-bottom: 8px;
    border: 1.5px solid #f3f4f6;
    transition: opacity 0.2s;
    min-height: 56px;
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

  .card--done {
    opacity: 0.5;
  }

  .card--skipped {
    opacity: 0.4;
  }

  .card--pending {
    border-color: #fcd34d;
    background: #fffbeb;
  }

  .card--rejected {
    border-color: #fca5a5;
    background: #fff5f5;
  }

  .card-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .chore-name-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .chore-name {
    font-size: 15px;
    font-weight: 600;
    color: #111827;
  }

  .location-tag {
    font-size: 11px;
    font-weight: 500;
    background: #e0e7ff;
    color: #3730a3;
    padding: 1px 7px;
    border-radius: 8px;
  }


  .rejection-note {
    font-size: 12px;
    color: #dc2626;
    font-style: italic;
  }

  .person-chip {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .avatar-sm {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    font-size: 9px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .person-name-sm {
    font-size: 12px;
    color: #6b7280;
  }

  .unassigned-label {
    font-size: 12px;
    color: #2563eb;
    font-weight: 500;
  }

  .card-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    flex-shrink: 0;
  }

  .points-chip {
    background: #dcfce7;
    color: #16a34a;
    font-size: 12px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 10px;
  }

  .points-label {
    font-size: 12px;
    color: #9ca3af;
  }

  .overdue-tag {
    font-size: 11px;
    font-weight: 600;
    background: #fee2e2;
    color: #b91c1c;
    padding: 1px 7px;
    border-radius: 8px;
  }

  .undo-btn {
    background: none;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    cursor: pointer;
  }

  /* Uncheck confirmation modal (same pattern as ApproveRejectBar) */
  .modal-backdrop {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 100dvh;
    background: rgba(0,0,0,0.4);
    display: flex;
    align-items: flex-end;
    z-index: 200;
  }

  .modal {
    background: #fff;
    border-radius: 16px 16px 0 0;
    padding: 24px 20px 0;
    width: 100%;
    max-height: 90dvh;
    overflow-y: auto;
  }

  .modal-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 6px;
  }

  .modal-text {
    font-size: 14px;
    color: #6b7280;
    margin-bottom: 16px;
  }

  .modal-actions {
    position: sticky;
    bottom: 0;
    display: flex;
    gap: 8px;
    padding: 12px 0 calc(8px + env(safe-area-inset-bottom));
    background: #fff;
  }

  .btn {
    flex: 1;
    padding: 12px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn--cancel { background: #f3f4f6; color: #374151; }
  .btn--uncheck { background: #dc2626; color: #fff; }
</style>

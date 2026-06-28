<script>
  import { currentUser } from '../stores/user.js';
  import {
    completeAssignment,
    skipAssignment,
    claimAssignment,
    approveAssignment,
    rejectAssignment,
  } from '../stores/data.js';
  import CheckAnimation from './CheckAnimation.svelte';
  import PendingReviewBadge from './PendingReviewBadge.svelte';
  import ApproveRejectBar from './ApproveRejectBar.svelte';
  import AdminOverflowMenu from './AdminOverflowMenu.svelte';
  import { initials, contrastColor } from '../lib/utils.js';

  export let assignment;
  export let showAdminControls = false;
  export let readonly = false;

  $: isOpen = assignment.status === 'open';
  $: isPending = assignment.status === 'pending_review';
  $: isDone = assignment.status === 'done';
  $: isSkipped = assignment.status === 'skipped';
  $: isRejected = assignment.status === 'rejected';
  $: isMine = assignment.person_id === $currentUser?.person_id;
  $: isUnassigned = !assignment.person_id;

  // Admin sees approve/reject inline (not in overflow) for pending items
  $: showApproveReject = showAdminControls && isPending;
  $: isInteractive = !readonly && (isOpen || isRejected) && (isMine || isUnassigned);

  function handleTap() {
    if (!isInteractive) return;
    if (isUnassigned) {
      claimAssignment(assignment.assignment_id, $currentUser.person_id);
    } else {
      completeAssignment(assignment.assignment_id, $currentUser.person_id);
    }
  }
</script>

<div
  class="card"
  class:card--done={isDone}
  class:card--skipped={isSkipped}
  class:card--pending={isPending}
  class:card--rejected={isRejected}
  class:card--interactive={isInteractive}
  on:click={handleTap}
  role={isInteractive ? 'button' : undefined}
  tabindex={isInteractive ? 0 : undefined}
  on:keydown={(e) => e.key === 'Enter' && handleTap()}
>
  <CheckAnimation status={assignment.status} size={32} />

  <div class="card-body">
    <div class="chore-name-row">
      <span class="chore-name">{assignment.chore_name}</span>
      {#if assignment.location}
        <span class="location-tag">{assignment.location}</span>
      {/if}
    </div>

    {#if assignment.description}
      <span class="chore-description">{assignment.description}</span>
    {/if}

    {#if isPending && isMine}
      <PendingReviewBadge />
    {/if}

    {#if isRejected && assignment.review_note}
      <span class="rejection-note">Sent back: {assignment.review_note}</span>
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
  </div>
</div>

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

  .card--interactive {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .card--interactive:active {
    opacity: 0.7;
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

  .chore-description {
    font-size: 12px;
    color: #6b7280;
    line-height: 1.35;
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
</style>

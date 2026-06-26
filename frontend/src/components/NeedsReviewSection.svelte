<script>
  import { currentUser } from '../stores/user.js';
  import { approveAssignment, rejectAssignment } from '../stores/data.js';
  import ApproveRejectBar from './ApproveRejectBar.svelte';
  import CheckAnimation from './CheckAnimation.svelte';

  export let pendingItems = [];
</script>

{#if pendingItems.length > 0}
  <section class="section">
    <h2 class="section-title">
      <span class="dot"></span>
      Needs review ({pendingItems.length})
    </h2>
    {#each pendingItems as item (item.assignment_id)}
      <div class="review-card">
        <div class="card-header">
          <CheckAnimation status="pending_review" size={28} />
          <div class="card-info">
            <span class="chore-name">{item.chore_name}</span>
            <span class="person-name">{item.person_name ?? 'Unassigned'}</span>
          </div>
          <span class="points">{item.points} pts</span>
        </div>
        <ApproveRejectBar
          assignment={item}
          onApprove={() => approveAssignment(item.assignment_id, $currentUser.person_id)}
          onReject={(note) => rejectAssignment(item.assignment_id, $currentUser.person_id, note)}
        />
      </div>
    {/each}
  </section>
{/if}

<style>
  .section {
    padding: 0 16px 8px;
  }

  .section-title {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #f59e0b;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 0 8px;
  }

  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    background: #f59e0b;
    border-radius: 50%;
  }

  .review-card {
    background: #fff;
    border: 1.5px solid #fcd34d;
    border-radius: 12px;
    padding: 12px;
    margin-bottom: 8px;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .card-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .chore-name {
    font-size: 15px;
    font-weight: 600;
    color: #111827;
  }

  .person-name {
    font-size: 12px;
    color: #6b7280;
  }

  .points {
    font-size: 12px;
    font-weight: 600;
    color: #16a34a;
    background: #dcfce7;
    padding: 2px 8px;
    border-radius: 10px;
  }
</style>

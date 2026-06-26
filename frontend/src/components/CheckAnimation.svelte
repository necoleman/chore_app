<script>
  export let status = 'open'; // 'open' | 'pending_review' | 'done' | 'skipped' | 'rejected'
  export let size = 32;
</script>

<div class="check-wrap check-wrap--{status}" style="width:{size}px;height:{size}px;" aria-hidden="true">
  {#if status === 'done'}
    <!-- Animated checkmark -->
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="15" fill="#16a34a"/>
      <polyline
        class="check-line"
        points="8,17 13,22 24,10"
        stroke="white"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  {:else if status === 'pending_review'}
    <!-- Clock / pending icon -->
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="15" fill="#f59e0b"/>
      <circle cx="16" cy="16" r="1.5" fill="white"/>
      <polyline points="16,9 16,16 20,20" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  {:else if status === 'skipped'}
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="15" fill="#d1d5db"/>
      <line x1="10" y1="10" x2="22" y2="22" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="22" y1="10" x2="10" y2="22" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  {:else if status === 'rejected'}
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="15" fill="#dc2626"/>
      <line x1="10" y1="10" x2="22" y2="22" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="22" y1="10" x2="10" y2="22" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  {:else}
    <!-- Open state: empty circle tap target -->
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="14" stroke="#d1d5db" stroke-width="2"/>
    </svg>
  {/if}
</div>

<style>
  .check-wrap {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .check-wrap svg {
    width: 100%;
    height: 100%;
  }

  .check-line {
    stroke-dasharray: 30;
    stroke-dashoffset: 30;
    animation: draw 0.3s ease forwards;
  }

  @keyframes draw {
    to { stroke-dashoffset: 0; }
  }
</style>

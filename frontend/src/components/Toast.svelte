<script>
  import { toast, dismissToast } from '../stores/ui.js';
</script>

{#if $toast}
  <div class="toast toast--{$toast.type}" role="alert" on:click={dismissToast}>
    {$toast.message}
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    bottom: calc(env(safe-area-inset-bottom) + 80px);
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    z-index: 1000;
    cursor: pointer;
    animation: slide-up 0.2s ease;
  }

  .toast--error {
    background: #dc2626;
    color: #fff;
  }

  .toast--success {
    background: #16a34a;
    color: #fff;
  }

  .toast--info {
    background: #2563eb;
    color: #fff;
  }

  @keyframes slide-up {
    from { transform: translateX(-50%) translateY(16px); opacity: 0; }
    to   { transform: translateX(-50%) translateY(0);   opacity: 1; }
  }
</style>

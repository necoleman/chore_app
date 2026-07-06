<script>
  import { registerFCM, isNotificationSupported } from '../lib/fcm.js';
  import { showToast } from '../stores/ui.js';

  // The current person — needed so the refreshed token is stored against them.
  export let personId;

  // `Notification.permission` is only meaningful where the API exists; the whole
  // control is hidden when notifications aren't supported (e.g. an iOS Safari tab
  // that hasn't been installed to the Home Screen).
  const supported = isNotificationSupported();
  let permission = supported ? Notification.permission : 'unsupported';
  let busy = false;

  async function enable() {
    if (busy) return;
    busy = true;
    try {
      const token = await registerFCM(personId);
      // Re-read: requestPermission may have just flipped it to granted/denied.
      permission = supported ? Notification.permission : 'unsupported';
      if (token) {
        showToast('Notifications enabled', 'success');
      } else if (permission === 'denied') {
        showToast('Notifications are blocked in settings', 'error');
      } else {
        showToast("Couldn't enable notifications", 'error');
      }
    } catch (e) {
      showToast("Couldn't enable notifications", 'error');
    } finally {
      busy = false;
    }
  }
</script>

{#if supported}
  <section class="notif">
    {#if permission === 'granted'}
      <div class="notif-row">
        <span class="notif-status">🔔 Notifications on for this device</span>
        <button class="notif-btn" on:click={enable} disabled={busy}>
          {busy ? 'Working…' : 'Re-register'}
        </button>
      </div>
    {:else if permission === 'denied'}
      <div class="notif-col">
        <span class="notif-status notif-status--muted">🔕 Notifications are blocked</span>
        <p class="notif-help">
          The browser is blocking notifications for this app. Turn them back on in your
          browser/device settings, then reload. On iPhone: <em>Settings → Notifications →
          this app</em>, or delete and re-add the Home-Screen icon, then tap Enable again.
        </p>
      </div>
    {:else}
      <div class="notif-row">
        <span class="notif-status notif-status--muted">🔕 Notifications off</span>
        <button class="notif-btn notif-btn--primary" on:click={enable} disabled={busy}>
          {busy ? 'Working…' : 'Enable notifications'}
        </button>
      </div>
    {/if}
  </section>
{/if}

<style>
  .notif {
    margin: 16px;
    padding: 12px 14px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
  }

  .notif-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .notif-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .notif-status {
    font-size: 14px;
    font-weight: 500;
    color: #111827;
  }

  .notif-status--muted {
    color: #6b7280;
  }

  .notif-help {
    font-size: 12px;
    line-height: 1.5;
    color: #6b7280;
  }

  .notif-btn {
    flex-shrink: 0;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 600;
    color: #374151;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
  }

  .notif-btn--primary {
    color: #fff;
    background: #16a34a;
    border-color: #16a34a;
  }

  .notif-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>

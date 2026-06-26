<script>
  import { onMount } from 'svelte';
  import { get as apiGet } from '../api/client.js';
  import { currentUser } from '../stores/user.js';
  import { registerFCM, isNotificationSupported } from '../lib/fcm.js';
  import { initials, contrastColor } from '../lib/utils.js';

  let step = 1; // 1 = pick person, 2 = A2HS, 3 = notifications
  let people = [];
  let selectedPerson = null;
  let loading = true;
  let deferredInstallPrompt = null;
  let isInstalled = false;

  onMount(async () => {
    isInstalled = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
    });

    try {
      const data = await apiGet('people');
      people = data.people ?? [];
    } catch (e) {
      // Proceed anyway — user can still pick if data loads later
    } finally {
      loading = false;
    }
  });

  function pickPerson(person) {
    selectedPerson = person;
  }

  function confirmPerson() {
    if (!selectedPerson) return;
    // A2HS only makes sense on mobile. Skip it on desktop, and also if the
    // app is already installed as a PWA.
    if (isMobile && !isInstalled) {
      step = 2;
    } else {
      step = 3;
    }
  }

  async function handleInstall() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const result = await deferredInstallPrompt.userChoice;
      if (result.outcome === 'accepted') {
        deferredInstallPrompt = null;
        step = 3;
      }
    }
  }

  function skipInstall() {
    step = 3;
  }

  async function handleNotifications() {
    await registerFCM(selectedPerson.person_id).catch(() => {});
    finishOnboarding();
  }

  function skipNotifications() {
    finishOnboarding();
  }

  function finishOnboarding() {
    currentUser.set(selectedPerson);
  }

  $: isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $: isAndroid = /android/i.test(navigator.userAgent);
  $: isMobile = isIOS || isAndroid;
</script>

<div class="onboarding">
  {#if step === 1}
    <div class="step">
      <div class="logo">🏠</div>
      <h1>Family Chores</h1>
      <p class="subtitle">Who are you?</p>

      {#if loading}
        <p class="loading-text">Loading…</p>
      {:else if people.length === 0}
        <p class="loading-text">Could not load people list. Check your connection.</p>
      {:else}
        <div class="person-grid">
          {#each people as person (person.person_id)}
            <button
              class="person-btn"
              class:selected={selectedPerson?.person_id === person.person_id}
              on:click={() => pickPerson(person)}
            >
              <div
                class="avatar"
                style="background:{person.color || '#6b7280'};color:{contrastColor(person.color || '#6b7280')}"
              >
                {initials(person.name)}
              </div>
              <span class="person-name">{person.name}</span>
            </button>
          {/each}
        </div>
      {/if}

      <button
        class="primary-btn"
        disabled={!selectedPerson}
        on:click={confirmPerson}
      >
        That's me →
      </button>
    </div>

  {:else if step === 2}
    <div class="step">
      <div class="logo">📲</div>
      <h1>Add to Home Screen</h1>

      {#if isIOS}
        <div class="instruction-box">
          <p><strong>On iPhone, reminders only work once this app is added to your Home Screen.</strong></p>
          <ol>
            <li>Tap the <strong>Share</strong> button at the bottom of Safari</li>
            <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
            <li>Tap <strong>Add</strong> in the top right</li>
          </ol>
        </div>
        <p class="note">Once installed, reopen the app from your Home Screen, then come back to this step.</p>
        <button class="primary-btn" on:click={() => (step = 3)}>I've added it ✓</button>
        <button class="text-btn" on:click={skipInstall}>I'll do this later</button>

      {:else if deferredInstallPrompt}
        <p class="instruction-text">Install the app on your device for the best experience and push notifications.</p>
        <button class="primary-btn" on:click={handleInstall}>Install App</button>
        <button class="text-btn" on:click={skipInstall}>I'll do this later</button>

      {:else}
        <!-- Mobile browser with no install prompt (e.g. Firefox Android, in-app browser) -->
        <p class="instruction-text">Open this page in Chrome or Safari, then add it to your Home Screen for the best experience.</p>
        <button class="text-btn" on:click={skipInstall}>Continue without installing</button>
      {/if}
    </div>

  {:else if step === 3}
    <div class="step">
      <div class="logo">🔔</div>
      <h1>Reminders</h1>
      <p class="instruction-text">
        Allow notifications so we can remind you when chores are due.
      </p>

      {#if isNotificationSupported()}
        <button class="primary-btn" on:click={handleNotifications}>
          Allow Notifications
        </button>
      {:else}
        <p class="note">Notifications are not supported on this device or browser.</p>
      {/if}

      <button class="text-btn" on:click={skipNotifications}>
        Skip for now
      </button>
    </div>
  {/if}
</div>

<style>
  .onboarding {
    min-height: 100dvh;
    background: #f0fdf4;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 20px env(safe-area-inset-bottom);
  }

  .step {
    max-width: 400px;
    width: 100%;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .logo {
    font-size: 56px;
  }

  h1 {
    font-size: 28px;
    font-weight: 800;
    color: #111827;
  }

  .subtitle {
    font-size: 18px;
    color: #6b7280;
  }

  .loading-text {
    font-size: 14px;
    color: #9ca3af;
  }

  .person-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 12px;
    width: 100%;
    margin-bottom: 8px;
  }

  .person-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    background: #fff;
    border: 2px solid #e5e7eb;
    border-radius: 14px;
    padding: 12px 8px;
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .person-btn.selected {
    border-color: #16a34a;
    box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.15);
  }

  .avatar {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 700;
  }

  .person-name {
    font-size: 13px;
    font-weight: 600;
    color: #374151;
  }

  .primary-btn {
    width: 100%;
    padding: 16px;
    background: #16a34a;
    color: #fff;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .primary-btn:disabled {
    background: #d1d5db;
    cursor: not-allowed;
  }

  .text-btn {
    background: none;
    border: none;
    color: #9ca3af;
    font-size: 13px;
    cursor: pointer;
    padding: 8px;
    text-decoration: underline;
  }

  .instruction-box {
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 12px;
    padding: 16px;
    text-align: left;
    font-size: 14px;
    line-height: 1.6;
  }

  .instruction-box ol {
    padding-left: 20px;
    margin-top: 8px;
  }

  .instruction-box li {
    margin-bottom: 4px;
  }

  .instruction-text {
    font-size: 15px;
    color: #374151;
    text-align: center;
    line-height: 1.5;
  }

  .note {
    font-size: 13px;
    color: #9ca3af;
    font-style: italic;
  }
</style>

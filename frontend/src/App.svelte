<script>
  import Router from 'svelte-spa-router';
  import { currentUser } from './stores/user.js';
  import Onboarding from './screens/Onboarding.svelte';
  import Today from './screens/Today.svelte';
  import Leaderboard from './screens/Leaderboard.svelte';
  import ChoresAdmin from './screens/ChoresAdmin.svelte';
  import History from './screens/History.svelte';
  import Toast from './components/Toast.svelte';
  import NavBar from './components/NavBar.svelte';

  const routes = {
    '/': Today,
    '/leaderboard': Leaderboard,
    '/admin/chores': ChoresAdmin,
    '/history': History,
  };

  // Injected by Vite at build time (see vite.config.js `define`).
  // Format the ISO build time as "YYYY-MM-DD HH:MM UTC".
  const version = __APP_VERSION__;
  const buildLabel = __BUILD_TIME__.slice(0, 16).replace('T', ' ') + ' UTC';
</script>

{#if !$currentUser}
  <Onboarding />
{:else}
  <div class="app-shell">
    <main class="content">
      <Router {routes} />
      <p class="build-marker">v{version} · {buildLabel}</p>
    </main>
    <NavBar />
  </div>
{/if}

<Toast />

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f9fafb;
    color: #111827;
    overscroll-behavior: none;
    -webkit-tap-highlight-color: transparent;
  }

  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    padding-top: env(safe-area-inset-top);
  }

  .content {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .build-marker {
    text-align: center;
    font-size: 10px;
    color: #cbd5e1;
    padding: 8px 0 16px;
    user-select: all;
  }
</style>

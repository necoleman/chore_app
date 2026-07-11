// Combined Workbox + FCM service worker.
// vite-plugin-pwa (injectManifest mode) injects the precache manifest
// into this file at build time via self.__WB_MANIFEST.

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

// ─── Core service worker (must always succeed) ────────────────────────────────
// Set this up BEFORE touching Firebase so a missing/invalid FCM config can never
// stop the SW from installing — that bug previously made the whole SW fail to
// evaluate, breaking offline caching and auto-update.

// Take over as soon as a new service worker is installed, instead of waiting for
// all tabs/PWA windows to close. Combined with registerType: 'autoUpdate' in
// vite.config.js, a new deploy activates and auto-reloads on the next open.
self.skipWaiting();
clientsClaim();

// Workbox precache (manifest injected by vite-plugin-pwa).
precacheAndRoute(self.__WB_MANIFEST);

// Runtime cache for Apps Script API — NetworkFirst with 5s timeout.
registerRoute(
  ({ url }) => url.hostname.endsWith('script.google.com'),
  new NetworkFirst({ cacheName: 'api-cache', networkTimeoutSeconds: 5 })
);

// ─── FCM background messages (best-effort) ────────────────────────────────────
// Config comes from VITE_FCM_* env vars, inlined at build time (same values as
// src/lib/fcm.js). Wrapped in try/catch so an unconfigured or unreachable
// Firebase never breaks the core service worker above.
try {
  // The compat SDK version must match the firebase package in package.json.
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

  // Trim env values so a stray newline/space in .env can't corrupt the config
  // (matches src/lib/fcm.js).
  const env = (key) => import.meta.env[key]?.trim();
  firebase.initializeApp({
    apiKey: env('VITE_FCM_API_KEY'),
    authDomain: env('VITE_FCM_AUTH_DOMAIN'),
    projectId: env('VITE_FCM_PROJECT_ID'),
    storageBucket: env('VITE_FCM_STORAGE_BUCKET'),
    messagingSenderId: env('VITE_FCM_MESSAGING_SENDER_ID'),
    appId: env('VITE_FCM_APP_ID'),
  });

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const { title, body, icon } = payload.notification ?? {};
    self.registration.showNotification(title ?? 'Chores', {
      body: body ?? '',
      icon: icon ?? '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
    });
  });
} catch (e) {
  // FCM unavailable (missing config or network) — core SW still works.
  console.error('[sw] FCM init skipped:', e);
}

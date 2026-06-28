// Combined Workbox + FCM service worker.
// vite-plugin-pwa (injectManifest mode) injects the precache manifest
// into this file at build time via self.__WB_MANIFEST.

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

// FCM background message handler (compat SDK via importScripts).
// The version must match the firebase package version in package.json.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: self.FIREBASE_API_KEY,
  authDomain: self.FIREBASE_AUTH_DOMAIN,
  projectId: self.FIREBASE_PROJECT_ID,
  storageBucket: self.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: self.FIREBASE_MESSAGING_SENDER_ID,
  appId: self.FIREBASE_APP_ID,
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

// Take over as soon as a new service worker is installed, instead of waiting
// for all tabs/PWA windows to close. Combined with registerType: 'autoUpdate'
// in vite.config.js, this makes a new deploy activate and auto-reload the page
// on the user's next open/refresh — no manual close-and-reopen needed.
self.skipWaiting();
clientsClaim();

// Workbox precache (manifest injected by vite-plugin-pwa).
precacheAndRoute(self.__WB_MANIFEST);

// Runtime cache for Apps Script API — NetworkFirst with 5s timeout.
registerRoute(
  ({ url }) => url.hostname.endsWith('script.google.com'),
  new NetworkFirst({ cacheName: 'api-cache', networkTimeoutSeconds: 5 })
);

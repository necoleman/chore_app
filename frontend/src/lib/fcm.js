import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, deleteToken, onMessage } from 'firebase/messaging';
import { getInstallations, deleteInstallations } from 'firebase/installations';
import { post } from '../api/client.js';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FCM_API_KEY,
  authDomain: import.meta.env.VITE_FCM_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FCM_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FCM_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FCM_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FCM_APP_ID,
};

function getFirebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

export async function registerFCM(person_id) {
  if (!isNotificationSupported()) return null;
  if (Notification.permission === 'denied') return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const app = getFirebaseApp();
  const messaging = getMessaging(app);

  // Reuse the app's own service worker (sw.js, registered by vite-plugin-pwa)
  // for FCM. Without an explicit registration the SDK tries to register a
  // nonexistent /firebase-messaging-sw.js and token retrieval fails — so this
  // project's combined sw.js would never receive background pushes.
  const serviceWorkerRegistration = await navigator.serviceWorker.ready;
  const fetchToken = () => getToken(messaging, {
    vapidKey: import.meta.env.VITE_FCM_VAPID_KEY,
    serviceWorkerRegistration,
  });

  let token;
  try {
    token = await fetchToken();
  } catch (e) {
    // getToken rejected — most often a 401 from fcmregistrations.googleapis.com,
    // meaning the stored FCM token / Firebase Installation is stale and Firebase
    // now rejects its credentials. Purge both and retry once so "Re-register"
    // self-heals from a bad token state. (A genuine config problem — restricted
    // apiKey, disabled FCM API — will 401 again and surface to the caller.)
    console.error('[fcm] getToken failed, resetting installation & retrying:', e);
    try { await deleteToken(messaging); } catch (_) { /* nothing to delete */ }
    try { await deleteInstallations(getInstallations(app)); } catch (_) { /* ditto */ }
    token = await fetchToken();
  }

  console.log('[fcm] getToken result:', token ? `token(len=${token.length})` : token);
  if (!token) return null;

  const res = await post('register_token', { person_id, fcm_token: token });
  console.log('[fcm] register_token response:', res);
  return token;
}

export function listenForeground(callback) {
  const app = getFirebaseApp();
  const messaging = getMessaging(app);
  return onMessage(messaging, callback);
}

export function isNotificationSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

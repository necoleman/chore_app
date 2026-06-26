import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
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
  if (!('Notification' in window)) return null;
  if (Notification.permission === 'denied') return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const app = getFirebaseApp();
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FCM_VAPID_KEY,
  });

  await post('register_token', { person_id, fcm_token: token });
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

// Firebase Cloud Messaging Service Worker for Accident Alert System
// Gives background notification capability to the Admin Emergency Monitoring Panel

// Import Firebase compat libraries inside Service Worker
try {
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

  const firebaseConfig = {
    apiKey: "AIzaSyBFgRgpon5oHkCAfFhojCnHouGpj0f0Z4w",
    authDomain: "gen-lang-client-0576207780.firebaseapp.com",
    projectId: "gen-lang-client-0576207780",
    storageBucket: "gen-lang-client-0576207780.firebasestorage.app",
    messagingSenderId: "773271531285",
    appId: "1:773271531285:web:6c2bcfa1eb6792dfec031c"
  };

  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Listen for background messages received via Firebase Cloud Messaging
  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received FCM background message:', payload);

    const title = payload.notification?.title || payload.data?.title || '🚨 CRITICAL ACCIDENT ALERT';
    const body = payload.notification?.body || payload.data?.body || 'New emergency report received requiring immediate response.';
    const reportId = payload.data?.reportId || payload.data?.id || '';
    const priority = payload.data?.priority || 'High';

    const notificationOptions = {
      body: body,
      icon: '/alert-siren.png',
      badge: '/alert-siren.png',
      tag: reportId ? `accident-${reportId}` : `emergency-${Date.now()}`,
      renotify: true,
      requireInteraction: true,
      vibrate: [500, 250, 500, 250, 500],
      data: {
        reportId: reportId,
        priority: priority,
        url: '/',
        timestamp: Date.now()
      },
      actions: [
        { action: 'inspect', title: '🚨 Open Incident' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    };

    self.registration.showNotification(title, notificationOptions);
  });
} catch (e) {
  console.warn('[firebase-messaging-sw.js] Firebase scripts could not be initialized in SW:', e);
}

// Listen for messages posted from client (e.g. background alert dispatch from Firestore listener)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_EMERGENCY_NOTIFICATION') {
    const { title, options } = event.data;
    const finalOptions = {
      icon: '/alert-siren.png',
      badge: '/alert-siren.png',
      requireInteraction: true,
      renotify: true,
      vibrate: [500, 250, 500, 250, 500],
      actions: [
        { action: 'inspect', title: '🚨 Open Incident' },
        { action: 'dismiss', title: 'Dismiss' }
      ],
      ...options,
    };
    event.waitUntil(
      self.registration.showNotification(title || '🚨 EMERGENCY ALERT', finalOptions)
    );
  }
});

// Handle notification click: Focus active tab or open dashboard and navigate to report
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const reportId = event.notification.data?.reportId;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and tell it which report was clicked
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (reportId && 'postMessage' in client) {
            client.postMessage({
              type: 'SELECT_ACCIDENT_REPORT',
              reportId: reportId
            });
          }
          return;
        }
      }
      // If no window is open, open a new window
      if (clients.openWindow) {
        return clients.openWindow('/' + (reportId ? `?reportId=${encodeURIComponent(reportId)}` : ''));
      }
    })
  );
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

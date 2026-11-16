import { getApp } from 'firebase/app';
import { getMessaging, isSupported, getToken, onMessage, Messaging } from 'firebase/messaging';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { AccidentReport } from '../types';
import { soundService } from './sound';

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

interface FCMState {
  isSupported: boolean;
  permission: NotificationPermissionStatus;
  token: string | null;
  registration: ServiceWorkerRegistration | null;
}

class FCMNotificationService {
  private messaging: Messaging | null = null;
  private state: FCMState = {
    isSupported: false,
    permission: 'default',
    token: null,
    registration: null,
  };
  private reportClickListeners: ((reportId: string) => void)[] = [];
  private isInitialized = false;

  constructor() {
    this.updatePermissionState();
  }

  private updatePermissionState() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      this.state.permission = 'unsupported';
    } else {
      this.state.permission = Notification.permission as NotificationPermissionStatus;
    }
  }

  public getPermissionStatus(): NotificationPermissionStatus {
    this.updatePermissionState();
    return this.state.permission;
  }

  public getToken(): string | null {
    return this.state.token;
  }

  public async initialize(): Promise<FCMState> {
    if (this.isInitialized) return this.state;
    this.updatePermissionState();

    if (typeof window === 'undefined') {
      return this.state;
    }

    // 1. Register Service Worker for background messaging
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/firebase-cloud-messaging-push-scope',
        });
        this.state.registration = registration;
        console.log('[FCM] Service Worker registered successfully with scope:', registration.scope);

        // Listen for messages from Service Worker (e.g., when notification is clicked)
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'SELECT_ACCIDENT_REPORT' && event.data.reportId) {
            console.log('[FCM] Notification clicked for report ID:', event.data.reportId);
            this.notifyReportClick(event.data.reportId);
          }
        });
      } catch (err) {
        console.warn('[FCM] Service worker registration failed or running in restricted sandbox:', err);
      }
    }

    // Check if URL parameters include a reportId from background notification click
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const linkedReportId = urlParams.get('reportId');
      if (linkedReportId) {
        setTimeout(() => this.notifyReportClick(linkedReportId), 1000);
      }
    } catch {
      // Ignore URL parsing errors
    }

    // 2. Check Firebase Cloud Messaging support
    try {
      const supported = await isSupported();
      this.state.isSupported = supported;

      if (supported) {
        const app = getApp();
        this.messaging = getMessaging(app);

        // Foreground push message listener
        onMessage(this.messaging, (payload) => {
          console.log('[FCM] Foreground message received:', payload);
          soundService.playEmergencyAlert();

          const title = payload.notification?.title || payload.data?.title || '🚨 EMERGENCY ALERT';
          const body = payload.notification?.body || payload.data?.body || 'New accident reported.';
          const reportId = payload.data?.reportId || payload.data?.id;

          // If the page is hidden, or user permitted notifications, show system notification
          this.triggerNativeNotification(title, {
            body,
            data: { reportId },
            tag: reportId ? `accident-${reportId}` : `msg-${Date.now()}`,
          });
        });
      }
    } catch (err) {
      console.warn('[FCM] Messaging isSupported check error:', err);
    }

    this.isInitialized = true;
    return this.state;
  }

  // Request browser permission and retrieve/register FCM token
  public async requestPermission(): Promise<{ success: boolean; token: string | null; error?: string }> {
    await this.initialize();

    if (typeof window === 'undefined' || !('Notification' in window)) {
      return { success: false, token: null, error: 'Web Notifications are not supported in this browser' };
    }

    try {
      const permission = await Notification.requestPermission();
      this.state.permission = permission as NotificationPermissionStatus;

      if (permission !== 'granted') {
        return { success: false, token: null, error: `Permission was ${permission}` };
      }

      let token: string | null = null;

      // Attempt to retrieve FCM token if messaging is available
      if (this.messaging && this.state.registration) {
        try {
          token = await getToken(this.messaging, {
            serviceWorkerRegistration: this.state.registration,
          });
          this.state.token = token;
          console.log('[FCM] Push registration token generated:', token);

          // Record token in Firestore under admin push recipients
          if (token) {
            await this.registerTokenInFirestore(token);
          }
        } catch (tokenErr) {
          console.warn('[FCM] getToken skipped or needs VAPID key; native notifications enabled:', tokenErr);
        }
      }

      // Record device subscription in Firestore even if native token is used
      await this.registerAdminSubscriber(token);

      return { success: true, token };
    } catch (err: any) {
      console.error('[FCM] Error requesting notification permission:', err);
      return { success: false, token: null, error: err?.message || 'Permission request failed' };
    }
  }

  // Save admin subscriber info to Firestore
  private async registerAdminSubscriber(token: string | null) {
    try {
      const deviceId = localStorage.getItem('accident_alert_device_id') || `admin-${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('accident_alert_device_id', deviceId);

      const subscriberRef = doc(db, 'adminPushSubscribers', deviceId);
      await setDoc(
        subscriberRef,
        {
          deviceId,
          fcmToken: token || 'browser-native-notifications',
          notificationPermission: Notification.permission,
          userAgent: navigator.userAgent,
          lastActiveAt: serverTimestamp(),
          enabledAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('[FCM] Could not write push subscriber record to Firestore:', e);
    }
  }

  private async registerTokenInFirestore(token: string) {
    try {
      const tokenRef = doc(collection(db, 'fcmTokens'), token.substring(0, 32));
      await setDoc(
        tokenRef,
        {
          token,
          createdAt: serverTimestamp(),
          deviceType: 'admin-web-dashboard',
          userAgent: navigator.userAgent,
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('[FCM] Error saving token to fcmTokens:', e);
    }
  }

  // Show emergency background / browser notification for an incoming report
  public showEmergencyReportNotification(
    report: AccidentReport,
    options?: { forceWhenVisible?: boolean }
  ) {
    this.updatePermissionState();
    if (this.state.permission !== 'granted') {
      return false;
    }

    const isBackground = document.visibilityState === 'hidden';
    // If not in background and forceWhenVisible is not set, we let the in-app siren + banner handle it
    if (!isBackground && !options?.forceWhenVisible) {
      return false;
    }

    const priorityEmoji = report.priority === 'High' ? '🚨' : report.priority === 'Medium' ? '⚠️' : 'ℹ️';
    const title = `${priorityEmoji} [${report.priority.toUpperCase()} PRIORITY] ${report.quickMessageType || 'Emergency Accident Alert'}`;
    const locationSnippet = report.address ? report.address.split(',').slice(0, 3).join(',') : `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`;
    const bodyText = `${locationSnippet}\nMessage: "${report.emergencyMessage || 'Immediate emergency medical and traffic assistance needed.'}"`;

    return this.triggerNativeNotification(title, {
      body: bodyText,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: `accident-${report.id}`,
      requireInteraction: true,
      renotify: true,
      data: {
        reportId: report.id,
        priority: report.priority,
        timestamp: Date.now(),
      },
    });
  }

  // Low-level notification dispatcher using ServiceWorker registration or new Notification
  public triggerNativeNotification(
    title: string,
    options: {
      body?: string;
      icon?: string;
      badge?: string;
      tag?: string;
      data?: any;
      requireInteraction?: boolean;
      renotify?: boolean;
    }
  ): boolean {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission !== 'granted') return false;

    const fullOptions: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
      body: options.body,
      icon: options.icon || '/pwa-192x192.png',
      badge: options.badge || '/pwa-192x192.png',
      tag: options.tag || `accident-${Date.now()}`,
      requireInteraction: options.requireInteraction ?? true,
      renotify: options.renotify ?? true,
      data: options.data,
      vibrate: [500, 200, 500, 200, 500],
    };

    // Prefer Service Worker registration showNotification (works reliably when tab is hidden or backgrounded)
    if (this.state.registration && 'showNotification' in this.state.registration) {
      this.state.registration
        .showNotification(title, fullOptions)
        .catch((err) => {
          console.warn('[FCM] registration.showNotification error, falling back to Notification constructor:', err);
          this.fallbackNotificationConstructor(title, fullOptions);
        });
      return true;
    }

    // Try sending message to active service worker controller
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_EMERGENCY_NOTIFICATION',
        title,
        options: fullOptions,
      });
      return true;
    }

    return this.fallbackNotificationConstructor(title, fullOptions);
  }

  private fallbackNotificationConstructor(title: string, options: NotificationOptions): boolean {
    try {
      const notif = new Notification(title, options);
      notif.onclick = () => {
        window.focus();
        const reportId = (options.data as any)?.reportId;
        if (reportId) {
          this.notifyReportClick(reportId);
        }
        notif.close();
      };
      return true;
    } catch (e) {
      console.warn('[FCM] Fallback Notification constructor failed:', e);
      return false;
    }
  }

  // Subscribe to report click events (from notifications)
  public onReportClick(listener: (reportId: string) => void): () => void {
    this.reportClickListeners.push(listener);
    return () => {
      this.reportClickListeners = this.reportClickListeners.filter((l) => l !== listener);
    };
  }

  private notifyReportClick(reportId: string) {
    for (const listener of this.reportClickListeners) {
      try {
        listener(reportId);
      } catch (err) {
        console.error('[FCM] Error in report click listener:', err);
      }
    }
  }
}

export const fcmService = new FCMNotificationService();

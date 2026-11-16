import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  Firestore,
} from 'firebase/firestore';
import type { AccidentReport, EmergencyDispatcher, DispatcherSmsAlert } from '../src/types';

interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
}

const DEFAULT_DISPATCHERS: Omit<EmergencyDispatcher, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'disp_ems_central_01',
    name: 'Capt. Elena Vance',
    unitCode: 'EMS-01',
    role: 'EMS Lead',
    phone: '+15550101101',
    latitude: 37.7793,
    longitude: -122.4193,
    stationName: 'Central Metro EMS Station #1',
    maxRadiusKm: 25,
    active: true,
  },
  {
    id: 'disp_fire_rescue_04',
    name: 'Lt. Marcus Cole',
    unitCode: 'RESCUE-04',
    role: 'Fire & Rescue',
    phone: '+15550102204',
    latitude: 37.7685,
    longitude: -122.4285,
    stationName: 'Mission Heavy Rescue Battalion #4',
    maxRadiusKm: 25,
    active: true,
  },
  {
    id: 'disp_patrol_hwy_09',
    name: 'Sgt. Priya Nair',
    unitCode: 'CHP-09',
    role: 'Highway Patrol',
    phone: '+15550103309',
    latitude: 37.7912,
    longitude: -122.4021,
    stationName: 'Bay Bridge Expressway Sector',
    maxRadiusKm: 35,
    active: true,
  },
];

function computeDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

class TwilioDispatcherService {
  private db: Firestore | null = null;
  private listenerActive = false;
  private seenReportStates = new Map<string, string>();
  private inFlightReports = new Set<string>();
  private recentAlertsCache: DispatcherSmsAlert[] = [];
  private unsubscribeSnapshot: (() => void) | null = null;

  private getTwilioCredentials() {
    const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
    const authToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
    const fromNumber = (process.env.TWILIO_FROM_NUMBER || '').trim();
    const messagingServiceSid = (process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim();

    const isPlaceholderSid =
      !accountSid ||
      accountSid === 'ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' ||
      !accountSid.startsWith('AC');
    const isPlaceholderToken = !authToken || authToken === 'your_twilio_auth_token';
    const hasSender = Boolean(fromNumber || messagingServiceSid);

    const configured = !isPlaceholderSid && !isPlaceholderToken && hasSender;

    return {
      configured,
      accountSid,
      authToken,
      fromNumber,
      messagingServiceSid,
    };
  }

  public getStatus() {
    const creds = this.getTwilioCredentials();
    const maskedFrom = creds.fromNumber
      ? creds.fromNumber.replace(/.(?=.{4})/g, '*')
      : creds.messagingServiceSid
      ? `MS...${creds.messagingServiceSid.slice(-6)}`
      : null;

    return {
      configured: creds.configured,
      mode: creds.configured ? ('twilio' as const) : ('twilio-sandbox' as const),
      fromNumberMasked: maskedFrom,
      firestoreListenerActive: this.listenerActive,
      recentAlertsCount: this.recentAlertsCache.length,
    };
  }

  private initFirestore(): Firestore | null {
    if (this.db) return this.db;
    try {
      const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
      if (!fs.existsSync(configPath)) {
        console.warn('[TwilioDispatcher] firebase-applet-config.json not found.');
        return null;
      }
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as FirebaseAppletConfig;
      const app = getApps().length === 0 ? initializeApp(config, 'server-dispatcher') : getApp('server-dispatcher');
      this.db = getFirestore(app, config.firestoreDatabaseId);
      return this.db;
    } catch (err) {
      console.error('[TwilioDispatcher] Failed to initialize server Firestore:', err);
      return null;
    }
  }

  public async ensureDefaultDispatchers(): Promise<EmergencyDispatcher[]> {
    const db = this.initFirestore();
    if (!db) {
      return DEFAULT_DISPATCHERS.map((d) => ({ ...d }));
    }

    try {
      const snapshot = await getDocs(collection(db, 'dispatchers'));
      if (!snapshot.empty) {
        return snapshot.docs.map((docSnap) => ({
          ...(docSnap.data() as EmergencyDispatcher),
          id: docSnap.id,
        }));
      }

      const now = new Date().toISOString();
      const seeded: EmergencyDispatcher[] = [];
      for (const disp of DEFAULT_DISPATCHERS) {
        const record: EmergencyDispatcher = {
          ...disp,
          createdAt: now,
          updatedAt: now,
        };
        await setDoc(doc(db, 'dispatchers', disp.id), record);
        seeded.push(record);
      }
      console.info(`[TwilioDispatcher] Seeded ${seeded.length} default emergency dispatchers in Firestore.`);
      return seeded;
    } catch (err) {
      console.warn('[TwilioDispatcher] Could not read/seed dispatchers from Firestore, using defaults:', err);
      return DEFAULT_DISPATCHERS.map((d) => ({ ...d }));
    }
  }

  public startFirestoreCriticalListener() {
    if (this.listenerActive) return;
    const db = this.initFirestore();
    if (!db) return;

    this.ensureDefaultDispatchers().catch(() => {});

    let isInitialSnapshot = true;
    const reportsQuery = query(collection(db, 'accidentReports'));

    this.unsubscribeSnapshot = onSnapshot(
      reportsQuery,
      async (snapshot) => {
        if (isInitialSnapshot) {
          snapshot.docs.forEach((d) => {
            const data = d.data() as AccidentReport;
            this.seenReportStates.set(d.id, data.priority || 'Medium');
          });
          isInitialSnapshot = false;
          console.info(
            `[TwilioDispatcher] Firestore Critical Accident Listener active (${snapshot.size} existing reports indexed).`
          );
          return;
        }

        for (const change of snapshot.docChanges()) {
          const docId = change.doc.id;
          const report = { ...(change.doc.data() as AccidentReport), id: docId };
          const prevPriority = this.seenReportStates.get(docId);
          this.seenReportStates.set(docId, report.priority);

          const isCritical = report.priority === 'Critical';
          const isNewCritical = change.type === 'added' && isCritical;
          const escalatedToCritical =
            change.type === 'modified' && isCritical && prevPriority !== 'Critical';

          if ((isNewCritical || escalatedToCritical) && report.status !== 'Resolved') {
            console.info(
              `[TwilioDispatcher] Detected ${isNewCritical ? 'new' : 'escalated'} CRITICAL report ${report.reportId} (${docId}). Initiating nearby dispatcher SMS alerts...`
            );
            this.dispatchCriticalAlertsForReport(report, { force: false }).catch((err) => {
              console.error('[TwilioDispatcher] Auto-dispatch failed:', err);
            });
          }
        }
      },
      (err) => {
        console.warn('[TwilioDispatcher] Firestore snapshot listener notice:', err);
      }
    );

    this.listenerActive = true;
  }

  public stopFirestoreCriticalListener() {
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
      this.unsubscribeSnapshot = null;
    }
    this.listenerActive = false;
  }

  public formatDispatcherSms(
    report: AccidentReport,
    dispatcher: EmergencyDispatcher,
    distanceKm: number,
    withinRadius: boolean
  ): string {
    const cat = (report.category || 'Vehicle').toUpperCase();
    const loc = (report.address || `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`).slice(0, 140);
    const details = (report.emergencyMessage || 'Critical accident reported').slice(0, 160);
    const rangeTag = withinRadius ? `${distanceKm} km away` : `${distanceKm} km (Nearest Mutual Aid)`;

    return [
      `🚨 CRITICAL ACCIDENT ALERT [${report.reportId}]`,
      `To: ${dispatcher.unitCode} (${dispatcher.name}) • ${rangeTag}`,
      `Type: ${cat} | Priority: ${report.priority.toUpperCase()}`,
      `Loc: ${loc}`,
      `Info: ${details}`,
      `Map: ${report.googleMapsUrl}`,
    ].join('\n');
  }

  private async sendViaTwilioRest(to: string, body: string): Promise<{
    provider: 'twilio' | 'twilio-sandbox';
    sid: string;
    status: DispatcherSmsAlert['status'];
    errorMessage?: string;
  }> {
    const creds = this.getTwilioCredentials();

    if (!creds.configured) {
      const mockSid = `SM${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`.slice(0, 34);
      return {
        provider: 'twilio-sandbox',
        sid: mockSid,
        status: 'simulated',
      };
    }

    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      creds.accountSid
    )}/Messages.json`;

    const params = new URLSearchParams();
    params.append('To', to);
    if (creds.messagingServiceSid) {
      params.append('MessagingServiceSid', creds.messagingServiceSid);
    } else {
      params.append('From', creds.fromNumber);
    }
    params.append('Body', body);

    const authHeader = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const data = (await response.json()) as {
        sid?: string;
        status?: string;
        message?: string;
        code?: number;
      };

      if (!response.ok) {
        return {
          provider: 'twilio',
          sid: data.sid || `ERR_${data.code || response.status}`,
          status: 'failed',
          errorMessage: data.message || `Twilio HTTP ${response.status}`,
        };
      }

      const normalizedStatus: DispatcherSmsAlert['status'] =
        data.status === 'delivered'
          ? 'delivered'
          : data.status === 'sent'
          ? 'sent'
          : 'queued';

      return {
        provider: 'twilio',
        sid: data.sid || `SM_${Date.now()}`,
        status: normalizedStatus,
      };
    } catch (err) {
      return {
        provider: 'twilio',
        sid: `ERR_${Date.now()}`,
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Network error contacting Twilio REST API',
      };
    }
  }

  public async findNearbyDispatchers(
    latitude: number,
    longitude: number
  ): Promise<Array<{ dispatcher: EmergencyDispatcher; distanceKm: number; withinRadius: boolean }>> {
    const allDispatchers = await this.ensureDefaultDispatchers();
    const activeDispatchers = allDispatchers.filter((d) => d.active);

    if (activeDispatchers.length === 0) {
      return [];
    }

    const ranked = activeDispatchers
      .map((dispatcher) => {
        const distanceKm = computeDistanceKm(
          latitude,
          longitude,
          dispatcher.latitude,
          dispatcher.longitude
        );
        const withinRadius = distanceKm <= (dispatcher.maxRadiusKm || 25);
        return { dispatcher, distanceKm, withinRadius };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const withinRange = ranked.filter((item) => item.withinRadius);
    if (withinRange.length > 0) {
      return withinRange;
    }

    // Fallback to nearest 2 active units (Mutual Aid) if incident occurs outside configured local zones
    return ranked.slice(0, 2);
  }

  public async dispatchCriticalAlertsForReport(
    report: AccidentReport,
    options: { force?: boolean } = {}
  ): Promise<{ alerts: DispatcherSmsAlert[]; deduplicated: boolean }> {
    const db = this.initFirestore();
    const reportDocId = report.id || report.reportId;

    if (!options.force && report.priority !== 'Critical') {
      return { alerts: [], deduplicated: false };
    }

    if (!options.force && this.inFlightReports.has(reportDocId)) {
      const cached = this.recentAlertsCache.filter((a) => a.reportDocId === reportDocId);
      return { alerts: cached, deduplicated: true };
    }

    this.inFlightReports.add(reportDocId);

    try {
      // Check Firestore for existing automatic alerts to avoid duplicate SMS
      if (!options.force && db) {
        try {
          const existingSnap = await getDocs(
            query(collection(db, 'dispatcherSmsAlerts'), where('reportDocId', '==', reportDocId))
          );
          if (!existingSnap.empty) {
            const existingAlerts = existingSnap.docs.map(
              (d) => ({ ...(d.data() as DispatcherSmsAlert), id: d.id })
            );
            return { alerts: existingAlerts, deduplicated: true };
          }
        } catch (queryErr) {
          console.warn('[TwilioDispatcher] Deduplication query check skipped:', queryErr);
        }
      }

      const targets = await this.findNearbyDispatchers(report.latitude, report.longitude);
      if (targets.length === 0) {
        return { alerts: [], deduplicated: false };
      }

      const sentAlerts: DispatcherSmsAlert[] = [];
      const nowIso = new Date().toISOString();

      for (const { dispatcher, distanceKm, withinRadius } of targets) {
        const message = this.formatDispatcherSms(report, dispatcher, distanceKm, withinRadius);
        const twilioResult = await this.sendViaTwilioRest(dispatcher.phone, message);
        const alertId = `dalert_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        const alertRecord: DispatcherSmsAlert = {
          id: alertId,
          reportDocId,
          reportId: report.reportId,
          priority: report.priority,
          dispatcherId: dispatcher.id,
          dispatcherName: dispatcher.name,
          unitCode: dispatcher.unitCode,
          dispatcherPhone: dispatcher.phone,
          distanceKm,
          withinRadius,
          message,
          gatewayProvider: twilioResult.provider,
          gatewaySid: twilioResult.sid,
          status: twilioResult.status,
          ...(twilioResult.errorMessage ? { errorMessage: twilioResult.errorMessage } : {}),
          createdAt: nowIso,
        };

        if (db) {
          try {
            await setDoc(doc(db, 'dispatcherSmsAlerts', alertId), alertRecord);
          } catch (saveErr) {
            console.warn('[TwilioDispatcher] Failed to persist dispatcherSmsAlert in Firestore:', saveErr);
          }
        }

        sentAlerts.push(alertRecord);
        this.recentAlertsCache.unshift(alertRecord);
      }

      this.recentAlertsCache = this.recentAlertsCache.slice(0, 100);

      // Update parent report counters in Firestore if it exists
      if (db && reportDocId && !reportDocId.startsWith('test_')) {
        try {
          await updateDoc(doc(db, 'accidentReports', reportDocId), {
            dispatcherSmsCount: sentAlerts.length,
            lastDispatcherSmsAt: nowIso,
            updatedAt: nowIso,
          });
        } catch {
          // Non-fatal if test doc or already deleted
        }
      }

      console.info(
        `[TwilioDispatcher] Dispatched ${sentAlerts.length} ${sentAlerts[0]?.gatewayProvider} SMS alert(s) for ${report.reportId}`
      );

      return { alerts: sentAlerts, deduplicated: false };
    } finally {
      setTimeout(() => {
        this.inFlightReports.delete(reportDocId);
      }, 4000);
    }
  }

  public getRecentAlerts(): DispatcherSmsAlert[] {
    return this.recentAlertsCache;
  }
}

export const twilioDispatcherService = new TwilioDispatcherService();

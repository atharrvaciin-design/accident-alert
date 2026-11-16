import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, Firestore } from 'firebase/firestore';
import type {
  AccidentReport,
  EmergencyContact,
  WhatsappDispatchRecord,
} from '../src/types';

interface CachedPhoto {
  buffer: Buffer;
  mimeType: string;
  createdAt: number;
}

interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
}

const MAX_CACHED_PHOTOS = 50;

class WhatsappContactService {
  private photoCache = new Map<string, CachedPhoto>();
  private db: Firestore | null = null;

  private initFirestore(): Firestore | null {
    if (this.db) return this.db;
    try {
      const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
      if (!fs.existsSync(configPath)) return null;
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as FirebaseAppletConfig;
      const app =
        getApps().find((a) => a.name === 'server-whatsapp') ||
        initializeApp(config, 'server-whatsapp');
      this.db = getFirestore(app, config.firestoreDatabaseId);
      return this.db;
    } catch (err) {
      console.warn('[WhatsAppService] Firestore init notice:', err);
      return null;
    }
  }

  private getTwilioWhatsappConfig() {
    const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
    const authToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
    const whatsappFromRaw = (process.env.TWILIO_WHATSAPP_FROM || '').trim();

    const isPlaceholderSid =
      !accountSid ||
      accountSid === 'ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' ||
      !accountSid.startsWith('AC');
    const isPlaceholderToken = !authToken || authToken === 'your_twilio_auth_token';

    const whatsappFrom = whatsappFromRaw
      ? whatsappFromRaw.startsWith('whatsapp:')
        ? whatsappFromRaw
        : `whatsapp:${whatsappFromRaw}`
      : '';

    const configured = !isPlaceholderSid && !isPlaceholderToken && Boolean(whatsappFrom);

    return {
      configured,
      accountSid,
      authToken,
      whatsappFrom,
    };
  }

  private getMetaWhatsappConfig() {
    const token = (process.env.WHATSAPP_CLOUD_TOKEN || '').trim();
    const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
    const configured = Boolean(token && phoneNumberId);
    return { configured, token, phoneNumberId };
  }

  public getGatewayStatus() {
    const twilio = this.getTwilioWhatsappConfig();
    const meta = this.getMetaWhatsappConfig();
    const provider = twilio.configured
      ? ('twilio-whatsapp' as const)
      : meta.configured
      ? ('meta-whatsapp' as const)
      : ('whatsapp-sandbox' as const);

    return {
      configured: twilio.configured || meta.configured,
      provider,
      fromMasked: twilio.whatsappFrom
        ? twilio.whatsappFrom.replace(/.(?=.{4})/g, '*')
        : meta.phoneNumberId
        ? `WA-${meta.phoneNumberId.slice(-4)}`
        : null,
    };
  }

  /**
   * Cache a Base64 Data URL photo in memory so it can be served over HTTPS as MediaUrl
   */
  public cachePhotoDataUrl(key: string, dataUrl?: string | null): boolean {
    if (!key || !dataUrl || !dataUrl.startsWith('data:image/')) {
      return false;
    }

    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return false;

    const mimeType = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0) return false;

    this.photoCache.set(key, {
      buffer,
      mimeType,
      createdAt: Date.now(),
    });

    // Keep cache bounded
    if (this.photoCache.size > MAX_CACHED_PHOTOS) {
      const oldestKey = this.photoCache.keys().next().value;
      if (oldestKey) this.photoCache.delete(oldestKey);
    }

    return true;
  }

  /**
   * Resolve cached photo or fetch from Firestore report document so MediaUrl stays valid
   */
  public async getPhotoBinary(reportKey: string): Promise<CachedPhoto | null> {
    const cached = this.photoCache.get(reportKey);
    if (cached) return cached;

    const db = this.initFirestore();
    if (!db) return null;

    try {
      const snap = await getDoc(doc(db, 'accidentReports', reportKey));
      if (!snap.exists()) return null;
      const data = snap.data() as AccidentReport;
      if (data.photoUrl && this.cachePhotoDataUrl(reportKey, data.photoUrl)) {
        return this.photoCache.get(reportKey) || null;
      }
    } catch (err) {
      console.warn('[WhatsAppService] Failed to fetch photo from Firestore:', err);
    }

    return null;
  }

  /**
   * Normalize phone number to E.164 digits (supports explicit +country code or 10-digit numbers)
   */
  public normalizePhoneDigits(rawPhone: string): string {
    const trimmed = rawPhone.trim();
    const digitsOnly = trimmed.replace(/[^0-9]/g, '');
    if (!digitsOnly) return '';

    if (trimmed.startsWith('+')) {
      return digitsOnly;
    }
    if (digitsOnly.startsWith('00') && digitsOnly.length > 10) {
      return digitsOnly.slice(2);
    }
    // 10-digit Indian mobile numbers (6-9 start) -> prepend 91, otherwise keep/prepend 1
    if (digitsOnly.length === 10) {
      return /^[6-9]/.test(digitsOnly) ? `91${digitsOnly}` : `1${digitsOnly}`;
    }
    return digitsOnly;
  }

  public formatWhatsappMessage(
    report: AccidentReport,
    contactName: string,
    photoPublicUrl?: string
  ): string {
    const cat = report.category || 'Vehicle';
    const loc =
      report.address || `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`;
    const lines = [
      `🚨 *ACCIDENT EMERGENCY ALERT*`,
      `Hello ${contactName}, an accident report was just triggered!`,
      `• *Report ID:* ${report.reportId}`,
      `• *Priority:* ${report.priority} (${cat})`,
      `• *Location:* ${loc}`,
      `• *Google Maps:* ${report.googleMapsUrl}`,
      report.emergencyMessage ? `• *Details:* "${report.emergencyMessage}"` : '',
      report.voiceTranscript ? `• *Voice Note:* "${report.voiceTranscript}"` : '',
      photoPublicUrl ? `📸 *Accident Scene Photo:* ${photoPublicUrl}` : '',
    ].filter(Boolean);

    return lines.join('\n');
  }

  private async sendViaTwilioWhatsapp(
    toDigits: string,
    body: string,
    mediaUrl?: string
  ): Promise<{
    provider: 'twilio-whatsapp';
    sid: string;
    status: WhatsappDispatchRecord['status'];
    errorMessage?: string;
  }> {
    const cfg = this.getTwilioWhatsappConfig();
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      cfg.accountSid
    )}/Messages.json`;

    const params = new URLSearchParams();
    params.append('To', `whatsapp:+${toDigits}`);
    params.append('From', cfg.whatsappFrom);
    params.append('Body', body);
    if (mediaUrl) {
      params.append('MediaUrl', mediaUrl);
    }

    const authHeader = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');

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
          provider: 'twilio-whatsapp',
          sid: data.sid || `WA_ERR_${data.code || response.status}`,
          status: 'Failed',
          errorMessage: data.message || `Twilio WhatsApp HTTP ${response.status}`,
        };
      }

      const mappedStatus: WhatsappDispatchRecord['status'] =
        data.status === 'delivered'
          ? 'Delivered'
          : data.status === 'sent'
          ? 'Sent'
          : 'Queued';

      return {
        provider: 'twilio-whatsapp',
        sid: data.sid || `WA_${Date.now()}`,
        status: mappedStatus,
      };
    } catch (err) {
      return {
        provider: 'twilio-whatsapp',
        sid: `WA_ERR_${Date.now()}`,
        status: 'Failed',
        errorMessage:
          err instanceof Error ? err.message : 'Network error calling Twilio WhatsApp API',
      };
    }
  }

  private async sendViaMetaWhatsapp(
    toDigits: string,
    body: string,
    mediaUrl?: string
  ): Promise<{
    provider: 'meta-whatsapp';
    sid: string;
    status: WhatsappDispatchRecord['status'];
    errorMessage?: string;
  }> {
    const cfg = this.getMetaWhatsappConfig();
    const endpoint = `https://graph.facebook.com/v19.0/${encodeURIComponent(
      cfg.phoneNumberId
    )}/messages`;

    const payload = mediaUrl
      ? {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toDigits,
          type: 'image',
          image: {
            link: mediaUrl,
            caption: body.slice(0, 1024),
          },
        }
      : {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toDigits,
          type: 'text',
          text: {
            preview_url: true,
            body,
          },
        };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        messages?: Array<{ id: string }>;
        error?: { message?: string };
      };

      if (!response.ok) {
        return {
          provider: 'meta-whatsapp',
          sid: `META_ERR_${response.status}`,
          status: 'Failed',
          errorMessage: data.error?.message || `Meta WhatsApp HTTP ${response.status}`,
        };
      }

      return {
        provider: 'meta-whatsapp',
        sid: data.messages?.[0]?.id || `WAMID_${Date.now()}`,
        status: 'Sent',
      };
    } catch (err) {
      return {
        provider: 'meta-whatsapp',
        sid: `META_ERR_${Date.now()}`,
        status: 'Failed',
        errorMessage:
          err instanceof Error ? err.message : 'Network error calling Meta WhatsApp Cloud API',
      };
    }
  }

  /**
   * Dispatch clicked accident photo + GPS alert to all enabled emergency contacts on WhatsApp
   */
  public async dispatchPhotoToContacts(
    report: AccidentReport,
    contacts: EmergencyContact[],
    baseUrl: string
  ): Promise<{
    dispatches: WhatsappDispatchRecord[];
    gateway: ReturnType<WhatsappContactService['getGatewayStatus']>;
  }> {
    const providedActive = (contacts || []).filter(
      (c) => c.enabled && c.whatsappEnabled !== false && Boolean(c.phone?.trim())
    );
    const activeContacts: EmergencyContact[] =
      providedActive.length > 0
        ? providedActive
        : [
            {
              id: 'contact_primary_wa',
              name: 'Primary Emergency WhatsApp',
              phone: '+91 9793060077',
              relationship: 'Primary Alert Contact',
              enabled: true,
              whatsappEnabled: true,
            },
          ];

    const mediaKey = report.id || report.reportId;
    const hasPhoto = this.cachePhotoDataUrl(mediaKey, report.photoUrl) || Boolean(report.photoUrl?.startsWith('http'));

    const cleanBase = baseUrl.replace(/\/+$/, '');
    const photoPublicUrl = hasPhoto
      ? report.photoUrl.startsWith('http')
        ? report.photoUrl
        : `${cleanBase}/api/media/report-photo/${encodeURIComponent(mediaKey)}`
      : undefined;

    const twilioCfg = this.getTwilioWhatsappConfig();
    const metaCfg = this.getMetaWhatsappConfig();
    const dispatches: WhatsappDispatchRecord[] = [];

    for (const contact of activeContacts) {
      const toDigits = this.normalizePhoneDigits(contact.phone);
      const message = this.formatWhatsappMessage(report, contact.name, photoPublicUrl);
      const whatsappUri = toDigits
        ? `https://wa.me/${toDigits}?text=${encodeURIComponent(message)}`
        : undefined;

      let provider: WhatsappDispatchRecord['gatewayProvider'] = 'whatsapp-sandbox';
      let sid = `WASIM_${Date.now().toString(16)}`;
      let status: WhatsappDispatchRecord['status'] = 'Simulated';
      let errorMessage: string | undefined;

      if (toDigits && twilioCfg.configured) {
        const res = await this.sendViaTwilioWhatsapp(toDigits, message, photoPublicUrl);
        provider = res.provider;
        sid = res.sid;
        status = res.status;
        errorMessage = res.errorMessage;
      } else if (toDigits && metaCfg.configured) {
        const res = await this.sendViaMetaWhatsapp(toDigits, message, photoPublicUrl);
        provider = res.provider;
        sid = res.sid;
        status = res.status;
        errorMessage = res.errorMessage;
      }

      dispatches.push({
        id: `wa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        contactName: contact.name,
        phone: contact.phone,
        message,
        photoIncluded: Boolean(photoPublicUrl),
        ...(photoPublicUrl ? { photoPublicUrl } : {}),
        ...(whatsappUri ? { whatsappUri } : {}),
        gatewayProvider: provider,
        gatewaySid: sid,
        status,
        ...(errorMessage ? { errorMessage } : {}),
        timestamp: new Date().toISOString(),
      });
    }

    return {
      dispatches,
      gateway: this.getGatewayStatus(),
    };
  }
}

export const whatsappContactService = new WhatsappContactService();

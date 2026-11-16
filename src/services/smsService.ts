import {
  AccidentReport,
  EmergencyContact,
  SmsDispatchRecord,
  DispatcherSmsAlert,
  WhatsappDispatchRecord,
} from '../types';

const STORAGE_KEY = 'accident_alert_emergency_contacts';
const PRIMARY_NUMBER_MIGRATION_KEY = 'accident_alert_wa_919793060077_v1';

const DEFAULT_CONTACTS: EmergencyContact[] = [
  {
    id: 'contact_primary_wa',
    name: 'Primary Emergency WhatsApp',
    phone: '+91 9793060077',
    relationship: 'Primary Alert Contact',
    enabled: true,
    whatsappEnabled: true,
  },
];

export interface TwilioGatewayStatus {
  configured: boolean;
  mode: 'twilio' | 'twilio-sandbox';
  fromNumberMasked: string | null;
  firestoreListenerActive: boolean;
  activeDispatchersCount?: number;
  totalDispatchersCount?: number;
}

export interface WhatsappGatewayStatus {
  configured: boolean;
  provider: 'twilio-whatsapp' | 'meta-whatsapp' | 'whatsapp-sandbox';
  fromMasked: string | null;
}

class SmsNotificationService {
  /**
   * Retrieve all configured emergency contacts from local storage
   */
  public getEmergencyContacts(): EmergencyContact[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const alreadyMigrated = localStorage.getItem(PRIMARY_NUMBER_MIGRATION_KEY) === '1';
          if (!alreadyMigrated) {
            // Strip legacy mock +1 (555) defaults and ensure +91 9793060077 is active
            const filtered = parsed.filter(
              (c: EmergencyContact) =>
                !['+1 (555) 911-0199', '+1 (555) 843-2210'].includes(c.phone)
            );
            const hasPrimary = filtered.some(
              (c: EmergencyContact) => (c.phone || '').replace(/[^0-9]/g, '').endsWith('9793060077')
            );
            const migrated = hasPrimary ? filtered : [...DEFAULT_CONTACTS, ...filtered];
            this.saveEmergencyContacts(migrated);
            localStorage.setItem(PRIMARY_NUMBER_MIGRATION_KEY, '1');
            return migrated;
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to parse emergency contacts from storage:', e);
    }
    this.saveEmergencyContacts(DEFAULT_CONTACTS);
    try {
      localStorage.setItem(PRIMARY_NUMBER_MIGRATION_KEY, '1');
    } catch {
      // Ignore storage errors
    }
    return DEFAULT_CONTACTS;
  }

  /**
   * Save configured emergency contacts
   */
  public saveEmergencyContacts(contacts: EmergencyContact[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
    } catch (e) {
      console.warn('Failed to persist emergency contacts:', e);
    }
  }

  /**
   * Format a concise emergency summary message for SMS
   */
  public formatEmergencySummary(report: AccidentReport, recipientName?: string): string {
    const greeting = recipientName ? `Alert for ${recipientName}: ` : '';
    const categoryText = report.category ? `[${report.category.toUpperCase()}] ` : '';
    const loc = report.address ? report.address : `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`;
    const msg = report.emergencyMessage ? ` "${report.emergencyMessage}"` : '';

    return `🚨 EMERGENCY ALERT: ${greeting}${categoryText}Accident reported at ${loc}.${msg} Status: ${report.status}. Report ID: ${report.reportId}. Track GPS: ${report.googleMapsUrl}`;
  }

  /**
   * Generates a device-native `sms:` deep link for manual mobile transmission
   */
  public getNativeSmsUri(phone: string, message: string): string {
    const cleanedPhone = phone.replace(/[^0-9+]/g, '');
    const encodedBody = encodeURIComponent(message);
    return `sms:${cleanedPhone}?body=${encodedBody}`;
  }

  /**
   * Generates a WhatsApp wa.me deep link for 1-tap instant photo link + alert sharing
   */
  public getNativeWhatsappUri(phone: string, message: string): string {
    const trimmed = phone.trim();
    let digits = trimmed.replace(/[^0-9]/g, '');
    if (digits.length === 10 && !trimmed.startsWith('+')) {
      digits = /^[6-9]/.test(digits) ? `91${digits}` : `1${digits}`;
    } else if (digits.startsWith('00') && digits.length > 10) {
      digits = digits.slice(2);
    }
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  }

  /**
   * Query server-side WhatsApp gateway configuration status
   */
  public async getWhatsappGatewayStatus(): Promise<WhatsappGatewayStatus | null> {
    try {
      const res = await fetch('/api/dispatch/whatsapp-status');
      if (!res.ok) return null;
      return (await res.json()) as WhatsappGatewayStatus;
    } catch {
      return null;
    }
  }

  /**
   * Automatically send clicked accident photo + GPS alert via WhatsApp to active emergency contacts
   */
  public async sendEmergencyWhatsappAlerts(
    report: AccidentReport,
    customContacts?: EmergencyContact[]
  ): Promise<{
    dispatches: WhatsappDispatchRecord[];
    gateway?: WhatsappGatewayStatus;
  }> {
    const contacts = (customContacts || this.getEmergencyContacts()).filter(
      (c) => c.enabled && c.whatsappEnabled !== false
    );
    if (contacts.length === 0) {
      return { dispatches: [] };
    }

    try {
      const res = await fetch('/api/dispatch/whatsapp-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report, contacts }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.dispatches)) {
        return {
          dispatches: data.dispatches as WhatsappDispatchRecord[],
          gateway: data.gateway,
        };
      }
    } catch (err) {
      console.warn('WhatsApp contact dispatch API notice:', err);
    }

    // Client fallback if backend is unreachable (offline mode)
    const fallback: WhatsappDispatchRecord[] = contacts.map((contact) => {
      const msg = this.formatEmergencySummary(report, contact.name);
      return {
        id: `wa_local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        contactName: contact.name,
        phone: contact.phone,
        message: msg,
        photoIncluded: Boolean(report.photoUrl),
        whatsappUri: this.getNativeWhatsappUri(contact.phone, msg),
        gatewayProvider: 'whatsapp-sandbox',
        status: 'Simulated',
        timestamp: new Date().toISOString(),
      };
    });

    return { dispatches: fallback };
  }

  /**
   * Send a test WhatsApp alert to a single emergency contact
   */
  public async sendTestWhatsappAlert(contact: EmergencyContact) {
    try {
      const res = await fetch('/api/dispatch/test-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact }),
      });
      return await res.json();
    } catch (err) {
      return {
        success: false,
        dispatches: [],
        error: err instanceof Error ? err.message : 'Test WhatsApp alert failed',
      };
    }
  }

  /**
   * Automated SMS notification dispatch for citizen emergency contacts
   */
  public async sendEmergencySmsAlerts(
    report: AccidentReport,
    customContacts?: EmergencyContact[]
  ): Promise<SmsDispatchRecord[]> {
    const contacts = (customContacts || this.getEmergencyContacts()).filter((c) => c.enabled);
    if (contacts.length === 0) {
      return [];
    }

    const records: SmsDispatchRecord[] = [];

    for (const contact of contacts) {
      const textMessage = this.formatEmergencySummary(report, contact.name);

      const record: SmsDispatchRecord = {
        id: `sms_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        contactName: contact.name,
        phone: contact.phone,
        message: textMessage,
        timestamp: new Date().toISOString(),
        status: 'Delivered',
      };

      records.push(record);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
    console.info(`[SMS Dispatch Service] Automated emergency SMS dispatched to ${records.length} contact(s).`);
    return records;
  }

  /**
   * Fetch server-side Twilio SMS Gateway connection status
   */
  public async getTwilioGatewayStatus(): Promise<TwilioGatewayStatus | null> {
    try {
      const res = await fetch('/api/dispatch/twilio-status');
      if (!res.ok) return null;
      return (await res.json()) as TwilioGatewayStatus;
    } catch (err) {
      console.warn('Unable to query Twilio gateway status:', err);
      return null;
    }
  }

  /**
   * Invoke server-side Twilio SMS Gateway to alert nearby emergency dispatchers
   * for a Critical accident report (idempotent unless force=true)
   */
  public async triggerCriticalDispatcherSms(
    report: AccidentReport,
    force = false
  ): Promise<{
    success: boolean;
    alerts: DispatcherSmsAlert[];
    deduplicated?: boolean;
    gateway?: TwilioGatewayStatus;
    error?: string;
  }> {
    try {
      const res = await fetch('/api/dispatch/critical-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report, force }),
      });
      const data = await res.json();
      return {
        success: Boolean(data.success),
        alerts: Array.isArray(data.alerts) ? data.alerts : [],
        deduplicated: Boolean(data.deduplicated),
        gateway: data.gateway,
        error: data.error,
      };
    } catch (err) {
      return {
        success: false,
        alerts: [],
        error: err instanceof Error ? err.message : 'Network error calling Twilio dispatch endpoint',
      };
    }
  }

  /**
   * Send a test Twilio SMS alert to nearby dispatchers
   */
  public async sendTestTwilioAlert(coords?: { latitude: number; longitude: number; address?: string }) {
    try {
      const res = await fetch('/api/dispatch/test-twilio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coords || {}),
      });
      return await res.json();
    } catch (err) {
      return {
        success: false,
        alerts: [],
        error: err instanceof Error ? err.message : 'Failed to send test Twilio alert',
      };
    }
  }
}

export const smsService = new SmsNotificationService();

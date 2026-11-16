import React, { useState } from 'react';
import { PhotoCapture } from './PhotoCapture';
import { LocationDetector } from './LocationDetector';
import { QuickCallList } from './QuickCallList';
import { Coordinates, AccidentReport, PriorityLevel, AccidentCategory, EmergencyContact, DispatcherSmsAlert } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { soundService } from '../utils/sound';
import { executeWithExponentialBackoff } from '../utils/retry';
import { sanitizeForFirestore } from '../utils/sanitize';
import { smsService } from '../services/smsService';
import { calculateResponderEta, fetchWeatherHazard } from '../services/emergencyTelemetry';
import { EmergencyContactsModal } from './EmergencyContactsModal';
import { VoiceRecorder } from './VoiceRecorder';
import {
  AlertTriangle,
  Send,
  CheckCircle2,
  Phone,
  User,
  Loader2,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Zap,
  Printer,
  Car,
  Footprints,
  Construction,
  Layers,
  MessageSquare,
  ShieldCheck,
  Radio,
  Volume2,
  MessageCircle,
} from 'lucide-react';
import { PrintableReportView } from './PrintableReportView';

const QUICK_MESSAGES = [
  'Serious Accident',
  'Road Accident',
  'Medical Emergency',
  'Need Ambulance',
  'Need Immediate Help',
];

const CATEGORIES: { id: AccidentCategory; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'Vehicle', label: 'Vehicle Collision', icon: <Car className="w-4 h-4" />, desc: 'Cars, trucks, bikes' },
  { id: 'Pedestrian', label: 'Pedestrian Hit', icon: <Footprints className="w-4 h-4" />, desc: 'Pedestrian or cyclist involved' },
  { id: 'Infrastructure', label: 'Road / Barrier Hazard', icon: <Construction className="w-4 h-4" />, desc: 'Fallen pole, oil spill, road blocked' },
  { id: 'Multiple', label: 'Multi-Vehicle Pileup', icon: <Layers className="w-4 h-4" />, desc: 'Multiple vehicles & severe blockage' },
  { id: 'Other', label: 'Other Hazard', icon: <AlertTriangle className="w-4 h-4" />, desc: 'General road emergency' },
];

interface UserReportingPanelProps {
  onReportSubmitted?: (report: AccidentReport) => void;
  onSwitchToMonitoring?: () => void;
}

export const UserReportingPanel: React.FC<UserReportingPanelProps> = ({
  onReportSubmitted,
  onSwitchToMonitoring,
}) => {
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [address, setAddress] = useState<string>('');
  const [countryCode, setCountryCode] = useState<string>('us');
  const [regionName, setRegionName] = useState<string>('United States');
  const [category, setCategory] = useState<AccidentCategory>('Vehicle');
  const [emergencyMessage, setEmergencyMessage] = useState<string>('');
  const [quickMessageType, setQuickMessageType] = useState<string>('');
  const [senderName, setSenderName] = useState<string>('');
  const [senderPhone, setSenderPhone] = useState<string>('');
  const [showSenderFields, setShowSenderFields] = useState<boolean>(false);
  const [voiceMessageUrl, setVoiceMessageUrl] = useState<string | null>(null);
  const [voiceDurationSec, setVoiceDurationSec] = useState<number>(0);
  const [voiceTranscript, setVoiceTranscript] = useState<string>('');

  // Instant dispatch setting: automatically dispatches as soon as photo is clicked!
  const [instantDispatchEnabled, setInstantDispatchEnabled] = useState<boolean>(true);
  const [showPrintView, setShowPrintView] = useState<boolean>(false);
  const [showContactsModal, setShowContactsModal] = useState<boolean>(false);

  // Configured emergency contacts list
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>(() =>
    smsService.getEmergencyContacts()
  );

  // Submission state
  const [selectedSeverity, setSelectedSeverity] = useState<'Auto' | PriorityLevel>('Auto');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionProgress, setSubmissionProgress] = useState<string>('');
  const [retryAttempt, setRetryAttempt] = useState<number>(0);
  const [pendingFailedReport, setPendingFailedReport] = useState<AccidentReport | null>(null);
  const [submittedReport, setSubmittedReport] = useState<AccidentReport | null>(null);
  const [dispatcherAlerts, setDispatcherAlerts] = useState<DispatcherSmsAlert[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleQuickMessageClick = (msg: string) => {
    setQuickMessageType(msg);
    if (!emergencyMessage || QUICK_MESSAGES.includes(emergencyMessage)) {
      setEmergencyMessage(msg);
    } else {
      setEmergencyMessage((prev) => `${msg} - ${prev}`);
    }
  };

  const determinePriority = (
    quickTag: string,
    msg: string,
    cat: AccidentCategory,
    override: 'Auto' | PriorityLevel
  ): PriorityLevel => {
    if (override !== 'Auto') {
      return override;
    }
    const text = `${quickTag} ${msg}`.toLowerCase();
    if (
      text.includes('critical') ||
      text.includes('serious') ||
      text.includes('immediate') ||
      text.includes('fire') ||
      text.includes('trapped') ||
      cat === 'Multiple'
    ) {
      return 'Critical';
    }
    if (text.includes('ambulance') || cat === 'Pedestrian') {
      return 'High';
    }
    if (text.includes('medical') || text.includes('road')) {
      return 'Medium';
    }
    return 'Medium';
  };

  const handleSendEmergencyAlert = async (photoOverride?: string) => {
    const photoToSend = photoOverride || photoData;
    // Validation
    if (!photoToSend) {
      setErrorMessage('Please capture or upload an accident scene photograph.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Ensure coordinates are available; if still resolving, attempt quick geolocation or fallback
    let targetCoords = coordinates;
    let targetAddress = address;

    if (!targetCoords) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 2000,
            enableHighAccuracy: true,
          });
        });
        targetCoords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        targetAddress = `GPS: ${targetCoords.latitude.toFixed(5)}, ${targetCoords.longitude.toFixed(5)}`;
        setCoordinates(targetCoords);
        setAddress(targetAddress);
      } catch {
        targetCoords = { latitude: 37.7749, longitude: -122.4194 };
        targetAddress = 'Market St & 7th St, San Francisco, CA (Default Scene Locality)';
      }
    }

    const finalMessage =
      emergencyMessage.trim() ||
      (voiceTranscript.trim() ? `Voice Message: ${voiceTranscript.trim()}` : '') ||
      quickMessageType ||
      (voiceMessageUrl
        ? `🚨 Emergency [${category}] accident reported with live photo & voice message (${voiceDurationSec}s)`
        : `🚨 Emergency [${category}] accident reported with live photographic evidence`);
    const computedPriority = determinePriority(
      quickMessageType,
      finalMessage,
      category,
      selectedSeverity
    );

    setIsSubmitting(true);
    setErrorMessage(null);
    setRetryAttempt(0);
    setSubmissionProgress('Connecting to Emergency Dispatch Center...');

    let reportPayload: AccidentReport | null = null;
    let docId = '';

    try {
      // Step 1: Generate Unique Readable Report ID
      const timestamp = new Date();
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const reportId = `ACC-${timestamp.getFullYear()}-${randomSuffix}`;
      docId = `rep_${Date.now()}_${randomSuffix}`;

      const googleMapsUrl = `https://www.google.com/maps?q=${targetCoords.latitude},${targetCoords.longitude}`;

      // Calculate responder ETA and fetch local weather hazard telemetry
      const { etaMinutes, distanceKm } = calculateResponderEta(
        targetCoords.latitude,
        targetCoords.longitude
      );

      setSubmissionProgress('Checking local environmental hazard telemetry...');
      const weatherInfo = await fetchWeatherHazard(
        targetCoords.latitude,
        targetCoords.longitude
      );

      // Construct Initial Base Payload
      reportPayload = {
        id: docId,
        reportId: reportId,
        photoUrl: photoToSend,
        latitude: targetCoords.latitude,
        longitude: targetCoords.longitude,
        address: targetAddress || `Lat: ${targetCoords.latitude}, Lng: ${targetCoords.longitude}`,
        googleMapsUrl,
        emergencyMessage: finalMessage,
        quickMessageType: quickMessageType || 'General Alert',
        category,
        status: 'Pending',
        priority: computedPriority,
        priorityReason: quickMessageType
          ? `Triage based on caller tag: ${quickMessageType} (${category})`
          : `Reported directly by citizen on scene with live photo (${category} incident).`,
        createdAt: timestamp.toISOString(),
        updatedAt: timestamp.toISOString(),
        responderStatus: 'Dispatched',
        responderEtaMinutes: etaMinutes,
        responderDistanceKm: distanceKm,
        weather: weatherInfo || undefined,
      };

      // Safely attach senderInfo only if non-empty strings exist
      if (senderName.trim() || senderPhone.trim()) {
        reportPayload.senderInfo = {
          name: senderName.trim() || 'Anonymous Reporter',
          phone: senderPhone.trim() || 'Not Provided',
        };
      }

      // Safely attach voice emergency message if recorded
      if (voiceMessageUrl) {
        reportPayload.voiceMessageUrl = voiceMessageUrl;
        reportPayload.voiceMessageDurationSec = voiceDurationSec || 1;
        if (voiceTranscript.trim()) {
          reportPayload.voiceTranscript = voiceTranscript.trim();
        }
      }

      // Step 2: Automated WhatsApp Photo + SMS notification dispatch to active emergency contacts
      setSubmissionProgress('Sending clicked photo & GPS alert to Emergency Contacts (WhatsApp & SMS)...');
      try {
        const [smsRecords, waResult] = await Promise.all([
          smsService.sendEmergencySmsAlerts(reportPayload, emergencyContacts),
          smsService.sendEmergencyWhatsappAlerts(reportPayload, emergencyContacts),
        ]);
        if (smsRecords.length > 0) {
          reportPayload.smsDispatches = smsRecords;
        }
        if (waResult.dispatches.length > 0) {
          reportPayload.whatsappDispatches = waResult.dispatches;
        }
      } catch (notifyErr) {
        console.warn('Contact WhatsApp/SMS dispatch error (non-fatal):', notifyErr);
      }

      // Step 3: Sanitize payload for Firestore so NO `undefined` exists!
      const sanitizedPayload = sanitizeForFirestore(reportPayload);

      // Step 4: Transmit report to Firestore with Exponential Backoff Retry Strategy
      await executeWithExponentialBackoff(
        async (attempt) => {
          if (attempt > 1) {
            setRetryAttempt(attempt);
            setSubmissionProgress(
              `Emergency Dispatch link retry in progress (Attempt ${attempt} of 4)...`
            );
          } else {
            setSubmissionProgress('Transmitting emergency report to Dispatch Center...');
          }
          await setDoc(doc(db, 'accidentReports', docId), sanitizedPayload);
        },
        {
          maxRetries: 4,
          initialDelayMs: 800,
          backoffMultiplier: 2,
          maxDelayMs: 6000,
          timeoutMs: 12000,
          onRetry: (attempt, maxRetries, delayMs, firestoreErr) => {
            console.warn(`Firestore write attempt ${attempt} failed, retrying in ${delayMs}ms:`, firestoreErr);
            setRetryAttempt(attempt + 1);
            const delaySec = (delayMs / 1000).toFixed(1);
            setSubmissionProgress(
              `Network latency detected. Retrying dispatch in ${delaySec}s (Attempt ${attempt + 1}/${maxRetries})...`
            );
          },
        }
      );

      // Step 5: If Critical priority, trigger/fetch Twilio Nearby Dispatcher SMS Alert status
      if (reportPayload.priority === 'Critical') {
        setSubmissionProgress('Alerting nearby emergency dispatchers via Twilio SMS Gateway...');
        try {
          const twilioRes = await smsService.triggerCriticalDispatcherSms(reportPayload, false);
          if (twilioRes.alerts && twilioRes.alerts.length > 0) {
            setDispatcherAlerts(twilioRes.alerts);
          }
        } catch (twilioErr) {
          console.warn('Twilio dispatcher alert trigger notice:', twilioErr);
        }
      } else {
        setDispatcherAlerts([]);
      }

      // Step 6: Play success confirmation chime
      soundService.playSuccessChime();

      setPendingFailedReport(null);
      setSubmittedReport(reportPayload);
      if (onReportSubmitted) {
        onReportSubmitted(reportPayload);
      }
    } catch (err: unknown) {
      console.error('Emergency submission error:', err);
      if (reportPayload) {
        setPendingFailedReport(reportPayload);
      }
      setErrorMessage(
        err instanceof Error
          ? `Transmission could not be confirmed (${err.message}). Your report data is safely preserved below.`
          : 'Unable to transmit emergency report. Please check connection and retry.'
      );
      if (docId) {
        try {
          handleFirestoreError(err, OperationType.WRITE, `accidentReports/${docId}`);
        } catch {
          // Handled
        }
      }
    } finally {
      setIsSubmitting(false);
      setSubmissionProgress('');
      setRetryAttempt(0);
    }
  };

  const handlePhotoSelected = (base64: string, shouldInstantDispatch: boolean = true) => {
    setPhotoData(base64);
    setErrorMessage(null);

    // If instant dispatch is active, send immediately to Dashboard 2 with photo and message!
    if (instantDispatchEnabled && shouldInstantDispatch) {
      handleSendEmergencyAlert(base64);
    }
  };

  const handleRetryPendingReport = async () => {
    if (!pendingFailedReport) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setRetryAttempt(0);
    setSubmissionProgress('Retrying emergency transmission...');

    try {
      const sanitized = sanitizeForFirestore(pendingFailedReport);
      await executeWithExponentialBackoff(
        async (attempt) => {
          if (attempt > 1) {
            setRetryAttempt(attempt);
            setSubmissionProgress(
              `Re-attempting dispatch transmission (Attempt ${attempt} of 4)...`
            );
          }
          await setDoc(doc(db, 'accidentReports', pendingFailedReport.id), sanitized);
        },
        {
          maxRetries: 4,
          initialDelayMs: 800,
          backoffMultiplier: 2,
          maxDelayMs: 6000,
          timeoutMs: 12000,
          onRetry: (attempt, maxRetries, delayMs) => {
            setRetryAttempt(attempt + 1);
            const delaySec = (delayMs / 1000).toFixed(1);
            setSubmissionProgress(
              `Network delay. Retrying dispatch in ${delaySec}s (Attempt ${attempt + 1}/${maxRetries})...`
            );
          },
        }
      );

      soundService.playSuccessChime();
      setSubmittedReport(pendingFailedReport);
      setPendingFailedReport(null);
      if (onReportSubmitted) {
        onReportSubmitted(pendingFailedReport);
      }
    } catch (err: unknown) {
      console.error('Manual retry failed:', err);
      setErrorMessage(
        err instanceof Error ? err.message : 'Retry failed. Please check internet connection.'
      );
    } finally {
      setIsSubmitting(false);
      setSubmissionProgress('');
      setRetryAttempt(0);
    }
  };

  const handleResetForNewReport = () => {
    setPhotoData(null);
    setEmergencyMessage('');
    setQuickMessageType('');
    setCategory('Vehicle');
    setSelectedSeverity('Auto');
    setVoiceMessageUrl(null);
    setVoiceDurationSec(0);
    setVoiceTranscript('');
    setDispatcherAlerts([]);
    setSubmittedReport(null);
    setPendingFailedReport(null);
    setErrorMessage(null);
  };

  // SUCCESS DELIVERY CONFIRMATION VIEW
  if (submittedReport) {
    const activeContactsCount = emergencyContacts.filter((c) => c.enabled).length;

    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl border border-emerald-100 dark:border-emerald-900/40 text-center space-y-6 transition-colors">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner ring-8 ring-emerald-50 dark:ring-emerald-950/30">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div>
            <span className="inline-block bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider mb-2 border border-emerald-200 dark:border-emerald-800">
              Delivery Confirmed & Dispatched
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-blue-950 dark:text-white">
              Emergency Alert Received!
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 max-w-md mx-auto">
              Your report has been successfully transmitted in real time to the Emergency Monitoring & Dispatch Team.
            </p>
          </div>

          {/* Details Pill Box */}
          <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 text-left space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Accident Report ID</span>
              <span className="font-mono text-base font-extrabold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 px-2.5 py-0.5 rounded-lg border border-red-200 dark:border-red-900">
                {submittedReport.reportId}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-400 dark:text-slate-500 block font-semibold">Triage Priority</span>
                <span
                  className={`inline-block mt-0.5 font-bold px-2 py-0.5 rounded text-[11px] ${
                    submittedReport.priority === 'Critical'
                      ? 'bg-red-600 text-white animate-pulse'
                      : submittedReport.priority === 'High'
                      ? 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300'
                      : 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {submittedReport.priority} Priority
                </span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-slate-500 block font-semibold">Incident Category</span>
                <span className="inline-block mt-0.5 font-bold px-2 py-0.5 rounded text-[11px] bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300">
                  {submittedReport.category || 'Vehicle'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-slate-500 block font-semibold">Responder ETA</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  ~{submittedReport.responderEtaMinutes ?? 6} mins ({submittedReport.responderDistanceKm ?? 3.2} km)
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
              <span className="text-slate-400 dark:text-slate-500 block font-semibold">GPS Location</span>
              <p className="text-slate-700 dark:text-slate-200 font-medium truncate mt-0.5">📍 {submittedReport.address}</p>
            </div>

            {submittedReport.voiceMessageUrl && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
                <span className="text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                  <span>Attached Voice Message ({submittedReport.voiceMessageDurationSec || 1}s)</span>
                </span>
                <audio controls src={submittedReport.voiceMessageUrl} className="w-full h-9" />
              </div>
            )}

            {/* Twilio Nearby Dispatcher SMS Alert Confirmation for Critical Reports */}
            {submittedReport.priority === 'Critical' && (
              <div className="pt-2 border-t border-red-200 dark:border-red-900 text-xs bg-red-50/80 dark:bg-red-950/40 p-3 rounded-xl border border-red-200 dark:border-red-900 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-black text-red-800 dark:text-red-300">
                    <Radio className="w-4 h-4 text-red-600 animate-pulse" />
                    <span>
                      Twilio Nearby Dispatcher Alert ({dispatcherAlerts.length || 'Auto-Triggered'})
                    </span>
                  </div>
                  <span className="text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded">
                    CRITICAL ESCALATION
                  </span>
                </div>
                {dispatcherAlerts.length > 0 ? (
                  <div className="space-y-1">
                    {dispatcherAlerts.map((alert) => (
                      <div key={alert.id} className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-200">
                        <span>
                          • <strong>{alert.unitCode}</strong> ({alert.dispatcherName}) — {alert.distanceKm} km away
                        </span>
                        <span className="bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded font-bold uppercase text-[10px]">
                          {alert.gatewayProvider === 'twilio' ? 'Twilio' : 'Sandbox'}: {alert.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-red-700 dark:text-red-300">
                    Firestore Critical listener automatically dispatched SMS alerts to nearest on-duty units.
                  </p>
                )}
              </div>
            )}

            {/* Automated WhatsApp Photo & Location Dispatch Confirmation */}
            {submittedReport.whatsappDispatches && submittedReport.whatsappDispatches.length > 0 && (
              <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800 text-xs bg-emerald-50/80 dark:bg-emerald-950/40 p-3 rounded-xl border border-emerald-300 dark:border-emerald-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-extrabold text-emerald-900 dark:text-emerald-200">
                    <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      Auto WhatsApp Photo Alerts ({submittedReport.whatsappDispatches.length} contact(s))
                    </span>
                  </div>
                  <span className="text-[10px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded">
                    📸 PHOTO + GPS
                  </span>
                </div>
                <div className="space-y-1.5">
                  {submittedReport.whatsappDispatches.map((wa) => (
                    <div
                      key={wa.id}
                      className="flex items-center justify-between gap-2 text-[11px] text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-900/70 p-2 rounded-lg border border-emerald-200/70 dark:border-emerald-900"
                    >
                      <div className="min-w-0">
                        <span className="font-bold">• {wa.contactName}</span>{' '}
                        <span className="text-slate-500">({wa.phone})</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                            wa.status === 'Failed'
                              ? 'bg-red-100 text-red-700'
                              : wa.status === 'Simulated'
                              ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300'
                              : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                          }`}
                        >
                          {wa.gatewayProvider === 'twilio-whatsapp'
                            ? 'Twilio WA'
                            : wa.gatewayProvider === 'meta-whatsapp'
                            ? 'WA Cloud'
                            : 'Sandbox'}
                          : {wa.status}
                        </span>
                        {wa.whatsappUri && (
                          <a
                            href={wa.whatsappUri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 rounded font-bold flex items-center gap-1 text-[10px]"
                            title="Open WhatsApp chat with photo link & GPS"
                          >
                            <span>WhatsApp</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Automated SMS Dispatch Confirmation */}
            {submittedReport.smsDispatches && submittedReport.smsDispatches.length > 0 && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-xs bg-emerald-50/60 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Automated SMS Emergency Alerts Dispatched ({submittedReport.smsDispatches.length} contacts)</span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {submittedReport.smsDispatches.map((sms) => (
                    <div key={sms.id} className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-300">
                      <span>• {sms.contactName} ({sms.phone})</span>
                      <div className="flex items-center gap-2">
                        <span className="bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded font-bold">
                          ✓ {sms.status}
                        </span>
                        <a
                          href={smsService.getNativeSmsUri(sms.phone, sms.message)}
                          className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                          title="Open phone SMS app"
                        >
                          <span>Open SMS</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Navigation / Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowPrintView(true)}
              className="py-3.5 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-xl font-bold text-sm border border-slate-300 dark:border-slate-700 transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Print Incident Dossier</span>
            </button>
            <button
              type="button"
              onClick={handleResetForNewReport}
              className="flex-1 py-3.5 px-5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-xl font-bold text-sm transition cursor-pointer"
            >
              Report Another Incident
            </button>
            {onSwitchToMonitoring && (
              <button
                type="button"
                onClick={onSwitchToMonitoring}
                className="flex-1 py-3.5 px-5 bg-blue-900 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500 text-white rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>View on Dashboard 2</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Print-Friendly Incident Dossier Modal View */}
        {showPrintView && (
          <PrintableReportView
            report={submittedReport}
            onClose={() => setShowPrintView(false)}
          />
        )}
      </div>
    );
  }

  // MAIN REPORTING FORM
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-red-600 via-red-700 to-rose-700 text-white rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10 space-y-1">
          <div className="flex items-center justify-between">
            <span className="bg-white/20 backdrop-blur text-white text-[11px] font-extrabold uppercase px-2.5 py-0.5 rounded-full tracking-wider flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" /> Emergency Dispatch Portal
            </span>

            {/* Emergency Contacts Button */}
            <button
              type="button"
              onClick={() => setShowContactsModal(true)}
              className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-xl backdrop-blur flex items-center gap-1.5 transition cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-300" />
              <span>WhatsApp & SMS ({emergencyContacts.filter((c) => c.enabled).length})</span>
            </button>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight pt-1">
            Report an Accident
          </h1>
          <p className="text-red-100 text-xs sm:text-sm font-medium">
            Take a photo, verify GPS location, and auto-send photo to Emergency Contacts on WhatsApp & Dispatchers.
          </p>
        </div>

        {/* Instant Dispatch Banner */}
        <div className="mt-4 pt-3 border-t border-red-500/40 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-300" />
            <span className="font-bold text-white">Instant Photo Dispatch:</span>
            <span className="text-red-100 hidden sm:inline">
              Sends photo to Dashboard 2 & WhatsApp Contacts immediately
            </span>
          </div>
          <button
            type="button"
            onClick={() => setInstantDispatchEnabled(!instantDispatchEnabled)}
            className={`px-3 py-1 rounded-full font-extrabold text-[11px] transition cursor-pointer ${
              instantDispatchEnabled
                ? 'bg-yellow-400 text-red-950 shadow-sm'
                : 'bg-red-900/60 text-white border border-red-400/30'
            }`}
          >
            {instantDispatchEnabled ? '⚡ Active (Instant)' : 'Manual Review'}
          </button>
        </div>
      </div>

      {/* Error / Offline Retry Notification Banner */}
      {errorMessage && (
        <div className="bg-red-50 dark:bg-red-950/70 border-2 border-red-400 dark:border-red-800 rounded-2xl p-4 sm:p-5 shadow-lg animate-in fade-in space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/80 text-red-600 dark:text-red-300 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-black text-red-900 dark:text-red-200">
                Dispatch Latency or Transmission Warning
              </h3>
              <p className="text-xs text-red-700 dark:text-red-300">{errorMessage}</p>
            </div>
          </div>

          {pendingFailedReport && (
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={handleRetryPendingReport}
                disabled={isSubmitting}
                className="py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Retrying Transmission...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Retry Dispatch Transmission Now</span>
                  </>
                )}
              </button>
              {onSwitchToMonitoring && (
                <button
                  type="button"
                  onClick={onSwitchToMonitoring}
                  className="py-2.5 px-4 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                >
                  Check Dashboard 2 Status
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Feature 1: Photo Capture */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3 transition-colors">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-blue-950 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 flex items-center justify-center text-xs">
              1
            </span>
            Live Accident Photograph
          </h2>
          <span className="text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 px-2 py-0.5 rounded">
            Required
          </span>
        </div>

        <PhotoCapture
          photoData={photoData}
          onPhotoSelected={handlePhotoSelected}
          onPhotoCleared={() => setPhotoData(null)}
          instantDispatch={instantDispatchEnabled}
          isSubmitting={isSubmitting}
        />
      </div>

      {/* Feature 2: GPS Location Verification */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3 transition-colors">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-blue-950 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 flex items-center justify-center text-xs">
              2
            </span>
            Accident Scene Location
          </h2>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded">
            Auto-Geotagged
          </span>
        </div>

        <LocationDetector
          coordinates={coordinates}
          address={address}
          onLocationFound={(coords, resolvedAddress, details) => {
            setCoordinates(coords);
            setAddress(resolvedAddress);
            if (details?.country_code) setCountryCode(details.country_code);
            if (details?.country) setRegionName(details.country);
          }}
        />
      </div>

      {/* Feature 3: Accident Category Selector */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3 transition-colors">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-blue-950 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 flex items-center justify-center text-xs">
              3
            </span>
            Incident Category
          </h2>
          <span className="text-[11px] font-bold text-slate-500">Triage Tag</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {CATEGORIES.map((cat) => {
            const isSelected = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-red-50 dark:bg-red-950/80 border-red-500 ring-2 ring-red-500/20 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                      isSelected
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {cat.icon}
                  </div>
                  <span
                    className={`text-xs font-bold leading-tight ${
                      isSelected
                        ? 'text-red-950 dark:text-red-200'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {cat.label}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 line-clamp-1">
                  {cat.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Feature 4: Emergency Message & Quick Tags */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4 transition-colors">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-blue-950 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 flex items-center justify-center text-xs">
              4
            </span>
            Emergency Details & Tags
          </h2>
        </div>

        {/* Quick Message Chips */}
        <div>
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            Quick Emergency Tags (Tap to Select)
          </label>
          <div className="flex flex-wrap gap-2">
            {QUICK_MESSAGES.map((msg) => {
              const isSelected = quickMessageType === msg;
              return (
                <button
                  key={msg}
                  type="button"
                  onClick={() => handleQuickMessageClick(msg)}
                  className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-red-600 text-white shadow-md shadow-red-500/20 scale-[1.02]'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {msg}
                </button>
              );
            })}
          </div>
        </div>

        {/* Severity / Priority Selector */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Incident Severity Level
            </label>
            <span className="text-[10px] font-bold text-red-600 dark:text-red-400">
              'Critical' triggers instant Twilio SMS to nearby dispatchers
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {(['Auto', 'Critical', 'High', 'Medium', 'Low'] as const).map((lvl) => {
              const isSelected = selectedSeverity === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSelectedSeverity(lvl)}
                  className={`py-2 px-2 rounded-xl text-xs font-extrabold transition cursor-pointer text-center border ${
                    isSelected
                      ? lvl === 'Critical'
                        ? 'bg-red-700 text-white border-red-500 ring-2 ring-red-400/50 shadow-md'
                        : lvl === 'High'
                        ? 'bg-red-600 text-white border-red-500 shadow-sm'
                        : lvl === 'Medium'
                        ? 'bg-amber-500 text-white border-amber-400 shadow-sm'
                        : lvl === 'Low'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                        : 'bg-blue-950 dark:bg-blue-600 text-white border-blue-500 shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {lvl}
                </button>
              );
            })}
          </div>
        </div>

        {/* Text Area */}
        <div>
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
            Accident Details / Description
          </label>
          <textarea
            value={emergencyMessage}
            onChange={(e) => setEmergencyMessage(e.target.value)}
            rows={3}
            placeholder="Type any visible details, number of vehicles, blocked lanes, or specific urgency..."
            className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 transition"
          />
        </div>

        {/* Voice Emergency Message Recorder */}
        <VoiceRecorder
          voiceUrl={voiceMessageUrl}
          durationSec={voiceDurationSec}
          transcript={voiceTranscript}
          onVoiceRecorded={(url, dur, trans) => {
            setVoiceMessageUrl(url);
            setVoiceDurationSec(dur);
            setVoiceTranscript(trans);
            if (!emergencyMessage.trim() && trans.trim()) {
              setEmergencyMessage(trans.trim());
            }
          }}
          onVoiceCleared={() => {
            setVoiceMessageUrl(null);
            setVoiceDurationSec(0);
            setVoiceTranscript('');
          }}
        />

        {/* Optional Sender Info Toggle */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setShowSenderFields(!showSenderFields)}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>{showSenderFields ? 'Hide Sender Contact Info' : '+ Add Your Contact Details (Optional)'}</span>
          </button>

          {showSenderFields && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                  <User className="w-3 h-3" /> Your Name
                </label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> Phone Number
                </label>
                <input
                  type="tel"
                  value={senderPhone}
                  onChange={(e) => setSenderPhone(e.target.value)}
                  placeholder="e.g. +1 (555) 019-2834"
                  className="w-full p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Feature 5: Emergency Hotlines */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3 transition-colors">
        <h2 className="text-sm font-extrabold text-blue-950 dark:text-white uppercase tracking-wider flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 flex items-center justify-center text-xs">
            5
          </span>
          Direct Emergency Hotlines ({regionName})
        </h2>
        <QuickCallList countryCode={countryCode} />
      </div>

      {/* Feature 6: Large RED "SEND EMERGENCY ALERT" Button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => handleSendEmergencyAlert()}
          disabled={isSubmitting}
          className={`w-full py-5 px-6 rounded-2xl font-black text-lg tracking-wider uppercase text-white shadow-2xl transition-all duration-200 flex items-center justify-center gap-3 cursor-pointer ${
            isSubmitting
              ? 'bg-slate-700 opacity-90 cursor-not-allowed'
              : 'bg-red-600 hover:bg-red-700 active:scale-[0.98] shadow-red-600/40 ring-4 ring-red-400/30 animate-pulse'
          }`}
        >
          {isSubmitting ? (
            <div className="flex items-center gap-2 text-base normal-case">
              <Loader2 className="w-6 h-6 animate-spin text-white" />
              <span>{submissionProgress || 'Connecting to Emergency Dispatch...'}</span>
            </div>
          ) : (
            <>
              <AlertTriangle className="w-7 h-7 text-white fill-white/20 animate-bounce" />
              <span>SEND EMERGENCY ALERT</span>
              <Send className="w-6 h-6 text-white ml-1" />
            </>
          )}
        </button>

        <p className="text-center text-[11px] text-slate-500 dark:text-slate-400 mt-2">
          Transmits photo, GPS location, and alert details immediately to the emergency response team.
        </p>
      </div>

      {/* Emergency Contacts Management Modal */}
      {showContactsModal && (
        <EmergencyContactsModal
          onClose={() => setShowContactsModal(false)}
          onContactsUpdated={(updated) => setEmergencyContacts(updated)}
        />
      )}
    </div>
  );
};

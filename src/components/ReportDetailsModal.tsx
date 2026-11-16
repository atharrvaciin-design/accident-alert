import React, { useState, useEffect } from 'react';
import { AccidentReport, PriorityLevel, ReportStatus, DispatcherSmsAlert } from '../types';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { soundService } from '../utils/sound';
import {
  X,
  ExternalLink,
  MapPin,
  Clock,
  User,
  Phone,
  Trash2,
  Printer,
  ShieldAlert,
  Car,
  Footprints,
  Construction,
  Layers,
  AlertTriangle,
  CloudSun,
  Wind,
  Droplets,
  Thermometer,
  Send,
  MessageSquare,
  Navigation,
  FileText,
  Plus,
  Radio,
  Loader2,
  Mic,
  MessageCircle,
} from 'lucide-react';
import { PrintableReportView } from './PrintableReportView';
import { calculateResponderEta } from '../services/emergencyTelemetry';
import { smsService } from '../services/smsService';

interface ReportDetailsModalProps {
  report: AccidentReport;
  onClose: () => void;
  onUpdateStatus: (reportId: string, newStatus: ReportStatus) => void;
  onUpdatePriority: (reportId: string, newPriority: PriorityLevel) => void;
  onDeleteReport: (reportId: string) => void;
  onAddAdminNote?: (reportId: string, note: string) => Promise<void>;
  onUpdateResponderStatus?: (
    reportId: string,
    status: 'Unassigned' | 'Dispatched' | 'En Route' | 'On Scene'
  ) => void;
}

export const ReportDetailsModal: React.FC<ReportDetailsModalProps> = ({
  report,
  onClose,
  onUpdateStatus,
  onUpdatePriority,
  onDeleteReport,
  onAddAdminNote,
  onUpdateResponderStatus,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPhotoZoomed, setIsPhotoZoomed] = useState(false);
  const [showPrintView, setShowPrintView] = useState(false);

  // Private Admin Internal Notes State
  const [newAdminNote, setNewAdminNote] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);

  // Nearby Dispatcher Twilio SMS alerts for this report
  const [dispatcherSmsLogs, setDispatcherSmsLogs] = useState<DispatcherSmsAlert[]>([]);
  const [isDispatchingTwilio, setIsDispatchingTwilio] = useState(false);
  const [twilioDispatchNotice, setTwilioDispatchNotice] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'dispatcherSmsAlerts'),
      where('reportDocId', '==', report.id)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: DispatcherSmsAlert[] = [];
        snap.forEach((d) => {
          list.push({ ...(d.data() as DispatcherSmsAlert), id: d.id });
        });
        list.sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        setDispatcherSmsLogs(list);
      },
      (err) => {
        console.warn('Report dispatcherSmsAlerts query notice:', err);
      }
    );
    return () => unsub();
  }, [report.id]);

  const handleTriggerTwilioAlert = async () => {
    setIsDispatchingTwilio(true);
    setTwilioDispatchNotice(null);
    try {
      const res = await smsService.triggerCriticalDispatcherSms(report, true);
      if (res.success) {
        soundService.playSuccessChime();
        setTwilioDispatchNotice(
          `Twilio SMS alert dispatched to ${res.alerts.length} nearby unit(s).`
        );
      } else {
        setTwilioDispatchNotice(res.error || 'Failed to dispatch Twilio alert.');
      }
    } finally {
      setIsDispatchingTwilio(false);
    }
  };

  const formattedDate = new Date(report.createdAt).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const formattedTime = new Date(report.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // Calculate real-time ETA if not already attached
  const { etaMinutes, distanceKm } = calculateResponderEta(report.latitude, report.longitude);
  const displayEta = report.responderEtaMinutes ?? etaMinutes;
  const displayDistance = report.responderDistanceKm ?? distanceKm;

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminNote.trim() || !onAddAdminNote) return;
    setIsAddingNote(true);
    try {
      await onAddAdminNote(report.id, newAdminNote.trim());
      setNewAdminNote('');
    } finally {
      setIsAddingNote(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 transition-colors">
        {/* Header */}
        <div className="bg-slate-900 dark:bg-slate-950 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <span className="font-mono text-base sm:text-lg font-black tracking-wider text-red-400 bg-red-950/80 px-3 py-1 rounded-xl border border-red-800">
              {report.reportId}
            </span>
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                report.status === 'Resolved'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : report.status === 'In Progress'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
              }`}
            >
              {report.status}
            </span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
              <span>Category:</span>
              <span className="text-white font-extrabold">{report.category || 'Vehicle'}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPrintView(true)}
              className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
              title="Print-friendly incident report dossier"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print Dossier</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition cursor-pointer"
              title="Delete Incident Record"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-800 dark:text-slate-100">
          {/* Top Section: Photo and Incident Telemetry */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Accident Photo */}
            <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-md flex items-center justify-center min-h-[220px]">
              {report.photoUrl ? (
                <>
                  <img
                    src={report.photoUrl}
                    alt="Accident scene"
                    className="w-full h-64 object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                    onClick={() => setIsPhotoZoomed(true)}
                  />
                  <button
                    type="button"
                    onClick={() => setIsPhotoZoomed(true)}
                    className="absolute bottom-2.5 right-2.5 bg-black/70 hover:bg-black/90 text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg backdrop-blur"
                  >
                    Click to Zoom
                  </button>
                </>
              ) : (
                <div className="py-12 text-slate-400 text-xs text-center">No photograph provided</div>
              )}
            </div>

            {/* Incident Telemetry Card */}
            <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 flex flex-col justify-between space-y-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">
                  Reported Emergency Message
                </span>
                <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1 leading-snug">
                  "{report.emergencyMessage}"
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {report.quickMessageType && (
                    <span className="inline-block bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-300 text-[11px] font-bold px-2 py-0.5 rounded-md border border-red-200 dark:border-red-900">
                      Tag: {report.quickMessageType}
                    </span>
                  )}
                  <span className="inline-block bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 text-[11px] font-bold px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-900">
                    Category: {report.category || 'Vehicle'}
                  </span>
                </div>
              </div>

              {/* Timestamp & Location */}
              <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{formattedDate} at {formattedTime}</span>
                </div>
                <div className="flex items-start gap-1.5 text-slate-600 dark:text-slate-300">
                  <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  <span className="leading-tight">{report.address}</span>
                </div>
                <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 pl-5">
                  Lat: {report.latitude.toFixed(6)}, Lng: {report.longitude.toFixed(6)}
                </div>
              </div>

              {/* Google Maps External Button */}
              <a
                href={report.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2 px-3 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-bold text-blue-900 dark:text-blue-300 flex items-center justify-center gap-2 transition"
              >
                <span>Navigate on Google Maps</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* CITIZEN VOICE EMERGENCY MESSAGE (IF ATTACHED) */}
          {report.voiceMessageUrl && (
            <div className="bg-red-50/70 dark:bg-red-950/30 rounded-2xl p-4 border border-red-200 dark:border-red-900 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <span className="text-xs font-extrabold uppercase tracking-wide text-red-900 dark:text-red-200">
                    Citizen Voice Emergency Message
                  </span>
                </div>
                <span className="text-[11px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full">
                  {report.voiceMessageDurationSec || 1}s Audio
                </span>
              </div>

              <audio controls src={report.voiceMessageUrl} className="w-full h-10" />

              {report.voiceTranscript && (
                <p className="text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-red-200 dark:border-red-900/60 italic">
                  Transcript: "{report.voiceTranscript}"
                </p>
              )}
            </div>
          )}

          {/* REAL-TIME RESPONDER ETA & DISPATCH STATUS */}
          <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-900 dark:text-white">
                  Responder Dispatch & Real-Time ETA
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/80 px-2.5 py-1 rounded-lg">
                  ETA: ~{displayEta} minutes ({displayDistance} km from EMS Station)
                </span>
              </div>
            </div>

            {onUpdateResponderStatus && (
              <div className="mt-3">
                <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Update Responder Stage:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['Unassigned', 'Dispatched', 'En Route', 'On Scene'] as const).map((stage) => {
                    const isCurrent = (report.responderStatus || 'Dispatched') === stage;
                    return (
                      <button
                        key={stage}
                        type="button"
                        onClick={() => onUpdateResponderStatus(report.id, stage)}
                        className={`py-1.5 px-2 rounded-xl text-xs font-bold transition cursor-pointer text-center ${
                          isCurrent
                            ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-400'
                            : 'bg-white dark:bg-slate-900 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {stage}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* REAL-TIME WEATHER HAZARD ASSESSMENT */}
          {report.weather && (
            <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <CloudSun className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-900 dark:text-white">
                    Environmental Hazard & Weather Telemetry
                  </span>
                </div>
                {report.weather.isHazardous ? (
                  <span className="text-[10px] font-black uppercase bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 px-2 py-0.5 rounded flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Hazard Alert
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded">
                    Normal Road Conditions
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 text-xs">
                <div className="flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-orange-500" />
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Temperature</span>
                    <span className="font-bold">{report.weather.tempC}°C</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Wind className="w-4 h-4 text-teal-500" />
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Wind Speed</span>
                    <span className="font-bold">{report.weather.windKph} km/h</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-blue-500" />
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Precipitation</span>
                    <span className="font-bold">{report.weather.precipitationMm} mm</span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Condition</span>
                  <span className="font-bold">{report.weather.conditionText}</span>
                </div>
              </div>

              {report.weather.hazardReason && (
                <div className="mt-2.5 p-2 bg-red-50 dark:bg-red-950/50 rounded-lg text-xs font-semibold text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900">
                  ⚠️ {report.weather.hazardReason}
                </div>
              )}
            </div>
          )}

          {/* SENDER INFO (IF PROVIDED) */}
          {report.senderInfo && (report.senderInfo.name || report.senderInfo.phone) && (
            <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Reporting Citizen Contact
              </span>
              <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-700 dark:text-slate-200">
                {report.senderInfo.name && (
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>{report.senderInfo.name}</span>
                  </div>
                )}
                {report.senderInfo.phone && (
                  <a
                    href={`tel:${report.senderInfo.phone}`}
                    className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>{report.senderInfo.phone}</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* WHATSAPP PHOTO DISPATCH SUMMARY */}
          {report.whatsappDispatches && report.whatsappDispatches.length > 0 && (
            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 rounded-2xl p-4 border border-emerald-200 dark:border-emerald-800">
              <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                Emergency Contacts WhatsApp Photo Alerts ({report.whatsappDispatches.length})
              </span>
              <div className="space-y-1.5 text-xs">
                {report.whatsappDispatches.map((wa) => (
                  <div
                    key={wa.id}
                    className="flex items-center justify-between bg-white dark:bg-slate-900 p-2 rounded-xl border border-emerald-200 dark:border-emerald-900"
                  >
                    <div>
                      <span className="font-bold">{wa.contactName}</span>
                      <span className="text-slate-400 ml-2">({wa.phone})</span>
                      {wa.photoIncluded && (
                        <span className="ml-2 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                          • 📸 Photo Attached
                        </span>
                      )}
                    </div>
                    <span className="bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded">
                      {wa.gatewayProvider === 'twilio-whatsapp'
                        ? 'Twilio WA'
                        : wa.gatewayProvider === 'meta-whatsapp'
                        ? 'WA Cloud'
                        : 'Sandbox'}
                      : {wa.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SMS ALERT DISPATCH SUMMARY */}
          {report.smsDispatches && report.smsDispatches.length > 0 && (
            <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                Emergency Contacts SMS Dispatches ({report.smsDispatches.length})
              </span>
              <div className="space-y-1.5 text-xs">
                {report.smsDispatches.map((sms) => (
                  <div key={sms.id} className="flex items-center justify-between bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div>
                      <span className="font-bold">{sms.contactName}</span>
                      <span className="text-slate-400 ml-2">({sms.phone})</span>
                    </div>
                    <span className="bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded">
                      ✓ {sms.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TWILIO NEARBY DISPATCHER SMS ALERTS */}
          <div className="bg-slate-50 dark:bg-slate-800/90 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-red-600 dark:text-red-400 animate-pulse" />
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-900 dark:text-white">
                  Nearby Dispatcher Twilio SMS Alerts ({dispatcherSmsLogs.length})
                </span>
              </div>
              <button
                type="button"
                onClick={handleTriggerTwilioAlert}
                disabled={isDispatchingTwilio}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                {isDispatchingTwilio ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Alert Nearby Dispatchers (Twilio SMS)</span>
              </button>
            </div>

            {twilioDispatchNotice && (
              <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 p-2 rounded-lg border border-emerald-200 dark:border-emerald-800">
                {twilioDispatchNotice}
              </div>
            )}

            {dispatcherSmsLogs.length > 0 ? (
              <div className="space-y-1.5 text-xs">
                {dispatcherSmsLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 gap-2 flex-wrap"
                  >
                    <div>
                      <span className="font-mono font-black text-red-600 dark:text-red-400 mr-1.5">
                        {log.unitCode}
                      </span>
                      <span className="font-bold">{log.dispatcherName}</span>
                      <span className="text-slate-400 ml-2">
                        ({log.dispatcherPhone} • {log.distanceKm} km)
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                        log.status === 'failed'
                          ? 'bg-red-100 text-red-700'
                          : log.status === 'simulated'
                          ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300'
                          : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                      }`}
                    >
                      {log.gatewayProvider === 'twilio' ? 'Twilio' : 'Sandbox'}: {log.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                {report.priority === 'Critical'
                  ? 'No dispatcher alerts logged yet — click "Alert Nearby Dispatchers" to dispatch.'
                  : 'Automatic Twilio SMS alerts trigger when priority is set to Critical.'}
              </p>
            )}
          </div>

          {/* PRIVATE ADMIN INTERNAL NOTES SECTION */}
          <div className="bg-slate-50 dark:bg-slate-800/90 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-900 dark:text-white">
                  Private Dispatcher Internal Notes
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-semibold">
                {(report.adminNotesList?.length || 0)} Recorded
              </span>
            </div>

            {/* Existing Notes List */}
            {report.adminNotesList && report.adminNotesList.length > 0 ? (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {report.adminNotesList.map((note) => (
                  <div
                    key={note.id}
                    className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{note.author}</span>
                      <span>{new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-slate-800 dark:text-slate-100 font-medium">{note.note}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No internal notes added yet.</p>
            )}

            {/* Add Note Input Form */}
            {onAddAdminNote && (
              <form onSubmit={handleCreateNote} className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newAdminNote}
                  onChange={(e) => setNewAdminNote(e.target.value)}
                  placeholder="Add private note (e.g. Unit 12 on scene, traffic diverted)..."
                  className="flex-1 p-2.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400"
                />
                <button
                  type="submit"
                  disabled={!newAdminNote.trim() || isAddingNote}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Note</span>
                </button>
              </form>
            )}
          </div>

          {/* TRIAGE CONTROLS (Status & Priority Override) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-700">
            {/* Status Control */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Update Dispatch Status
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Pending', 'In Progress', 'Resolved'] as ReportStatus[]).map((st) => {
                  const isActive = report.status === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => onUpdateStatus(report.id, st)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition cursor-pointer text-center ${
                        isActive
                          ? st === 'Resolved'
                            ? 'bg-green-600 text-white shadow-md ring-2 ring-green-400'
                            : st === 'In Progress'
                            ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400'
                            : 'bg-yellow-500 text-white shadow-md ring-2 ring-yellow-400'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {st}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Manual Priority Override */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Manual Priority Override
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['Critical', 'High', 'Medium', 'Low'] as PriorityLevel[]).map((pr) => {
                  const isCurrent = report.priority === pr;
                  return (
                    <button
                      key={pr}
                      type="button"
                      onClick={() => onUpdatePriority(report.id, pr)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition cursor-pointer text-center ${
                        isCurrent
                          ? pr === 'Critical'
                            ? 'bg-red-700 text-white shadow-md ring-2 ring-red-400 animate-pulse'
                            : pr === 'High'
                            ? 'bg-red-600 text-white shadow-md ring-2 ring-red-400'
                            : pr === 'Medium'
                            ? 'bg-amber-500 text-white shadow-md ring-2 ring-amber-400'
                            : 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-400'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {pr}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowPrintView(true)}
            className="py-2.5 px-4 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <Printer className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Print-Friendly Dossier</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-6 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Close Incident
          </button>
        </div>
      </div>

      {/* Full Photo Zoom Modal */}
      {isPhotoZoomed && report.photoUrl && (
        <div
          className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setIsPhotoZoomed(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={report.photoUrl}
              alt="Full size accident view"
              className="max-h-[85vh] w-auto rounded-2xl shadow-2xl object-contain mx-auto"
            />
            <button
              type="button"
              onClick={() => setIsPhotoZoomed(false)}
              className="absolute top-3 right-3 bg-white/20 hover:bg-white/40 text-white p-2 rounded-full backdrop-blur"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-60 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-red-200 dark:border-red-900 text-center space-y-4">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-extrabold text-base text-slate-900 dark:text-white">Delete Incident Report?</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Are you sure you want to delete incident record <span className="font-bold text-slate-800 dark:text-slate-200">{report.reportId}</span>? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onDeleteReport(report.id);
                  onClose();
                }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print-Friendly Incident Dossier Modal View */}
      {showPrintView && (
        <PrintableReportView
          report={report}
          onClose={() => setShowPrintView(false)}
        />
      )}
    </div>
  );
};

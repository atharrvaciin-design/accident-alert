import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AccidentReport, PriorityLevel, ReportStatus, AccidentCategory, AdminNote } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  query,
} from 'firebase/firestore';
import { AccidentMap } from './AccidentMap';
import { ReportDetailsModal } from './ReportDetailsModal';
import { soundService } from '../utils/sound';
import {
  AlertCircle,
  Bell,
  BellRing,
  BellOff,
  CheckCircle2,
  Volume2,
  VolumeX,
  Search,
  Filter,
  ExternalLink,
  MapPin,
  Clock,
  Radio,
  Eye,
  Trash2,
  Phone,
  Layers,
  Map as MapIcon,
  List,
  BarChart3,
  TrendingUp,
  Printer,
  Download,
  Car,
  Footprints,
  Construction,
  Navigation,
  FileText,
  CloudSun,
  ShieldAlert,
  Mic,
} from 'lucide-react';
import { ReportStatusAnalytics } from './ReportStatusAnalytics';
import { ReportCategoryTrends } from './ReportCategoryTrends';
import { fcmService, NotificationPermissionStatus } from '../utils/fcm';
import { PrintableReportView } from './PrintableReportView';
import { calculateResponderEta } from '../services/emergencyTelemetry';
import { DispatcherTwilioModal } from './DispatcherTwilioModal';
import { smsService, TwilioGatewayStatus } from '../services/smsService';

interface AdminMonitoringPanelProps {
  onSwitchToReporter?: () => void;
}

export const AdminMonitoringPanel: React.FC<AdminMonitoringPanelProps> = ({
  onSwitchToReporter,
}) => {
  const [reports, setReports] = useState<AccidentReport[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Selected report for modal inspection
  const [inspectingReport, setInspectingReport] = useState<AccidentReport | null>(null);
  // Dedicated print-friendly report
  const [printingReport, setPrintingReport] = useState<AccidentReport | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'split' | 'map' | 'list' | 'analytics'>('split');
  const [showCategoryTrends, setShowCategoryTrends] = useState<boolean>(true);
  const [showInlineAnalytics, setShowInlineAnalytics] = useState<boolean>(false);

  // Sound alert state
  const [isMuted, setIsMuted] = useState<boolean>(soundService.getIsMuted());

  // Track initial snapshot load to avoid triggering siren on initial load
  const isInitialLoadRef = useRef(true);
  const previousReportIdsRef = useRef<Set<string>>(new Set());

  // Banner notification for newest alert
  const [newAlertBanner, setNewAlertBanner] = useState<AccidentReport | null>(null);

  // Push notification state
  const [pushPermission, setPushPermission] = useState<NotificationPermissionStatus>('default');
  const [isEnablingPush, setIsEnablingPush] = useState<boolean>(false);
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null);
  const [testPushCountdown, setTestPushCountdown] = useState<number | null>(null);

  // Twilio Dispatcher SMS Gateway state
  const [showTwilioModal, setShowTwilioModal] = useState<boolean>(false);
  const [twilioStatus, setTwilioStatus] = useState<TwilioGatewayStatus | null>(null);
  const [dispatcherAlertsCount, setDispatcherAlertsCount] = useState<number>(0);

  // Initialize FCM, register Service Worker and listen for notification clicks
  useEffect(() => {
    fcmService.initialize().then((state) => {
      setPushPermission(state.permission);
    });

    const unsubscribeClick = fcmService.onReportClick((clickedReportId) => {
      setReports((currentReports) => {
        const found = currentReports.find(
          (r) => r.id === clickedReportId || r.reportId === clickedReportId
        );
        if (found) {
          setInspectingReport(found);
        }
        return currentReports;
      });
    });

    smsService.getTwilioGatewayStatus().then((st) => {
      if (st) setTwilioStatus(st);
    });

    const unsubDispatcherAlerts = onSnapshot(
      collection(db, 'dispatcherSmsAlerts'),
      (snap) => {
        setDispatcherAlertsCount(snap.size);
      },
      (err) => {
        console.warn('Dispatcher SMS count listener notice:', err);
      }
    );

    return () => {
      unsubscribeClick();
      unsubDispatcherAlerts();
    };
  }, []);

  // Request browser push permissions & register token
  const handleEnablePush = async () => {
    setIsEnablingPush(true);
    setPushStatusMessage(null);
    try {
      const result = await fcmService.requestPermission();
      setPushPermission(fcmService.getPermissionStatus());
      if (result.success) {
        soundService.playSuccessChime();
        setPushStatusMessage('Browser push notifications active! Background emergency alerts enabled.');
      } else {
        setPushStatusMessage(result.error || 'Push notification permission was not granted.');
      }
    } catch (err: unknown) {
      setPushStatusMessage(err instanceof Error ? err.message : 'Failed to request notification permission');
    } finally {
      setIsEnablingPush(false);
      setTimeout(() => setPushStatusMessage(null), 7000);
    }
  };

  // Test background alert notification
  const handleTestBackgroundPush = () => {
    if (pushPermission !== 'granted') {
      handleEnablePush();
      return;
    }

    setPushStatusMessage('Background test queued: Switch to another tab or minimize browser now! Alert fires in 4 seconds...');
    setTestPushCountdown(4);

    let count = 4;
    const timer = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setTestPushCountdown(count);
      } else {
        clearInterval(timer);
        setTestPushCountdown(null);

        const demoReport: AccidentReport = {
          id: `demo_${Date.now()}`,
          reportId: `ACC-TEST-${Math.floor(1000 + Math.random() * 9000)}`,
          photoUrl: '',
          latitude: 37.7749,
          longitude: -122.4194,
          address: 'Emergency Dispatch Simulation Test — Central Expressway',
          googleMapsUrl: 'https://maps.google.com',
          emergencyMessage: 'Simulated multi-vehicle incident. Testing background push dispatch trigger.',
          quickMessageType: 'Serious Accident',
          category: 'Vehicle',
          status: 'Pending',
          priority: 'High',
          priorityReason: 'Background push notification test simulation',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        soundService.playEmergencyAlert();
        fcmService.showEmergencyReportNotification(demoReport, { forceWhenVisible: true });
        setPushStatusMessage('🚨 Test push alert triggered! Notice native system notification.');
        setTimeout(() => setPushStatusMessage(null), 6000);
      }
    }, 1000);
  };

  // Real-time Firestore sync
  useEffect(() => {
    setIsLoading(true);
    const reportsCollection = collection(db, 'accidentReports');
    const q = query(reportsCollection);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: AccidentReport[] = [];
        snapshot.forEach((docSnapshot) => {
          items.push({ ...(docSnapshot.data() as AccidentReport), id: docSnapshot.id });
        });

        // Sort descending by creation date (newest first)
        items.sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );

        // Check for new incoming reports to trigger alarm sound and background notification
        if (!isInitialLoadRef.current) {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const newReport = { ...(change.doc.data() as AccidentReport), id: change.doc.id };
              if (!previousReportIdsRef.current.has(newReport.id)) {
                // Audible siren on high priority or critical report
                soundService.playEmergencyAlert();
                setNewAlertBanner(newReport);

                // Trigger browser push notification
                fcmService.showEmergencyReportNotification(newReport);

                setTimeout(() => {
                  setNewAlertBanner((curr) => (curr?.id === newReport.id ? null : curr));
                }, 8000);
              }
            }
          });
        }

        previousReportIdsRef.current = new Set(items.map((r) => r.id));
        isInitialLoadRef.current = false;
        setReports(items);
        setIsLoading(false);
      },
      (err) => {
        console.error('Firestore snapshot listener error:', err);
        setError('Real-time sync issue with Firebase. Retrying...');
        handleFirestoreError(err, OperationType.LIST, 'accidentReports');
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Update Status in Firestore
  const handleUpdateStatus = async (reportId: string, newStatus: ReportStatus) => {
    try {
      soundService.playSuccessChime();
      const reportDoc = doc(db, 'accidentReports', reportId);
      await updateDoc(reportDoc, {
        status: newStatus,
        updatedAt: new Date().toISOString(),
      });
      setInspectingReport((prev) => (prev?.id === reportId ? { ...prev, status: newStatus } : prev));
    } catch (err) {
      console.error('Error updating report status:', err);
      handleFirestoreError(err, OperationType.UPDATE, `accidentReports/${reportId}`);
    }
  };

  // Update Priority in Firestore
  const handleUpdatePriority = async (reportId: string, newPriority: PriorityLevel) => {
    try {
      soundService.playSuccessChime();
      const reportDoc = doc(db, 'accidentReports', reportId);
      await updateDoc(reportDoc, {
        priority: newPriority,
        updatedAt: new Date().toISOString(),
      });
      setInspectingReport((prev) =>
        prev?.id === reportId ? { ...prev, priority: newPriority } : prev
      );
    } catch (err) {
      console.error('Error updating report priority:', err);
      handleFirestoreError(err, OperationType.UPDATE, `accidentReports/${reportId}`);
    }
  };

  // Update Responder Status in Firestore
  const handleUpdateResponderStatus = async (
    reportId: string,
    stage: 'Unassigned' | 'Dispatched' | 'En Route' | 'On Scene'
  ) => {
    try {
      soundService.playSuccessChime();
      const reportDoc = doc(db, 'accidentReports', reportId);
      await updateDoc(reportDoc, {
        responderStatus: stage,
        updatedAt: new Date().toISOString(),
      });
      setInspectingReport((prev) =>
        prev?.id === reportId ? { ...prev, responderStatus: stage } : prev
      );
    } catch (err) {
      console.error('Error updating responder status:', err);
      handleFirestoreError(err, OperationType.UPDATE, `accidentReports/${reportId}`);
    }
  };

  // Add Private Admin Note to Firestore
  const handleAddAdminNote = async (reportId: string, noteText: string) => {
    try {
      const reportDoc = doc(db, 'accidentReports', reportId);
      const targetReport = reports.find((r) => r.id === reportId);
      const newNote: AdminNote = {
        id: `note_${Date.now()}`,
        author: 'EMS Dispatch Officer',
        note: noteText,
        timestamp: new Date().toISOString(),
      };
      const updatedNotes = [...(targetReport?.adminNotesList || []), newNote];
      await updateDoc(reportDoc, {
        adminNotesList: updatedNotes,
        internalNotes: noteText,
        updatedAt: new Date().toISOString(),
      });
      soundService.playSuccessChime();
      setInspectingReport((prev) =>
        prev?.id === reportId
          ? { ...prev, adminNotesList: updatedNotes, internalNotes: noteText }
          : prev
      );
    } catch (err) {
      console.error('Error adding admin note:', err);
      handleFirestoreError(err, OperationType.UPDATE, `accidentReports/${reportId}`);
    }
  };

  // Delete Report in Firestore
  const handleDeleteReport = async (reportId: string) => {
    try {
      const reportDoc = doc(db, 'accidentReports', reportId);
      await deleteDoc(reportDoc);
      soundService.playSuccessChime();
      if (inspectingReport?.id === reportId) {
        setInspectingReport(null);
      }
    } catch (err) {
      console.error('Error deleting report:', err);
      handleFirestoreError(err, OperationType.DELETE, `accidentReports/${reportId}`);
    }
  };

  const toggleSound = () => {
    const next = soundService.toggleMute();
    setIsMuted(next);
  };

  // Filtered reports by search query, status, priority, and category
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (statusFilter !== 'All' && r.status !== statusFilter) return false;
      if (priorityFilter !== 'All' && r.priority !== priorityFilter) return false;
      if (categoryFilter !== 'All' && (r.category || 'Vehicle') !== categoryFilter) return false;

      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase();
        const matchesId = r.reportId?.toLowerCase().includes(queryLower);
        const matchesAddress = r.address?.toLowerCase().includes(queryLower);
        const matchesMsg = r.emergencyMessage?.toLowerCase().includes(queryLower);
        const matchesSender = r.senderInfo?.name?.toLowerCase().includes(queryLower);
        const matchesTag = r.quickMessageType?.toLowerCase().includes(queryLower);
        const matchesCat = r.category?.toLowerCase().includes(queryLower);
        const matchesTranscript = r.voiceTranscript?.toLowerCase().includes(queryLower);
        return matchesId || matchesAddress || matchesMsg || matchesSender || matchesTag || matchesCat || matchesTranscript;
      }
      return true;
    });
  }, [reports, statusFilter, priorityFilter, categoryFilter, searchQuery]);

  // Counts & Triage metrics
  const stats = useMemo(() => {
    const pending = reports.filter((r) => r.status === 'Pending').length;
    const inProgress = reports.filter((r) => r.status === 'In Progress').length;
    const resolved = reports.filter((r) => r.status === 'Resolved').length;
    const highPriority = reports.filter(
      (r) => (r.priority === 'Critical' || r.priority === 'High') && r.status !== 'Resolved'
    ).length;
    const criticalCount = reports.filter(
      (r) => r.priority === 'Critical' && r.status !== 'Resolved'
    ).length;
    return { pending, inProgress, resolved, highPriority, criticalCount, total: reports.length };
  }, [reports]);

  // OFFICIAL CSV EXPORT FUNCTION
  const handleExportCsv = () => {
    if (reports.length === 0) return;

    const headers = [
      'Report ID',
      'Date',
      'Time',
      'Status',
      'Priority',
      'Category',
      'Address',
      'Latitude',
      'Longitude',
      'Emergency Message',
      'Quick Tag',
      'Reporter Name',
      'Reporter Phone',
      'Responder Status',
      'Responder ETA (mins)',
      'Responder Distance (km)',
      'Admin Notes Count',
      'Last Admin Note',
      'Weather Condition',
      'Temperature (C)',
      'SMS Alerts Sent',
      'Google Maps URL',
    ];

    const escapeCsv = (str: unknown) => {
      if (str === null || str === undefined) return '""';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    const targetList = filteredReports.length > 0 ? filteredReports : reports;

    const rows = targetList.map((r) => {
      const d = new Date(r.createdAt || Date.now());
      const dateStr = d.toLocaleDateString();
      const timeStr = d.toLocaleTimeString();
      const lastNote =
        r.adminNotesList && r.adminNotesList.length > 0
          ? r.adminNotesList[r.adminNotesList.length - 1].note
          : '';
      const smsCount = r.smsDispatches?.length || 0;

      return [
        escapeCsv(r.reportId),
        escapeCsv(dateStr),
        escapeCsv(timeStr),
        escapeCsv(r.status),
        escapeCsv(r.priority),
        escapeCsv(r.category || 'Vehicle'),
        escapeCsv(r.address),
        escapeCsv(r.latitude),
        escapeCsv(r.longitude),
        escapeCsv(r.emergencyMessage),
        escapeCsv(r.quickMessageType),
        escapeCsv(r.senderInfo?.name || 'Anonymous'),
        escapeCsv(r.senderInfo?.phone || ''),
        escapeCsv(r.responderStatus || 'Dispatched'),
        escapeCsv(r.responderEtaMinutes ?? ''),
        escapeCsv(r.responderDistanceKm ?? ''),
        escapeCsv(r.adminNotesList?.length || 0),
        escapeCsv(lastNote),
        escapeCsv(r.weather?.conditionText || ''),
        escapeCsv(r.weather?.tempC ?? ''),
        escapeCsv(smsCount),
        escapeCsv(r.googleMapsUrl),
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `accident-reports-export-${dateStamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    soundService.playSuccessChime();
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 space-y-5">
      {/* Real-time Alert Banner Popup */}
      {newAlertBanner && (
        <div className="bg-red-600 text-white rounded-2xl p-4 shadow-2xl border-2 border-white/30 flex items-center justify-between gap-4 animate-bounce">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl">
              <Bell className="w-6 h-6 animate-spin text-yellow-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider bg-black/30 px-2 py-0.5 rounded">
                  NEW EMERGENCY ALERT RECEIVED
                </span>
                <span className="font-mono text-sm font-bold text-yellow-300">
                  {newAlertBanner.reportId}
                </span>
                <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                  Category: {newAlertBanner.category || 'Vehicle'}
                </span>
              </div>
              <p className="text-xs sm:text-sm font-semibold mt-0.5 line-clamp-1">
                📍 {newAlertBanner.address} — "{newAlertBanner.emergencyMessage}"
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setInspectingReport(newAlertBanner);
                setNewAlertBanner(null);
              }}
              className="py-1.5 px-3 bg-white text-red-700 hover:bg-red-50 text-xs font-extrabold rounded-lg shadow cursor-pointer transition"
            >
              Inspect Now
            </button>
            <button
              type="button"
              onClick={() => setNewAlertBanner(null)}
              className="text-white/80 hover:text-white text-xs font-bold px-2 py-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Push Notification Activation Prompt Banner */}
      {pushPermission === 'default' && (
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg border border-blue-700/60">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-blue-600/40 text-amber-300 border border-blue-400/30 shrink-0">
              <BellRing className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm sm:text-base">
                  Emergency Dispatch Push Notifications
                </span>
                <span className="text-[10px] bg-red-500 text-white font-extrabold px-2 py-0.5 rounded-full uppercase">
                  Dispatcher Alert
                </span>
              </div>
              <p className="text-xs text-blue-200 mt-0.5 max-w-xl">
                Enable background browser push alerts to receive instant audible alerts when a citizen reports an accident, even if this browser tab is minimized or in the background.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleEnablePush}
            disabled={isEnablingPush}
            className="w-full sm:w-auto py-2.5 px-5 bg-amber-400 hover:bg-amber-300 text-blue-950 font-black text-xs rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2 shrink-0"
          >
            <Bell className="w-4 h-4" />
            <span>{isEnablingPush ? 'Activating...' : 'Enable Dispatch Push Alerts'}</span>
          </button>
        </div>
      )}

      {/* Status banner for push actions */}
      {pushStatusMessage && (
        <div className="p-3 bg-blue-50 dark:bg-blue-950/80 border border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-xs font-bold rounded-xl flex items-center justify-between animate-in fade-in">
          <span>{pushStatusMessage}</span>
          <button
            type="button"
            onClick={() => setPushStatusMessage(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Control Header & Audio / Export Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
            <h1 className="text-xl sm:text-2xl font-black text-blue-950 dark:text-white tracking-tight">
              Emergency Dispatch & Incident Monitoring
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time emergency stream, GPS geocoding, dispatch triage, and official CSV logging.
          </p>
        </div>

        {/* Audio control & Quick actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Siren Alert Sound Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            className={`py-2 px-3.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
              isMuted
                ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                : 'bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60'
            }`}
            title={isMuted ? 'Unmute Emergency Siren' : 'Mute Emergency Siren'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-red-600 animate-pulse" />}
            <span>{isMuted ? 'Siren Muted' : 'Siren ON'}</span>
          </button>

          {/* Test Siren Button */}
          <button
            type="button"
            onClick={() => soundService.playEmergencyAlert()}
            className="py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
            title="Test Emergency Siren Audio"
          >
            Test Siren
          </button>

          {/* Twilio Nearby Dispatcher SMS Gateway Button */}
          <button
            type="button"
            onClick={() => setShowTwilioModal(true)}
            className="py-2 px-3.5 rounded-xl bg-blue-950 dark:bg-blue-700 hover:bg-blue-900 dark:hover:bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            title="Configure nearby emergency dispatchers & Twilio SMS gateway"
          >
            <Radio className="w-3.5 h-3.5 text-red-400 animate-pulse" />
            <span>Twilio SMS</span>
            <span className="bg-white/20 text-[10px] font-black px-1.5 py-0.5 rounded-full">
              {dispatcherAlertsCount}
            </span>
          </button>

          {/* Export CSV Official Record Button */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={reports.length === 0}
            className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            title="Export accident report logs to official CSV file"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          {/* Layout Mode switchers */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                viewMode === 'split'
                  ? 'bg-white dark:bg-slate-900 text-blue-900 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Split View"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Split</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-900 text-blue-900 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="List Feed"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Feed</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('map')}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                viewMode === 'map'
                  ? 'bg-white dark:bg-slate-900 text-blue-900 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Map View"
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Map</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('analytics')}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                viewMode === 'analytics'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="30-Day Status Distribution Analytics"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">30d Trends</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Triage Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Pending Card (Red / Critical) */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'Pending' ? 'All' : 'Pending')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            statusFilter === 'Pending'
              ? 'bg-red-100 dark:bg-red-950/80 border-red-400 dark:border-red-700 ring-2 ring-red-400'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-red-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wider block">
              Pending Reports
            </span>
            {stats.pending > 0 && <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />}
          </div>
          <div className="text-2xl font-black text-red-600 dark:text-red-400 mt-1">{stats.pending}</div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Awaiting Dispatch</span>
        </button>

        {/* High Priority Critical Card */}
        <button
          type="button"
          onClick={() => setPriorityFilter(priorityFilter === 'Critical' ? 'All' : 'Critical')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            priorityFilter === 'Critical'
              ? 'bg-red-100 dark:bg-red-950/80 border-red-500 dark:border-red-800 ring-2 ring-red-500'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-red-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wider block">
              Critical / High Priority
            </span>
            {stats.criticalCount > 0 && (
              <span className="text-[10px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded animate-pulse">
                {stats.criticalCount} CRIT
              </span>
            )}
          </div>
          <div className="text-2xl font-black text-red-600 dark:text-red-400 mt-1">{stats.highPriority}</div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
            {twilioStatus?.configured ? 'Twilio SMS Auto-Dispatch' : 'Twilio Sandbox Auto-Alert'}
          </span>
        </button>

        {/* In Progress Card (Yellow / Amber) */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'In Progress' ? 'All' : 'In Progress')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            statusFilter === 'In Progress'
              ? 'bg-amber-100 dark:bg-amber-950/80 border-amber-400 dark:border-amber-700 ring-2 ring-amber-400'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-300'
          }`}
        >
          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">
            In-Progress
          </span>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{stats.inProgress}</div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">EMS En Route / Active</span>
        </button>

        {/* Resolved Card (Green) */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'Resolved' ? 'All' : 'Resolved')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            statusFilter === 'Resolved'
              ? 'bg-emerald-100 dark:bg-emerald-950/80 border-emerald-400 dark:border-emerald-700 ring-2 ring-emerald-400'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-300'
          }`}
        >
          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
            Resolved
          </span>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{stats.resolved}</div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Cleared Incidents</span>
        </button>
      </div>

      {/* 7-DAY REPORT TRENDS SUMMARY CARD (RECHARTS) */}
      {showCategoryTrends && (
        <ReportCategoryTrends reports={reports} />
      )}

      {/* Real-time Filter & Search Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3 transition-colors">
        {/* Real-Time Text Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search location, report ID, caller message..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter chips (Status, Priority, Category) */}
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {/* Status Filter */}
          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-bold shrink-0">
            <Filter className="w-3 h-3" />
            <span>Status:</span>
          </div>
          {['All', 'Pending', 'In Progress', 'Resolved'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`py-1 px-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                statusFilter === st
                  ? st === 'Pending'
                    ? 'bg-red-600 text-white'
                    : st === 'In Progress'
                    ? 'bg-amber-500 text-white'
                    : st === 'Resolved'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-blue-950 dark:bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200'
              }`}
            >
              {st}
            </button>
          ))}

          <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 mx-1 shrink-0" />

          {/* Priority Filter */}
          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-bold shrink-0">
            <span>Priority:</span>
          </div>
          {['All', 'Critical', 'High', 'Medium'].map((pr) => (
            <button
              key={pr}
              type="button"
              onClick={() => setPriorityFilter(pr)}
              className={`py-1 px-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                priorityFilter === pr
                  ? pr === 'Critical'
                    ? 'bg-red-700 text-white'
                    : pr === 'High'
                    ? 'bg-red-600 text-white'
                    : pr === 'Medium'
                    ? 'bg-amber-500 text-white'
                    : 'bg-blue-950 dark:bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200'
              }`}
            >
              {pr}
            </button>
          ))}

          <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 mx-1 shrink-0" />

          {/* Category Filter */}
          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-bold shrink-0">
            <span>Category:</span>
          </div>
          {['All', 'Vehicle', 'Pedestrian', 'Infrastructure'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`py-1 px-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                categoryFilter === cat
                  ? 'bg-blue-950 dark:bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Analytics Banner Toggle when in feed/map/split */}
      {viewMode !== 'analytics' && (
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => setShowInlineAnalytics(!showInlineAnalytics)}
            className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3.5 py-2 rounded-xl shadow-xs cursor-pointer transition"
          >
            <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>
              {showInlineAnalytics
                ? '▲ Hide 30-Day Status Distribution Chart'
                : '▼ View 30-Day Status Distribution Chart (Recharts)'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('analytics')}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Open Full 30d Analytics View</span>
            <span>→</span>
          </button>
        </div>
      )}

      {/* Inline Analytics preview if toggled in standard view */}
      {viewMode !== 'analytics' && showInlineAnalytics && (
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-3xl border border-slate-200 dark:border-slate-800">
          <ReportStatusAnalytics reports={reports} onSelectReport={(rep) => setInspectingReport(rep)} />
        </div>
      )}

      {/* FULL ANALYTICS VIEW */}
      {viewMode === 'analytics' ? (
        <div className="space-y-6">
          <ReportStatusAnalytics reports={reports} onSelectReport={(rep) => setInspectingReport(rep)} />
        </div>
      ) : (
        /* Main Content Layout based on viewMode */
        <div
          className={`grid gap-5 ${
            viewMode === 'split'
              ? 'grid-cols-1 lg:grid-cols-12'
              : viewMode === 'map'
              ? 'grid-cols-1'
              : 'grid-cols-1'
          }`}
        >
          {/* INTERACTIVE MAP COMPONENT */}
          {(viewMode === 'split' || viewMode === 'map') && (
            <div className={`${viewMode === 'split' ? 'lg:col-span-7' : 'w-full'} min-h-[440px] flex flex-col`}>
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm flex-1 flex flex-col transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-blue-950 dark:text-white uppercase tracking-wide">
                      Live Incident Map
                    </span>
                    <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold px-2 py-0.5 rounded-full">
                      {filteredReports.length} Plotted
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">Click marker to inspect</span>
                </div>
                <div className="flex-1 min-h-[400px]">
                  <AccidentMap
                    reports={filteredReports}
                    selectedReport={inspectingReport}
                    onSelectReport={(rep) => setInspectingReport(rep)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ACCIDENT REPORT FEED & HISTORY */}
          {(viewMode === 'split' || viewMode === 'list') && (
            <div className={`${viewMode === 'split' ? 'lg:col-span-5' : 'w-full'} space-y-3`}>
              <div className="flex items-center justify-between px-1">
                <span className="font-extrabold text-sm text-blue-950 dark:text-white uppercase tracking-wide">
                  Incident History Log ({filteredReports.length})
                </span>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download CSV</span>
                </button>
              </div>

              {isLoading ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center text-slate-500 space-y-2 border border-slate-200 dark:border-slate-800">
                  <div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-semibold">Connecting to Emergency Stream...</p>
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center text-slate-500 border border-slate-200 dark:border-slate-800 space-y-2">
                  <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No matching accident alerts</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {reports.length === 0
                      ? 'No accident reports recorded yet. Submit an alert in Dashboard 1 to test live synchronization.'
                      : 'Try clearing your search or status filters.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[660px] overflow-y-auto pr-1">
                  {filteredReports.map((report) => {
                    const isCritical = report.priority === 'Critical';
                    const isHighPriority = report.priority === 'High' || isCritical;
                    const isPending = report.status === 'Pending';
                    const isResolved = report.status === 'Resolved';
                    const isInProgress = report.status === 'In Progress';

                    // Estimated ETA
                    const { etaMinutes } = calculateResponderEta(report.latitude, report.longitude);
                    const displayEta = report.responderEtaMinutes ?? etaMinutes;

                    return (
                      <div
                        key={report.id}
                        className={`bg-white dark:bg-slate-900 rounded-2xl p-4 border transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer ${
                          isCritical && !isResolved
                            ? 'border-red-600 dark:border-red-600 ring-2 ring-red-500/30'
                            : isPending && isHighPriority
                            ? 'border-red-400 dark:border-red-800 ring-2 ring-red-400/20'
                            : isResolved
                            ? 'border-slate-200 dark:border-slate-800 opacity-80'
                            : 'border-slate-200 dark:border-slate-800 hover:border-blue-400'
                        }`}
                        onClick={() => setInspectingReport(report)}
                      >
                        {/* Top Bar: ID, Status, Priority, Category */}
                        <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-black text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 px-2 py-0.5 rounded border border-red-200 dark:border-red-900">
                              {report.reportId}
                            </span>

                            {/* Color-Coded Status Badge */}
                            <span
                              className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 ${
                                isResolved
                                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                  : isInProgress
                                  ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                  : 'bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-800'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isResolved
                                    ? 'bg-emerald-500'
                                    : isInProgress
                                    ? 'bg-amber-500'
                                    : 'bg-red-500 animate-ping'
                                }`}
                              />
                              <span>{report.status}</span>
                            </span>

                            {/* Category Tag Badge */}
                            <span className="text-[10px] font-extrabold bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-900">
                              {report.category || 'Vehicle'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            {typeof report.dispatcherSmsCount === 'number' && report.dispatcherSmsCount > 0 && (
                              <span
                                className="text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 px-2 py-0.5 rounded flex items-center gap-1"
                                title="Nearby emergency dispatchers alerted via Twilio SMS"
                              >
                                <Radio className="w-2.5 h-2.5" />
                                {report.dispatcherSmsCount} SMS
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                isCritical
                                  ? 'bg-red-700 text-white animate-pulse'
                                  : report.priority === 'High'
                                  ? 'bg-red-600 text-white'
                                  : report.priority === 'Medium'
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-emerald-600 text-white'
                              }`}
                            >
                              {report.priority}
                            </span>
                          </div>
                        </div>

                        {/* Photo Thumbnail + Emergency Message */}
                        <div className="flex items-start gap-3">
                          {report.photoUrl && (
                            <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-900 shrink-0 border border-slate-200 dark:border-slate-700">
                              <img
                                src={report.photoUrl}
                                alt="Accident preview"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-2">
                              "{report.emergencyMessage}"
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-1 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-red-500 shrink-0" />
                              <span>{report.address}</span>
                            </p>
                          </div>
                        </div>

                        {/* Citizen Voice Message Audio Player */}
                        {report.voiceMessageUrl && (
                          <div
                            className="mt-2.5 p-2 rounded-xl bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 space-y-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between text-[10px] font-bold text-red-700 dark:text-red-300">
                              <span className="flex items-center gap-1 uppercase tracking-wider">
                                <Mic className="w-3 h-3" />
                                Citizen Voice Message ({report.voiceMessageDurationSec || 1}s)
                              </span>
                            </div>
                            <audio controls src={report.voiceMessageUrl} className="w-full h-8" />
                          </div>
                        )}

                        {/* Quick Telemetry Bar: Responder ETA & Notes */}
                        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-2">
                            {/* Responder ETA */}
                            <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded">
                              <Navigation className="w-3 h-3" />
                              <span>ETA: ~{displayEta}m</span>
                            </span>

                            {/* Weather indicator if available */}
                            {report.weather && (
                              <span className="text-slate-600 dark:text-slate-400 font-semibold flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                                <CloudSun className="w-3 h-3 text-blue-500" />
                                <span>{report.weather.tempC}°C</span>
                              </span>
                            )}

                            {/* Admin Notes badge */}
                            {report.adminNotesList && report.adminNotesList.length > 0 && (
                              <span className="text-blue-700 dark:text-blue-400 font-semibold flex items-center gap-1 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded">
                                <FileText className="w-3 h-3" />
                                <span>{report.adminNotesList.length} note(s)</span>
                              </span>
                            )}

                            {/* Voice Note badge */}
                            {report.voiceMessageUrl && (
                              <span className="text-red-700 dark:text-red-300 font-bold flex items-center gap-1 bg-red-50 dark:bg-red-950/60 px-2 py-0.5 rounded">
                                <Mic className="w-3 h-3" />
                                <span>Voice {report.voiceMessageDurationSec || 1}s</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <a
                              href={report.googleMapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-1"
                              title="Open Google Maps"
                            >
                              <span>Map</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>

                            <button
                              type="button"
                              onClick={() => setPrintingReport(report)}
                              className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1 transition cursor-pointer border border-slate-200 dark:border-slate-700"
                              title="Print incident dossier"
                            >
                              <Printer className="w-3 h-3 text-slate-600 dark:text-slate-400" />
                              <span>Print</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setInspectingReport(report)}
                              className="bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1 transition cursor-pointer"
                            >
                              <Eye className="w-3 h-3" /> Details
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Full Incident Details Modal */}
      {inspectingReport && (
        <ReportDetailsModal
          report={inspectingReport}
          onClose={() => setInspectingReport(null)}
          onUpdateStatus={handleUpdateStatus}
          onUpdatePriority={handleUpdatePriority}
          onDeleteReport={handleDeleteReport}
          onAddAdminNote={handleAddAdminNote}
          onUpdateResponderStatus={handleUpdateResponderStatus}
        />
      )}

      {/* Print-Friendly Incident Dossier Modal View */}
      {printingReport && (
        <PrintableReportView
          report={printingReport}
          onClose={() => setPrintingReport(null)}
        />
      )}

      {/* Twilio Dispatcher SMS Gateway & Nearby Units Modal */}
      {showTwilioModal && (
        <DispatcherTwilioModal onClose={() => setShowTwilioModal(false)} />
      )}
    </div>
  );
};

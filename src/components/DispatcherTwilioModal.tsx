import React, { useState, useEffect } from 'react';
import { EmergencyDispatcher, DispatcherSmsAlert } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { smsService, TwilioGatewayStatus } from '../services/smsService';
import { soundService } from '../utils/sound';
import {
  X,
  Radio,
  Plus,
  Trash2,
  Phone,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Send,
  ShieldAlert,
  Loader2,
  Navigation,
  Activity,
} from 'lucide-react';

interface DispatcherTwilioModalProps {
  onClose: () => void;
}

export const DispatcherTwilioModal: React.FC<DispatcherTwilioModalProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'units' | 'logs'>('units');
  const [dispatchers, setDispatchers] = useState<EmergencyDispatcher[]>([]);
  const [alertLogs, setAlertLogs] = useState<DispatcherSmsAlert[]>([]);
  const [gatewayStatus, setGatewayStatus] = useState<TwilioGatewayStatus | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add unit form state
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [role, setRole] = useState<EmergencyDispatcher['role']>('EMS Lead');
  const [phone, setPhone] = useState('');
  const [stationName, setStationName] = useState('');
  const [latitude, setLatitude] = useState('37.7749');
  const [longitude, setLongitude] = useState('-122.4194');
  const [maxRadiusKm, setMaxRadiusKm] = useState('25');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    smsService.getTwilioGatewayStatus().then((status) => {
      if (status) setGatewayStatus(status);
    });

    const unsubDispatchers = onSnapshot(
      collection(db, 'dispatchers'),
      (snap) => {
        const list: EmergencyDispatcher[] = [];
        snap.forEach((d) => {
          list.push({ ...(d.data() as EmergencyDispatcher), id: d.id });
        });
        setDispatchers(list);
      },
      (err) => {
        console.warn('Dispatchers listener notice:', err);
      }
    );

    const unsubAlerts = onSnapshot(
      collection(db, 'dispatcherSmsAlerts'),
      (snap) => {
        const logs: DispatcherSmsAlert[] = [];
        snap.forEach((d) => {
          logs.push({ ...(d.data() as DispatcherSmsAlert), id: d.id });
        });
        logs.sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        setAlertLogs(logs);
      },
      (err) => {
        console.warn('Dispatcher SMS alerts listener notice:', err);
      }
    );

    return () => {
      unsubDispatchers();
      unsubAlerts();
    };
  }, []);

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setFeedbackBanner({ type: 'success', text: 'Coordinates synced to your current GPS position.' });
        setTimeout(() => setFeedbackBanner(null), 4000);
      },
      () => {
        setFeedbackBanner({ type: 'error', text: 'Could not read browser GPS. Please enter coordinates manually.' });
      }
    );
  };

  const handleAddDispatcher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !unitCode.trim() || !phone.trim()) return;

    setIsSaving(true);
    const id = `disp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const record: EmergencyDispatcher = {
      id,
      name: name.trim(),
      unitCode: unitCode.trim().toUpperCase(),
      role,
      phone: phone.trim(),
      stationName: stationName.trim() || 'Field Response Unit',
      latitude: Number(latitude) || 37.7749,
      longitude: Number(longitude) || -122.4194,
      maxRadiusKm: Number(maxRadiusKm) || 25,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await setDoc(doc(db, 'dispatchers', id), record);
      soundService.playSuccessChime();
      setName('');
      setUnitCode('');
      setPhone('');
      setStationName('');
      setIsAdding(false);
      setFeedbackBanner({ type: 'success', text: `Dispatcher unit ${record.unitCode} registered for Critical SMS alerts.` });
      setTimeout(() => setFeedbackBanner(null), 5000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `dispatchers/${id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleDispatcher = async (disp: EmergencyDispatcher) => {
    try {
      await updateDoc(doc(db, 'dispatchers', disp.id), {
        active: !disp.active,
        updatedAt: new Date().toISOString(),
      });
      soundService.playSuccessChime();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `dispatchers/${disp.id}`);
    }
  };

  const handleDeleteDispatcher = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'dispatchers', id));
      soundService.playSuccessChime();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `dispatchers/${id}`);
    }
  };

  const handleRunTestAlert = async () => {
    setIsTesting(true);
    setFeedbackBanner(null);
    try {
      const firstActive = dispatchers.find((d) => d.active);
      const res = await smsService.sendTestTwilioAlert(
        firstActive
          ? {
              latitude: firstActive.latitude,
              longitude: firstActive.longitude,
              address: `Sector Test near ${firstActive.stationName}`,
            }
          : undefined
      );

      if (res.success) {
        soundService.playSuccessChime();
        const count = res.alerts?.length || 0;
        setFeedbackBanner({
          type: 'success',
          text: `Twilio SMS verification triggered for ${count} nearby dispatcher unit(s). Check SMS Dispatch Logs tab.`,
        });
        setActiveTab('logs');
      } else {
        setFeedbackBanner({
          type: 'error',
          text: res.error || 'Twilio test dispatch returned an error.',
        });
      }
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 transition-colors">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/90 flex items-center justify-center shadow-lg shadow-red-600/30">
              <Radio className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base leading-tight">
                  Twilio Dispatcher SMS Gateway
                </h3>
                {gatewayStatus?.configured ? (
                  <span className="text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                    Twilio Live
                  </span>
                ) : (
                  <span className="text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full">
                    Sandbox Gateway
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Automatically texts nearby units when a 'Critical' accident report is filed in Firestore
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Bar & Sub-tabs */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('units')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'units'
                  ? 'bg-blue-950 dark:bg-blue-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              Nearby Dispatchers ({dispatchers.filter((d) => d.active).length}/{dispatchers.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'logs'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>SMS Dispatch Logs ({alertLogs.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleRunTestAlert}
            disabled={isTesting}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
          >
            {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>Test Critical Twilio SMS</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-slate-800 dark:text-slate-100">
          {/* Gateway mode info banner */}
          <div
            className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 ${
              gatewayStatus?.configured
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
            }`}
          >
            {gatewayStatus?.configured ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <div className="font-bold">
                {gatewayStatus?.configured
                  ? `Live Twilio Carrier Gateway Active (Sender: ${gatewayStatus.fromNumberMasked})`
                  : 'Twilio Sandbox Gateway Active — Server Env Secrets Not Set'}
              </div>
              <p className="text-[11px] opacity-90">
                {gatewayStatus?.configured
                  ? 'Real-time Firestore listener is watching for Critical reports and sending live Twilio SMS.'
                  : 'Alerts are logged to Firestore in sandbox mode. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER in environment secrets to send live carrier SMS.'}
              </p>
            </div>
          </div>

          {feedbackBanner && (
            <div
              className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                feedbackBanner.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-950/60 border-red-300 text-red-800 dark:text-red-300'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{feedbackBanner.text}</span>
            </div>
          )}

          {activeTab === 'units' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Registered Nearby Dispatchers (Firestore)
                </span>
                {!isAdding && (
                  <button
                    type="button"
                    onClick={() => setIsAdding(true)}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Register Dispatcher Unit</span>
                  </button>
                )}
              </div>

              {isAdding && (
                <form
                  onSubmit={handleAddDispatcher}
                  className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-800 dark:text-white">
                      Add Nearby Emergency Dispatcher
                    </span>
                    <button
                      type="button"
                      onClick={handleUseCurrentGps}
                      className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Navigation className="w-3 h-3" />
                      <span>Use My Current GPS</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Unit Code</label>
                      <input
                        type="text"
                        required
                        value={unitCode}
                        onChange={(e) => setUnitCode(e.target.value)}
                        placeholder="e.g. EMS-07"
                        className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Lead Name</label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Capt. Alex Rivera"
                        className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Specialty</label>
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as EmergencyDispatcher['role'])}
                        className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      >
                        <option value="EMS Lead">EMS Lead</option>
                        <option value="Fire & Rescue">Fire & Rescue</option>
                        <option value="Highway Patrol">Highway Patrol</option>
                        <option value="Trauma Unit">Trauma Unit</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        SMS Phone (E.164)
                      </label>
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+15550109988"
                        className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Station / Zone</label>
                      <input
                        type="text"
                        value={stationName}
                        onChange={(e) => setStationName(e.target.value)}
                        placeholder="North Sector Hub"
                        className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Latitude</label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Longitude</label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Radius (km)</label>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        required
                        value={maxRadiusKm}
                        onChange={(e) => setMaxRadiusKm(e.target.value)}
                        className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAdding(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer"
                    >
                      {isSaving ? 'Saving...' : 'Save Dispatcher'}
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2.5">
                {dispatchers.map((d) => (
                  <div
                    key={d.id}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition ${
                      d.active
                        ? 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
                        : 'bg-slate-100/50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-60'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] font-black bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-2 py-0.5 rounded border border-red-200 dark:border-red-900">
                          {d.unitCode}
                        </span>
                        <span className="font-bold text-xs text-slate-900 dark:text-white">{d.name}</span>
                        <span className="text-[10px] font-semibold bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded">
                          {d.role}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {d.phone}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-red-500" /> {d.stationName} ({d.maxRadiusKm} km radius)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleDispatcher(d)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                          d.active
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {d.active ? 'On Duty' : 'Off Duty'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDispatcher(d.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg cursor-pointer"
                        title="Remove dispatcher"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {alertLogs.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                  <ShieldAlert className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    No Critical Dispatcher SMS Alerts Logged Yet
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Submit a Critical report or click "Test Critical Twilio SMS" above.
                  </p>
                </div>
              ) : (
                alertLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 px-2 py-0.5 rounded border border-red-200 dark:border-red-900">
                          {log.reportId}
                        </span>
                        <span className="font-bold">
                          → {log.unitCode} ({log.dispatcherName})
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">{log.dispatcherPhone}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">
                          {log.distanceKm} km {log.withinRadius ? '(In Sector)' : '(Mutual Aid)'}
                        </span>
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                            log.status === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : log.status === 'simulated'
                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                              : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                          }`}
                        >
                          {log.gatewayProvider === 'twilio' ? 'Twilio' : 'Sandbox'}: {log.status}
                        </span>
                      </div>
                    </div>

                    <pre className="whitespace-pre-wrap font-sans text-[11px] bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 leading-relaxed">
                      {log.message}
                    </pre>

                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>SID: {log.gatewaySid || 'N/A'}</span>
                      <span>{new Date(log.createdAt).toLocaleString()}</span>
                    </div>

                    {log.errorMessage && (
                      <div className="text-[11px] text-red-600 dark:text-red-400 font-semibold">
                        Gateway Error: {log.errorMessage}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Firestore Real-Time Trigger: <strong className="text-emerald-600">Active for Critical Priority</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

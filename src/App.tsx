import React, { useState, useEffect } from 'react';
import { UserReportingPanel } from './components/UserReportingPanel';
import { AdminMonitoringPanel } from './components/AdminMonitoringPanel';
import { testFirestoreConnection, db } from './firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { useTheme } from './context/ThemeContext';
import {
  Radio,
  Split,
  Smartphone,
  Monitor,
  CheckCircle,
  Sun,
  Moon,
  WifiOff,
} from 'lucide-react';
import { PWAInstallButton } from './components/PWAInstallButton';

export default function App() {
  const [activeTab, setActiveTab] = useState<'reporter' | 'monitoring' | 'dual'>('reporter');
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const { isDark, toggleTheme } = useTheme();

  // Listen to network status (online / offline)
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initialize and validate Firestore connection on boot
  useEffect(() => {
    testFirestoreConnection();

    const unsubscribe = onSnapshot(
      collection(db, 'accidentReports'),
      (snapshot) => {
        let count = 0;
        snapshot.forEach((doc) => {
          if (doc.data().status === 'Pending') {
            count++;
          }
        });
        setPendingCount(count);
      },
      (err) => {
        console.warn('Pending count listener notice:', err);
      }
    );

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200 selection:bg-red-500 selection:text-white">
      {/* Top Application Header / Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div className="bg-slate-900 dark:bg-slate-950 text-white text-center py-1 px-4 border-b border-slate-800">
          <p className="text-[11px] sm:text-xs font-bold tracking-wide text-slate-200">
            This app made by <span className="text-amber-400 font-black">Atharv Singh</span>
          </p>
        </div>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 min-h-16 py-2 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <img
              src="/pwa-192x192.png"
              alt="Accident Alert"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl shadow-md shadow-red-500/20 shrink-0"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-sm sm:text-base text-blue-950 dark:text-white tracking-tight">
                  Accident Alert
                </span>
                <span className="hidden xs:inline-block sm:inline-block text-[10px] font-extrabold bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-md border border-red-200 dark:border-red-900">
                  RAPID DISPATCH
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Emergency Reporting & Live Response
              </p>
            </div>
          </div>

          {/* Network Status Badge + Navigation Tab Switcher & Install / Theme Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {/* Network Status Detector */}
            {isOnline ? (
              <div
                className="hidden md:flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-xl border border-emerald-200 dark:border-emerald-800"
                title="Internet connection active. Receiving real-time emergency telemetry."
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Live Sync</span>
              </div>
            ) : (
              <div
                className="flex items-center gap-1.5 text-[11px] font-black text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/90 px-2.5 py-1 rounded-xl border border-amber-300 dark:border-amber-700 animate-pulse"
                title="Internet disconnected. Local emergency retry queue active."
              >
                <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Offline (Local Queue)</span>
              </div>
            )}

            <nav className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
              {/* Dashboard 1 Button */}
              <button
                type="button"
                onClick={() => setActiveTab('reporter')}
                className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'reporter'
                    ? 'bg-red-600 text-white shadow-sm shadow-red-600/30'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Dashboard 1</span>
                <span className="hidden md:inline font-normal opacity-90">(Citizen)</span>
              </button>

              {/* Dashboard 2 Button */}
              <button
                type="button"
                onClick={() => setActiveTab('monitoring')}
                className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer relative ${
                  activeTab === 'monitoring'
                    ? 'bg-blue-950 dark:bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Dashboard 2</span>
                <span className="hidden md:inline font-normal opacity-90">(Admin / EMS)</span>
                {pendingCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center ml-0.5 animate-pulse">
                    {pendingCount}
                  </span>
                )}
              </button>

              {/* Dual Simulator View (Desktop) */}
              <button
                type="button"
                onClick={() => setActiveTab('dual')}
                className={`hidden lg:flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'dual'
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Side-by-side test simulation to see real-time alert dispatch"
              >
                <Split className="w-3.5 h-3.5" />
                <span>Live Simulation</span>
              </button>
            </nav>

            {/* PWA Install / Add to Home Screen Button */}
            <PWAInstallButton />

            {/* High-Contrast Night Mode Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-yellow-400 border border-slate-200 dark:border-slate-700 transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
              title={isDark ? 'Switch to Day Mode' : 'Switch to Night Emergency High-Contrast Mode'}
              aria-label="Toggle Night Mode"
            >
              {isDark ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
              <span className="hidden sm:inline">{isDark ? 'Day' : 'Night'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 pb-12">
        {activeTab === 'reporter' && (
          <UserReportingPanel
            onSwitchToMonitoring={() => setActiveTab('monitoring')}
          />
        )}

        {activeTab === 'monitoring' && (
          <AdminMonitoringPanel
            onSwitchToReporter={() => setActiveTab('reporter')}
          />
        )}

        {activeTab === 'dual' && (
          <div className="w-full max-w-[1700px] mx-auto px-4 py-6 space-y-4">
            <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-3 text-emerald-900 dark:text-emerald-200 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-semibold">
                  Dual Live Mode: Report an accident on the left (Dashboard 1) and watch it arrive instantly in real time on the right (Dashboard 2)!
                </span>
              </div>
              <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded shadow-xs">
                Real-Time Firestore Sync
              </span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {/* Left Column: Dashboard 1 */}
              <div className="xl:col-span-5 bg-white/70 dark:bg-slate-900/80 backdrop-blur rounded-3xl p-2 border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 mb-2 flex items-center justify-between">
                  <span className="text-xs font-black text-red-600 dark:text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4" /> DASHBOARD 1: Citizen Reporter Panel
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                    Mobile Viewport
                  </span>
                </div>
                <UserReportingPanel
                  onSwitchToMonitoring={() => setActiveTab('monitoring')}
                />
              </div>

              {/* Right Column: Dashboard 2 */}
              <div className="xl:col-span-7 bg-white/70 dark:bg-slate-900/80 backdrop-blur rounded-3xl p-2 border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 mb-2 flex items-center justify-between">
                  <span className="text-xs font-black text-blue-950 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Monitor className="w-4 h-4 text-blue-800 dark:text-blue-400" /> DASHBOARD 2: Admin / EMS Monitoring
                  </span>
                  <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 px-2 py-0.5 rounded flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-600 animate-ping"></span> Live Receiver
                  </span>
                </div>
                <AdminMonitoringPanel
                  onSwitchToReporter={() => setActiveTab('reporter')}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-4 px-4 text-center text-xs text-slate-500 dark:text-slate-400 transition-colors">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="font-semibold text-slate-700 dark:text-slate-200">Accident Alert System</span>
            <span>— Real-Time Emergency Response Network</span>
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500">
            Real-Time Cloud Synchronization & GPS Geotagging
          </div>
        </div>
      </footer>
    </div>
  );
}

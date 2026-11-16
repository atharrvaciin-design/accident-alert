import React, { useState } from 'react';
import { Download, Smartphone, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // Suppress install prompt when already running in standalone installed PWA mode
  if (isInstalled) {
    return null;
  }

  // Android Chrome / Desktop Chromium native install prompt
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs font-extrabold text-white shadow-sm shadow-red-600/30 transition cursor-pointer shrink-0"
        title="Install Accident Alert app to your Home Screen"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari (no beforeinstallprompt) or browsers where prompt hasn't fired yet (show quick Add to Home Screen guide)
  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="flex items-center gap-1.5 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900/70 px-2.5 py-1.5 text-xs font-bold text-red-700 dark:text-red-300 transition cursor-pointer shrink-0"
        title="Add Accident Alert to Home Screen"
      >
        <Smartphone className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{isIOS ? 'Install on iOS' : 'Add to Home'}</span>
        <span className="sm:hidden">Install</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img
                  src="/pwa-192x192.png"
                  alt="Accident Alert"
                  className="w-10 h-10 rounded-xl shadow"
                />
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Install Accident Alert
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Standalone Home Screen App
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="text-xs text-slate-700 dark:text-slate-300 space-y-2 bg-slate-50 dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700">
                <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Share className="w-4 h-4 text-blue-600" />
                  Install on iPhone / iPad (Safari):
                </p>
                <p>1. Tap the <strong>Share</strong> button in the Safari toolbar.</p>
                <p>2. Scroll down and tap <strong>Add to Home Screen</strong>.</p>
                <p>3. Tap <strong>Add</strong> to launch Accident Alert full-screen.</p>
              </div>
            ) : (
              <div className="text-xs text-slate-700 dark:text-slate-300 space-y-2 bg-slate-50 dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700">
                <p className="font-bold text-slate-900 dark:text-white">
                  Install on Android Chrome / Desktop:
                </p>
                <p>1. Open this page directly in Chrome (outside embedded preview).</p>
                <p>2. Tap Chrome&apos;s menu (<strong>⋮</strong>) in the top right corner.</p>
                <p>3. Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 py-2.5 text-xs font-bold text-white transition cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};

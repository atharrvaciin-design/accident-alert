import React from 'react';
import { AccidentReport } from '../types';
import { Printer, X, ArrowLeft, ShieldAlert, MapPin, Clock, Phone, User, CheckCircle2, AlertTriangle } from 'lucide-react';

interface PrintableReportViewProps {
  report: AccidentReport;
  onClose: () => void;
  autoTriggerPrint?: boolean;
}

export const PrintableReportView: React.FC<PrintableReportViewProps> = ({
  report,
  onClose,
  autoTriggerPrint = false,
}) => {
  React.useEffect(() => {
    if (autoTriggerPrint) {
      const timer = setTimeout(() => {
        window.print();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [autoTriggerPrint]);

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = new Date(report.createdAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const formattedTime = new Date(report.createdAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const printTimestamp = new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm overflow-y-auto flex flex-col items-center justify-start p-2 sm:p-6 transition-all print:p-0 print:bg-white print:static print:inset-auto">
      {/* On-screen control bar (Hidden during print) */}
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-4 mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            title="Return to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 hidden sm:block" />
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Print Preview: <strong className="text-slate-900 dark:text-white font-mono">{report.reportId}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="py-2 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report (Ctrl+P / ⌘P)</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Close Preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Official Incident Dossier (Formatted for clean A4/Letter printout) */}
      <div
        id="printable-accident-dossier"
        className="w-full max-w-4xl bg-white text-slate-900 rounded-2xl shadow-2xl p-6 sm:p-10 border border-slate-200 print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none print:w-full print:rounded-none"
      >
        {/* Document Header */}
        <div className="border-b-2 border-slate-900 pb-4 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-red-700">
                <ShieldAlert className="w-6 h-6 stroke-[2.5]" />
                <span className="text-xs font-black tracking-widest uppercase">
                  EMERGENCY DISPATCH & TRAFFIC SAFETY RECORD
                </span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 uppercase font-sans">
                Accident Incident Dossier
              </h1>
              <p className="text-xs text-slate-600">
                Official First Responder Triage & Eyewitness Collision Log
              </p>
            </div>

            <div className="text-right">
              <div className="inline-block border-2 border-slate-900 px-3 py-1 bg-slate-50 font-mono text-sm font-black tracking-wider text-slate-950">
                ID: {report.reportId}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Printed: {printTimestamp}
              </p>
            </div>
          </div>
        </div>

        {/* Status & Priority Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-300 rounded-lg p-3 mb-6 print:bg-slate-100">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Incident Status
            </span>
            <span className="text-sm font-black text-slate-900">
              {report.status.toUpperCase()}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Priority Classification
            </span>
            <span className={`text-sm font-black ${
              report.priority === 'Critical' || report.priority === 'High'
                ? 'text-red-700'
                : report.priority === 'Medium'
                ? 'text-amber-700'
                : 'text-emerald-700'
            }`}>
              {report.priority.toUpperCase()} PRIORITY
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Date Logged
            </span>
            <span className="text-xs font-bold text-slate-900">
              {formattedDate}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Time Received
            </span>
            <span className="text-xs font-bold text-slate-900 font-mono">
              {formattedTime}
            </span>
          </div>
        </div>

        {/* Two-Column Grid: Location & Caller Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Location Box */}
          <div className="border border-slate-300 rounded-lg p-4 bg-white space-y-3">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
              <MapPin className="w-4 h-4 text-red-600" />
              <span>Geographic Location & Coordinates</span>
            </h2>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Reported Address</span>
                <p className="font-semibold text-slate-900 mt-0.5 leading-snug">
                  {report.address}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Latitude</span>
                  <p className="font-mono font-bold text-slate-800">{report.latitude.toFixed(6)}°</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Longitude</span>
                  <p className="font-mono font-bold text-slate-800">{report.longitude.toFixed(6)}°</p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Navigation Coordinate Link</span>
                <p className="font-mono text-[10px] text-slate-600 truncate underline mt-0.5">
                  {report.googleMapsUrl}
                </p>
              </div>
            </div>
          </div>

          {/* Caller & Distress Message Box */}
          <div className="border border-slate-300 rounded-lg p-4 bg-white space-y-3">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
              <Phone className="w-4 h-4 text-blue-600" />
              <span>Reporting Citizen & Distress Message</span>
            </h2>

            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Caller Name</span>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {report.senderInfo?.name || 'Eyewitness (Anonymous)'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Contact Phone</span>
                  <p className="font-mono font-semibold text-slate-900 mt-0.5">
                    {report.senderInfo?.phone || 'Not Provided'}
                  </p>
                </div>
              </div>

              {report.quickMessageType && (
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Report Category</span>
                  <p className="font-bold text-red-700 mt-0.5">
                    {report.quickMessageType}
                  </p>
                </div>
              )}

              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Emergency Message</span>
                <blockquote className="italic font-medium text-slate-800 bg-slate-50 p-2.5 rounded border border-slate-200 mt-1">
                  "{report.emergencyMessage}"
                </blockquote>
              </div>

              {(report.voiceMessageUrl || report.voiceTranscript) && (
                <div className="pt-1 border-t border-slate-100">
                  <span className="text-[10px] font-bold text-red-700 uppercase block">
                    Attached Voice Message ({report.voiceMessageDurationSec || 1}s audio recorded)
                  </span>
                  {report.voiceTranscript && (
                    <p className="text-xs italic text-slate-700 mt-0.5">
                      Voice Transcript: "{report.voiceTranscript}"
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI / Triage Hazard Assessment */}
        <div className="border border-slate-300 rounded-lg p-4 bg-white mb-6 space-y-2">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Triage Hazard Evaluation & Assessment</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
            <div className="sm:col-span-2 space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Triage Rationale</span>
              <p className="text-slate-800 font-medium leading-relaxed">
                {report.priorityReason || report.aiAnalysis?.priorityReason || 'Assigned based on initial rapid caller message and incident severity protocol.'}
              </p>
            </div>

            {report.aiAnalysis?.criticalHazardBadge && (
              <div className="bg-red-50 border border-red-200 p-2.5 rounded">
                <span className="text-[10px] font-bold text-red-700 uppercase block">Critical Hazard</span>
                <p className="text-xs font-extrabold text-red-900 mt-0.5">
                  {report.aiAnalysis.criticalHazardBadge}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Scene Photograph Section */}
        <div className="border border-slate-300 rounded-lg p-4 bg-white mb-6 page-break-inside-avoid">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center justify-between border-b border-slate-200 pb-1.5 mb-3">
            <span>Photographic Evidence Record</span>
            <span className="text-[10px] text-slate-500 font-mono">SCENE CAMERA RECORD</span>
          </h2>

          {report.photoUrl ? (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-full sm:w-64 max-h-52 overflow-hidden rounded border border-slate-300 bg-slate-100 flex items-center justify-center">
                <img
                  src={report.photoUrl}
                  alt={`Incident ${report.reportId} scene`}
                  className="max-h-52 w-auto object-contain mx-auto"
                  crossOrigin="anonymous"
                />
              </div>
              <div className="flex-1 text-xs space-y-1.5">
                <div className="flex items-center gap-1 text-emerald-700 font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Scene Photo Captured at Dispatch Time</span>
                </div>
                <p className="text-slate-600">
                  Image submitted with report metadata. High resolution photo stored in emergency system archives.
                </p>
                <div className="text-[10px] font-mono text-slate-500 pt-2 border-t border-slate-100">
                  REF: {report.id}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-slate-400 italic bg-slate-50 rounded border border-dashed border-slate-200">
              No photographic evidence submitted by the citizen at the time of reporting.
            </div>
          )}
        </div>

        {/* First Responder & Dispatch Sign-off Section */}
        <div className="border border-slate-300 rounded-lg p-4 bg-white mb-6 page-break-inside-avoid">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-1.5 mb-3">
            On-Scene First Responder Verification & Dispatch Log
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs mb-4">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Responding Unit ID</span>
              <div className="border-b border-slate-400 h-6"></div>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Officer / Medic in Charge</span>
              <div className="border-b border-slate-400 h-6"></div>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Badge / License #</span>
              <div className="border-b border-slate-400 h-6"></div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-xs mb-4">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Departure Time</span>
              <div className="border-b border-slate-400 h-6"></div>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">On-Scene Arrival Time</span>
              <div className="border-b border-slate-400 h-6"></div>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Incident Cleared Time</span>
              <div className="border-b border-slate-400 h-6"></div>
            </div>
          </div>

          <div className="text-xs mb-4">
            <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Field Action Taken / Transport Facility Notes
            </span>
            <div className="border-b border-slate-300 h-6"></div>
            <div className="border-b border-slate-300 h-6 mt-1"></div>
          </div>

          <div className="grid grid-cols-2 gap-6 text-xs pt-2">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Officer Signature</span>
              <div className="border-b border-slate-800 h-8"></div>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Verification Date</span>
              <div className="border-b border-slate-800 h-8"></div>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="border-t border-slate-200 pt-3 text-[10px] text-slate-400 flex items-center justify-between">
          <span>Accident Alert Rapid Response System • Emergency Record Archive</span>
          <span>Doc ID: {report.id}</span>
        </div>
      </div>
    </div>
  );
};

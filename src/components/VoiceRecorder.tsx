import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, CheckCircle2, Volume2, AlertCircle } from 'lucide-react';

interface VoiceRecorderProps {
  voiceUrl: string | null;
  durationSec: number;
  transcript: string;
  onVoiceRecorded: (dataUrl: string, durationSec: number, transcript: string) => void;
  onVoiceCleared: () => void;
}

const MAX_RECORDING_SECONDS = 30;

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  voiceUrl,
  durationSec,
  transcript,
  onVoiceRecorded,
  onVoiceCleared,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);
  const transcriptAccumRef = useRef<string>('');

  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      recognitionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  };

  const startRecording = async () => {
    setError(null);
    setLiveTranscript('');
    transcriptAccumRef.current = '';
    chunksRef.current = [];

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Microphone recording is not supported in this browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick compact audio MIME type for fast Firestore sync
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      const supportedMime = mimeTypes.find((type) =>
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)
      );

      const recorder = new MediaRecorder(stream, {
        ...(supportedMime ? { mimeType: supportedMime } : {}),
        audioBitsPerSecond: 24000,
      });

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const finalDuration = Math.max(
          1,
          Math.round((Date.now() - startTimeRef.current) / 1000)
        );
        const blobType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(chunksRef.current, { type: blobType });

        cleanup();

        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            onVoiceRecorded(
              reader.result,
              finalDuration,
              transcriptAccumRef.current.trim()
            );
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      // Optional live browser SpeechRecognition transcript (non-blocking)
      const SpeechRecognitionClass =
        (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
          .SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

      if (SpeechRecognitionClass) {
        try {
          const recognition = new SpeechRecognitionClass();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';
          recognition.onresult = (event: any) => {
            let finalText = '';
            let interimText = '';
            for (let i = 0; i < event.results.length; i++) {
              const res = event.results[i];
              if (res.isFinal) {
                finalText += res[0].transcript + ' ';
              } else {
                interimText += res[0].transcript;
              }
            }
            const combined = `${finalText}${interimText}`.trim();
            transcriptAccumRef.current = combined;
            setLiveTranscript(combined);
          };
          recognition.onerror = () => {
            // Non-fatal if speech recognition isn't available offline
          };
          recognition.start();
          recognitionRef.current = recognition;
        } catch {
          // Ignore SpeechRecognition startup issues
        }
      }

      startTimeRef.current = Date.now();
      setElapsedSec(0);
      setIsRecording(true);
      recorder.start(250);

      timerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedSec(secs);
        if (secs >= MAX_RECORDING_SECONDS) {
          stopRecording();
        }
      }, 250);
    } catch (err) {
      console.warn('Microphone access denied or unavailable:', err);
      cleanup();
      setError('Microphone permission denied or unavailable. Please allow mic access to record a voice message.');
    }
  };

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  return (
    <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-red-600 dark:text-red-400" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
            Voice Emergency Message (Audio Note)
          </span>
        </div>
        <span className="text-[10px] font-semibold text-slate-400">Max {MAX_RECORDING_SECONDS}s</span>
      </div>

      {error && (
        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {voiceUrl ? (
        <div className="space-y-2 bg-white dark:bg-slate-900 p-3 rounded-xl border border-emerald-300 dark:border-emerald-800">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Voice Message Recorded ({formatTimer(durationSec)})
            </span>
            <button
              type="button"
              onClick={onVoiceCleared}
              className="text-red-600 dark:text-red-400 hover:underline font-bold flex items-center gap-1 cursor-pointer text-[11px]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>

          <audio controls src={voiceUrl} className="w-full h-9" />

          {transcript && (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 italic bg-slate-50 dark:bg-slate-800 p-2 rounded-lg">
              Transcript: "{transcript}"
            </p>
          )}
        </div>
      ) : isRecording ? (
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-600 animate-ping" />
              <span className="text-xs font-black text-red-700 dark:text-red-300">
                Recording Voice Alert... {formatTimer(elapsedSec)}
              </span>
            </div>

            <button
              type="button"
              onClick={stopRecording}
              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop & Attach</span>
            </button>
          </div>

          {liveTranscript && (
            <p className="text-[11px] text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-900/70 p-2 rounded-lg">
              "{liveTranscript}"
            </p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={startRecording}
          className="w-full py-2.5 px-4 bg-white dark:bg-slate-900 hover:bg-red-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-red-400 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
        >
          <Mic className="w-4 h-4 text-red-600 dark:text-red-400" />
          <span>Record Voice Message (Bolkar Emergency Batayein)</span>
        </button>
      )}
    </div>
  );
};

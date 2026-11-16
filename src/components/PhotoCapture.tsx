import React, { useState, useRef, useEffect } from 'react';
import { Camera, Image as ImageIcon, X, RefreshCw, Zap, CheckCircle2, Loader2 } from 'lucide-react';

interface PhotoCaptureProps {
  photoData: string | null;
  onPhotoSelected: (base64: string, shouldInstantDispatch?: boolean) => void;
  onPhotoCleared: () => void;
  instantDispatch?: boolean;
  isSubmitting?: boolean;
}

// Sample real-world accident images with valid data URLs for 1-click testing
const SAMPLE_ACCIDENTS = [
  {
    name: 'Frontal Crash',
    desc: 'Two-car intersection collision with heavy front bumper crush',
    url: 'https://images.unsplash.com/photo-1543393470-b2c650b2a759?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Highway Rollover',
    desc: 'SUV overturned on expressway with debris across lanes',
    url: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Rear Collision',
    desc: 'Sedan rear-ended at traffic signal with shattered glass',
    url: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=800&q=80',
  },
];

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({
  photoData,
  onPhotoSelected,
  onPhotoCleared,
  instantDispatch = true,
  isSubmitting = false,
}) => {
  const [isLiveCameraActive, setIsLiveCameraActive] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [streamVersion, setStreamVersion] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stop camera stream helper
  const stopCamera = () => {
    if (readyTimeoutRef.current) {
      clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraReady(false);
    setIsLiveCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Attach MediaStream AFTER <video> element has actually mounted in DOM
  useEffect(() => {
    if (!isLiveCameraActive || !streamRef.current || !videoRef.current) return;

    const video = videoRef.current;
    const stream = streamRef.current;

    setIsCameraReady(false);
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;

    const markReadyWhenFramesFlow = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
        // Brief 250ms exposure settle so camera sensor does not capture initial dark frame
        if (readyTimeoutRef.current) clearTimeout(readyTimeoutRef.current);
        readyTimeoutRef.current = setTimeout(() => {
          setIsCameraReady(true);
        }, 250);
      }
    };

    const handlePlaying = () => markReadyWhenFramesFlow();
    const handleLoadedData = () => markReadyWhenFramesFlow();
    const handleCanPlay = () => markReadyWhenFramesFlow();

    video.addEventListener('playing', handlePlaying);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('canplay', handleCanPlay);

    video.play().catch((playErr) => {
      console.warn('Video autoplay play() notice:', playErr);
    });

    // If metadata was already ready synchronously
    if (video.readyState >= 2 && video.videoWidth > 0) {
      markReadyWhenFramesFlow();
    }

    return () => {
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('canplay', handleCanPlay);
      if (readyTimeoutRef.current) {
        clearTimeout(readyTimeoutRef.current);
        readyTimeoutRef.current = null;
      }
    };
  }, [isLiveCameraActive, streamVersion]);

  const startCamera = async (targetFacing: 'environment' | 'user' = facingMode) => {
    setCameraError(null);
    stopCamera();
    setIsStartingCamera(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API unavailable in this browser context');
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        // Fallback to default camera without strict facingMode/resolution constraints
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;
      setStreamVersion((v) => v + 1);
      setIsLiveCameraActive(true);
    } catch (err: unknown) {
      console.warn('Camera access issue:', err);
      setCameraError('Camera access unavailable. You can upload a photo or select a quick scenario below.');
      setIsLiveCameraActive(false);
    } finally {
      setIsStartingCamera(false);
    }
  };

  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video) return;

    // Wait briefly for live frame dimensions if sensor is still initializing
    if (video.videoWidth === 0 || video.videoHeight === 0 || video.readyState < 2) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1200);
        const onReady = () => {
          if (video.videoWidth > 0 && video.readyState >= 2) {
            clearTimeout(timeout);
            video.removeEventListener('loadeddata', onReady);
            video.removeEventListener('playing', onReady);
            setTimeout(resolve, 200);
          }
        };
        video.addEventListener('loadeddata', onReady);
        video.addEventListener('playing', onReady);
      });
    }

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('Camera frame not ready yet. Please allow camera permission or wait 1 second and try again.');
      return;
    }

    // Wait for next animation frame so GPU compositor has painted current frame
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);

    stopCamera();
    onPhotoSelected(dataUrl, instantDispatch);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onPhotoSelected(reader.result, instantDispatch);
      }
    };
    reader.readAsDataURL(file);
    // Reset input
    e.target.value = '';
  };

  const toggleCameraFacing = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Convert an external sample photo to Base64 data URL so server can analyze it smoothly
  const handleSampleSelected = async (sampleUrl: string) => {
    try {
      const response = await fetch(sampleUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          onPhotoSelected(reader.result, instantDispatch);
        }
      };
      reader.readAsDataURL(blob);
    } catch {
      onPhotoSelected(sampleUrl, instantDispatch);
    }
  };

  return (
    <div className="w-full">
      {/* Hidden File Input for Gallery / Native Camera */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Captured Photo Preview State */}
      {photoData ? (
        <div className="relative rounded-2xl overflow-hidden border-2 border-red-500 shadow-lg bg-slate-900 group">
          <img
            src={photoData}
            alt="Accident Scene"
            className="w-full h-64 object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

          {/* Badge */}
          <div className="absolute top-3 left-3 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-md">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Accident Photo Attached</span>
          </div>

          {/* Remove / Retake Actions */}
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onPhotoCleared();
                startCamera();
              }}
              className="bg-black/60 hover:bg-black/80 backdrop-blur text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition"
            >
              <RefreshCw className="w-3 h-3" /> Retake
            </button>
            <button
              type="button"
              onClick={onPhotoCleared}
              className="bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-lg transition shadow"
              title="Remove Photo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="absolute bottom-3 left-3 right-3 text-white text-xs opacity-90">
            <span>Ready for emergency transmission to response units</span>
          </div>
        </div>
      ) : isLiveCameraActive ? (
        /* Live Camera Viewfinder */
        <div className="relative rounded-2xl overflow-hidden border-2 border-red-500 bg-black shadow-xl">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-72 object-cover bg-slate-950"
          />

          {/* Camera sensor initializing overlay until real video frames arrive */}
          {!isCameraReady && (
            <div className="absolute inset-0 bg-slate-950/85 flex flex-col items-center justify-center gap-2 text-white z-10 pointer-events-none">
              <Loader2 className="w-7 h-7 animate-spin text-red-500" />
              <span className="text-xs font-bold tracking-wide">Starting live camera lens...</span>
            </div>
          )}

          {/* Grid lines overlay */}
          <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-white/20">
            <div className="border-r border-b border-white/15"></div>
            <div className="border-r border-b border-white/15"></div>
            <div className="border-b border-white/15"></div>
            <div className="border-r border-b border-white/15"></div>
            <div className="border-r border-b border-white/15"></div>
            <div className="border-b border-white/15"></div>
          </div>

          {/* Viewfinder Controls */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-white z-20">
            <span className="bg-red-600 text-[11px] font-bold px-2.5 py-0.5 rounded-full animate-pulse flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-white"></span>
              {isCameraReady ? 'LIVE CAMERA' : 'WARMING UP...'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleCameraFacing}
                className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white cursor-pointer"
                title="Switch Camera"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={stopCamera}
                className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white cursor-pointer"
                title="Close Camera"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Capture Trigger Button */}
          <div className="absolute bottom-3 inset-x-0 flex flex-col items-center justify-center gap-1.5 pointer-events-auto z-20">
            <button
              type="button"
              onClick={captureFrame}
              disabled={isSubmitting || !isCameraReady}
              className="w-16 h-16 rounded-full border-4 border-white bg-red-600 hover:bg-red-700 shadow-2xl flex items-center justify-center transition-transform active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-wait"
              title="Snap & Send Instantly to Dashboard 2"
            >
              <div className="w-12 h-12 rounded-full bg-white/20 border-2 border-white/60"></div>
            </button>
            <span className="text-[10px] font-black text-white bg-black/80 backdrop-blur px-3 py-0.5 rounded-full uppercase tracking-wider shadow">
              {!isCameraReady
                ? 'Waiting for camera feed...'
                : instantDispatch
                ? '⚡ Click = Instant Send to Dashboard 2'
                : 'Capture Photo'}
            </span>
          </div>
        </div>
      ) : (
        /* Empty State with Large Camera Button & Gallery Upload */
        <div className="space-y-3">
          <div className="p-5 border-2 border-dashed border-red-300 dark:border-red-900/60 hover:border-red-500 rounded-2xl bg-red-50/40 dark:bg-slate-900/60 text-center transition-colors">
            {cameraError && (
              <div className="mb-3 p-2 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs rounded-xl">
                {cameraError}
              </div>
            )}

            <div className="flex flex-col items-center justify-center gap-3">
              {/* Primary Big Camera Button */}
              <button
                type="button"
                onClick={() => startCamera()}
                disabled={isStartingCamera}
                className="w-full py-4 px-6 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold shadow-lg hover:shadow-red-500/25 transition-all flex items-center justify-center gap-3 cursor-pointer group active:scale-[0.98] disabled:opacity-70"
              >
                <div className="p-2 bg-white/20 rounded-xl group-hover:scale-110 transition-transform">
                  {isStartingCamera ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6" />
                  )}
                </div>
                <div className="text-left">
                  <div className="text-base font-extrabold uppercase tracking-wide flex items-center gap-2">
                    <span>{isStartingCamera ? 'Opening Camera...' : 'Click Accident Photo'}</span>
                    {instantDispatch && (
                      <span className="text-[10px] bg-white text-red-700 px-1.5 py-0.5 rounded font-black tracking-normal uppercase">
                        ⚡ Auto-Send
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-normal text-red-100">
                    {instantDispatch
                      ? 'Photo click karte hi Dashboard 2 & WhatsApp Contacts par chali jayegi'
                      : 'Open phone camera for live capture'}
                  </div>
                </div>
              </button>

              <div className="text-xs font-medium text-slate-400 dark:text-slate-500">or choose from device</div>

              {/* Gallery Upload Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl font-semibold shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <ImageIcon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <span>Upload Photo from Gallery {instantDispatch && '(Auto-Dispatches)'}</span>
              </button>
            </div>
          </div>

          {/* Quick Simulation Scenarios for Instant Testing */}
          <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>Quick Test Scenarios (1-Click Test Accidents)</span>
              </div>
              {instantDispatch && (
                <span className="text-[10px] font-extrabold text-red-600 dark:text-red-400">
                  ⚡ 1-Click Send to Dashboard 2
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SAMPLE_ACCIDENTS.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSampleSelected(sample.url)}
                  className="flex flex-col items-center p-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 hover:border-red-300 transition text-left cursor-pointer group"
                >
                  <img
                    src={sample.url}
                    alt={sample.name}
                    className="w-full h-12 object-cover rounded-md mb-1.5 group-hover:brightness-95"
                  />
                  <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 group-hover:text-red-700 dark:group-hover:text-red-400 truncate w-full text-center">
                    {sample.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

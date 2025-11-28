import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, CameraOff, Video, AlertCircle, Settings, Globe, Monitor, Hourglass, RefreshCw } from 'lucide-react';
import { analyzeTrafficFrame } from '../services/geminiService';
import { TrafficAnalysisResult, BoundingBox } from '../types';

interface CameraFeedProps {
  isAnalyzing: boolean;
  onAnalysisComplete: (result: TrafficAnalysisResult) => void;
  onError: (error: string) => void;
  intervalMs: number;
}

type VideoSource = 'webcam' | 'url';

const CameraFeed: React.FC<CameraFeedProps> = ({ 
  isAnalyzing, 
  onAnalysisComplete, 
  onError,
  intervalMs 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Track consecutive errors for exponential backoff
  const errorCountRef = useRef(0);
  const nextRetryTimeRef = useRef<number>(0);
  
  const [sourceType, setSourceType] = useState<VideoSource>('webcam');
  const [urlInput, setUrlInput] = useState('');
  const [activeUrl, setActiveUrl] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [permissionErrorMsg, setPermissionErrorMsg] = useState("");
  const [detectedBoxes, setDetectedBoxes] = useState<BoundingBox[]>([]);
  
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(0);

  // Initialize Camera
  const startCamera = async () => {
    try {
      if (videoRef.current && videoRef.current.srcObject) {
         // Stop existing stream
         const stream = videoRef.current.srcObject as MediaStream;
         stream.getTracks().forEach(track => track.stop());
         videoRef.current.srcObject = null;
      }

      // Use lower resolution to save bandwidth/processing and reduce potential for payload errors
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.src = ""; // Clear src if switching from URL
        setIsStreamActive(true);
        setPermissionDenied(false);
        setPermissionErrorMsg("");
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      setPermissionDenied(true);
      setIsStreamActive(false);
      
      let msg = "Could not access camera.";
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          msg = "Camera permission denied. Please allow access in your browser settings (lock icon).";
      } else if (err.name === 'NotFoundError') {
          msg = "No camera device found.";
      } else if (err.name === 'NotReadableError') {
          msg = "Camera is currently in use by another application.";
      }
      setPermissionErrorMsg(msg);
      onError(msg);
    }
  };

  // Initialize URL Stream
  const startUrlStream = () => {
    if (!activeUrl) return;
    
    if (videoRef.current) {
        if (videoRef.current.srcObject) {
             const stream = videoRef.current.srcObject as MediaStream;
             stream.getTracks().forEach(track => track.stop());
             videoRef.current.srcObject = null;
        }
        videoRef.current.src = activeUrl;
        videoRef.current.load();
        
        videoRef.current.play().then(() => {
            setIsStreamActive(true);
            setPermissionDenied(false);
        }).catch(err => {
            console.error("URL Playback error:", err);
            setIsStreamActive(false);
            onError("Could not play video from URL. Check format or CORS.");
        });
    }
  };

  // Switch Handler
  useEffect(() => {
    setIsStreamActive(false);
    setDetectedBoxes([]); // Clear boxes on source change
    
    if (sourceType === 'webcam') {
        startCamera();
    } else {
        startUrlStream();
    }

    return () => {
        // Cleanup
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
        }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceType, activeUrl]);

  // Capture Logic
  // Returns promise that resolves when complete or fails
  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !isStreamActive) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Draw video frame to canvas
    try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Get base64 data - Use 0.7 quality to reduce payload size
        const base64Image = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
        
        const result = await analyzeTrafficFrame(base64Image);
        
        // Update local state for overlays
        setDetectedBoxes(result.detectedObjects);
        setIsRateLimited(false);
        
        // Propagate result up
        onAnalysisComplete(result);
    } catch (err: any) {
        // Check for CORS error specifically
        if (err.name === 'SecurityError') {
             onError("CORS Error: Cannot analyze this video stream. The server must allow cross-origin access (Access-Control-Allow-Origin).");
        } else {
             // Propagate other errors to the loop
             throw err;
        }
    }
  }, [isStreamActive, onAnalysisComplete, onError]);

  // Force Retry Handler
  const handleForceRetry = () => {
      // Reset error count and trigger loop immediately via state/ref reset could be complex,
      // easiest is to let the loop logic handle it by resetting the timestamp
      errorCountRef.current = 0;
      nextRetryTimeRef.current = 0; 
      setIsRateLimited(false);
  };

  // Smart Analysis Loop
  useEffect(() => {
    let timeoutId: number;
    let isMounted = true;
    let countdownInterval: number;

    const loop = async () => {
      if (!isAnalyzing || !isStreamActive) return;

      // Check if we need to wait (if manually forced retry, this check passes)
      if (Date.now() < nextRetryTimeRef.current) {
           timeoutId = window.setTimeout(loop, 1000); // Check again in 1s
           return;
      }

      try {
        await captureAndAnalyze();
        
        // Success: Reset error count and schedule next run
        if (isMounted && isAnalyzing) {
          errorCountRef.current = 0;
          setIsRateLimited(false);
          timeoutId = window.setTimeout(loop, intervalMs);
        }
      } catch (err: any) {
        
        // Check for Quota/Rate Limit Error
        const errorMessage = err.message || JSON.stringify(err);
        const isQuota = errorMessage.includes('QUOTA_EXCEEDED') || 
                        errorMessage.includes('429') || 
                        errorMessage.includes('RESOURCE_EXHAUSTED');

        if (isMounted && isAnalyzing) {
            if (isQuota) {
                // Increment error count for exponential backoff
                errorCountRef.current += 1;
                
                // Backoff: 10s, 20s, 40s... Cap at 2 minutes.
                // Start with smaller backoff (10s) to be less annoying
                const backoffMs = Math.min(10000 * Math.pow(2, errorCountRef.current - 1), 120000);
                
                nextRetryTimeRef.current = Date.now() + backoffMs;
                setIsRateLimited(true);
                
                // Start countdown for UI
                let remaining = backoffMs;
                setRetryCountdown(Math.ceil(remaining/1000));
                
                if (countdownInterval) clearInterval(countdownInterval);
                countdownInterval = window.setInterval(() => {
                    remaining -= 1000;
                    if (remaining <= 0) clearInterval(countdownInterval);
                    setRetryCountdown(Math.max(0, Math.ceil(remaining/1000)));
                }, 1000);

                console.warn(`Rate limit hit. Backing off for ${backoffMs / 1000}s`);
                
                timeoutId = window.setTimeout(loop, backoffMs);

            } else {
                // Non-critical error (e.g. temporary network blip)
                console.warn("Temporary analysis error, retrying...", err);
                timeoutId = window.setTimeout(loop, intervalMs * 1.5);
            }
        }
      }
    };

    if (isAnalyzing && isStreamActive) {
      loop();
    } else {
      // Reset state if stopped
      errorCountRef.current = 0;
      nextRetryTimeRef.current = 0;
      setIsRateLimited(false);
    }

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
      window.clearInterval(countdownInterval);
    };
  }, [isAnalyzing, isStreamActive, intervalMs, captureAndAnalyze, isRateLimited]); // dependency isRateLimited added to re-trigger if forced to false

  const handleUrlSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (urlInput) {
          setActiveUrl(urlInput);
          setShowSettings(false);
      }
  };

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-800 group">
      {/* Loading / Offline States */}
      {!isStreamActive && !permissionDenied && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500 z-10">
          <div className="text-center">
            {sourceType === 'webcam' ? (
                 <Camera className="w-12 h-12 mx-auto mb-2 animate-pulse" />
            ) : (
                 <Globe className="w-12 h-12 mx-auto mb-2 animate-pulse" />
            )}
            <p>Initializing Source...</p>
          </div>
        </div>
      )}
      
      {permissionDenied && (
        <div className="absolute inset-0 flex items-center justify-center text-red-400 bg-slate-900/90 z-20">
          <div className="text-center p-6 max-w-sm">
            <CameraOff className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="font-bold text-lg mb-2">Camera Access Blocked</p>
            <p className="text-sm text-slate-400 mb-6">{permissionErrorMsg || "Please enable camera permissions in your browser settings and try again."}</p>
            
            <button 
                onClick={() => { setPermissionDenied(false); startCamera(); }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-lg"
            >
                Retry Access
            </button>
            <div className="mt-4">
                <button 
                    onClick={() => { setSourceType('url'); setPermissionDenied(false); }}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                >
                    Or use a Video URL instead
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden canvas for processing */}
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Video Element */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        loop
        crossOrigin="anonymous" 
        className="w-full h-full object-cover"
      />

      {/* Bounding Box Overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {detectedBoxes.map((box, index) => (
            <div
                key={index}
                className="absolute border-2 border-green-500/70 bg-green-500/10 transition-all duration-300 ease-out"
                style={{
                    top: `${box.ymin * 100}%`,
                    left: `${box.xmin * 100}%`,
                    height: `${(box.ymax - box.ymin) * 100}%`,
                    width: `${(box.xmax - box.xmin) * 100}%`
                }}
            >
                <span className="absolute -top-6 left-0 bg-green-500/90 text-slate-900 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase shadow-sm">
                    {box.label}
                </span>
            </div>
        ))}
      </div>

      {/* Status Overlay */}
      <div className="absolute top-4 left-4 flex gap-2 z-30 flex-wrap">
        <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-medium text-white border border-white/10">
          {isStreamActive ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              {sourceType === 'webcam' ? 'LIVE FEED' : 'URL STREAM'}
            </>
          ) : (
            <>
              <Video className="w-3 h-3 text-slate-400" />
              OFFLINE
            </>
          )}
        </div>
        
        {isAnalyzing && !isRateLimited && (
           <div className="flex items-center gap-2 bg-indigo-500/80 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-medium text-white animate-pulse border border-indigo-400/30">
             ANALYZING
           </div>
        )}

        {isRateLimited && (
           <button 
             onClick={handleForceRetry}
             className="flex items-center gap-2 bg-amber-600/90 hover:bg-amber-500 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-medium text-white border border-amber-500/30 shadow-lg transition-colors cursor-pointer group"
             title="Click to force retry now"
           >
             <Hourglass className="w-3 h-3" />
             QUOTA PAUSE ({retryCountdown}s)
             <RefreshCw className="w-3 h-3 ml-1 opacity-50 group-hover:opacity-100" />
           </button>
        )}
      </div>

      {/* Settings Toggle */}
      <button 
        onClick={() => setShowSettings(!showSettings)}
        className="absolute top-4 right-4 p-2 bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-full text-white border border-white/10 transition-colors z-30"
      >
        <Settings className="w-4 h-4" />
      </button>

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute top-16 right-4 w-72 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-xl p-4 shadow-2xl z-40 animate-in fade-in slide-in-from-top-2">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Input Source</h3>
            
            <div className="flex bg-slate-800 p-1 rounded-lg mb-4">
                <button 
                    onClick={() => setSourceType('webcam')}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${
                        sourceType === 'webcam' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                    }`}
                >
                    <Monitor className="w-3 h-3" /> Webcam
                </button>
                <button 
                    onClick={() => setSourceType('url')}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${
                        sourceType === 'url' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                    }`}
                >
                    <Globe className="w-3 h-3" /> URL
                </button>
            </div>

            {sourceType === 'url' && (
                <form onSubmit={handleUrlSubmit} className="space-y-2">
                    <label className="text-xs text-slate-500">Video URL (Direct/MJPEG)</label>
                    <input 
                        type="url" 
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <button 
                        type="submit"
                        className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2 rounded-lg transition-colors border border-slate-700"
                    >
                        Load Stream
                    </button>
                    <p className="text-[10px] text-slate-500 leading-tight">
                        Note: URL must support CORS (Access-Control-Allow-Origin) for analysis to work.
                    </p>
                </form>
            )}
        </div>
      )}
    </div>
  );
};

export default CameraFeed;
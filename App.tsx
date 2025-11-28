import React, { useState, useCallback } from 'react';
import { Activity, Car, AlertTriangle, Play, Pause, Info, BarChart3, Video } from 'lucide-react';
import CameraFeed from './components/CameraFeed';
import AnalysisChart from './components/AnalysisChart';
import { TrafficAnalysisResult, CongestionLevel } from './types';

const App: React.FC = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [history, setHistory] = useState<TrafficAnalysisResult[]>([]);
  const [latestResult, setLatestResult] = useState<TrafficAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalysisComplete = useCallback((result: TrafficAnalysisResult) => {
    setLatestResult(result);
    setHistory(prev => [...prev, result].slice(-50)); // Keep last 50 records
    setError(null);
  }, []);

  const handleError = useCallback((err: string) => {
    setError(err);
    setIsAnalyzing(false);
  }, []);

  const toggleAnalysis = () => {
    setIsAnalyzing(prev => !prev);
    // Clear error on restart
    if (!isAnalyzing) setError(null);
  };

  const getCongestionColor = (level?: CongestionLevel) => {
    switch (level) {
      case CongestionLevel.LOW: return 'text-emerald-400';
      case CongestionLevel.MEDIUM: return 'text-amber-400';
      case CongestionLevel.HIGH: return 'text-red-500';
      default: return 'text-slate-400';
    }
  };

  const getCongestionBg = (level?: CongestionLevel) => {
    switch (level) {
      case CongestionLevel.LOW: return 'bg-emerald-500/10 border-emerald-500/20';
      case CongestionLevel.MEDIUM: return 'bg-amber-500/10 border-amber-500/20';
      case CongestionLevel.HIGH: return 'bg-red-500/10 border-red-500/20';
      default: return 'bg-slate-800/50 border-slate-700';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans selection:bg-indigo-500/30">
      
      {/* Header */}
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <Activity className="w-6 h-6 text-white" />
            </div>
            TrafficSense AI
          </h1>
          <p className="text-slate-400 mt-1 max-w-xl">
            Real-time optical flow analysis using Gemini Vision. 
            Detects vehicles, estimates density, and tracks congestion trends.
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:block text-right">
             <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Status</div>
             <div className="flex items-center justify-end gap-2">
                <div className={`w-2 h-2 rounded-full ${isAnalyzing ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`}></div>
                <span className="font-medium text-slate-300">{isAnalyzing ? 'System Active' : 'System Standby'}</span>
             </div>
          </div>
          <button
            onClick={toggleAnalysis}
            className={`
              flex items-center gap-2 px-6 py-3 rounded-lg font-bold transition-all shadow-lg hover:shadow-xl active:scale-95
              ${isAnalyzing 
                ? 'bg-red-500/10 text-red-400 border border-red-500/50 hover:bg-red-500/20' 
                : 'bg-indigo-600 text-white hover:bg-indigo-500 border border-indigo-400/50'}
            `}
          >
            {isAnalyzing ? (
              <>
                <Pause className="w-5 h-5 fill-current" /> Stop Analysis
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" /> Start Analysis
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Video Feed */}
        <div className="lg:col-span-2 space-y-6">
          <div className="aspect-video w-full rounded-2xl overflow-hidden shadow-2xl ring-1 ring-slate-700 bg-slate-900 relative">
            <CameraFeed 
              isAnalyzing={isAnalyzing} 
              onAnalysisComplete={handleAnalysisComplete}
              onError={handleError}
              intervalMs={20000} // Increased to 20s to be safe
            />
          </div>

          {/* Error Banner */}
          {error && (
            <div className="bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-xl flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Quick Explanation */}
          <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl text-sm text-slate-400 flex gap-3">
            <Info className="w-5 h-5 flex-shrink-0 text-indigo-400" />
            <p>
              This application captures frames from your webcam and sends them to the Gemini 2.5 Flash model. 
              The AI counts vehicles and categorizes congestion based on visual density, effectively replacing traditional 
              background subtraction algorithms (like MOG2) with semantic understanding.
            </p>
          </div>
        </div>

        {/* Right Column: Dashboard Stats */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Real-time Status Card */}
          <div className={`p-6 rounded-2xl border transition-all duration-500 ${getCongestionBg(latestResult?.congestionLevel)}`}>
            <h2 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-4 flex items-center gap-2">
              <Video className="w-4 h-4" /> Current Traffic State
            </h2>
            
            <div className="flex justify-between items-end mb-6">
              <div>
                <div className="text-4xl font-bold text-white tabular-nums tracking-tight">
                  {latestResult ? latestResult.vehicleCount : '--'}
                </div>
                <div className="text-sm text-slate-400">Vehicles Detected</div>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold ${getCongestionColor(latestResult?.congestionLevel)}`}>
                  {latestResult ? latestResult.congestionLevel : 'Idle'}
                </div>
                <div className="text-xs text-slate-500 uppercase tracking-wide font-bold">Congestion Level</div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="h-1.5 w-full bg-slate-700/50 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${
                    latestResult?.congestionLevel === CongestionLevel.HIGH ? 'bg-red-500 w-full' :
                    latestResult?.congestionLevel === CongestionLevel.MEDIUM ? 'bg-amber-400 w-2/3' :
                    latestResult?.congestionLevel === CongestionLevel.LOW ? 'bg-emerald-400 w-1/3' : 'w-0'
                  }`}
                />
              </div>
              <p className="text-sm text-slate-300 italic min-h-[3rem]">
                {latestResult?.description || "Waiting for analysis stream..."}
              </p>
            </div>
          </div>

          {/* Chart Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
             <h2 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-6 flex items-center gap-2">
               <BarChart3 className="w-4 h-4" /> Density Trend (Last Min)
             </h2>
             <AnalysisChart history={history} />
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
             <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <div className="text-slate-500 text-xs font-bold uppercase mb-1">Peak Count</div>
                <div className="text-2xl font-bold text-white">
                  {Math.max(...history.map(h => h.vehicleCount), 0)}
                </div>
             </div>
             <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <div className="text-slate-500 text-xs font-bold uppercase mb-1">Samples</div>
                <div className="text-2xl font-bold text-indigo-400">
                  {history.length}
                </div>
             </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default App;
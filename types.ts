export enum CongestionLevel {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High'
}

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  label: string;
}

export interface TrafficAnalysisResult {
  vehicleCount: number;
  congestionLevel: CongestionLevel;
  description: string;
  detectedObjects: BoundingBox[];
  timestamp: string;
  processedAt: number;
}

export interface ChartDataPoint {
  time: string;
  count: number;
  level: number; // 1 for Low, 2 for Medium, 3 for High for easy charting
}

export interface AppState {
  isAnalyzing: boolean;
  intervalMs: number;
  history: TrafficAnalysisResult[];
  latestResult: TrafficAnalysisResult | null;
  error: string | null;
}
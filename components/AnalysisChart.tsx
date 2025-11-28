import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { TrafficAnalysisResult, ChartDataPoint, CongestionLevel } from '../types';

interface AnalysisChartProps {
  history: TrafficAnalysisResult[];
}

const AnalysisChart: React.FC<AnalysisChartProps> = ({ history }) => {
  const data: ChartDataPoint[] = history.slice(-20).map(item => ({
    time: item.timestamp,
    count: item.vehicleCount,
    level: item.congestionLevel === CongestionLevel.HIGH ? 3 
         : item.congestionLevel === CongestionLevel.MEDIUM ? 2 : 1
  }));

  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <p>Waiting for data...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{
            top: 10,
            right: 30,
            left: 0,
            bottom: 0,
          }}
        >
          <defs>
            <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis 
            dataKey="time" 
            stroke="#94a3b8" 
            fontSize={12} 
            tick={{fill: '#94a3b8'}}
          />
          <YAxis 
            stroke="#94a3b8" 
            fontSize={12} 
            tick={{fill: '#94a3b8'}}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }}
            itemStyle={{ color: '#93c5fd' }}
          />
          <Area 
            type="monotone" 
            dataKey="count" 
            stroke="#3b82f6" 
            fillOpacity={1} 
            fill="url(#colorCount)" 
            name="Vehicle Count"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AnalysisChart;
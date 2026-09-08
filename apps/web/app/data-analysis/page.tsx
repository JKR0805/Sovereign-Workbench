'use client';

import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  RefreshCw,
  Cpu,
  ChevronDown
} from 'lucide-react';
import { MockBadge } from '../../components/primitives/MockBadge';

export default function DataAnalysisPage() {
  const [selectedUnit, setSelectedUnit] = useState('Distillation Column (DC-101)');
  const [liveStreaming, setLiveStreaming] = useState(true);

  // Time-series telemetry matching Reference Image 2 Bottom Center
  const telemetryData = [
    { time: '10:00', temperature: 210, pressure: 120, flowRate: 85 },
    { time: '12:00', temperature: 235, pressure: 125, flowRate: 90 },
    { time: '14:00', temperature: 220, pressure: 118, flowRate: 88 },
    { time: '16:00', temperature: 245, pressure: 130, flowRate: 94 },
    { time: '18:00', temperature: 342, pressure: 165, flowRate: 110 }, // Spike point
    { time: '20:00', temperature: 280, pressure: 140, flowRate: 95 },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      {/* Header matching Reference Image 2 Bottom Center */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              Live Data Analysis
            </h1>
            <MockBadge label="Simulated Telemetry" size="sm" />
          </div>
          <p className="text-xs text-text-secondary">
            Connect to operational data and get AI-powered insights
          </p>
        </div>

        {/* Unit Selector and Live Data Badge */}
        <div className="flex items-center gap-3">
          <select
            value={selectedUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
            className="bg-bg-panel border border-border rounded-md px-3 py-1.5 text-xs text-text-primary font-mono focus:border-accent outline-none"
          >
            <option>Distillation Column (DC-101)</option>
            <option>Heat Exchanger (E-102)</option>
            <option>Crude Distillation Unit (CDU-100)</option>
          </select>

          <MockBadge label="Simulated Stream" size="md" />
        </div>
      </div>

      {/* Main Chart Box matching Reference Image 2 Bottom Center */}
      <div className="bg-[#0B0E14] border border-border rounded-lg p-5 flex flex-col gap-4 shadow-xl">
        {/* Metric Legend & Alert Pill */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E0A32E]" />
              <span className="text-text-secondary">Temperature (°C)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#4DA3FF]" />
              <span className="text-text-secondary">Pressure (bar)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#35C08A]" />
              <span className="text-text-secondary">Flow Rate (m³/h)</span>
            </span>
          </div>

          {/* Alert pill matching Reference Image 2 */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-[#E5484D]/15 border border-[#E5484D]/40 text-[#E5484D] text-xs font-mono font-bold animate-pulse self-start sm:self-auto">
            <span>↑ 342°C Above normal range</span>
          </div>
        </div>

        {/* Telemetry Chart */}
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={telemetryData}>
              <XAxis
                dataKey="time"
                stroke="#5A6376"
                fontSize={10}
                tickLine={false}
                fontFamily="JetBrains Mono"
              />
              <YAxis
                stroke="#5A6376"
                fontSize={10}
                tickLine={false}
                fontFamily="JetBrains Mono"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#171B22',
                  borderColor: '#2E3542',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontFamily: 'JetBrains Mono',
                }}
              />
              <Line
                type="monotone"
                dataKey="temperature"
                stroke="#E0A32E"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#E0A32E' }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="pressure"
                stroke="#4DA3FF"
                strokeWidth={2}
                dot={{ r: 3, fill: '#4DA3FF' }}
              />
              <Line
                type="monotone"
                dataKey="flowRate"
                stroke="#35C08A"
                strokeWidth={2}
                dot={{ r: 3, fill: '#35C08A' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Real-time Automated Agent Recommendation */}
        <div className="bg-bg-panel border border-border rounded-md p-4 flex items-start gap-3 mt-2">
          <AlertTriangle className="w-5 h-5 text-warn flex-shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-semibold text-text-primary block mb-1">
              Automated Anomaly Detection Notice:
            </span>
            <p className="text-text-secondary leading-relaxed">
              At 18:00, column temperature peaked at 342°C approaching the 350°C shutdown threshold. Correlation analysis with pressure sensor P-102 indicates vapor line constriction. Recommended action: Check pre-heater bypass valve and initiate cooling protocol as per Refinery_Safety_Manual.pdf (Section 4.2.3).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

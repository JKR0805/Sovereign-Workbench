'use client';

import React, { useState } from 'react';
import { MetricStat } from '../../components/primitives/MetricStat';
import { MockBadge } from '../../components/primitives/MockBadge';
import {
  MessageSquare,
  FileText,
  Image as ImageIcon,
  Cpu,
  Calendar,
  Activity
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'model' | 'docs' | 'query' | 'health'>('model');
  const [timeRange, setTimeRange] = useState('Last 30 Days');

  // Query Volume chart data matching Reference Image 2
  const queryVolumeData = [
    { date: 'Aug 8', volume: 38 },
    { date: 'Aug 12', volume: 62 },
    { date: 'Aug 16', volume: 48 },
    { date: 'Aug 20', volume: 74 },
    { date: 'Aug 24', volume: 60 },
    { date: 'Aug 28', volume: 112 },
    { date: 'Sep 1', volume: 85 },
    { date: 'Sep 5', volume: 142 },
  ];

  // Distribution by task data matching Reference Image 2
  const taskDistributionData = [
    { name: 'Document Analysis', value: 32, color: '#4DA3FF' },
    { name: 'Data Analysis', value: 24, color: '#35C08A' },
    { name: 'Knowledge Search', value: 16, color: '#A78BFA' },
    { name: 'Image Analysis', value: 16, color: '#E0A32E' },
    { name: 'General Chat', value: 12, color: '#4DD4AC' },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6">
      {/* Header matching Reference Image 2 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              System Analytics
            </h1>
            <MockBadge label="Mock Telemetrics" size="sm" />
          </div>
          <p className="text-xs text-text-secondary">
            Operational metrics, query distribution, and local hardware utilization
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="bg-bg-panel border border-border rounded-md px-3 py-1.5 text-xs text-text-secondary font-mono focus:border-accent outline-none"
          >
            <option>Last 30 Days</option>
            <option>Last 7 Days</option>
            <option>Last 24 Hours</option>
          </select>
        </div>
      </div>

      {/* Tabs matching Reference Image 2 */}
      <div className="flex items-center gap-6 border-b border-border text-xs font-medium">
        {(['model', 'docs', 'query', 'health'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`pb-2.5 capitalize transition-colors border-b-2 -mb-px ${
              activeTab === t
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {t === 'model'
              ? 'Model Usage'
              : t === 'docs'
              ? 'Document Insights'
              : t === 'query'
              ? 'Query Analytics'
              : 'System Health'}
          </button>
        ))}
      </div>

      {/* 4 Metric Cards matching Reference Image 2 Center Left */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricStat
          label="Total Queries"
          value="1,482"
          change="12%"
          isPositive={true}
          icon={<MessageSquare className="w-4 h-4 text-accent" />}
        />
        <MetricStat
          label="Documents Analyzed"
          value="287"
          change="8%"
          isPositive={true}
          icon={<FileText className="w-4 h-4 text-ok" />}
        />
        <MetricStat
          label="Images Processed"
          value="64"
          change="26%"
          isPositive={true}
          icon={<ImageIcon className="w-4 h-4 text-modality-vision" />}
        />
        <MetricStat
          label="Active Agents"
          value="18"
          change="50%"
          isPositive={true}
          icon={<Cpu className="w-4 h-4 text-warn" />}
        />
      </div>

      {/* Charts Grid matching Reference Image 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Query Volume Line Chart (2 Cols) */}
        <div className="lg:col-span-2 bg-bg-panel border border-border rounded-md p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider font-mono">
                Query Volume
              </h2>
              <span className="text-xs text-text-tertiary">Daily token queries handled locally</span>
            </div>
            <span className="text-xs font-mono text-ok font-semibold">Peak: 142 queries/day</span>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={queryVolumeData}>
                <defs>
                  <linearGradient id="queryGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4DA3FF" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#4DA3FF" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  stroke="#5A6376"
                  fontSize={12}
                  tickLine={false}
                  fontFamily="JetBrains Mono"
                />
                <YAxis
                  stroke="#5A6376"
                  fontSize={12}
                  tickLine={false}
                  fontFamily="JetBrains Mono"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#171B22',
                    borderColor: '#2E3542',
                    borderRadius: '4px',
                    fontSize: '13px',
                    fontFamily: 'JetBrains Mono',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="volume"
                  stroke="#4DA3FF"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#queryGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Donut Chart matching Reference Image 2 */}
        <div className="bg-bg-panel border border-border rounded-md p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider font-mono mb-1">
              Query Distribution by Task
            </h2>
            <span className="text-xs text-text-tertiary">Workload routing allocation</span>
          </div>

          <div className="h-44 w-full my-2 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={taskDistributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={68}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {taskDistributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#171B22',
                    borderColor: '#2E3542',
                    borderRadius: '4px',
                    fontSize: '13px',
                    fontFamily: 'JetBrains Mono',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-1.5 pt-2 border-t border-border text-xs font-mono">
            {taskDistributionData.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-text-secondary">{item.name}</span>
                </div>
                <span className="text-text-primary font-bold">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

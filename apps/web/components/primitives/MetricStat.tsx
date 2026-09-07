import React from 'react';

interface MetricStatProps {
  label: string;
  value: string | number;
  change?: string;
  isPositive?: boolean;
  icon?: React.ReactNode;
}

export const MetricStat: React.FC<MetricStatProps> = ({
  label,
  value,
  change,
  isPositive = true,
  icon,
}) => {
  return (
    <div className="bg-bg-panel border border-border hover:border-border-strong transition-colors rounded-md p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        {icon && <div className="text-accent text-sm p-1.5 rounded bg-bg-elevated border border-border">{icon}</div>}
      </div>
      <div className="flex items-baseline gap-2.5">
        <span className="text-2xl font-bold font-mono tracking-tight text-text-primary">
          {value}
        </span>
        {change && (
          <span
            className={`text-xs font-mono font-medium flex items-center gap-0.5 ${
              isPositive ? 'text-ok' : 'text-error'
            }`}
          >
            {isPositive ? '↑' : '↓'} {change}
          </span>
        )}
      </div>
    </div>
  );
};

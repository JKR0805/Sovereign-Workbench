import React from 'react';

interface StatusDotProps {
  status:
    | 'healthy'
    | 'degraded'
    | 'unhealthy'
    | 'unknown'
    | 'running'
    | 'stopped'
    | 'analyzed'
    | 'ready'
    | 'processing'
    | 'online'
    | 'indexed'
    | 'failed'
    | 'pending'
    | 'parsing'
    | 'chunking'
    | 'embedding'
    | 'skipped';
  pulse?: boolean;
  size?: 'sm' | 'md';
}

export const StatusDot: React.FC<StatusDotProps> = ({ status, pulse = false, size = 'md' }) => {
  let bg = 'bg-ok';
  let label: string = status;

  switch (status) {
    case 'healthy':
    case 'running':
    case 'analyzed':
    case 'ready':
    case 'indexed':
    case 'online':
      bg = 'bg-[#35C08A]';
      label = status === 'running' ? 'Running' : status === 'analyzed' ? 'Analyzed' : status === 'indexed' ? 'Indexed' : 'Ready';
      break;
    case 'degraded':
    case 'processing':
    case 'parsing':
    case 'chunking':
    case 'embedding':
    case 'pending':
      bg = 'bg-[#E0A32E]';
      label = status === 'processing' ? 'Processing' : status.charAt(0).toUpperCase() + status.slice(1);
      break;
    case 'unhealthy':
    case 'stopped':
    case 'failed':
      bg = 'bg-[#E5484D]';
      label = status === 'stopped' ? 'Stopped' : status === 'failed' ? 'Failed' : 'Unhealthy';
      break;
    case 'skipped':
    case 'unknown':
      bg = 'bg-[#5A6376]';
      label = status === 'skipped' ? 'Skipped' : 'Unknown';
      break;
  }

  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';

  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-text-secondary">
      <span className="relative flex h-2 w-2 items-center justify-center">
        {pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${bg}`}
          />
        )}
        <span className={`relative inline-flex rounded-full ${dotSize} ${bg}`} />
      </span>
      <span>{label}</span>
    </span>
  );
};

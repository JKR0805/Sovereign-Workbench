import React from 'react';

interface StatusDotProps {
  status:
    | 'healthy'
    | 'degraded'
    | 'unhealthy'
    | 'running'
    | 'stopped'
    | 'analyzed'
    | 'ready'
    | 'processing'
    | 'online'
    | 'indexed'
    | 'failed';
  pulse?: boolean;
  size?: 'sm' | 'md';
}

export const StatusDot: React.FC<StatusDotProps> = ({ status, pulse = false, size = 'md' }) => {
  let bg = 'bg-ok';
  let label = 'Healthy';

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
      bg = 'bg-[#E0A32E]';
      label = status === 'processing' ? 'Processing' : 'Degraded';
      break;
    case 'unhealthy':
    case 'stopped':
    case 'failed':
      bg = 'bg-[#E5484D]';
      label = status === 'stopped' ? 'Stopped' : status === 'failed' ? 'Failed' : 'Unhealthy';
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

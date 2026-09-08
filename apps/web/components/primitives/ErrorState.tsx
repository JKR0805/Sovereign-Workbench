'use client';

import React from 'react';
import { AlertTriangle, RotateCcw, WifiOff } from 'lucide-react';
import { ApiError } from '../../lib/api';

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

/**
 * Renders what actually failed instead of substituting fabricated data.
 * Distinguishes a network failure (backend unreachable) from a real
 * server-reported error, since those imply different next steps for the
 * operator.
 */
export const ErrorState: React.FC<ErrorStateProps> = ({
  error,
  onRetry,
  compact = false,
  className = '',
}) => {
  const isNetwork = error instanceof ApiError && error.isNetworkError;
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  const code = error instanceof ApiError ? error.code : undefined;

  return (
    <div
      role="alert"
      className={`flex ${compact ? 'items-center gap-2 px-3 py-2' : 'flex-col items-center text-center gap-2 px-6 py-8'} rounded-md border border-error/30 bg-error/5 ${className}`}
    >
      {isNetwork ? (
        <WifiOff className={compact ? 'w-4 h-4 text-error flex-shrink-0' : 'w-6 h-6 text-error'} />
      ) : (
        <AlertTriangle className={compact ? 'w-4 h-4 text-error flex-shrink-0' : 'w-6 h-6 text-error'} />
      )}
      <div className={compact ? 'flex-1 min-w-0' : ''}>
        <p className="text-xs font-mono text-error truncate">{message}</p>
        {code && !compact && (
          <p className="text-[10px] font-mono text-text-tertiary mt-1">code: {code}</p>
        )}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono text-error hover:bg-error/10 border border-error/30 transition-colors flex-shrink-0"
        >
          <RotateCcw className="w-3 h-3" />
          Retry
        </button>
      )}
    </div>
  );
};

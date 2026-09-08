'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  label?: string;
  compact?: boolean;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  label = 'Loading...',
  compact = false,
  className = '',
}) => (
  <div
    className={`flex ${compact ? 'items-center gap-2 px-3 py-2' : 'flex-col items-center justify-center gap-2 px-6 py-12'} text-text-tertiary ${className}`}
  >
    <Loader2 className={`${compact ? 'w-4 h-4' : 'w-6 h-6'} animate-spin`} />
    <span className="text-xs font-mono">{label}</span>
  </div>
);

interface EmptyStateProps {
  label: string;
  detail?: string;
  className?: string;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ label, detail, className = '', icon }) => (
  <div
    className={`flex flex-col items-center justify-center gap-2 px-6 py-12 text-center ${className}`}
  >
    {icon}
    <p className="text-sm font-medium text-text-secondary">{label}</p>
    {detail && <p className="text-xs text-text-tertiary max-w-sm">{detail}</p>}
  </div>
);

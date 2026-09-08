'use client';

import React from 'react';

interface MockBadgeProps {
  label?: string;
  size?: 'sm' | 'md';
  variant?: 'amber' | 'cyan' | 'neutral';
  className?: string;
  tooltip?: string;
}

export const MockBadge: React.FC<MockBadgeProps> = ({
  label = 'Mock Data',
  size = 'sm',
  variant = 'amber',
  className = '',
  tooltip = 'Live backend endpoint is currently offline or unreachable. Displaying grounded local fallback data.'
}) => {
  const colorStyles = {
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.15)]',
    cyan: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30 shadow-[0_0_8px_rgba(6,182,212,0.15)]',
    neutral: 'bg-bg-elevated text-text-tertiary border-border',
  }[variant];

  const dotColor = {
    amber: 'bg-amber-400',
    cyan: 'bg-cyan-400',
    neutral: 'bg-text-tertiary',
  }[variant];

  const sizeStyles = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border font-mono tracking-tight select-none ${colorStyles} ${sizeStyles} ${className}`}
      title={tooltip}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor} animate-pulse flex-shrink-0`} />
      <span className="font-semibold uppercase tracking-wider">{label}</span>
    </span>
  );
};

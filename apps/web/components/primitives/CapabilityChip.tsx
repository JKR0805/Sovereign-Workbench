import React from 'react';

interface CapabilityChipProps {
  label: string;
  score?: number;
  size?: 'sm' | 'md';
}

export const CapabilityChip: React.FC<CapabilityChipProps> = ({ label, score, size = 'md' }) => {
  const normalized = label.toLowerCase();
  
  let colorClass = 'bg-[#232833] text-text-secondary border-border';

  if (normalized.includes('vision') || normalized.includes('multimodal')) {
    colorClass = 'bg-[#A78BFA]/10 text-[#C4B5FD] border-[#A78BFA]/30';
  } else if (normalized.includes('code') || normalized.includes('coding')) {
    colorClass = 'bg-[#4DD4AC]/10 text-[#6EE7B7] border-[#4DD4AC]/30';
  } else if (normalized.includes('reason') || normalized.includes('text')) {
    colorClass = 'bg-[#4DA3FF]/10 text-[#93C5FD] border-[#4DA3FF]/30';
  } else if (normalized.includes('embed')) {
    colorClass = 'bg-[#E0A32E]/10 text-[#FDE047] border-[#E0A32E]/30';
  } else if (normalized.includes('tool')) {
    colorClass = 'bg-[#EC4899]/10 text-[#F472B6] border-[#EC4899]/30';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border font-mono tracking-tight transition-colors ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
      } ${colorClass}`}
    >
      <span className="capitalize">{label}</span>
      {score !== undefined && (
        <span className="opacity-75 font-semibold text-[10px]">
          {(score * 100).toFixed(0)}%
        </span>
      )}
    </span>
  );
};

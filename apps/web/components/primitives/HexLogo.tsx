import React from 'react';

interface HexLogoProps {
  size?: number;
  className?: string;
  withText?: boolean;
}

export const HexLogo: React.FC<HexLogoProps> = ({ size = 32, className = '', withText = false }) => {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        <defs>
          <linearGradient id="hexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4DA3FF" />
            <stop offset="100%" stopColor="#7C3AED" />
          </linearGradient>
          <linearGradient id="innerGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#93C5FD" />
          </linearGradient>
        </defs>
        
        {/* Outer Hexagon outline */}
        <polygon
          points="24,3 43,13.5 43,34.5 24,45 5,34.5 5,13.5"
          stroke="url(#hexGrad)"
          strokeWidth="2.5"
          fill="rgba(77, 163, 255, 0.08)"
          strokeLinejoin="round"
        />
        
        {/* Inner geometric loop forming stylized Q */}
        <circle
          cx="24"
          cy="22"
          r="9"
          stroke="url(#innerGlow)"
          strokeWidth="2.2"
          fill="none"
        />
        <path
          d="M29 27L36 34"
          stroke="url(#innerGlow)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>

      {withText && (
        <div className="flex flex-col">
          <span className="text-base font-semibold tracking-tight text-text-primary whitespace-nowrap">
            Sovereign AI Workbench
          </span>
          <span className="text-xs text-text-tertiary tracking-wider font-mono uppercase">
            Built for Bharat · Airgap
          </span>
        </div>
      )}
    </div>
  );
};

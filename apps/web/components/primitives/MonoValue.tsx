import React from 'react';

interface MonoValueProps {
  children: React.ReactNode;
  className?: string;
  copyable?: boolean;
}

export const MonoValue: React.FC<MonoValueProps> = ({ children, className = '', copyable = false }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (!copyable || typeof children !== 'string') return;
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <span
      onClick={handleCopy}
      className={`font-mono text-xs text-text-primary px-1.5 py-0.5 rounded bg-[#171B22] border border-border inline-flex items-center gap-1 ${
        copyable ? 'cursor-pointer hover:border-accent' : ''
      } ${className}`}
      title={copyable ? 'Click to copy' : undefined}
    >
      {children}
      {copyable && (
        <span className="text-[10px] text-text-tertiary">
          {copied ? '✓' : '⧉'}
        </span>
      )}
    </span>
  );
};

'use client';

import React from 'react';
import Link from 'next/link';
import { HexLogo } from '../components/primitives/HexLogo';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="mb-4">
        <HexLogo size={56} />
      </div>
      <div className="flex items-center gap-2 text-warning mb-2">
        <ShieldAlert className="w-5 h-5" />
        <span className="font-mono text-sm font-bold uppercase tracking-wider">
          404 · Route Not In Sovereign Boundary
        </span>
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-text-primary mb-2">
        Endpoint Or View Not Found
      </h1>
      <p className="text-xs text-text-secondary max-w-md mb-6 leading-relaxed">
        The requested resource is not mapped within the local airgapped workbench routing table.
      </p>
      <Link
        href="/"
        className="flex items-center gap-2 px-4 py-2 rounded bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow transition-all"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Return to Workbench</span>
      </Link>
    </div>
  );
}

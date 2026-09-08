'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { TopBar } from './TopBar';
import { SideNav } from './SideNav';
import { StatusBar } from './StatusBar';
import { CommandPalette } from './CommandPalette';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return (
      <div className="min-h-screen bg-bg-base text-text-primary flex flex-col justify-between">
        {children}
        <CommandPalette />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-bg-base text-text-primary flex flex-col overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <SideNav />
        <main className="flex-1 overflow-y-auto bg-bg-base relative">
          {children}
        </main>
      </div>
      <StatusBar />
      <CommandPalette />
    </div>
  );
};

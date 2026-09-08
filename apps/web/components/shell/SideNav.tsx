'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  MessageSquare,
  FileText,
  Image as ImageIcon,
  BarChart3,
  Network,
  Cpu,
  GitFork,
  Sliders,
  PlayCircle,
  ShieldAlert,
  Activity,
  FileCheck2,
  Settings,
  HelpCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Plus
} from 'lucide-react';
import { useShellStore } from '../../stores/shellStore';

export const SideNav: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed, toggleSidebar } = useShellStore();

  const navItems = [
    { label: 'Chat', href: '/', icon: MessageSquare },
    { label: 'Document Analysis', href: '/knowledge', icon: FileText },
    { label: 'Image Analysis', href: '/multimodal', icon: ImageIcon },
    { label: 'Data Analysis', href: '/data-analysis', icon: BarChart3 },
    { label: 'Knowledge Graph', href: '/knowledge/graph', icon: Network },
    { label: 'Model Management', href: '/models', icon: Cpu },
    { label: 'Agent Workflows', href: '/workflows', icon: GitFork },
    { label: 'Routing Studio', href: '/routing', icon: Sliders },
    { label: 'Runs', href: '/runs', icon: PlayCircle },
    { label: 'Network & Sovereignty', href: '/network', icon: ShieldAlert },
    { label: 'System Analytics', href: '/analytics', icon: Activity },
    { label: 'Audit Logs', href: '/audit', icon: FileCheck2 },
  ];

  const handleNewChat = () => {
    router.push('/');
  };

  return (
    <aside
      className={`h-[calc(100vh-3.5rem-2rem)] bg-bg-panel border-r border-border flex flex-col justify-between transition-all duration-200 z-20 flex-shrink-0 ${
        sidebarCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Top: New Chat button & Nav links */}
      <div className="flex flex-col p-2.5 gap-2 overflow-y-auto overflow-x-hidden">
        {/* Collapse toggle header */}
        <div className="flex items-center justify-between px-1 mb-1">
          {!sidebarCollapsed && (
            <span className="text-xs font-mono text-text-tertiary uppercase tracking-wider">
              Workspace
            </span>
          )}
          <button
            onClick={toggleSidebar}
            className="p-1 rounded text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated transition-colors ml-auto"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* New Chat Button */}
        <button
          onClick={handleNewChat}
          className={`flex items-center justify-center gap-2 rounded-lg font-medium text-white transition-all shadow-md active:scale-95 ${
            sidebarCollapsed
              ? 'w-10 h-10 mx-auto bg-gradient-to-r from-blue-600 to-indigo-600'
              : 'w-full py-2.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-sm font-semibold'
          }`}
          title="New Chat"
        >
          <Plus className="w-4 h-4" />
          {!sidebarCollapsed && <span>New Chat</span>}
        </button>

        {/* Nav Links */}
        <nav className="flex flex-col gap-1 mt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-2.5 py-2 rounded-md text-sm transition-colors group ${
                  isActive
                    ? 'bg-accent/15 text-accent font-medium border border-accent/20'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated border border-transparent'
                }`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-accent' : 'text-text-tertiary group-hover:text-text-secondary'}`} />
                {!sidebarCollapsed && (
                  <span className="truncate">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom links: Settings, Help, Sign Out */}
      <div className="p-2.5 border-t border-border flex flex-col gap-1">
        <Link
          href="/settings"
          className={`flex items-center gap-3 px-2.5 py-2 rounded-md text-sm transition-colors ${
            pathname === '/settings'
              ? 'bg-accent/15 text-accent font-medium'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
          }`}
          title={sidebarCollapsed ? 'Settings' : undefined}
        >
          <Settings className="w-4 h-4 flex-shrink-0 text-text-tertiary" />
          {!sidebarCollapsed && <span>Settings</span>}
        </Link>

        <button
          onClick={() => alert('VAJRA Sovereign AI Workbench v0.1.0\nOperating in 100% On-Premise Airgapped Mode.\nNo external data egress allowed.')}
          className="flex items-center gap-3 px-2.5 py-2 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors text-left"
          title={sidebarCollapsed ? 'Help' : undefined}
        >
          <HelpCircle className="w-4 h-4 flex-shrink-0 text-text-tertiary" />
          {!sidebarCollapsed && <span>Help</span>}
        </button>

        <Link
          href="/login"
          className="flex items-center gap-3 px-2.5 py-2 rounded-md text-sm text-error/80 hover:text-error hover:bg-error/10 transition-colors"
          title={sidebarCollapsed ? 'Sign Out' : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!sidebarCollapsed && <span>Sign Out</span>}
        </Link>
      </div>
    </aside>
  );
};

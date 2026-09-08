'use client';

import React, { useEffect, useState, useCallback } from 'react';
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
  Plus,
  Trash2,
  Users,
  Clock,
  MessageCircle,
} from 'lucide-react';
import { useShellStore } from '../../stores/shellStore';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../lib/api';
import type { ConversationRead } from '../../lib/types';

export const SideNav: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed, toggleSidebar } = useShellStore();
  const { currentUser, checkAuth, logout } = useAuthStore();

  const [conversations, setConversations] = useState<ConversationRead[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [adminChatTab, setAdminChatTab] = useState<'my' | 'all'>('my');
  const [searchFilter, setSearchFilter] = useState('');

  const myConversations = conversations.filter(
    (c) => c.user_id === currentUser?.id || c.username === currentUser?.username
  );

  const displayedConversations =
    currentUser?.role === 'admin' && adminChatTab === 'my'
      ? myConversations
      : conversations;

  const filteredConversations = searchFilter.trim()
    ? displayedConversations.filter(
        (c) =>
          c.title?.toLowerCase().includes(searchFilter.toLowerCase()) ||
          c.username?.toLowerCase().includes(searchFilter.toLowerCase())
      )
    : displayedConversations;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const cId = urlParams.get('c') || sessionStorage.getItem('vajra_active_conversation_id');
      setActiveConversationId(cId);

      const handleLoad = (e: Event) => {
        const customEvt = e as CustomEvent<{ conversationId?: string }>;
        setActiveConversationId(customEvt.detail?.conversationId || null);
      };
      const handleNew = () => {
        setActiveConversationId(null);
      };
      window.addEventListener('vajra_load_conversation', handleLoad);
      window.addEventListener('vajra_new_chat', handleNew);
      return () => {
        window.removeEventListener('vajra_load_conversation', handleLoad);
        window.removeEventListener('vajra_new_chat', handleNew);
      };
    }
  }, [pathname]);

  const fetchConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const page = await api.getConversations({ limit: 25 });
      setConversations(page.items);
    } catch {
      // Ignored if user not yet logged in
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (currentUser) {
      fetchConversations();
    }
  }, [currentUser, fetchConversations]);

  useEffect(() => {
    const handleUpdate = () => fetchConversations();
    window.addEventListener('vajra_conversation_updated', handleUpdate);
    window.addEventListener('vajra_new_chat', handleUpdate);
    return () => {
      window.removeEventListener('vajra_conversation_updated', handleUpdate);
      window.removeEventListener('vajra_new_chat', handleUpdate);
    };
  }, [fetchConversations]);

  const handleNewChat = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('vajra_active_conversation_id');
      window.dispatchEvent(new CustomEvent('vajra_new_chat'));
    }
    router.push('/');
  };

  const handleSelectConversation = (id: string) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('vajra_active_conversation_id', id);
      window.dispatchEvent(new CustomEvent('vajra_load_conversation', { detail: { conversationId: id } }));
    }
    router.push(`/?c=${encodeURIComponent(id)}`);
  };

  const handleDeleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await api.deleteConversation(id);
      if (activeConversationId === id) {
        handleNewChat();
      } else {
        fetchConversations();
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const handleSignOut = async () => {
    await logout();
    router.push('/login');
  };

  const baseNavItems = [
    { label: 'Chat', href: '/', icon: MessageSquare },
    { label: 'Document Analysis', href: '/knowledge', icon: FileText },
    { label: 'Image Analysis', href: '/multimodal', icon: ImageIcon },
    { label: 'Data Analysis', href: '/data-analysis', icon: BarChart3 },
  ];

  const adminNavItems = [
    { label: 'Operators & Access', href: '/admin/users', icon: Users },
    { label: 'Knowledge Graph', href: '/knowledge/graph', icon: Network },
    { label: 'Model Management', href: '/models', icon: Cpu },
    { label: 'Agent Workflows', href: '/workflows', icon: GitFork },
    { label: 'Routing Studio', href: '/routing', icon: Sliders },
    { label: 'Runs', href: '/runs', icon: PlayCircle },
    { label: 'Network & Sovereignty', href: '/network', icon: ShieldAlert },
    { label: 'System Analytics', href: '/analytics', icon: Activity },
    { label: 'Audit Logs', href: '/audit', icon: FileCheck2 },
  ];

  const visibleNavItems =
    currentUser?.role === 'admin' ? [...baseNavItems, ...adminNavItems] : baseNavItems;

  return (
    <aside
      className={`h-[calc(100vh-3.5rem-2rem)] bg-bg-panel border-r border-border flex flex-col justify-between transition-all duration-200 z-20 flex-shrink-0 select-none ${
        sidebarCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Scrollable Container */}
      <div className="flex-1 flex flex-col p-2.5 gap-2 overflow-y-auto overflow-x-hidden min-h-0">
        {/* Collapse toggle header */}
        <div className="flex items-center justify-between px-1 mb-1">
          {!sidebarCollapsed && (
            <span className="text-xs font-mono text-text-tertiary uppercase tracking-wider">
              {currentUser?.role === 'admin' ? 'Institutional Enclave' : 'Workspace Enclave'}
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

        {/* Navigation Links */}
        <nav className="flex flex-col gap-0.5 mt-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-2.5 py-2 rounded-md text-xs font-medium transition-colors group ${
                  isActive
                    ? 'bg-accent/15 text-accent border border-accent/20 font-semibold'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated border border-transparent'
                }`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon
                  className={`w-4 h-4 flex-shrink-0 ${
                    isActive ? 'text-accent' : 'text-text-tertiary group-hover:text-text-secondary'
                  }`}
                />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Recent Chats Section (Shown when sidebar is expanded) */}
        {!sidebarCollapsed && (
          <div className="mt-4 flex flex-col gap-1.5 pt-3 border-t border-border/60">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[11px] font-mono uppercase tracking-wider text-text-tertiary flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                <span>Conversations</span>
              </span>
              <span className="text-[10px] text-text-tertiary font-mono">
                {displayedConversations.length}
              </span>
            </div>

            {/* Admin Tabs: My Chats vs All Users */}
            {currentUser?.role === 'admin' && (
              <div className="flex flex-col gap-1.5 mb-1">
                <div className="flex items-center gap-1 p-0.5 bg-bg-surface border border-border/70 rounded-md">
                  <button
                    onClick={() => setAdminChatTab('my')}
                    className={`flex-1 text-[10px] py-1 px-1.5 rounded font-mono font-medium transition-colors flex items-center justify-center gap-1 ${
                      adminChatTab === 'my'
                        ? 'bg-accent/20 text-accent border border-accent/40 shadow-xs'
                        : 'text-text-tertiary hover:text-text-secondary'
                    }`}
                  >
                    <span>My Chats</span>
                    <span className="text-[9px] px-1 rounded bg-bg-elevated/80">{myConversations.length}</span>
                  </button>
                  <button
                    onClick={() => setAdminChatTab('all')}
                    className={`flex-1 text-[10px] py-1 px-1.5 rounded font-mono font-medium transition-colors flex items-center justify-center gap-1 ${
                      adminChatTab === 'all'
                        ? 'bg-blue-950/50 text-blue-300 border border-blue-700/50 shadow-xs'
                        : 'text-text-tertiary hover:text-text-secondary'
                    }`}
                  >
                    <span>All Users</span>
                    <span className="text-[9px] px-1 rounded bg-bg-elevated/80">{conversations.length}</span>
                  </button>
                </div>

                {adminChatTab === 'all' && (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Filter by title or @user..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="w-full bg-bg-surface border border-border/70 rounded px-2 py-1 text-[10px] font-mono text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
                    />
                    {searchFilter && (
                      <button
                        onClick={() => setSearchFilter('')}
                        className="absolute right-1.5 top-1 text-text-tertiary hover:text-text-primary text-[10px]"
                      >
                        ×
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {filteredConversations.length === 0 ? (
              <div className="px-2 py-3 text-[11px] text-text-tertiary italic text-center">
                {loadingConversations
                  ? 'Loading history...'
                  : adminChatTab === 'my' && currentUser?.role === 'admin'
                  ? 'No personal chats yet. Click + New Chat!'
                  : 'No conversations found.'}
              </div>
            ) : (
              <div className="flex flex-col gap-1 max-h-52 overflow-y-auto pr-1">
                {filteredConversations.map((conv) => {
                  const isCurrent = activeConversationId === conv.id;
                  const isOwner = conv.username === currentUser?.username || conv.user_id === currentUser?.id;
                  return (
                    <div
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={`group flex items-center justify-between px-2.5 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                        isCurrent
                          ? 'bg-[#1E232B] text-accent font-medium border border-border/80'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated/70'
                      }`}
                      title={conv.username ? `Conversation by @${conv.username}` : undefined}
                    >
                      <div className="flex flex-col overflow-hidden min-w-0 pr-1">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <MessageCircle
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isCurrent ? 'text-accent' : 'text-text-tertiary'
                            }`}
                          />
                          <span className="truncate text-[11px]">
                            {conv.title || 'Untitled chat'}
                          </span>
                        </div>

                        {/* Show user tag in All Users view for admins */}
                        {currentUser?.role === 'admin' && adminChatTab === 'all' && (
                          <div className="flex items-center gap-1 mt-0.5 ml-5">
                            {isOwner ? (
                              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-blue-950/60 text-blue-300 border border-blue-800/40">
                                You
                              </span>
                            ) : (
                              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-950/50 text-amber-300 border border-amber-800/40 truncate max-w-[120px]">
                                @{conv.username || 'operator'}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={(e) => handleDeleteConversation(e, conv.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-text-tertiary hover:text-rose-400 rounded hover:bg-rose-950/40 transition-all shrink-0"
                        title="Delete conversation"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom links: Current Operator Info, Settings, Help, Sign Out */}
      <div className="p-2.5 border-t border-border flex flex-col gap-1">
        {/* User Card */}
        {currentUser && !sidebarCollapsed && (
          <div className="px-2.5 py-2 mb-1 rounded bg-[#11141A] border border-border/60 flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-blue-900/40 text-blue-300 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-700/50">
              {currentUser.username.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-semibold text-text-primary truncate">
                {currentUser.display_name || currentUser.username}
              </div>
              <div className="text-[10px] font-mono text-text-tertiary uppercase">
                {currentUser.role}
              </div>
            </div>
          </div>
        )}

        <Link
          href="/settings"
          className={`flex items-center gap-3 px-2.5 py-2 rounded-md text-xs transition-colors ${
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
          onClick={() =>
            alert(
              `VAJRA Sovereign AI Workbench v0.1.0\nOperating in 100% On-Premise Airgapped Mode.\nOperator: ${currentUser?.username || 'Guest'} (${currentUser?.role || 'user'})\nNo external data egress allowed.`
            )
          }
          className="flex items-center gap-3 px-2.5 py-2 rounded-md text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors text-left"
          title={sidebarCollapsed ? 'Help' : undefined}
        >
          <HelpCircle className="w-4 h-4 flex-shrink-0 text-text-tertiary" />
          {!sidebarCollapsed && <span>Help</span>}
        </button>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-2.5 py-2 rounded-md text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 transition-colors text-left"
          title={sidebarCollapsed ? 'Sign Out' : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!sidebarCollapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
};

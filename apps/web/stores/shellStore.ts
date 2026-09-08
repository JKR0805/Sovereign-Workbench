import { create } from 'zustand';

interface ShellState {
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  activeModelId: string;
  activeModelName: string;
  egressCount: number;
  blockedCount: number;
  gpuUsagePercent: number;
  vramUsedGb: number;
  vramTotalGb: number;
  activeRunId: string | null;
  sovereigntyAlert: boolean;
  
  // Actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setActiveModel: (id: string, name: string) => void;
  triggerEgressPulse: () => void;
  incrementBlocked: () => void;
  setActiveRunId: (runId: string | null) => void;
}

export const useShellStore = create<ShellState>((set) => ({
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  activeModelId: "llama-3-1-70b",
  activeModelName: "Llama 3.1 70B",
  egressCount: 0,
  blockedCount: 4,
  gpuUsagePercent: 68,
  vramUsedGb: 5.2,
  vramTotalGb: 8.0,
  activeRunId: "8a31e847",
  sovereigntyAlert: false,

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setActiveModel: (id, name) => set({ activeModelId: id, activeModelName: name }),
  triggerEgressPulse: () => {
    set((s) => ({ 
      sovereigntyAlert: true,
      blockedCount: s.blockedCount + 1 
    }));
    setTimeout(() => {
      set({ sovereigntyAlert: false });
    }, 4000);
  },
  incrementBlocked: () => set((s) => ({ blockedCount: s.blockedCount + 1 })),
  setActiveRunId: (runId) => set({ activeRunId: runId }),
}));

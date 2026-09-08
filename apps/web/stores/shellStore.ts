import { create } from 'zustand';

interface ShellState {
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  activeModelId: string | null;
  activeModelName: string | null;
  /** Real external-connection count from GET /api/network/snapshot. null
   * until the first poll succeeds -- never a placeholder number. */
  externalConnections: number | null;
  /** Real app_blocked_total from the same snapshot. */
  blockedTotal: number | null;
  /** Sum of resident models' vram_gb from GET /api/models/residency. There
   * is no backend source for total GPU VRAM or utilization percent, so
   * neither is tracked here -- inventing one would be exactly the kind of
   * fabricated number this project exists to avoid. */
  vramUsedGb: number | null;
  activeRunId: string | null;
  sovereigntyAlert: boolean;
  backendReachable: boolean | null;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setActiveModel: (id: string, name: string) => void;
  triggerEgressPulse: () => void;
  setActiveRunId: (runId: string | null) => void;
  setNetworkStats: (external: number | null, blocked: number | null) => void;
  setVramUsedGb: (gb: number | null) => void;
  setBackendReachable: (reachable: boolean) => void;
}

export const useShellStore = create<ShellState>((set) => ({
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  activeModelId: null,
  activeModelName: null,
  externalConnections: null,
  blockedTotal: null,
  vramUsedGb: null,
  activeRunId: null,
  sovereigntyAlert: false,
  backendReachable: null,

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setActiveModel: (id, name) => set({ activeModelId: id, activeModelName: name }),
  triggerEgressPulse: () => {
    set({ sovereigntyAlert: true });
    setTimeout(() => {
      set({ sovereigntyAlert: false });
    }, 4000);
  },
  setActiveRunId: (runId) => set({ activeRunId: runId }),
  setNetworkStats: (external, blocked) => set({ externalConnections: external, blockedTotal: blocked }),
  setVramUsedGb: (gb) => set({ vramUsedGb: gb }),
  setBackendReachable: (reachable) => set({ backendReachable: reachable }),
}));

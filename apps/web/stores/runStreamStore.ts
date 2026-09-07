import { create } from 'zustand';
import { RunStep, RunArtifact, WireEvent, RoutingDecision } from '../lib/types';
import { MOCK_RUN, MOCK_RUN_STEPS, MOCK_RUN_ARTIFACTS, MOCK_TIMELINE_EVENTS } from '../lib/mockData';

interface RunStreamState {
  runId: string | null;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  prompt: string;
  totalTokens: number;
  tokenStream: string;
  steps: RunStep[];
  artifacts: RunArtifact[];
  timelineEvents: WireEvent[];
  activeNodeId: string | null;
  routingDecision: Partial<RoutingDecision> | null;
  selectedInspectorTab: "routing" | "rag" | "tokens" | "artifacts";

  // Actions
  setRunId: (id: string) => void;
  setActiveNodeId: (nodeId: string | null) => void;
  setSelectedInspectorTab: (tab: "routing" | "rag" | "tokens" | "artifacts") => void;
  loadMockRun: () => void;
  simulateStepProgression: () => void;
}

export const useRunStreamStore = create<RunStreamState>((set, get) => ({
  runId: MOCK_RUN.id,
  status: "completed",
  prompt: MOCK_RUN.prompt,
  totalTokens: 1240,
  tokenStream: `Based on the provided inspection report (e102_report.md) for Heat Exchanger E-102:

1. Measured Wall Thickness:
   • Average measured tube wall thickness: 6.8 mm across all tube passes.
   • ASME Section VIII Division 1 minimum retirement limit: 5.0 mm.
   • Safety margin: +1.8 mm (+36% above minimum allowable threshold).

2. Assessment & Recommended Action:
   • The equipment meets all pressure boundary integrity standards.
   • Schedule next non-destructive ultrasound examination in 12 months.
   • Approval note drafted and compiled to Approval_Note_E102.docx.`,
  steps: MOCK_RUN_STEPS,
  artifacts: MOCK_RUN_ARTIFACTS,
  timelineEvents: MOCK_TIMELINE_EVENTS,
  activeNodeId: "route",
  routingDecision: MOCK_RUN_STEPS[1].routing_decision || null,
  selectedInspectorTab: "routing",

  setRunId: (id) => set({ runId: id }),
  setActiveNodeId: (nodeId) => {
    let tab: "routing" | "rag" | "tokens" | "artifacts" = "routing";
    if (nodeId === "route") tab = "routing";
    else if (nodeId === "rag") tab = "rag";
    else if (nodeId === "generate") tab = "tokens";
    else if (nodeId === "artifact") tab = "artifacts";
    set({ activeNodeId: nodeId, selectedInspectorTab: tab });
  },
  setSelectedInspectorTab: (tab) => set({ selectedInspectorTab: tab }),
  loadMockRun: () => {
    set({
      runId: MOCK_RUN.id,
      status: "completed",
      prompt: MOCK_RUN.prompt,
      totalTokens: 1240,
      steps: MOCK_RUN_STEPS,
      artifacts: MOCK_RUN_ARTIFACTS,
      timelineEvents: MOCK_TIMELINE_EVENTS,
      activeNodeId: "route",
      routingDecision: MOCK_RUN_STEPS[1].routing_decision || null,
      selectedInspectorTab: "routing",
    });
  },
  simulateStepProgression: () => {
    // Allows interactive live demonstration of a run executing node by node
    const currentSteps = [...get().steps];
    set({ status: "running" });
  }
}));

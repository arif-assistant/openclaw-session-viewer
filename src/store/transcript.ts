// ── Transcript Store ──────────────────────────────────────────────────
//
// Manages the currently-selected session's transcript data and
// the computed fishbone graph layout.

import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type { TranscriptEntry } from '@/gateway/types';
import { computeFishboneLayout, type SessionNodeData } from '@/layout/fishbone';
import { useConnectionStore } from './connection';

interface TranscriptStore {
  // ── State ──
  /** Currently loaded session key. */
  sessionKey: string | null;
  /** Raw transcript entries for the current session. */
  entries: TranscriptEntry[];
  /** React Flow nodes (computed from layout). */
  graphNodes: Node<SessionNodeData>[];
  /** React Flow edges (computed from layout). */
  graphEdges: Edge[];
  /** Currently selected node id. */
  selectedNodeId: string | null;
  /** Whether transcript is being loaded. */
  loading: boolean;
  /** Last error from loading. */
  error: string | null;

  // ── Actions ──
  /** Load transcript for a session from the gateway. */
  loadTranscript: (sessionKey: string) => Promise<void>;
  /** Recompute the fishbone layout from current entries. */
  computeLayout: () => void;
  /** Set selected node. */
  selectNode: (nodeId: string | null) => void;
  /** Clear the transcript (e.g. on disconnect). */
  clear: () => void;
}

export const useTranscriptStore = create<TranscriptStore>((set, get) => ({
  sessionKey: null,
  entries: [],
  graphNodes: [],
  graphEdges: [],
  selectedNodeId: null,
  loading: false,
  error: null,

  loadTranscript: async (sessionKey: string) => {
    const client = useConnectionStore.getState().client;
    if (!client) {
      set({ error: 'Not connected to gateway' });
      return;
    }

    set({ loading: true, error: null, sessionKey });

    try {
      const result = await client.request<{ messages: TranscriptEntry[] }>(
        'sessions.get',
        { key: sessionKey }
      );

      const entries = result?.messages ?? [];
      set({ entries, loading: false });
      get().computeLayout();
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load transcript',
      });
    }
  },

  computeLayout: () => {
    const { entries } = get();
    const { nodes, edges } = computeFishboneLayout(entries);
    set({ graphNodes: nodes, graphEdges: edges });
  },

  selectNode: (nodeId: string | null) => {
    set({ selectedNodeId: nodeId });
  },

  clear: () => {
    set({
      sessionKey: null,
      entries: [],
      graphNodes: [],
      graphEdges: [],
      selectedNodeId: null,
      loading: false,
      error: null,
    });
  },
}));

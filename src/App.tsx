// ── App — Main application shell ─────────────────────────────────────
//
// Integrates all components into a complete workflow:
//   1. Not connected → ConnectDialog
//   2. Connected → SessionList (left) + GraphCanvas (top-right) + DetailPanel (bottom-right)
//   3. Click session → load transcript → render fishbone graph
//   4. Click graph node → show entry detail in bottom panel

import { useEffect, useCallback } from 'react';
import { useConnectionStore } from '@/store/connection';
import { useSessionStore } from '@/store/sessions';
import { useTranscriptStore } from '@/store/transcript';
import { ConnectDialog } from '@/components/Connect/ConnectDialog';
import { SessionList } from '@/components/SessionList';
import { GraphCanvas } from '@/components/Graph/GraphCanvas';
import { DetailPanel } from '@/components/Detail';

export default function App() {
  const status = useConnectionStore((s) => s.status);
  const activeSessionKey = useSessionStore((s) => s.activeSessionKey);
  const selectSession = useSessionStore((s) => s.selectSession);

  const loadTranscript = useTranscriptStore((s) => s.loadTranscript);
  const graphNodes = useTranscriptStore((s) => s.graphNodes);
  const graphEdges = useTranscriptStore((s) => s.graphEdges);
  const selectedNodeId = useTranscriptStore((s) => s.selectedNodeId);
  const selectNode = useTranscriptStore((s) => s.selectNode);
  const transcriptLoading = useTranscriptStore((s) => s.loading);
  const transcriptError = useTranscriptStore((s) => s.error);
  const clearTranscript = useTranscriptStore((s) => s.clear);

  // Load transcript when active session changes
  useEffect(() => {
    if (activeSessionKey) {
      loadTranscript(activeSessionKey);
    } else {
      clearTranscript();
    }
  }, [activeSessionKey, loadTranscript, clearTranscript]);

  // Handle node selection from graph
  const handleNodeSelect = useCallback(
    (nodeId: string | null) => {
      selectNode(nodeId);
    },
    [selectNode]
  );

  // Not connected — show connect dialog
  if (status !== 'connected') {
    return <ConnectDialog />;
  }

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Left sidebar — Session list */}
      <SessionList />

      {/* Right area — Graph + Detail */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Graph canvas area */}
        <div className="flex-1 min-h-0 relative">
          {activeSessionKey ? (
            transcriptLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <svg
                    className="w-6 h-6 animate-spin text-gray-500 mx-auto mb-2"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <p className="text-xs text-gray-500">Loading transcript…</p>
                </div>
              </div>
            ) : transcriptError ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <p className="text-sm text-status-error mb-1">
                    Failed to load transcript
                  </p>
                  <p className="text-xs text-gray-500">{transcriptError}</p>
                  <button
                    onClick={() => loadTranscript(activeSessionKey)}
                    className="mt-2 text-xs text-accent hover:text-accent-hover"
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : graphNodes.length > 0 ? (
              <GraphCanvas
                nodes={graphNodes}
                edges={graphEdges}
                selectedNodeId={selectedNodeId}
                onNodeSelect={handleNodeSelect}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <p className="text-sm">No entries in this session.</p>
                </div>
              </div>
            )
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="text-lg font-medium">Connected to Gateway</p>
                <p className="text-sm mt-1">
                  Select a session to view its timeline.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Detail panel — bottom section (shown when a node is selected) */}
        {selectedNodeId && (
          <div className="h-[300px] shrink-0">
            <DetailPanel />
          </div>
        )}
      </div>
    </div>
  );
}

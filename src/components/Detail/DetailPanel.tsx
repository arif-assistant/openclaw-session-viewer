// ── DetailPanel — Selected node detail view ──────────────────────────
//
// Main container for the detail panel displayed at the bottom of the
// graph area. Shows full content of the selected transcript entry:
//   - MessageView for message entries
//   - ToolCallView for tool calls in structured content
//   - MetadataView for entry metadata
//   - Summary display for compaction / branch_summary

import { useMemo } from 'react';
import type { TranscriptEntry, ContentBlock } from '@/gateway/types';
import { useTranscriptStore } from '@/store/transcript';
import { MessageView } from './MessageView';
import { ToolCallView } from './ToolCallView';
import { MetadataView } from './MetadataView';

// ── Helper: build a map of tool_use_id → tool_result content ────────

function buildToolResultsMap(
  entries: TranscriptEntry[],
  selectedEntry: TranscriptEntry
): Map<string, string> {
  const map = new Map<string, string>();

  // Collect tool_use ids from the selected entry
  const content = selectedEntry.message?.content;
  if (!Array.isArray(content)) return map;

  const toolUseIds = new Set<string>();
  for (const block of content) {
    if (block.type === 'tool_use' && block.id) {
      toolUseIds.add(block.id as string);
    }
  }

  if (toolUseIds.size === 0) return map;

  // Search forward for tool_result entries that reference these ids
  const selectedIdx = entries.findIndex((e) => e.id === selectedEntry.id);
  if (selectedIdx < 0) return map;

  for (let i = selectedIdx + 1; i < entries.length && map.size < toolUseIds.size; i++) {
    const e = entries[i];
    if (e.message?.role === 'tool' || e.type === 'message') {
      const c = e.message?.content;
      // Check if this is a tool_result block referencing one of our tool_use ids
      if (Array.isArray(c)) {
        for (const block of c) {
          const toolUseId = block.tool_use_id as string | undefined;
          if (toolUseId && toolUseIds.has(toolUseId)) {
            const text = typeof block.content === 'string'
              ? block.content
              : block.text ?? JSON.stringify(block.content ?? block, null, 2);
            map.set(toolUseId, text);
          }
        }
      } else if (typeof c === 'string') {
        // Some tool results are plain strings with tool_use_id on the entry itself
        const data = e.data as Record<string, unknown> | undefined;
        const toolUseId = data?.tool_use_id as string | undefined;
        if (toolUseId && toolUseIds.has(toolUseId)) {
          map.set(toolUseId, c);
        }
      }
    }
  }

  return map;
}

// ── Placeholder when nothing is selected ─────────────────────────────

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center text-gray-500">
      <div className="text-center">
        <span className="text-2xl block mb-1">🔍</span>
        <p className="text-xs">Click a node to view details</p>
      </div>
    </div>
  );
}

// ── Summary view for compaction / branch_summary ─────────────────────

function SummaryView({ entry }: { entry: TranscriptEntry }) {
  const label = entry.type === 'compaction' ? 'Compaction Summary' : 'Branch Summary';
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider bg-yellow-500/20 text-yellow-300">
          {label}
        </span>
      </div>
      <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
        {entry.summary ?? 'No summary available.'}
      </p>
    </div>
  );
}

// ── Main DetailPanel ─────────────────────────────────────────────────

export function DetailPanel() {
  const selectedNodeId = useTranscriptStore((s) => s.selectedNodeId);
  const entries = useTranscriptStore((s) => s.entries);

  // Find the selected entry
  const selectedEntry = useMemo(
    () => (selectedNodeId ? entries.find((e) => e.id === selectedNodeId) : undefined),
    [selectedNodeId, entries]
  );

  // Build tool results map
  const toolResults = useMemo(
    () => (selectedEntry ? buildToolResultsMap(entries, selectedEntry) : new Map<string, string>()),
    [entries, selectedEntry]
  );

  if (!selectedEntry) {
    return (
      <div className="h-full bg-surface-secondary border-t border-surface-tertiary">
        <EmptyState />
      </div>
    );
  }

  const hasMessage = selectedEntry.type === 'message' && selectedEntry.message;
  const hasSummary =
    (selectedEntry.type === 'compaction' || selectedEntry.type === 'branch_summary') &&
    selectedEntry.summary;
  const contentBlocks: ContentBlock[] = Array.isArray(selectedEntry.message?.content)
    ? (selectedEntry.message!.content as ContentBlock[])
    : [];
  const hasToolCalls = contentBlocks.some((b) => b.type === 'tool_use');

  return (
    <div className="h-full bg-surface-secondary border-t border-surface-tertiary flex flex-col overflow-hidden">
      {/* Drag handle / header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-surface-tertiary bg-surface-secondary shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            Detail
          </span>
          <span className="text-[10px] text-gray-600 font-mono truncate max-w-[200px]">
            {selectedEntry.id}
          </span>
        </div>
        <button
          onClick={() => useTranscriptStore.getState().selectNode(null)}
          className="text-gray-500 hover:text-gray-300 transition-colors p-0.5"
          title="Close detail panel"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Message content */}
        {hasMessage && (
          <MessageView
            message={selectedEntry.message!}
            timestamp={selectedEntry.timestamp}
          />
        )}

        {/* Summary content (compaction / branch) */}
        {hasSummary && <SummaryView entry={selectedEntry} />}

        {/* Non-message, non-summary entries */}
        {!hasMessage && !hasSummary && (
          <div className="px-3 py-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider bg-gray-500/20 text-gray-300">
                {selectedEntry.type}
              </span>
            </div>
            {selectedEntry.data != null && (
              <pre className="text-[11px] text-gray-300 font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto bg-surface/50 rounded p-2">
                {typeof selectedEntry.data === 'string'
                  ? selectedEntry.data
                  : JSON.stringify(selectedEntry.data, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* Tool calls */}
        {hasToolCalls && (
          <ToolCallView contentBlocks={contentBlocks} toolResults={toolResults} />
        )}

        {/* Metadata */}
        <MetadataView entry={selectedEntry} />
      </div>
    </div>
  );
}

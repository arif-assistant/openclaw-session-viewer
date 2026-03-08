// ── DetailPanel — Selected node detail view ──────────────────────────
//
// When a round node is selected, shows the full round content:
//   - User prompt (MessageView)
//   - Tool calls (collapsible list)
//   - Final assistant response (MessageView)
//   - Metadata (total tokens, timestamp, round type)
//
// When a bone node is selected, shows the single tool call detail.

import { useMemo } from 'react';
import type { TranscriptEntry, ContentBlock } from '@/gateway/types';
import type { Round } from '@/layout/types';
import { useTranscriptStore } from '@/store/transcript';
import { MessageView } from './MessageView';
import { ToolCallView } from './ToolCallView';
import { MetadataView } from './MetadataView';
import { formatTokenCount } from './MetadataView';

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

// ── Round detail view ────────────────────────────────────────────────

const ROUND_TYPE_LABELS: Record<string, { bg: string; text: string; label: string }> = {
  normal:    { bg: 'bg-blue-500/20',   text: 'text-blue-300',   label: 'Conversation' },
  tool_call: { bg: 'bg-orange-500/20', text: 'text-orange-300', label: 'Tool Call' },
  subagent:  { bg: 'bg-purple-500/20', text: 'text-purple-300', label: 'Subagent' },
};

function RoundDetail({ round }: { round: Round }) {
  const typeStyle = ROUND_TYPE_LABELS[round.type] ?? ROUND_TYPE_LABELS.normal;

  // Build tool results map from the round's raw entries
  const toolResults = useMemo(() => {
    const map = new Map<string, string>();
    for (const tc of round.toolCalls) {
      if (tc.id && tc.resultContent) {
        map.set(tc.id, tc.resultContent);
      }
    }
    return map;
  }, [round.toolCalls]);

  // Collect all tool_use content blocks from all assistant messages in the round
  const allToolUseBlocks = useMemo(() => {
    const blocks: ContentBlock[] = [];
    for (const entry of round.rawEntries) {
      if (entry.message?.role === 'assistant' && Array.isArray(entry.message.content)) {
        for (const block of entry.message.content) {
          if (block.type === 'tool_use') {
            blocks.push(block as ContentBlock);
          }
        }
      }
    }
    return blocks;
  }, [round.rawEntries]);

  return (
    <>
      {/* Round header */}
      <div className="px-3 py-2 border-b border-surface-tertiary">
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ${typeStyle.bg} ${typeStyle.text}`}
          >
            {typeStyle.label}
          </span>
          <span className="text-[10px] text-gray-600 font-mono">{round.id}</span>
          {round.totalTokens > 0 && (
            <span className="text-[10px] text-gray-500 font-mono ml-auto">
              {formatTokenCount(round.totalTokens)} tokens
            </span>
          )}
        </div>
        {round.subagentSpawns.length > 0 && (
          <div className="mt-1 text-[10px] text-purple-400">
            🧬 Spawned {round.subagentSpawns.length} subagent{round.subagentSpawns.length > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* User prompt */}
      {round.userMessage?.message && (
        <MessageView
          message={round.userMessage.message}
          timestamp={round.userMessage.timestamp}
        />
      )}

      {/* Tool calls */}
      {allToolUseBlocks.length > 0 && (
        <ToolCallView contentBlocks={allToolUseBlocks} toolResults={toolResults} />
      )}

      {/* Final assistant response */}
      {round.assistantMessage?.message &&
        round.assistantMessage !== round.userMessage && (
          <MessageView
            message={round.assistantMessage.message}
            timestamp={round.assistantMessage.timestamp}
          />
        )}

      {/* Round metadata */}
      <div className="px-3 py-2 border-t border-surface-tertiary">
        <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          Round Metadata
        </h4>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
          <span className="text-gray-500">Type</span>
          <span className="text-gray-300 font-mono">{round.type}</span>
          <span className="text-gray-500">Timestamp</span>
          <span className="text-gray-300 font-mono">
            {round.timestamp ? new Date(round.timestamp).toLocaleString() : '—'}
          </span>
          <span className="text-gray-500">Total tokens</span>
          <span className="text-gray-300 font-mono">{formatTokenCount(round.totalTokens)}</span>
          <span className="text-gray-500">Messages</span>
          <span className="text-gray-300 font-mono">{round.rawEntries.length}</span>
          <span className="text-gray-500">Tool calls</span>
          <span className="text-gray-300 font-mono">{round.toolCalls.length}</span>
        </div>
      </div>
    </>
  );
}

// ── Bone (tool call) detail view ─────────────────────────────────────

function BoneDetail({ roundId, boneIndex, rounds }: { roundId: string; boneIndex: number; rounds: Round[] }) {
  const round = rounds.find((r) => r.id === roundId);
  if (!round) return <EmptyState />;

  const tc = round.toolCalls[boneIndex];
  if (!tc) return <EmptyState />;

  // Build a synthetic content block for ToolCallView
  const blocks: ContentBlock[] = [tc.toolUseBlock as ContentBlock];
  const toolResults = new Map<string, string>();
  if (tc.id && tc.resultContent) {
    toolResults.set(tc.id, tc.resultContent);
  }

  return (
    <>
      <div className="px-3 py-2 border-b border-surface-tertiary">
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider bg-orange-500/20 text-orange-300">
            Tool Call
          </span>
          <span className="text-xs font-mono text-gray-300">{tc.name}</span>
        </div>
      </div>
      <ToolCallView contentBlocks={blocks} toolResults={toolResults} />
    </>
  );
}

// ── Main DetailPanel ─────────────────────────────────────────────────

export function DetailPanel() {
  const selectedNodeId = useTranscriptStore((s) => s.selectedNodeId);
  const rounds = useTranscriptStore((s) => s.rounds);

  // Determine what we're showing
  const detail = useMemo(() => {
    if (!selectedNodeId) return null;

    // Check if it's a bone node: "{roundId}-bone-{index}"
    const boneMatch = selectedNodeId.match(/^(round-\d+)-bone-(\d+)$/);
    if (boneMatch) {
      return {
        kind: 'bone' as const,
        roundId: boneMatch[1],
        boneIndex: parseInt(boneMatch[2], 10),
      };
    }

    // Check if it's a round node
    const round = rounds.find((r) => r.id === selectedNodeId);
    if (round) {
      return { kind: 'round' as const, round };
    }

    return null;
  }, [selectedNodeId, rounds]);

  if (!detail) {
    return (
      <div className="h-full bg-surface-secondary border-t border-surface-tertiary">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="h-full bg-surface-secondary border-t border-surface-tertiary flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-surface-tertiary bg-surface-secondary shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            Detail
          </span>
          <span className="text-[10px] text-gray-600 font-mono truncate max-w-[200px]">
            {selectedNodeId}
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
        {detail.kind === 'round' && <RoundDetail round={detail.round} />}
        {detail.kind === 'bone' && (
          <BoneDetail roundId={detail.roundId} boneIndex={detail.boneIndex} rounds={rounds} />
        )}
      </div>
    </div>
  );
}

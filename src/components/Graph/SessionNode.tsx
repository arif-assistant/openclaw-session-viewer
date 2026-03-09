// ── SessionNode — Custom React Flow node ─────────────────────────────
//
// Renders either:
//   A) A round node  – shows round summary, tool-call badge, toggle button
//   B) A bone node   – small tool-call indicator when a round is expanded
//   C) A sub-agent fork node – purple fork showing sub-agent session key
//
// Visual encoding:
//   - Size ∝ token count
//   - Colour encodes round type (blue=normal, orange=tool_call, purple=subagent)
//   - Handles: left (target) + right (source) + bottom (source, for bones/forks)

import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { SessionNodeData } from '@/layout/fishbone';
import { useTranscriptStore } from '@/store/transcript';

// ── Bone node (small tool-call indicator) ────────────────────────────

function BoneNode({ data, selected }: { data: SessionNodeData; selected: boolean }) {
  return (
    <div
      style={{
        width: data.nodeWidth,
        height: data.nodeHeight,
        borderColor: data.color,
      }}
      className={`
        relative rounded border bg-surface-secondary px-2 py-1
        flex items-center gap-1.5 overflow-hidden
        cursor-pointer transition-shadow text-xs
        ${selected ? 'shadow-lg ring-2 ring-accent' : 'hover:shadow-md'}
      `}
    >
      <span className="text-[10px]">🔧</span>
      <span className="text-[11px] text-gray-300 truncate font-mono">
        {data.toolName}
      </span>

      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-gray-500 !border-gray-600"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-gray-500 !border-gray-600"
      />
    </div>
  );
}

// ── Sub-agent fork node ──────────────────────────────────────────────

function SubagentForkNode({ data, selected }: { data: SessionNodeData; selected: boolean }) {
  const toggleSubagent = useTranscriptStore((s) => s.toggleSubagent);
  const loadSubagentTranscript = useTranscriptStore((s) => s.loadSubagentTranscript);
  // Issue 6 fix: subscribe only to this fork's loading/failed state
  const sessionKey = data.subagentSessionKey;
  const isLoading = useTranscriptStore((s) => s.loadingSubagents.has(sessionKey));
  const isFailed = useTranscriptStore((s) => s.failedSubagents.has(sessionKey));

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleSubagent(data.parentRoundId, data.subagentSessionKey);
    },
    [toggleSubagent, data.parentRoundId, data.subagentSessionKey]
  );

  const handleRetry = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      loadSubagentTranscript(data.subagentSessionKey);
    },
    [loadSubagentTranscript, data.subagentSessionKey]
  );

  return (
    <div
      onClick={handleClick}
      style={{
        width: data.nodeWidth,
        height: data.nodeHeight,
        borderColor: isFailed ? '#ef4444' : data.color,
        borderStyle: 'dashed',
      }}
      className={`
        relative rounded-lg border-2 bg-surface-secondary px-2 py-1
        flex items-center gap-1.5 overflow-hidden
        cursor-pointer transition-all
        ${selected ? 'shadow-lg ring-2 ring-purple-400' : 'hover:shadow-md hover:bg-purple-900/10'}
      `}
      title={
        isFailed
          ? `Sub-agent: ${data.subagentSessionKey}\nFailed to load — click ↻ to retry`
          : `Sub-agent: ${data.subagentSessionKey}\nClick to ${data.subagentExpanded ? 'collapse' : 'expand'}`
      }
    >
      <span className="text-[10px]">
        {isLoading ? '⏳' : isFailed ? '⚠️' : data.subagentExpanded ? '▼' : '▶'}
      </span>
      <span
        className="text-[11px] truncate font-mono"
        style={{ color: isFailed ? '#ef4444' : data.color }}
      >
        {isFailed ? 'Load failed' : data.preview}
      </span>
      {isFailed && (
        <button
          onClick={handleRetry}
          className="text-[10px] ml-auto px-1 rounded hover:bg-red-900/20 transition-colors"
          style={{ color: '#ef4444' }}
          title="Retry loading"
        >
          ↻
        </button>
      )}

      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !border-purple-500"
        style={{ background: data.color }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !border-purple-500"
        style={{ background: data.color }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-2 !h-2 !border-purple-500"
        style={{ background: data.color }}
      />
    </div>
  );
}

// ── Round node (main spine node) ─────────────────────────────────────

function RoundNode({ data, selected }: { data: SessionNodeData; selected: boolean }) {
  const toggleRound = useTranscriptStore((s) => s.toggleRound);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleRound(data.entryId);
    },
    [toggleRound, data.entryId]
  );

  const { nodeWidth, nodeHeight, color, preview, totalTokens, toolCallCount, expanded, hasSubagent } = data;

  // Opacity increases with token count (min 0.6, max 1.0)
  const opacity = Math.min(
    1.0,
    0.6 + (totalTokens > 0 ? Math.min(0.4, totalTokens / 10000) : 0)
  );

  return (
    <div
      style={{
        width: nodeWidth,
        height: nodeHeight,
        borderColor: color,
        opacity,
      }}
      className={`
        relative rounded-lg border-2 bg-surface-secondary p-1.5
        flex flex-col justify-between overflow-hidden
        cursor-pointer transition-shadow
        ${selected ? 'shadow-lg ring-2 ring-accent' : 'hover:shadow-md'}
      `}
      title={
        data.userPreview
          ? `User: ${data.userPreview}\n\nAssistant: ${data.assistantPreview}`
          : data.assistantPreview || undefined
      }
    >
      {/* Top row: preview text */}
      <div className="flex items-start gap-1 min-w-0">
        <span className="text-sm flex-shrink-0">
          {hasSubagent ? '🧬' : toolCallCount > 0 ? '🤖' : '💬'}
        </span>
        <span className="text-[11px] text-gray-300 truncate leading-tight">
          {preview || '…'}
        </span>
      </div>

      {/* Bottom row: badges */}
      <div className="flex items-center justify-between">
        {/* Tool call badge + toggle */}
        <div className="flex items-center gap-1">
          {toolCallCount > 0 && (
            <button
              onClick={handleToggle}
              className="text-[9px] px-1 py-0.5 rounded-sm font-mono flex items-center gap-0.5 hover:bg-surface-tertiary transition-colors"
              style={{ color }}
              title={expanded ? 'Collapse tool calls' : 'Expand tool calls'}
            >
              <span className="text-[8px]">{expanded ? '▼' : '▶'}</span>
              🔧×{toolCallCount}
            </button>
          )}
          {hasSubagent && (
            <span className="text-[9px] px-1 py-0.5 rounded-sm" style={{ color: '#a855f7' }}>
              🧬 sub
            </span>
          )}
        </div>

        {/* Token badge */}
        {totalTokens > 0 && (
          <span
            className="text-[9px] px-1 py-0.5 rounded-sm font-mono"
            style={{ backgroundColor: `${color}30`, color }}
          >
            {totalTokens >= 1000
              ? `${(totalTokens / 1000).toFixed(1)}k`
              : totalTokens}{' '}
            tok
          </span>
        )}
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-gray-500 !border-gray-600"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-gray-500 !border-gray-600"
      />
      {/* Bottom handle for bone/fork connections */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!w-2 !h-2 !bg-gray-500 !border-gray-600"
      />
    </div>
  );
}

// ── SessionNode dispatcher ───────────────────────────────────────────

function SessionNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as SessionNodeData;

  if (nodeData.isSubagentFork) {
    return <SubagentForkNode data={nodeData} selected={!!selected} />;
  }

  if (nodeData.isBone) {
    return <BoneNode data={nodeData} selected={!!selected} />;
  }

  return <RoundNode data={nodeData} selected={!!selected} />;
}

export const SessionNode = memo(SessionNodeComponent);

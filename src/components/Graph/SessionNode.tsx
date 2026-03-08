// ── SessionNode — Custom React Flow node ─────────────────────────────
//
// Renders a single transcript entry as a fishbone node:
//   - Size ∝ token count
//   - Color encodes entry category
//   - Shows role icon + truncated preview + token badge
//   - Handles: left (target) + right (source)

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { SessionNodeData } from '@/layout/fishbone';

const ROLE_ICONS: Record<string, string> = {
  user:      '👤',
  assistant: '🤖',
  system:    '⚙️',
  tool:      '🔧',
  session:   '▶️',
  compaction: '📦',
  model_change: '🔄',
  branch_summary: '🌿',
};

function getRoleIcon(data: SessionNodeData): string {
  if (data.type === 'message' && data.role) {
    return ROLE_ICONS[data.role] ?? '💬';
  }
  return ROLE_ICONS[data.type] ?? '📋';
}

function SessionNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as SessionNodeData;
  const { nodeWidth, nodeHeight, color, preview, totalTokens } = nodeData;
  const icon = getRoleIcon(nodeData);

  // Opacity increases with token count (min 0.6, max 1.0)
  const opacity = Math.min(1.0, 0.6 + (totalTokens > 0 ? Math.min(0.4, totalTokens / 10000) : 0));

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
    >
      {/* Top: role icon + preview */}
      <div className="flex items-start gap-1 min-w-0">
        <span className="text-sm flex-shrink-0">{icon}</span>
        <span className="text-[11px] text-gray-300 truncate leading-tight">
          {preview || '…'}
        </span>
      </div>

      {/* Bottom: token badge */}
      {totalTokens > 0 && (
        <div className="flex justify-end">
          <span
            className="text-[9px] px-1 py-0.5 rounded-sm font-mono"
            style={{ backgroundColor: `${color}30`, color }}
          >
            {totalTokens >= 1000
              ? `${(totalTokens / 1000).toFixed(1)}k`
              : totalTokens}{' '}
            tok
          </span>
        </div>
      )}

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
    </div>
  );
}

export const SessionNode = memo(SessionNodeComponent);

import type { TreeNode } from '@/gateway/types';
import { useSessionStore, getSessionDisplayName, formatRelativeTime, formatTokens, shortenModel } from '@/store/sessions';

interface SessionTreeItemProps {
  node: TreeNode;
  depth: number;
}

export function SessionTreeItem({ node, depth }: SessionTreeItemProps) {
  const activeSessionKey = useSessionStore((s) => s.activeSessionKey);
  const selectSession = useSessionStore((s) => s.selectSession);
  const toggleExpanded = useSessionStore((s) => s.toggleExpanded);

  const { session, children, expanded } = node;
  const isActive = activeSessionKey === session.key;
  const hasChildren = children.length > 0;
  const displayName = getSessionDisplayName(session);
  const model = shortenModel(session.model);
  const tokens = formatTokens(session.totalTokens);
  const updated = formatRelativeTime(session.updatedAt);

  return (
    <div>
      <div
        className={`group flex items-start gap-1 px-2 py-1.5 cursor-pointer rounded-md mx-1 transition-colors ${
          isActive
            ? 'bg-accent/15 text-accent'
            : 'text-gray-300 hover:bg-surface-tertiary/50'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => selectSession(session.key)}
      >
        {/* Expand/collapse toggle */}
        <button
          className={`shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center rounded transition-colors ${
            hasChildren
              ? 'text-gray-500 hover:text-gray-300'
              : 'text-transparent cursor-default'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) toggleExpanded(session.key);
          }}
          tabIndex={-1}
        >
          {hasChildren && (
            <svg
              className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
        </button>

        {/* Session info */}
        <div className="flex-1 min-w-0">
          {/* Name + channel badge */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium truncate">{displayName}</span>
            {session.channel && (
              <span className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-surface-tertiary/60 text-gray-500 leading-none">
                {session.channel}
              </span>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
            {model && <span className="truncate max-w-[100px]">{model}</span>}
            <span className="shrink-0">{tokens} tok</span>
            <span className="shrink-0 ml-auto">{updated}</span>
          </div>
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {children.map((child) => (
            <SessionTreeItem
              key={child.session.key}
              node={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

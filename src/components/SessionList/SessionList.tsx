import { useEffect, useState } from 'react';
import { useSessionStore } from '@/store/sessions';
import { useConnectionStore } from '@/store/connection';
import { SessionFilter } from './SessionFilter';
import { SessionTreeItem } from './SessionTreeItem';

export function SessionList() {
  const status = useConnectionStore((s) => s.status);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const getFilteredTree = useSessionStore((s) => s.getFilteredTree);
  const loading = useSessionStore((s) => s.loading);
  const error = useSessionStore((s) => s.error);
  const filterQuery = useSessionStore((s) => s.filterQuery);
  const sessions = useSessionStore((s) => s.sessions);
  const sessionTree = useSessionStore((s) => s.sessionTree);
  const [collapsed, setCollapsed] = useState(false);

  // Fetch sessions when connected
  useEffect(() => {
    if (status === 'connected') {
      fetchSessions();
    }
  }, [status, fetchSessions]);

  // Derive filtered tree (depends on sessionTree, filterQuery, sessions)
  const filteredTree = getFilteredTree();

  if (collapsed) {
    return (
      <aside className="w-10 bg-surface-secondary border-r border-surface-tertiary flex flex-col items-center pt-3 shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="text-gray-500 hover:text-gray-300 transition-colors p-1"
          title="Expand sidebar"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-72 bg-surface-secondary border-r border-surface-tertiary flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-surface-tertiary">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Sessions
          {sessions.size > 0 && (
            <span className="ml-1.5 text-gray-500 normal-case tracking-normal">
              ({filteredTree.length !== sessions.size ? `${filteredTree.length}/` : ''}{sessions.size})
            </span>
          )}
        </h2>
        <div className="flex items-center gap-1">
          {/* Refresh button */}
          <button
            onClick={() => fetchSessions()}
            disabled={loading}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1 disabled:opacity-50"
            title="Refresh sessions"
          >
            <svg
              className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          {/* Collapse button */}
          <button
            onClick={() => setCollapsed(true)}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1"
            title="Collapse sidebar"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="pt-2">
        <SessionFilter />
      </div>

      {/* Session tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading && sessions.size === 0 ? (
          <div className="px-3 py-8 text-center">
            <svg
              className="w-5 h-5 animate-spin text-gray-500 mx-auto mb-2"
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
            <p className="text-xs text-gray-500">Loading sessions…</p>
          </div>
        ) : error ? (
          <div className="px-3 py-4">
            <p className="text-xs text-status-error">{error}</p>
            <button
              onClick={() => fetchSessions()}
              className="text-xs text-accent hover:text-accent-hover mt-1"
            >
              Retry
            </button>
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-gray-500">
              {filterQuery ? 'No sessions match filter.' : 'No sessions found.'}
            </p>
          </div>
        ) : (
          filteredTree.map((node) => (
            <SessionTreeItem key={node.session.key} node={node} depth={0} />
          ))
        )}
      </div>
    </aside>
  );
}

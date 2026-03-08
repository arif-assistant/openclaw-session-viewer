import { create } from 'zustand';
import { useConnectionStore } from '@/store/connection';
import type { SessionListItem, TreeNode, SessionsListResponse } from '@/gateway/types';

// ── Helper: Build tree from flat session list ────────────────────────

export function buildSessionTree(sessions: SessionListItem[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();

  // Create a TreeNode for each session
  for (const session of sessions) {
    nodeMap.set(session.sessionKey, {
      session,
      children: [],
      expanded: true,
    });
  }

  const roots: TreeNode[] = [];

  // Build parent-child relationships
  for (const session of sessions) {
    const node = nodeMap.get(session.sessionKey)!;
    if (session.spawnedBy && nodeMap.has(session.spawnedBy)) {
      nodeMap.get(session.spawnedBy)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by updatedAt descending (newest first)
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort(
      (a, b) =>
        new Date(b.session.updatedAt).getTime() -
        new Date(a.session.updatedAt).getTime()
    );
    for (const node of nodes) {
      sortNodes(node.children);
    }
  };

  sortNodes(roots);
  return roots;
}

// ── Helper: Filter sessions by query ─────────────────────────────────

export function filterSessions(
  sessions: SessionListItem[],
  query: string
): SessionListItem[] {
  if (!query.trim()) return sessions;
  const lower = query.toLowerCase();
  return sessions.filter((s) => {
    const name =
      s.displayName || s.label || s.derivedTitle || s.sessionKey;
    return (
      name.toLowerCase().includes(lower) ||
      s.sessionKey.toLowerCase().includes(lower) ||
      (s.model && s.model.toLowerCase().includes(lower)) ||
      (s.channel && s.channel.toLowerCase().includes(lower))
    );
  });
}

// ── Helper: Get display name for session ─────────────────────────────

export function getSessionDisplayName(session: SessionListItem): string {
  return session.displayName || session.label || session.derivedTitle || session.sessionKey;
}

// ── Helper: Format relative time ─────────────────────────────────────

export function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}mo ago`;
}

// ── Helper: Format token count ───────────────────────────────────────

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

// ── Helper: Shorten model name ───────────────────────────────────────

export function shortenModel(model?: string): string {
  if (!model) return '';
  // Extract the last meaningful segment (e.g. "claude-opus-4.6" from a long path)
  const parts = model.split('/');
  const last = parts[parts.length - 1];
  // Truncate if still long
  if (last.length > 20) return last.slice(0, 18) + '…';
  return last;
}

// ── Store ────────────────────────────────────────────────────────────

interface SessionStore {
  // State
  sessions: Map<string, SessionListItem>;
  sessionTree: TreeNode[];
  activeSessionKey: string | null;
  filterQuery: string;
  loading: boolean;
  error: string | null;

  // Actions
  fetchSessions: () => Promise<void>;
  selectSession: (key: string | null) => void;
  setFilterQuery: (query: string) => void;
  toggleExpanded: (key: string) => void;
  getFilteredTree: () => TreeNode[];
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: new Map(),
  sessionTree: [],
  activeSessionKey: null,
  filterQuery: '',
  loading: false,
  error: null,

  fetchSessions: async () => {
    const client = useConnectionStore.getState().client;
    if (!client) {
      set({ error: 'Not connected' });
      return;
    }

    set({ loading: true, error: null });

    try {
      const result = await client.request<SessionsListResponse>('sessions.list', {
        includeDerivedTitles: true,
        includeLastMessage: true,
      });

      const sessionsList = result.sessions ?? [];
      const sessionsMap = new Map<string, SessionListItem>();
      for (const s of sessionsList) {
        sessionsMap.set(s.sessionKey, s);
      }

      const tree = buildSessionTree(sessionsList);
      set({ sessions: sessionsMap, sessionTree: tree, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch sessions',
        loading: false,
      });
    }
  },

  selectSession: (key: string | null) => {
    set({ activeSessionKey: key });
  },

  setFilterQuery: (query: string) => {
    set({ filterQuery: query });
  },

  toggleExpanded: (key: string) => {
    const { sessionTree } = get();

    const toggleInTree = (nodes: TreeNode[]): TreeNode[] =>
      nodes.map((node) => {
        if (node.session.sessionKey === key) {
          return { ...node, expanded: !node.expanded };
        }
        if (node.children.length > 0) {
          return { ...node, children: toggleInTree(node.children) };
        }
        return node;
      });

    set({ sessionTree: toggleInTree(sessionTree) });
  },

  getFilteredTree: () => {
    const { sessionTree, filterQuery, sessions } = get();
    if (!filterQuery.trim()) return sessionTree;

    const filtered = filterSessions([...sessions.values()], filterQuery);
    const filteredKeys = new Set(filtered.map((s) => s.sessionKey));

    // Include ancestors of matched sessions so tree structure is preserved
    const includeKeys = new Set<string>();
    for (const session of filtered) {
      let current: SessionListItem | undefined = session;
      while (current) {
        includeKeys.add(current.sessionKey);
        current = current.spawnedBy
          ? sessions.get(current.spawnedBy)
          : undefined;
      }
    }

    const filterTree = (nodes: TreeNode[]): TreeNode[] =>
      nodes
        .filter((node) => includeKeys.has(node.session.sessionKey))
        .map((node) => ({
          ...node,
          children: filterTree(node.children),
          // Auto-expand nodes that match filter
          expanded: filteredKeys.has(node.session.sessionKey)
            ? true
            : node.expanded,
        }));

    return filterTree(sessionTree);
  },
}));

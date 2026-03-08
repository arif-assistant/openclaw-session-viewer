// ── Layout-related types ──────────────────────────────────────────────

/** Classification of a transcript entry for visual encoding. */
export type EntryCategory =
  | 'conversation'   // Regular user/assistant text
  | 'tool_call'      // Assistant message with tool calls
  | 'subagent'       // Entry that spawned a subagent
  | 'system';        // compaction, model_change, etc.

/** Computed dimensions for a node. */
export interface NodeDimensions {
  width: number;
  height: number;
}

/** A tree node built from transcript entries. */
export interface LayoutEntry {
  id: string;
  parentId: string | undefined;
  type: string;
  category: EntryCategory;
  role?: string;
  preview: string;
  totalTokens: number;
  timestamp?: string;
  children: LayoutEntry[];
  /** Depth in the tree (0 = root). */
  depth: number;
  /** Index within the main spine or branch. */
  index: number;
}

/** Color mapping for entry categories. */
export const CATEGORY_COLORS: Record<EntryCategory, string> = {
  conversation: '#3b82f6',  // blue
  tool_call:    '#f97316',  // orange
  subagent:     '#22c55e',  // green
  system:       '#9ca3af',  // gray
};

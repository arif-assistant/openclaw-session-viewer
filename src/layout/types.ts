// ── Layout-related types ──────────────────────────────────────────────

/** Classification of a transcript entry for visual encoding. */
export type EntryCategory =
  | 'conversation'   // Regular user/assistant text
  | 'tool_call'      // Assistant message with tool calls
  | 'subagent'       // Entry that spawned a subagent
  | 'system';        // compaction, model_change, etc.

/** Round type — matches EntryCategory but uses the spec naming. */
export type RoundType = 'normal' | 'tool_call' | 'subagent';

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

/** A single tool call within a round (tool_use + optional tool_result). */
export interface ToolCallInfo {
  /** tool_use block id. */
  id?: string;
  /** Tool name (e.g. "exec", "read", "web_search"). */
  name: string;
  /** Raw tool_use block. */
  toolUseBlock: unknown;
  /** Corresponding tool result content (if found). */
  resultContent?: string;
}

/**
 * A "round" groups one user→assistant interaction cycle.
 * Multiple intermediate tool calls are folded into the round.
 */
export interface Round {
  /** Stable id: "round-0", "round-1", … */
  id: string;
  /** The user message that started this round (may be absent for system-initiated). */
  userMessage?: import('@/gateway/types').TranscriptEntry;
  /** The final assistant reply (the one sent to the IM channel). */
  assistantMessage?: import('@/gateway/types').TranscriptEntry;
  /** Intermediate tool call pairs (tool_use → tool_result). */
  toolCalls: ToolCallInfo[];
  /** Session keys of subagents spawned during this round. */
  subagentSpawns: string[];
  /** All raw entries belonging to this round (for detail view). */
  rawEntries: import('@/gateway/types').TranscriptEntry[];
  /** Sum of all tokens consumed in this round. */
  totalTokens: number;
  /** Timestamp of the first message in the round. */
  timestamp?: string;
  /** Classification for colour coding. */
  type: RoundType;
}

/** Color mapping for entry categories. */
export const CATEGORY_COLORS: Record<EntryCategory, string> = {
  conversation: '#3b82f6',  // blue
  tool_call:    '#f97316',  // orange
  subagent:     '#a855f7',  // purple  (was green, now purple per spec)
  system:       '#9ca3af',  // gray
};

/** Color mapping for round types. */
export const ROUND_COLORS: Record<RoundType, string> = {
  normal:    '#3b82f6',  // blue  — pure conversation
  tool_call: '#f97316',  // orange — has tool calls
  subagent:  '#a855f7',  // purple — spawned a subagent
};

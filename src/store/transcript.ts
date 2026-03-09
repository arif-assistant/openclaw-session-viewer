// ── Transcript Store ──────────────────────────────────────────────────
//
// Manages the currently-selected session's transcript data and
// the computed fishbone graph layout.
//
// Key concept: **Rounds**.
// Raw chat.history messages are grouped into "rounds" where each round
// is one user→assistant interaction cycle.  Multiple tool calls within
// a single cycle are folded into the round.

import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type { TranscriptEntry, ContentBlock } from '@/gateway/types';
import type { Round, ToolCallInfo, RoundType } from '@/layout/types';
import { computeFishboneLayout, type SessionNodeData } from '@/layout/fishbone';
import { useConnectionStore } from './connection';

// ── Round grouping logic ─────────────────────────────────────────────

/**
 * Group flat transcript entries into rounds.
 *
 * A round starts at a `user` message and includes every subsequent
 * assistant / tool message until the next `user` message (or end).
 *
 * System / compaction / session entries that appear before the first
 * user message form a special "system" round.
 */
export function groupIntoRounds(entries: TranscriptEntry[]): Round[] {
  if (entries.length === 0) return [];

  const rounds: Round[] = [];
  let currentRound: Round | null = null;
  let roundIndex = 0;

  function finishRound() {
    if (currentRound) {
      // Determine round type
      currentRound.type = classifyRound(currentRound);
      rounds.push(currentRound);
    }
  }

  function newRound(): Round {
    const round: Round = {
      id: `round-${roundIndex++}`,
      toolCalls: [],
      subagentSpawns: [],
      rawEntries: [],
      totalTokens: 0,
      type: 'normal',
    };
    return round;
  }

  for (const entry of entries) {
    const role = entry.message?.role;

    // Start a new round on every user message
    if (role === 'user') {
      finishRound();
      currentRound = newRound();
      currentRound.userMessage = entry;
      currentRound.timestamp = entry.timestamp;
      currentRound.rawEntries.push(entry);
      currentRound.totalTokens += extractEntryTokens(entry);
      continue;
    }

    // If no round has been started yet, create one for pre-user messages
    if (!currentRound) {
      currentRound = newRound();
      // For non-user entries before the first user message (session start, etc.)
      if (entry.timestamp) currentRound.timestamp = entry.timestamp;
    }

    currentRound.rawEntries.push(entry);
    currentRound.totalTokens += extractEntryTokens(entry);

    if (role === 'assistant' && entry.type === 'message') {
      // Check if this assistant message has tool calls
      const toolUseBlocks = extractToolUseBlocks(entry);
      if (toolUseBlocks.length > 0) {
        // This is an intermediate assistant message with tool calls
        for (const block of toolUseBlocks) {
          const tcInfo: ToolCallInfo = {
            id: block.id as string | undefined,
            name: (block.name as string) ?? 'unknown',
            toolUseBlock: block,
          };

          // Check for subagent spawn
          const toolName = tcInfo.name;
          if (
            toolName.includes('subagent') ||
            toolName === 'sessions_spawn'
          ) {
            // Try to extract session key from input
            const input = block.input as Record<string, unknown> | undefined;
            if (input?.sessionKey) {
              currentRound.subagentSpawns.push(input.sessionKey as string);
            } else {
              currentRound.subagentSpawns.push(`subagent-from-${entry.id}`);
            }
          }

          currentRound.toolCalls.push(tcInfo);
        }
        // Don't set as assistantMessage yet — there may be more tool calls
        // The LAST assistant message without tool calls (or the last one period) wins
      } else {
        // Pure text assistant reply — this is (likely) the final response
        currentRound.assistantMessage = entry;
      }
    } else if (role === 'tool') {
      // Match tool result to its tool_use by tool_use_id
      const content = entry.message?.content;
      let toolUseId: string | undefined;
      let resultText: string | undefined;

      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.tool_use_id) {
            toolUseId = block.tool_use_id as string;
            resultText = typeof block.content === 'string'
              ? block.content
              : block.text ?? JSON.stringify(block.content ?? block, null, 2);
          }
        }
      } else if (typeof content === 'string') {
        resultText = content;
        const data = entry.data as Record<string, unknown> | undefined;
        toolUseId = data?.tool_use_id as string | undefined;
      }

      if (toolUseId) {
        const tc = currentRound.toolCalls.find((t) => t.id === toolUseId);
        if (tc) tc.resultContent = resultText;
      }
    }
    // Other entry types (compaction, model_change, etc.) are just collected
  }

  // Finish last round
  finishRound();

  // Post-process: if a round has no explicit assistantMessage but has tool calls,
  // the last assistant entry with tool calls becomes the assistantMessage
  for (const round of rounds) {
    if (!round.assistantMessage) {
      const lastAssistant = [...round.rawEntries]
        .reverse()
        .find((e) => e.message?.role === 'assistant');
      if (lastAssistant) round.assistantMessage = lastAssistant;
    }
  }

  return rounds;
}

function extractToolUseBlocks(entry: TranscriptEntry): ContentBlock[] {
  const content = entry.message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter(
    (b) => typeof b === 'object' && b !== null && b.type === 'tool_use'
  ) as ContentBlock[];
}

function extractEntryTokens(entry: TranscriptEntry): number {
  if (entry.message?.usage) {
    const u = entry.message.usage;
    return (u.input_tokens ?? 0) + (u.output_tokens ?? 0);
  }
  if (entry.type === 'compaction' && entry.tokensBefore) {
    return entry.tokensBefore;
  }
  return 0;
}

function classifyRound(round: Round): RoundType {
  if (round.subagentSpawns.length > 0) return 'subagent';
  if (round.toolCalls.length > 0) return 'tool_call';
  return 'normal';
}

// ── Cached sub-agent transcript ──────────────────────────────────────

export interface SubagentTranscriptCache {
  entries: TranscriptEntry[];
  rounds: Round[];
}

// ── Store ────────────────────────────────────────────────────────────

interface TranscriptStore {
  // ── State ──
  /** Currently loaded session key. */
  sessionKey: string | null;
  /** Raw transcript entries for the current session. */
  entries: TranscriptEntry[];
  /** Grouped rounds (derived from entries). */
  rounds: Round[];
  /** React Flow nodes (computed from layout). */
  graphNodes: Node<SessionNodeData>[];
  /** React Flow edges (computed from layout). */
  graphEdges: Edge[];
  /** Currently selected node id (round id or tool-call id). */
  selectedNodeId: string | null;
  /** Set of expanded round ids (showing tool call bones). */
  expandedRounds: Set<string>;
  /** Whether transcript is being loaded. */
  loading: boolean;
  /** Last error from loading. */
  error: string | null;

  // ── Sub-agent state ──
  /** Cached transcripts for sub-agent sessions (lazy-loaded). */
  subagentTranscripts: Map<string, SubagentTranscriptCache>;
  /** Set of expanded sub-agent session keys. */
  expandedSubagents: Set<string>;
  /** Sub-agent sessions currently being loaded. */
  loadingSubagents: Set<string>;

  // ── Actions ──
  /** Load transcript for a session from the gateway. */
  loadTranscript: (sessionKey: string) => Promise<void>;
  /** Recompute the fishbone layout from current rounds. */
  computeLayout: () => void;
  /** Set selected node. */
  selectNode: (nodeId: string | null) => void;
  /** Toggle expanded state for a round (show/hide tool call bones). */
  toggleRound: (roundId: string) => void;
  /** Toggle a sub-agent fork: expand/collapse + lazy-load transcript. */
  toggleSubagent: (roundId: string, sessionKey: string) => void;
  /** Load a sub-agent transcript (called internally by toggleSubagent). */
  loadSubagentTranscript: (sessionKey: string) => Promise<void>;
  /** Clear the transcript (e.g. on disconnect). */
  clear: () => void;
}

export const useTranscriptStore = create<TranscriptStore>((set, get) => ({
  sessionKey: null,
  entries: [],
  rounds: [],
  graphNodes: [],
  graphEdges: [],
  selectedNodeId: null,
  expandedRounds: new Set(),
  loading: false,
  error: null,

  // Sub-agent state
  subagentTranscripts: new Map(),
  expandedSubagents: new Set(),
  loadingSubagents: new Set(),

  loadTranscript: async (sessionKey: string) => {
    const client = useConnectionStore.getState().client;
    if (!client) {
      set({ error: 'Not connected to gateway' });
      return;
    }

    set({
      loading: true,
      error: null,
      sessionKey,
      expandedRounds: new Set(),
      expandedSubagents: new Set(),
      subagentTranscripts: new Map(),
      loadingSubagents: new Set(),
    });

    try {
      const result = await client.request<{ sessionKey: string; messages: unknown[] }>(
        'chat.history',
        { sessionKey }
      );

      const rawMessages = result?.messages ?? [];

      // Transform raw gateway messages into TranscriptEntry format.
      const entries: TranscriptEntry[] = rawMessages.map((msg: any, index: number) => ({
        id: msg.id ?? `msg-${index}`,
        parentId: msg.parentId ?? (index > 0 ? (rawMessages[index - 1] as any).id ?? `msg-${index - 1}` : undefined),
        type: msg.type ?? ('message' as const),
        message: msg.message ?? {
          role: msg.role ?? 'user',
          content: msg.content ?? null,
          usage: msg.usage,
          timestamp: msg.timestamp ? new Date(msg.timestamp).toISOString() : undefined,
        },
        summary: msg.summary,
        tokensBefore: msg.tokensBefore,
        customType: msg.customType,
        data: msg.data,
        timestamp: msg.timestamp ? new Date(msg.timestamp).toISOString() : undefined,
      }));

      const rounds = groupIntoRounds(entries);

      set({ entries, rounds, loading: false });
      get().computeLayout();
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load transcript',
      });
    }
  },

  computeLayout: () => {
    const { rounds, expandedRounds, subagentTranscripts, expandedSubagents } = get();

    // Build a Map<sessionKey, Round[]> for expanded sub-agents
    const subagentRounds = new Map<string, Round[]>();
    for (const [key, cache] of subagentTranscripts) {
      if (expandedSubagents.has(key)) {
        subagentRounds.set(key, cache.rounds);
      }
    }

    const { nodes, edges } = computeFishboneLayout(
      rounds,
      expandedRounds,
      subagentRounds,
      expandedSubagents,
    );
    set({ graphNodes: nodes, graphEdges: edges });
  },

  selectNode: (nodeId: string | null) => {
    set({ selectedNodeId: nodeId });
  },

  toggleRound: (roundId: string) => {
    const { expandedRounds } = get();
    const next = new Set(expandedRounds);
    if (next.has(roundId)) {
      next.delete(roundId);
    } else {
      next.add(roundId);
    }
    set({ expandedRounds: next });
    get().computeLayout();
  },

  toggleSubagent: (roundId: string, sessionKey: string) => {
    const { expandedSubagents, subagentTranscripts } = get();
    const next = new Set(expandedSubagents);

    if (next.has(sessionKey)) {
      // Collapse
      next.delete(sessionKey);
      set({ expandedSubagents: next });
      get().computeLayout();
    } else {
      // Expand
      next.add(sessionKey);
      set({ expandedSubagents: next });

      if (subagentTranscripts.has(sessionKey)) {
        // Already cached — just recompute layout
        get().computeLayout();
      } else {
        // Lazy-load the transcript
        get().loadSubagentTranscript(sessionKey);
      }
    }
  },

  loadSubagentTranscript: async (sessionKey: string) => {
    const client = useConnectionStore.getState().client;
    if (!client) return;

    const { loadingSubagents } = get();
    if (loadingSubagents.has(sessionKey)) return; // already loading

    const nextLoading = new Set(loadingSubagents);
    nextLoading.add(sessionKey);
    set({ loadingSubagents: nextLoading });

    try {
      const result = await client.request<{ sessionKey: string; messages: unknown[] }>(
        'chat.history',
        { sessionKey }
      );

      const rawMessages = result?.messages ?? [];
      const entries: TranscriptEntry[] = rawMessages.map((msg: any, index: number) => ({
        id: msg.id ?? `msg-${index}`,
        parentId: msg.parentId ?? (index > 0 ? (rawMessages[index - 1] as any).id ?? `msg-${index - 1}` : undefined),
        type: msg.type ?? ('message' as const),
        message: msg.message ?? {
          role: msg.role ?? 'user',
          content: msg.content ?? null,
          usage: msg.usage,
          timestamp: msg.timestamp ? new Date(msg.timestamp).toISOString() : undefined,
        },
        summary: msg.summary,
        tokensBefore: msg.tokensBefore,
        customType: msg.customType,
        data: msg.data,
        timestamp: msg.timestamp ? new Date(msg.timestamp).toISOString() : undefined,
      }));

      const rounds = groupIntoRounds(entries);

      const nextTranscripts = new Map(get().subagentTranscripts);
      nextTranscripts.set(sessionKey, { entries, rounds });

      const doneLoading = new Set(get().loadingSubagents);
      doneLoading.delete(sessionKey);

      set({ subagentTranscripts: nextTranscripts, loadingSubagents: doneLoading });
      get().computeLayout();
    } catch (err) {
      const doneLoading = new Set(get().loadingSubagents);
      doneLoading.delete(sessionKey);
      set({ loadingSubagents: doneLoading });
      console.error(`Failed to load subagent transcript for ${sessionKey}:`, err);
    }
  },

  clear: () => {
    set({
      sessionKey: null,
      entries: [],
      rounds: [],
      graphNodes: [],
      graphEdges: [],
      selectedNodeId: null,
      expandedRounds: new Set(),
      loading: false,
      error: null,
      subagentTranscripts: new Map(),
      expandedSubagents: new Set(),
      loadingSubagents: new Set(),
    });
  },
}));

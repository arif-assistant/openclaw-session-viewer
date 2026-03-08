// ── Fishbone layout algorithm (Round-based) ──────────────────────────
//
// Input:  Round[] (grouped from transcript entries) + expanded round ids
// Output: React Flow Node[] and Edge[]
//
// Layout rules:
//   - Main spine: one node per round, horizontal left-to-right at Y=0
//   - Tool call "bones": when a round is expanded, its tool calls appear
//     as small nodes below the round node (vertical fishbone ribs)
//   - Node colour encodes round type (normal / tool_call / subagent)
//   - Node size ∝ token count

import type { Node, Edge } from '@xyflow/react';
import type { Round, RoundType } from './types';
import { computeNodeSize } from './node-sizing';
import { ROUND_COLORS } from './types';

// ── Constants ────────────────────────────────────────────────────────

const X_SPACING = 220;       // px between round nodes horizontally
const Y_BONE_SPACING = 80;   // px between tool-call bone nodes vertically
const X_OFFSET = 60;         // left margin

// ── Types for React Flow data ────────────────────────────────────────

export interface SessionNodeData {
  // Common fields
  entryId: string;
  color: string;
  nodeWidth: number;
  nodeHeight: number;
  timestamp?: string;
  totalTokens: number;

  // Round-specific fields (present on round nodes)
  /** Identifies this node as a round node. */
  isRound: boolean;
  /** Round type for colour encoding. */
  roundType: RoundType;
  /** Short label like "Round 3: exec, read → response…" */
  preview: string;
  /** Number of tool calls in this round (for badge). */
  toolCallCount: number;
  /** Whether the round is currently expanded (showing bones). */
  expanded: boolean;
  /** Whether this round has subagent spawns. */
  hasSubagent: boolean;
  /** Tooltip: user prompt (first 200 chars). */
  userPreview: string;
  /** Tooltip: assistant response (first 200 chars). */
  assistantPreview: string;

  // Tool-call bone fields (present on bone nodes)
  /** Identifies this node as a tool-call bone. */
  isBone: boolean;
  /** Tool name (e.g. "exec", "read"). */
  toolName: string;

  // Legacy compatibility fields
  type: string;
  category: string;
  role: string;

  [key: string]: unknown;
}

// ── Preview helpers ──────────────────────────────────────────────────

/**
 * Strip common markdown syntax from text for clean display in graph nodes.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')         // code blocks (must be before inline code)
    .replace(/\*\*(.*?)\*\*/g, '$1')        // bold
    .replace(/\*(.*?)\*/g, '$1')            // italic
    .replace(/`(.*?)`/g, '$1')              // inline code
    .replace(/^#+\s/gm, '')                 // headers
    .replace(/^[-*]\s/gm, '')               // list items
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')     // links
    .trim();
}

function extractTextPreview(entry: import('@/gateway/types').TranscriptEntry | undefined, maxLen = 200): string {
  if (!entry?.message) return '';
  const content = entry.message.content;
  if (typeof content === 'string') return stripMarkdown(content.slice(0, maxLen));
  if (Array.isArray(content)) {
    const textBlock = content.find((b: any) => b.type === 'text' && b.text);
    if (textBlock?.text) return stripMarkdown((textBlock.text as string).slice(0, maxLen));
  }
  return '';
}

function buildRoundPreview(round: Round, index: number): string {
  const parts: string[] = [];

  // Tool names summary
  if (round.toolCalls.length > 0) {
    const toolNames = [...new Set(round.toolCalls.map((tc) => tc.name))];
    const shown = toolNames.slice(0, 3).join(', ');
    const extra = toolNames.length > 3 ? ` +${toolNames.length - 3}` : '';
    parts.push(`${shown}${extra}`);
  }

  // Response snippet
  const response = extractTextPreview(round.assistantMessage, 60);
  if (response) {
    parts.push(`→ ${response}`);
  }

  const detail = parts.length > 0 ? `: ${parts.join(' ')}` : '';
  return `Round ${index + 1}${detail}`;
}

// ── Layout computation ───────────────────────────────────────────────

export interface FishboneResult {
  nodes: Node<SessionNodeData>[];
  edges: Edge[];
}

/**
 * Compute fishbone layout from rounds.
 *
 * @param rounds - Grouped rounds from transcript
 * @param expandedRounds - Set of round ids that are currently expanded
 * @returns React Flow nodes and edges positioned in a fishbone pattern
 */
export function computeFishboneLayout(
  rounds: Round[],
  expandedRounds: Set<string> = new Set()
): FishboneResult {
  if (rounds.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodes: Node<SessionNodeData>[] = [];
  const edges: Edge[] = [];

  // ── Lay out main spine (Y = 0) ──
  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    const { width, height } = computeNodeSize(round.totalTokens);
    const x = X_OFFSET + i * X_SPACING;
    const y = 0;
    const isExpanded = expandedRounds.has(round.id);
    const preview = buildRoundPreview(round, i);

    nodes.push({
      id: round.id,
      type: 'sessionNode',
      position: { x, y },
      data: {
        entryId: round.id,
        color: ROUND_COLORS[round.type],
        nodeWidth: width,
        nodeHeight: height,
        timestamp: round.timestamp,
        totalTokens: round.totalTokens,

        isRound: true,
        roundType: round.type,
        preview,
        toolCallCount: round.toolCalls.length,
        expanded: isExpanded,
        hasSubagent: round.subagentSpawns.length > 0,
        userPreview: extractTextPreview(round.userMessage),
        assistantPreview: extractTextPreview(round.assistantMessage),

        isBone: false,
        toolName: '',

        type: 'round',
        category: round.type === 'normal' ? 'conversation' : round.type,
        role: 'round',
      },
    });

    // Edge to previous round
    if (i > 0) {
      edges.push({
        id: `e-${rounds[i - 1].id}-${round.id}`,
        source: rounds[i - 1].id,
        target: round.id,
        type: 'branchEdge',
      });
    }

    // ── Tool call bones (if expanded) ──
    if (isExpanded && round.toolCalls.length > 0) {
      for (let j = 0; j < round.toolCalls.length; j++) {
        const tc = round.toolCalls[j];
        const boneId = `${round.id}-bone-${j}`;
        const boneY = y + height + 20 + j * Y_BONE_SPACING;

        nodes.push({
          id: boneId,
          type: 'sessionNode',
          position: { x: x + 20, y: boneY },
          data: {
            entryId: boneId,
            color: '#f97316',
            nodeWidth: 120,
            nodeHeight: 36,
            timestamp: undefined,
            totalTokens: 0,

            isRound: false,
            roundType: 'tool_call',
            preview: tc.name,
            toolCallCount: 0,
            expanded: false,
            hasSubagent: false,
            userPreview: '',
            assistantPreview: tc.resultContent?.slice(0, 200) ?? '',

            isBone: true,
            toolName: tc.name,

            type: 'tool_call',
            category: 'tool_call',
            role: 'tool',
          },
        });

        // Edge from round node (or previous bone) to this bone
        const sourceId = j === 0 ? round.id : `${round.id}-bone-${j - 1}`;
        edges.push({
          id: `e-${sourceId}-${boneId}`,
          source: sourceId,
          target: boneId,
          type: 'branchEdge',
        });
      }
    }
  }

  return { nodes, edges };
}

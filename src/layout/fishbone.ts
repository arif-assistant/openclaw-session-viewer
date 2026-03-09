// ── Fishbone layout algorithm (Round-based) ──────────────────────────
//
// Input:  Round[] (grouped from transcript entries) + expanded round ids
// Output: React Flow Node[] and Edge[]
//
// Layout rules:
//   - Main spine: one node per round, horizontal left-to-right at Y=0
//   - Tool call "bones": when a round is expanded, its tool calls appear
//     as small nodes below the round node (vertical fishbone ribs)
//   - Sub-agent forks: when a round has expanded sub-agents, fork nodes
//     and sub-agent fishbone sub-graphs are rendered below
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
const Y_SUBAGENT_FORK = 60;  // px from round node to sub-agent fork node
const Y_SUBAGENT_GRAPH = 50; // px from fork node to sub-agent sub-graph
const SUBAGENT_X_SPACING = 180; // slightly tighter spacing for sub-graphs
const SUBAGENT_SCALE = 0.85;    // sub-graph nodes are slightly smaller
export const MAX_NESTING_DEPTH = 5;    // max recursion depth for sub-agent rendering

// Purple shades per nesting depth (lighter = deeper)
const SUBAGENT_COLORS = [
  '#a855f7', // depth 0 (direct sub-agents)
  '#c084fc', // depth 1
  '#d8b4fe', // depth 2
  '#e9d5ff', // depth 3+
];

function subagentColor(depth: number): string {
  return SUBAGENT_COLORS[Math.min(depth, SUBAGENT_COLORS.length - 1)];
}

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

  // Sub-agent fork fields
  /** Identifies this node as a sub-agent fork node. */
  isSubagentFork: boolean;
  /** Sub-agent session key (for fork nodes). */
  subagentSessionKey: string;
  /** Whether the sub-agent fork is expanded (showing sub-graph). */
  subagentExpanded: boolean;
  /** Nesting depth for sub-agent rendering (0 = top level). */
  nestingDepth: number;
  /** The parent round id this fork belongs to. */
  parentRoundId: string;

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

/** Shorten a session key for display. */
function shortSessionLabel(sessionKey: string): string {
  // If it looks like "agent:main:subagent:uuid", show last part
  const parts = sessionKey.split(':');
  if (parts.length > 2) {
    const last = parts[parts.length - 1];
    // Truncate UUID
    return last.length > 12 ? `${last.slice(0, 8)}…` : last;
  }
  return sessionKey.length > 20 ? `${sessionKey.slice(0, 18)}…` : sessionKey;
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
 * @param subagentTranscripts - Map of session key → rounds for expanded sub-agents
 * @param expandedSubagents - Set of expanded sub-agent session keys
 * @param nestingDepth - Current nesting depth (0 = main, 1+ = sub-agent)
 * @param idPrefix - Prefix for node/edge ids (for uniqueness in nested graphs)
 * @param originX - X offset for the sub-graph
 * @param originY - Y offset for the sub-graph
 * @param visited - Set of session keys already being rendered (cycle detection)
 * @returns React Flow nodes and edges positioned in a fishbone pattern
 */
export function computeFishboneLayout(
  rounds: Round[],
  expandedRounds: Set<string> = new Set(),
  subagentTranscripts: Map<string, Round[]> = new Map(),
  expandedSubagents: Set<string> = new Set(),
  nestingDepth: number = 0,
  idPrefix: string = '',
  originX: number = 0,
  originY: number = 0,
  visited: Set<string> = new Set(),
): FishboneResult {
  if (rounds.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Guard: stop recursion if depth exceeds limit
  if (nestingDepth > MAX_NESTING_DEPTH) {
    return { nodes: [], edges: [] };
  }

  const nodes: Node<SessionNodeData>[] = [];
  const edges: Edge[] = [];

  const scale = Math.pow(SUBAGENT_SCALE, nestingDepth);
  const xSpacing = nestingDepth === 0 ? X_SPACING : SUBAGENT_X_SPACING * scale;

  // ── Lay out main spine (Y = originY) ──
  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    const rawSize = computeNodeSize(round.totalTokens);
    const width = rawSize.width * scale;
    const height = rawSize.height * scale;
    const x = originX + X_OFFSET * scale + i * xSpacing;
    const y = originY;
    const isExpanded = expandedRounds.has(round.id);
    const preview = buildRoundPreview(round, i);
    const nodeId = `${idPrefix}${round.id}`;

    // Color: preserve round-type colour encoding at all nesting levels
    const nodeColor = ROUND_COLORS[round.type];

    nodes.push({
      id: nodeId,
      type: 'sessionNode',
      position: { x, y },
      data: {
        entryId: round.id,
        color: nodeColor,
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

        isSubagentFork: false,
        subagentSessionKey: '',
        subagentExpanded: false,
        nestingDepth,
        parentRoundId: '',

        type: 'round',
        category: round.type === 'normal' ? 'conversation' : round.type,
        role: 'round',
      },
    });

    // Edge to previous round
    if (i > 0) {
      const prevNodeId = `${idPrefix}${rounds[i - 1].id}`;
      edges.push({
        id: `e-${prevNodeId}-${nodeId}`,
        source: prevNodeId,
        target: nodeId,
        type: 'branchEdge',
      });
    }

    // Track the bottom of bone nodes for sub-agent fork positioning
    let boneBottomY = y + height + 20;

    // ── Tool call bones (if expanded) ──
    if (isExpanded && round.toolCalls.length > 0) {
      for (let j = 0; j < round.toolCalls.length; j++) {
        const tc = round.toolCalls[j];
        const boneId = `${nodeId}-bone-${j}`;
        const boneY = y + height + 20 + j * Y_BONE_SPACING * scale;

        nodes.push({
          id: boneId,
          type: 'sessionNode',
          position: { x: x + 20 * scale, y: boneY },
          data: {
            entryId: boneId,
            color: '#f97316',
            nodeWidth: 120 * scale,
            nodeHeight: 36 * scale,
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

            isSubagentFork: false,
            subagentSessionKey: '',
            subagentExpanded: false,
            nestingDepth,
            parentRoundId: round.id,

            type: 'tool_call',
            category: 'tool_call',
            role: 'tool',
          },
        });

        // Edge from round node (or previous bone) to this bone
        const sourceId = j === 0 ? nodeId : `${nodeId}-bone-${j - 1}`;
        edges.push({
          id: `e-${sourceId}-${boneId}`,
          source: sourceId,
          target: boneId,
          type: 'branchEdge',
        });

        boneBottomY = boneY + 36 * scale + 10;
      }
    }

    // ── Sub-agent fork nodes ──
    if (round.subagentSpawns.length > 0) {
      for (let s = 0; s < round.subagentSpawns.length; s++) {
        const subKey = round.subagentSpawns[s];
        const isSubExpanded = expandedSubagents.has(subKey);
        const forkId = `${nodeId}-fork-${s}`;
        const forkY = boneBottomY + s * (Y_SUBAGENT_FORK + 10) * scale;

        nodes.push({
          id: forkId,
          type: 'sessionNode',
          position: { x: x + 10 * scale, y: forkY },
          data: {
            entryId: forkId,
            color: subagentColor(nestingDepth),
            nodeWidth: 150 * scale,
            nodeHeight: 40 * scale,
            timestamp: undefined,
            totalTokens: 0,

            isRound: false,
            roundType: 'subagent',
            preview: `🧬 ${shortSessionLabel(subKey)}`,
            toolCallCount: 0,
            expanded: false,
            hasSubagent: false,
            userPreview: '',
            assistantPreview: '',

            isBone: false,
            toolName: '',

            isSubagentFork: true,
            subagentSessionKey: subKey,
            subagentExpanded: isSubExpanded,
            nestingDepth,
            parentRoundId: round.id,

            type: 'subagent_fork',
            category: 'subagent',
            role: 'subagent',
          },
        });

        // Edge from round node to fork
        edges.push({
          id: `e-${nodeId}-${forkId}`,
          source: nodeId,
          target: forkId,
          type: 'subagentEdge',
        });

        // ── Render sub-agent sub-graph if expanded ──
        if (isSubExpanded) {
          const subRounds = subagentTranscripts.get(subKey);
          if (subRounds && subRounds.length > 0 && !visited.has(subKey)) {
            const subGraphOriginX = x;
            const subGraphOriginY = forkY + 40 * scale + Y_SUBAGENT_GRAPH * scale;
            const subPrefix = `${forkId}-sub-`;

            // Track this session key to prevent circular references
            const nextVisited = new Set(visited);
            nextVisited.add(subKey);

            const subResult = computeFishboneLayout(
              subRounds,
              expandedRounds,
              subagentTranscripts,
              expandedSubagents,
              nestingDepth + 1,
              subPrefix,
              subGraphOriginX,
              subGraphOriginY,
              nextVisited,
            );

            nodes.push(...subResult.nodes);
            edges.push(...subResult.edges);

            // Edge from fork node to first sub-graph round
            if (subResult.nodes.length > 0) {
              edges.push({
                id: `e-${forkId}-${subResult.nodes[0].id}`,
                source: forkId,
                target: subResult.nodes[0].id,
                type: 'subagentEdge',
              });
            }
          }
        }
      }
    }
  }

  return { nodes, edges };
}

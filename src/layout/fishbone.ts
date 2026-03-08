// ── Fishbone layout algorithm ─────────────────────────────────────────
//
// Input:  TranscriptEntry[] (with id/parentId tree structure)
// Output: React Flow Node[] and Edge[]
//
// Layout rules:
//   - Horizontal left-to-right
//   - Main spine at Y=0
//   - Subagent branches offset ±Y from the spine
//   - X = sequential index × spacing
//   - No external layout library required

import type { Node, Edge } from '@xyflow/react';
import type { TranscriptEntry } from '@/gateway/types';
import type { EntryCategory, LayoutEntry } from './types';
import { computeNodeSize } from './node-sizing';
import { CATEGORY_COLORS } from './types';

// ── Constants ────────────────────────────────────────────────────────

const X_SPACING = 220;      // px between nodes horizontally
const Y_SPACING = 180;      // px between branch levels vertically
const X_OFFSET = 60;        // left margin

// ── Types for React Flow data ────────────────────────────────────────

export interface SessionNodeData {
  entryId: string;
  type: string;
  category: EntryCategory;
  role: string;
  preview: string;
  totalTokens: number;
  color: string;
  nodeWidth: number;
  nodeHeight: number;
  timestamp?: string;
  [key: string]: unknown;
}

// ── Category classification ──────────────────────────────────────────

function classifyEntry(entry: TranscriptEntry): EntryCategory {
  if (entry.type === 'message' && entry.message) {
    const content = entry.message.content;
    // Check for tool calls in content (array with tool_use blocks)
    if (Array.isArray(content)) {
      const hasToolUse = content.some(
        (block: unknown) =>
          typeof block === 'object' &&
          block !== null &&
          (block as Record<string, unknown>).type === 'tool_use'
      );
      if (hasToolUse) return 'tool_call';

      // Check for subagent spawning
      const hasSubagent = content.some(
        (block: unknown) =>
          typeof block === 'object' &&
          block !== null &&
          (block as Record<string, unknown>).type === 'tool_use' &&
          typeof (block as Record<string, unknown>).name === 'string' &&
          ((block as Record<string, unknown>).name as string).includes('subagent')
      );
      if (hasSubagent) return 'subagent';
    }

    // Tool role messages are tool results
    if (entry.message.role === 'tool') return 'tool_call';

    return 'conversation';
  }

  if (entry.type === 'branch_summary') return 'subagent';

  // compaction, model_change, session, custom, etc.
  return 'system';
}

function extractPreview(entry: TranscriptEntry): string {
  if (entry.type === 'message' && entry.message) {
    const content = entry.message.content;
    if (typeof content === 'string') {
      return content.slice(0, 80);
    }
    if (Array.isArray(content)) {
      const textBlock = content.find(
        (b: unknown) =>
          typeof b === 'object' &&
          b !== null &&
          (b as Record<string, unknown>).type === 'text'
      );
      if (textBlock && typeof (textBlock as Record<string, unknown>).text === 'string') {
        return ((textBlock as Record<string, unknown>).text as string).slice(0, 80);
      }
    }
    return `[${entry.message.role}]`;
  }

  if (entry.type === 'compaction') return `Compaction: ${entry.summary?.slice(0, 60) ?? '…'}`;
  if (entry.type === 'model_change') return 'Model Change';
  if (entry.type === 'session') return 'Session Start';
  if (entry.type === 'branch_summary') return `Branch: ${entry.summary?.slice(0, 60) ?? '…'}`;

  return entry.type;
}

function extractTokens(entry: TranscriptEntry): number {
  if (entry.type === 'message' && entry.message?.usage) {
    const u = entry.message.usage;
    return (u.input_tokens ?? 0) + (u.output_tokens ?? 0);
  }
  if (entry.type === 'compaction' && entry.tokensBefore) {
    return entry.tokensBefore;
  }
  return 0;
}

// ── Tree building ────────────────────────────────────────────────────

function buildTree(entries: TranscriptEntry[]): LayoutEntry[] {
  if (entries.length === 0) return [];

  const map = new Map<string, LayoutEntry>();
  const roots: LayoutEntry[] = [];

  // Create LayoutEntry for each transcript entry
  for (const entry of entries) {
    const le: LayoutEntry = {
      id: entry.id,
      parentId: entry.parentId,
      type: entry.type,
      category: classifyEntry(entry),
      role: entry.message?.role,
      preview: extractPreview(entry),
      totalTokens: extractTokens(entry),
      timestamp: entry.timestamp,
      children: [],
      depth: 0,
      index: 0,
    };
    map.set(entry.id, le);
  }

  // Link parents ↔ children
  for (const le of map.values()) {
    if (le.parentId && map.has(le.parentId)) {
      map.get(le.parentId)!.children.push(le);
    } else {
      roots.push(le);
    }
  }

  return roots;
}

/**
 * Flatten a tree into a linear "main spine" (following first-child path)
 * plus branches for any additional children.
 */
interface SpineResult {
  spine: LayoutEntry[];
  branches: Array<{ parentIndex: number; entries: LayoutEntry[] }>;
}

function extractSpineAndBranches(roots: LayoutEntry[]): SpineResult {
  const spine: LayoutEntry[] = [];
  const branches: Array<{ parentIndex: number; entries: LayoutEntry[] }> = [];

  if (roots.length === 0) return { spine, branches };

  // Start from first root
  let current: LayoutEntry | undefined = roots[0];

  // If multiple roots, treat extras as branches from index 0
  for (let i = 1; i < roots.length; i++) {
    const branchEntries = flattenBranch(roots[i]);
    branches.push({ parentIndex: 0, entries: branchEntries });
  }

  let index = 0;
  while (current) {
    current.index = index;
    current.depth = 0;
    spine.push(current);

    // Extra children become branches
    for (let c = 1; c < current.children.length; c++) {
      const branchEntries = flattenBranch(current.children[c]);
      branches.push({ parentIndex: index, entries: branchEntries });
    }

    current = current.children[0]; // Follow first child
    index++;
  }

  return { spine, branches };
}

/** Flatten a subtree into a linear sequence (DFS first-child path). */
function flattenBranch(root: LayoutEntry): LayoutEntry[] {
  const result: LayoutEntry[] = [];
  let current: LayoutEntry | undefined = root;
  let idx = 0;

  while (current) {
    current.index = idx++;
    result.push(current);
    // Sub-branches of branches are flattened into the same branch for simplicity
    current = current.children[0];
  }

  return result;
}

// ── Layout computation ───────────────────────────────────────────────

export interface FishboneResult {
  nodes: Node<SessionNodeData>[];
  edges: Edge[];
}

/**
 * Compute fishbone layout from transcript entries.
 *
 * @param entries - Transcript entries (with id/parentId tree structure)
 * @returns React Flow nodes and edges positioned in a fishbone pattern
 */
export function computeFishboneLayout(entries: TranscriptEntry[]): FishboneResult {
  if (entries.length === 0) {
    return { nodes: [], edges: [] };
  }

  const roots = buildTree(entries);
  const { spine, branches } = extractSpineAndBranches(roots);

  const nodes: Node<SessionNodeData>[] = [];
  const edges: Edge[] = [];

  // Alternate branch direction: odd branches go up, even go down
  let branchDirectionCounter = 0;

  // ── Lay out main spine (Y = 0) ──
  for (let i = 0; i < spine.length; i++) {
    const entry = spine[i];
    const { width, height } = computeNodeSize(entry.totalTokens);

    nodes.push({
      id: entry.id,
      type: 'sessionNode',
      position: { x: X_OFFSET + i * X_SPACING, y: 0 },
      data: {
        entryId: entry.id,
        type: entry.type,
        category: entry.category,
        role: entry.role ?? entry.type,
        preview: entry.preview,
        totalTokens: entry.totalTokens,
        color: CATEGORY_COLORS[entry.category],
        nodeWidth: width,
        nodeHeight: height,
        timestamp: entry.timestamp,
      },
    });

    // Edge to previous spine node
    if (i > 0) {
      edges.push({
        id: `e-${spine[i - 1].id}-${entry.id}`,
        source: spine[i - 1].id,
        target: entry.id,
        type: 'branchEdge',
      });
    }
  }

  // ── Lay out branches ──
  for (const branch of branches) {
    branchDirectionCounter++;
    const direction = branchDirectionCounter % 2 === 0 ? 1 : -1;
    const yOffset = direction * Y_SPACING * Math.ceil(branchDirectionCounter / 2);

    for (let j = 0; j < branch.entries.length; j++) {
      const entry = branch.entries[j];
      const { width, height } = computeNodeSize(entry.totalTokens);
      const x = X_OFFSET + (branch.parentIndex + 1 + j) * X_SPACING;
      const y = yOffset;

      nodes.push({
        id: entry.id,
        type: 'sessionNode',
        position: { x, y },
        data: {
          entryId: entry.id,
          type: entry.type,
          category: entry.category,
          role: entry.role ?? entry.type,
          preview: entry.preview,
          totalTokens: entry.totalTokens,
          color: CATEGORY_COLORS[entry.category],
          nodeWidth: width,
          nodeHeight: height,
          timestamp: entry.timestamp,
        },
      });

      if (j === 0) {
        // Edge from spine parent to first branch node
        const parentId = spine[branch.parentIndex].id;
        edges.push({
          id: `e-${parentId}-${entry.id}`,
          source: parentId,
          target: entry.id,
          type: 'branchEdge',
        });
      } else {
        // Edge within the branch
        const prevId = branch.entries[j - 1].id;
        edges.push({
          id: `e-${prevId}-${entry.id}`,
          source: prevId,
          target: entry.id,
          type: 'branchEdge',
        });
      }
    }
  }

  return { nodes, edges };
}

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
      // Check subagent first — a subagent spawn is also a tool_use,
      // so this must come before the generic tool_use check.
      const hasSubagent = content.some(
        (block) =>
          typeof block === 'object' &&
          block !== null &&
          (block as Record<string, unknown>).type === 'tool_use' &&
          typeof (block as Record<string, unknown>).name === 'string' &&
          ((block as Record<string, unknown>).name as string).includes('subagent')
      );
      if (hasSubagent) return 'subagent';

      const hasToolUse = content.some(
        (block) =>
          typeof block === 'object' &&
          block !== null &&
          (block as Record<string, unknown>).type === 'tool_use'
      );
      if (hasToolUse) return 'tool_call';
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
      const textBlock = content.find((b) => b.type === 'text');
      if (textBlock?.text) {
        return textBlock.text.slice(0, 80);
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

// ── Spine / branch extraction ────────────────────────────────────────

/** A collected branch: the first node's parent ID + the X slot where it forks. */
interface BranchRecord {
  /** ID of the parent node this branch forks from. */
  parentNodeId: string;
  /** Global X-slot of the parent node (used to position the branch). */
  parentXSlot: number;
  /** Linear list of entries along this branch's first-child spine. */
  entries: LayoutEntry[];
}

interface SpineResult {
  spine: LayoutEntry[];
  branches: BranchRecord[];
}

function extractSpineAndBranches(roots: LayoutEntry[]): SpineResult {
  const spine: LayoutEntry[] = [];
  const branches: BranchRecord[] = [];

  if (roots.length === 0) return { spine, branches };

  // Start from first root
  let current: LayoutEntry | undefined = roots[0];

  // If multiple roots, treat extras as branches from slot 0
  for (let i = 1; i < roots.length; i++) {
    collectBranch(roots[i], roots[0].id, 0, branches);
  }

  let slot = 0;
  while (current) {
    current.index = slot;
    current.depth = 0;
    spine.push(current);

    // Extra children become branches
    for (let c = 1; c < current.children.length; c++) {
      collectBranch(current.children[c], current.id, slot, branches);
    }

    current = current.children[0]; // Follow first child
    slot++;
  }

  return { spine, branches };
}

/**
 * Collect a branch (first-child spine) and recursively collect any
 * nested sub-branches as additional top-level branches.
 *
 * @param root         Root of the subtree to collect
 * @param parentNodeId ID of the node this branch forks from
 * @param parentXSlot  Global X-slot of the parent node
 * @param branches     Accumulated branches array (mutated)
 */
function collectBranch(
  root: LayoutEntry,
  parentNodeId: string,
  parentXSlot: number,
  branches: BranchRecord[]
): void {
  const entries: LayoutEntry[] = [];
  let current: LayoutEntry | undefined = root;
  let idx = 0;

  while (current) {
    current.index = idx;
    entries.push(current);

    // Any additional children become their own sub-branches.
    // The parent is the current node; its X-slot = parentXSlot + 1 + idx.
    const currentXSlot = parentXSlot + 1 + idx;
    for (let c = 1; c < current.children.length; c++) {
      collectBranch(current.children[c], current.id, currentXSlot, branches);
    }

    current = current.children[0];
    idx++;
  }

  branches.push({ parentNodeId, parentXSlot, entries });
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

  // ── Helper to create a node ──
  function makeNode(entry: LayoutEntry, x: number, y: number): void {
    const { width, height } = computeNodeSize(entry.totalTokens);
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
  }

  function makeEdge(sourceId: string, targetId: string): void {
    edges.push({
      id: `e-${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
      type: 'branchEdge',
    });
  }

  // ── Lay out main spine (Y = 0) ──
  for (let i = 0; i < spine.length; i++) {
    makeNode(spine[i], X_OFFSET + i * X_SPACING, 0);
    if (i > 0) {
      makeEdge(spine[i - 1].id, spine[i].id);
    }
  }

  // ── Lay out branches ──
  // Alternate direction: odd branches go up (−Y), even go down (+Y)
  let branchDirectionCounter = 0;

  for (const branch of branches) {
    branchDirectionCounter++;
    const direction = branchDirectionCounter % 2 === 0 ? 1 : -1;
    const yOffset = direction * Y_SPACING * Math.ceil(branchDirectionCounter / 2);

    for (let j = 0; j < branch.entries.length; j++) {
      const entry = branch.entries[j];
      const x = X_OFFSET + (branch.parentXSlot + 1 + j) * X_SPACING;

      makeNode(entry, x, yOffset);

      if (j === 0) {
        // Edge from parent node to first branch node
        makeEdge(branch.parentNodeId, entry.id);
      } else {
        makeEdge(branch.entries[j - 1].id, entry.id);
      }
    }
  }

  return { nodes, edges };
}

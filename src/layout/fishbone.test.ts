// ── Fishbone layout tests ────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { computeFishboneLayout } from './fishbone';
import { computeNodeSize, BASE_SIZE, SCALE_FACTOR } from './node-sizing';
import type { TranscriptEntry } from '@/gateway/types';

// ── Helpers ──────────────────────────────────────────────────────────

function makeEntry(
  id: string,
  parentId: string | undefined,
  type: TranscriptEntry['type'] = 'message',
  overrides: Partial<TranscriptEntry> = {}
): TranscriptEntry {
  return {
    id,
    parentId,
    type,
    timestamp: new Date().toISOString(),
    message:
      type === 'message'
        ? {
            role: 'assistant',
            content: `Message ${id}`,
            usage: { input_tokens: 100, output_tokens: 50 },
          }
        : undefined,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('computeFishboneLayout', () => {
  it('returns empty nodes and edges for empty input', () => {
    const result = computeFishboneLayout([]);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('lays out a single entry', () => {
    const entries = [makeEntry('a', undefined)];
    const result = computeFishboneLayout(entries);

    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
    expect(result.nodes[0].id).toBe('a');
    expect(result.nodes[0].position.y).toBe(0);
  });

  it('lays out a linear conversation left-to-right', () => {
    const entries = [
      makeEntry('a', undefined, 'session'),
      makeEntry('b', 'a'),
      makeEntry('c', 'b'),
      makeEntry('d', 'c'),
    ];

    const result = computeFishboneLayout(entries);

    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toHaveLength(3);

    // All on main spine (y = 0)
    for (const node of result.nodes) {
      expect(node.position.y).toBe(0);
    }

    // X should be increasing
    const xs = result.nodes.map((n) => n.position.x);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    }

    // Edges connect sequentially
    expect(result.edges[0].source).toBe('a');
    expect(result.edges[0].target).toBe('b');
    expect(result.edges[1].source).toBe('b');
    expect(result.edges[1].target).toBe('c');
    expect(result.edges[2].source).toBe('c');
    expect(result.edges[2].target).toBe('d');
  });

  it('handles branching (multiple children from one node)', () => {
    // a → b → c  (main spine)
    //   → d → e  (branch from a)
    const entries = [
      makeEntry('a', undefined, 'session'),
      makeEntry('b', 'a'),
      makeEntry('c', 'b'),
      makeEntry('d', 'a'),
      makeEntry('e', 'd'),
    ];

    const result = computeFishboneLayout(entries);

    expect(result.nodes).toHaveLength(5);

    // Main spine nodes at y=0
    const mainNodes = result.nodes.filter((n) => ['a', 'b', 'c'].includes(n.id));
    for (const node of mainNodes) {
      expect(node.position.y).toBe(0);
    }

    // Branch nodes offset from y=0
    const branchNode = result.nodes.find((n) => n.id === 'd');
    expect(branchNode).toBeDefined();
    expect(branchNode!.position.y).not.toBe(0);

    // Edges
    expect(result.edges.find((e) => e.source === 'a' && e.target === 'd')).toBeDefined();
    expect(result.edges.find((e) => e.source === 'd' && e.target === 'e')).toBeDefined();
  });

  it('alternates branch direction for multiple branches', () => {
    const entries = [
      makeEntry('a', undefined, 'session'),
      makeEntry('b', 'a'),
      makeEntry('c', 'a'),
      makeEntry('d', 'a'),
    ];

    const result = computeFishboneLayout(entries);

    const nodeC = result.nodes.find((n) => n.id === 'c');
    const nodeD = result.nodes.find((n) => n.id === 'd');

    expect(nodeC).toBeDefined();
    expect(nodeD).toBeDefined();
    // Opposite sides of the spine
    expect(nodeC!.position.y * nodeD!.position.y).toBeLessThan(0);
  });

  it('assigns correct entry categories', () => {
    const entries = [
      makeEntry('a', undefined, 'session'),
      makeEntry('b', 'a', 'message'),
      makeEntry('c', 'b', 'compaction', {
        summary: 'Compacted conversation',
        tokensBefore: 50000,
        message: undefined,
      }),
    ];

    const result = computeFishboneLayout(entries);
    expect(result.nodes).toHaveLength(3);

    for (const node of result.nodes) {
      expect(node.type).toBe('sessionNode');
    }

    expect((result.nodes.find((n) => n.id === 'a')!.data as Record<string, unknown>).category).toBe('system');
    expect((result.nodes.find((n) => n.id === 'b')!.data as Record<string, unknown>).category).toBe('conversation');
    expect((result.nodes.find((n) => n.id === 'c')!.data as Record<string, unknown>).category).toBe('system');
  });

  it('includes token data in node data', () => {
    const entries = [
      makeEntry('a', undefined, 'message', {
        message: {
          role: 'assistant',
          content: 'Hello',
          usage: { input_tokens: 500, output_tokens: 200 },
        },
      }),
    ];

    const result = computeFishboneLayout(entries);
    const data = result.nodes[0].data as Record<string, unknown>;

    expect(data.totalTokens).toBe(700);
    expect(data.nodeWidth).toBeGreaterThan(0);
    expect(data.nodeHeight).toBeGreaterThan(0);
  });

  // ── Subagent classification ────────────────────────────────────────

  it('classifies subagent tool calls as subagent (not tool_call)', () => {
    const entries = [
      makeEntry('a', undefined, 'message', {
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Spawning a subagent...' },
            { type: 'tool_use', name: 'subagent_spawn', id: 'tu_1' },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      }),
    ];

    const result = computeFishboneLayout(entries);
    const data = result.nodes[0].data as Record<string, unknown>;
    expect(data.category).toBe('subagent');
  });

  it('classifies regular tool calls as tool_call (not subagent)', () => {
    const entries = [
      makeEntry('a', undefined, 'message', {
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Reading file...' },
            { type: 'tool_use', name: 'read', id: 'tu_2' },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      }),
    ];

    const result = computeFishboneLayout(entries);
    const data = result.nodes[0].data as Record<string, unknown>;
    expect(data.category).toBe('tool_call');
  });

  // ── Nested sub-branches ────────────────────────────────────────────

  it('collects nested sub-branches instead of discarding them', () => {
    // Spine: a → b → c
    // Branch from b: d → e
    // Sub-branch from d: f → g  (nested branch off a branch)
    const entries = [
      makeEntry('a', undefined, 'session'),
      makeEntry('b', 'a'),
      makeEntry('c', 'b'),
      makeEntry('d', 'b'),   // branch from b
      makeEntry('e', 'd'),
      makeEntry('f', 'd'),   // sub-branch from d (second child)
      makeEntry('g', 'f'),
    ];

    const result = computeFishboneLayout(entries);

    // All 7 nodes must be present — none discarded
    expect(result.nodes).toHaveLength(7);

    const nodeIds = new Set(result.nodes.map((n) => n.id));
    expect(nodeIds).toContain('f');
    expect(nodeIds).toContain('g');

    // Edges: d→f and f→g
    expect(result.edges.find((e) => e.source === 'd' && e.target === 'f')).toBeDefined();
    expect(result.edges.find((e) => e.source === 'f' && e.target === 'g')).toBeDefined();
  });

  it('handles nested sub-branches with correct edges and positions', () => {
    // Main spine: a → b → c
    // Branch from a: d → e → f
    // Sub-branch from e: g → h
    const entries = [
      makeEntry('a', undefined, 'session'),
      makeEntry('b', 'a'),
      makeEntry('c', 'b'),
      makeEntry('d', 'a'),
      makeEntry('e', 'd'),
      makeEntry('f', 'e'),
      makeEntry('g', 'e'),   // sub-branch from e (second child)
      makeEntry('h', 'g'),
    ];

    const result = computeFishboneLayout(entries);

    expect(result.nodes).toHaveLength(8);
    // Edges: a→b, b→c, a→d, d→e, e→f, e→g, g→h = 7
    expect(result.edges).toHaveLength(7);

    expect(result.edges.find((e) => e.source === 'e' && e.target === 'g')).toBeDefined();
    expect(result.edges.find((e) => e.source === 'g' && e.target === 'h')).toBeDefined();

    // Sub-branch not on spine, not on parent branch
    const nodeG = result.nodes.find((n) => n.id === 'g')!;
    const nodeD = result.nodes.find((n) => n.id === 'd')!;
    expect(nodeG.position.y).not.toBe(0);
    expect(nodeG.position.y).not.toBe(nodeD.position.y);
  });

  it('handles 3 levels of nested sub-branches', () => {
    // Spine:          a → b
    // Branch L1:      c → c2 (from a)
    // Sub-branch L2:  d → d2 (from c, second child)
    // Sub-branch L3:  e      (from d, second child)
    const entries = [
      makeEntry('a', undefined, 'session'),
      makeEntry('b', 'a'),
      makeEntry('c', 'a'),
      makeEntry('c2', 'c'),
      makeEntry('d', 'c'),
      makeEntry('d2', 'd'),
      makeEntry('e', 'd'),
    ];

    const result = computeFishboneLayout(entries);

    expect(result.nodes).toHaveLength(7);

    const nodeIds = new Set(result.nodes.map((n) => n.id));
    for (const id of ['a', 'b', 'c', 'c2', 'd', 'd2', 'e']) {
      expect(nodeIds).toContain(id);
    }

    // Fork edges at each level
    expect(result.edges.find((e) => e.source === 'a' && e.target === 'c')).toBeDefined();
    expect(result.edges.find((e) => e.source === 'c' && e.target === 'd')).toBeDefined();
    expect(result.edges.find((e) => e.source === 'd' && e.target === 'e')).toBeDefined();

    // All branch levels at distinct Y positions
    const yC = result.nodes.find((n) => n.id === 'c')!.position.y;
    const yD = result.nodes.find((n) => n.id === 'd')!.position.y;
    const yE = result.nodes.find((n) => n.id === 'e')!.position.y;

    const ys = new Set([0, yC, yD, yE]);
    expect(ys.size).toBe(4); // spine + 3 distinct branch Y levels
  });

  // ── Content preview extraction ─────────────────────────────────────

  it('extracts preview from array content blocks', () => {
    const entries = [
      makeEntry('a', undefined, 'message', {
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello from array content!' },
          ],
          usage: { input_tokens: 10, output_tokens: 0 },
        },
      }),
    ];

    const result = computeFishboneLayout(entries);
    const data = result.nodes[0].data as Record<string, unknown>;
    expect(data.preview).toBe('Hello from array content!');
  });
});

// ── Node sizing tests ────────────────────────────────────────────────

describe('computeNodeSize', () => {
  it('returns base size for 0 tokens', () => {
    const { width, height } = computeNodeSize(0);
    expect(width).toBe(BASE_SIZE);
    expect(height).toBe(BASE_SIZE * 0.75);
  });

  it('grows logarithmically with token count', () => {
    const small = computeNodeSize(100);
    const medium = computeNodeSize(1000);
    const large = computeNodeSize(10000);

    expect(small.width).toBeLessThan(medium.width);
    expect(medium.width).toBeLessThan(large.width);

    const growthSmallMedium = medium.width - small.width;
    const growthMediumLarge = large.width - medium.width;
    expect(growthMediumLarge).toBeLessThan(growthSmallMedium * 2);
  });

  it('maintains 4:3 aspect ratio', () => {
    const { width, height } = computeNodeSize(5000);
    expect(height / width).toBeCloseTo(0.75, 5);
  });

  it('uses the correct formula', () => {
    const tokens = 1000;
    const expectedSize = BASE_SIZE + Math.log2(1 + tokens) * SCALE_FACTOR;
    const { width, height } = computeNodeSize(tokens);

    expect(width).toBeCloseTo(expectedSize, 5);
    expect(height).toBeCloseTo(expectedSize * 0.75, 5);
  });
});

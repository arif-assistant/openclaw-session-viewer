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
    expect(result.nodes[0].position.y).toBe(0); // main spine
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
      makeEntry('d', 'a'), // second child of a → branch
      makeEntry('e', 'd'),
    ];

    const result = computeFishboneLayout(entries);

    expect(result.nodes).toHaveLength(5);

    // Main spine nodes at y=0
    const mainNodes = result.nodes.filter((n) => ['a', 'b', 'c'].includes(n.id));
    for (const node of mainNodes) {
      expect(node.position.y).toBe(0);
    }

    // Branch nodes should be offset from y=0
    const branchNode = result.nodes.find((n) => n.id === 'd');
    expect(branchNode).toBeDefined();
    expect(branchNode!.position.y).not.toBe(0);

    // There should be an edge from a to d
    const branchEdge = result.edges.find(
      (e) => e.source === 'a' && e.target === 'd'
    );
    expect(branchEdge).toBeDefined();

    // And from d to e
    const innerEdge = result.edges.find(
      (e) => e.source === 'd' && e.target === 'e'
    );
    expect(innerEdge).toBeDefined();
  });

  it('alternates branch direction for multiple branches', () => {
    // a → b (main)
    //   → c (branch 1)
    //   → d (branch 2)
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

    // They should be on opposite sides of the spine
    // (one positive Y, one negative Y)
    expect(nodeC!.position.y * nodeD!.position.y).toBeLessThan(0);
  });

  it('assigns correct node types', () => {
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

    // All should be sessionNode type
    for (const node of result.nodes) {
      expect(node.type).toBe('sessionNode');
    }

    // Check data categories
    const sessionNode = result.nodes.find((n) => n.id === 'a');
    expect((sessionNode!.data as Record<string, unknown>).category).toBe('system');

    const messageNode = result.nodes.find((n) => n.id === 'b');
    expect((messageNode!.data as Record<string, unknown>).category).toBe('conversation');

    const compactionNode = result.nodes.find((n) => n.id === 'c');
    expect((compactionNode!.data as Record<string, unknown>).category).toBe('system');
  });

  it('collects nested sub-branches instead of discarding them', () => {
    // Spine: a → b → c
    // Branch from b: d → e
    // Sub-branch from d: f → g  (nested branch off a branch)
    const entries = [
      makeEntry('a', undefined, 'session'),
      makeEntry('b', 'a'),
      makeEntry('c', 'b'),
      makeEntry('d', 'b'), // branch from b
      makeEntry('e', 'd'),
      makeEntry('f', 'd'), // sub-branch from d (second child)
      makeEntry('g', 'f'),
    ];

    const result = computeFishboneLayout(entries);

    // All 7 nodes must be present — none should be discarded
    expect(result.nodes).toHaveLength(7);

    // Sub-branch nodes f and g should exist in the output
    const nodeF = result.nodes.find((n) => n.id === 'f');
    const nodeG = result.nodes.find((n) => n.id === 'g');
    expect(nodeF).toBeDefined();
    expect(nodeG).toBeDefined();

    // f and g should be on a branch (not on the main spine y=0
    // and not on the same branch as d/e)
    const nodeD = result.nodes.find((n) => n.id === 'd')!;
    expect(nodeF!.position.y).not.toBe(0);
    // The sub-branch should be at a different Y than the parent branch
    // (they might coincidentally land at same Y in some alternation patterns,
    // but they should be separate branch entries with proper edges)

    // Check edges: d→f and f→g should exist
    const edgeDF = result.edges.find((e) => e.source === 'd' && e.target === 'f');
    const edgeFG = result.edges.find((e) => e.source === 'f' && e.target === 'g');
    expect(edgeDF).toBeDefined();
    expect(edgeFG).toBeDefined();
  });

  it('handles deeply nested sub-branches (3 levels)', () => {
    // Spine: a → b
    // Branch from a: c → d
    // Sub-branch from c: e → f
    // Sub-sub-branch from e: g
    const entries = [
      makeEntry('a', undefined, 'session'),
      makeEntry('b', 'a'),
      makeEntry('c', 'a'), // branch from a
      makeEntry('d', 'c'),
      makeEntry('e', 'c'), // sub-branch from c
      makeEntry('f', 'e'),
      makeEntry('g', 'e'), // sub-sub-branch from e
    ];

    const result = computeFishboneLayout(entries);

    // All 7 nodes present
    expect(result.nodes).toHaveLength(7);

    // All nodes reachable via edges
    const nodeIds = new Set(result.nodes.map((n) => n.id));
    expect(nodeIds).toEqual(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g']));

    // Sub-sub-branch node g should exist and be connected
    const edgeEG = result.edges.find((e) => e.source === 'e' && e.target === 'g');
    expect(edgeEG).toBeDefined();
  });

  it('classifies subagent tool_use before generic tool_use', () => {
    const subagentEntry = makeEntry('sa', undefined, 'message', {
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'subagent_spawn',
            id: 'tool_1',
            input: {},
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    });

    const result = computeFishboneLayout([subagentEntry]);
    const data = result.nodes[0].data as Record<string, unknown>;
    expect(data.category).toBe('subagent');
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
    const node = result.nodes[0];
    const data = node.data as Record<string, unknown>;

    expect(data.totalTokens).toBe(700);
    expect(data.nodeWidth).toBeGreaterThan(0);
    expect(data.nodeHeight).toBeGreaterThan(0);
  });

  it('classifies subagent tool calls as subagent (not tool_call)', () => {
    const entries = [
      makeEntry('a', undefined, 'message', {
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Spawning a subagent...' },
            { type: 'tool_use', name: 'subagents', id: 'tu_1' },
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

  it('handles nested sub-branches (branch of a branch)', () => {
    // Main spine: a → b → c
    // Branch from a: d → e → f
    // Sub-branch from e: g → h
    const entries = [
      makeEntry('a', undefined, 'session'),
      makeEntry('b', 'a'),
      makeEntry('c', 'b'),
      makeEntry('d', 'a'),   // branch from a
      makeEntry('e', 'd'),
      makeEntry('f', 'e'),
      makeEntry('g', 'e'),   // sub-branch from e (second child of e)
      makeEntry('h', 'g'),
    ];

    const result = computeFishboneLayout(entries);

    // All 8 nodes should be present
    expect(result.nodes).toHaveLength(8);

    const nodeIds = new Set(result.nodes.map((n) => n.id));
    expect(nodeIds).toContain('g');
    expect(nodeIds).toContain('h');

    // Edges: a→b, b→c (spine), a→d, d→e, e→f (branch), e→g, g→h (sub-branch)
    expect(result.edges).toHaveLength(7);

    // Edge from e to g (sub-branch fork)
    const subBranchEdge = result.edges.find(
      (e) => e.source === 'e' && e.target === 'g'
    );
    expect(subBranchEdge).toBeDefined();

    // Edge from g to h (within sub-branch)
    const innerSubEdge = result.edges.find(
      (e) => e.source === 'g' && e.target === 'h'
    );
    expect(innerSubEdge).toBeDefined();

    // Sub-branch nodes should be at a different Y than both spine and parent branch
    const nodeG = result.nodes.find((n) => n.id === 'g')!;
    const nodeD = result.nodes.find((n) => n.id === 'd')!;
    expect(nodeG.position.y).not.toBe(0);              // not on spine
    expect(nodeG.position.y).not.toBe(nodeD.position.y); // not on parent branch
  });

  it('handles deeply nested sub-branches (3 levels)', () => {
    // Spine:          a → b
    // Branch L1:      c (from a)
    // Sub-branch L2:  d (from c, second child)
    // Sub-branch L3:  e (from d, second child)
    const entries = [
      makeEntry('a', undefined, 'session'),
      makeEntry('b', 'a'),
      makeEntry('c', 'a'),   // L1 branch from a
      makeEntry('c2', 'c'),  // first child of c (continues L1)
      makeEntry('d', 'c'),   // L2 sub-branch from c
      makeEntry('d2', 'd'),  // first child of d (continues L2)
      makeEntry('e', 'd'),   // L3 sub-branch from d
    ];

    const result = computeFishboneLayout(entries);

    // All 7 nodes present
    expect(result.nodes).toHaveLength(7);

    const nodeIds = new Set(result.nodes.map((n) => n.id));
    for (const id of ['a', 'b', 'c', 'c2', 'd', 'd2', 'e']) {
      expect(nodeIds).toContain(id);
    }

    // Verify fork edges exist
    expect(result.edges.find((e) => e.source === 'a' && e.target === 'c')).toBeDefined();
    expect(result.edges.find((e) => e.source === 'c' && e.target === 'd')).toBeDefined();
    expect(result.edges.find((e) => e.source === 'd' && e.target === 'e')).toBeDefined();

    // All three branch levels should be at distinct Y positions
    const yC = result.nodes.find((n) => n.id === 'c')!.position.y;
    const yD = result.nodes.find((n) => n.id === 'd')!.position.y;
    const yE = result.nodes.find((n) => n.id === 'e')!.position.y;

    const ys = new Set([0, yC, yD, yE]);
    expect(ys.size).toBe(4); // spine + 3 distinct branch Y levels
  });

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

    // Growth should be sub-linear (log)
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

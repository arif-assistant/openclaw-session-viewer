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

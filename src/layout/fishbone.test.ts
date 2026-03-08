// ── Fishbone layout tests (Round-based) ──────────────────────────────

import { describe, it, expect } from 'vitest';
import { computeFishboneLayout } from './fishbone';
import { computeNodeSize, BASE_SIZE, SCALE_FACTOR } from './node-sizing';
import type { Round } from './types';

// ── Helpers ──────────────────────────────────────────────────────────

function makeRound(
  index: number,
  overrides: Partial<Round> = {}
): Round {
  return {
    id: `round-${index}`,
    toolCalls: [],
    subagentSpawns: [],
    rawEntries: [],
    totalTokens: 150,
    timestamp: new Date().toISOString(),
    type: 'normal',
    ...overrides,
  };
}

function makeToolCallRound(
  index: number,
  toolNames: string[],
  overrides: Partial<Round> = {}
): Round {
  return makeRound(index, {
    type: 'tool_call',
    toolCalls: toolNames.map((name, i) => ({
      id: `tc-${index}-${i}`,
      name,
      toolUseBlock: { type: 'tool_use', name, id: `tc-${index}-${i}` },
      resultContent: `Result of ${name}`,
    })),
    ...overrides,
  });
}

function makeSubagentRound(
  index: number,
  overrides: Partial<Round> = {}
): Round {
  return makeRound(index, {
    type: 'subagent',
    subagentSpawns: ['subagent-session-1'],
    toolCalls: [{
      id: `tc-${index}-0`,
      name: 'subagents',
      toolUseBlock: { type: 'tool_use', name: 'subagents', id: `tc-${index}-0` },
    }],
    ...overrides,
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe('computeFishboneLayout (Round-based)', () => {
  it('returns empty nodes and edges for empty input', () => {
    const result = computeFishboneLayout([]);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('lays out a single round', () => {
    const rounds = [makeRound(0)];
    const result = computeFishboneLayout(rounds);

    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
    expect(result.nodes[0].id).toBe('round-0');
    expect(result.nodes[0].position.y).toBe(0); // main spine
  });

  it('lays out multiple rounds left-to-right on spine', () => {
    const rounds = [makeRound(0), makeRound(1), makeRound(2), makeRound(3)];
    const result = computeFishboneLayout(rounds);

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
    expect(result.edges[0].source).toBe('round-0');
    expect(result.edges[0].target).toBe('round-1');
    expect(result.edges[1].source).toBe('round-1');
    expect(result.edges[1].target).toBe('round-2');
    expect(result.edges[2].source).toBe('round-2');
    expect(result.edges[2].target).toBe('round-3');
  });

  it('does not show tool call bones when not expanded', () => {
    const rounds = [
      makeToolCallRound(0, ['exec', 'read', 'write']),
    ];
    const result = computeFishboneLayout(rounds, new Set());

    // Only the round node, no bones
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);

    // Node data should show tool call count
    const data = result.nodes[0].data as Record<string, unknown>;
    expect(data.toolCallCount).toBe(3);
    expect(data.expanded).toBe(false);
  });

  it('shows tool call bones when round is expanded', () => {
    const rounds = [
      makeToolCallRound(0, ['exec', 'read', 'write']),
    ];
    const expanded = new Set(['round-0']);
    const result = computeFishboneLayout(rounds, expanded);

    // 1 round node + 3 bone nodes
    expect(result.nodes).toHaveLength(4);

    // 3 edges: round→bone0, bone0→bone1, bone1→bone2
    expect(result.edges).toHaveLength(3);

    // Bone nodes should be below the round node (positive Y)
    const roundNode = result.nodes.find((n) => n.id === 'round-0')!;
    const boneNodes = result.nodes.filter((n) => n.id.includes('bone'));
    expect(boneNodes).toHaveLength(3);
    for (const bone of boneNodes) {
      expect(bone.position.y).toBeGreaterThan(roundNode.position.y);
    }

    // Check bone node data
    const bone0 = result.nodes.find((n) => n.id === 'round-0-bone-0')!;
    expect((bone0.data as Record<string, unknown>).toolName).toBe('exec');
    expect((bone0.data as Record<string, unknown>).isBone).toBe(true);
  });

  it('assigns correct round type data', () => {
    const rounds = [
      makeRound(0),                             // normal
      makeToolCallRound(1, ['exec']),            // tool_call
      makeSubagentRound(2),                      // subagent
    ];

    const result = computeFishboneLayout(rounds);

    expect(result.nodes).toHaveLength(3);

    const normalNode = result.nodes.find((n) => n.id === 'round-0')!;
    expect((normalNode.data as Record<string, unknown>).roundType).toBe('normal');

    const toolNode = result.nodes.find((n) => n.id === 'round-1')!;
    expect((toolNode.data as Record<string, unknown>).roundType).toBe('tool_call');

    const subNode = result.nodes.find((n) => n.id === 'round-2')!;
    expect((subNode.data as Record<string, unknown>).roundType).toBe('subagent');
    expect((subNode.data as Record<string, unknown>).hasSubagent).toBe(true);
  });

  it('uses correct colours for round types', () => {
    const rounds = [
      makeRound(0),
      makeToolCallRound(1, ['exec']),
      makeSubagentRound(2),
    ];

    const result = computeFishboneLayout(rounds);

    const normalColor = (result.nodes.find((n) => n.id === 'round-0')!.data as Record<string, unknown>).color;
    const toolColor = (result.nodes.find((n) => n.id === 'round-1')!.data as Record<string, unknown>).color;
    const subColor = (result.nodes.find((n) => n.id === 'round-2')!.data as Record<string, unknown>).color;

    expect(normalColor).toBe('#3b82f6');   // blue
    expect(toolColor).toBe('#f97316');      // orange
    expect(subColor).toBe('#a855f7');       // purple
  });

  it('includes token data in node data', () => {
    const rounds = [makeRound(0, { totalTokens: 700 })];

    const result = computeFishboneLayout(rounds);
    const data = result.nodes[0].data as Record<string, unknown>;

    expect(data.totalTokens).toBe(700);
    expect(data.nodeWidth).toBeGreaterThan(0);
    expect(data.nodeHeight).toBeGreaterThan(0);
  });

  it('connects expanded bones with edges in correct order', () => {
    const rounds = [
      makeRound(0),
      makeToolCallRound(1, ['exec', 'read']),
      makeRound(2),
    ];
    const expanded = new Set(['round-1']);
    const result = computeFishboneLayout(rounds, expanded);

    // 3 round nodes + 2 bone nodes = 5
    expect(result.nodes).toHaveLength(5);

    // Edges: round-0→round-1, round-1→round-2 (spine)
    //      + round-1→bone-0, bone-0→bone-1 (bones)
    expect(result.edges).toHaveLength(4);

    // Spine edges
    expect(result.edges.find((e) => e.source === 'round-0' && e.target === 'round-1')).toBeDefined();
    expect(result.edges.find((e) => e.source === 'round-1' && e.target === 'round-2')).toBeDefined();

    // Bone edges
    expect(result.edges.find((e) => e.source === 'round-1' && e.target === 'round-1-bone-0')).toBeDefined();
    expect(result.edges.find((e) => e.source === 'round-1-bone-0' && e.target === 'round-1-bone-1')).toBeDefined();
  });

  it('all nodes have sessionNode type', () => {
    const rounds = [
      makeRound(0),
      makeToolCallRound(1, ['exec']),
    ];
    const expanded = new Set(['round-1']);
    const result = computeFishboneLayout(rounds, expanded);

    for (const node of result.nodes) {
      expect(node.type).toBe('sessionNode');
    }
  });

  it('generates preview with tool names', () => {
    const rounds = [
      makeToolCallRound(0, ['exec', 'read', 'web_search', 'write']),
    ];
    const result = computeFishboneLayout(rounds);
    const preview = (result.nodes[0].data as Record<string, unknown>).preview as string;

    // Should contain "Round 1" and some tool names
    expect(preview).toContain('Round 1');
    expect(preview).toContain('exec');
  });

  it('handles many rounds efficiently', () => {
    const rounds = Array.from({ length: 50 }, (_, i) => makeRound(i));
    const result = computeFishboneLayout(rounds);

    expect(result.nodes).toHaveLength(50);
    expect(result.edges).toHaveLength(49);

    // All on spine
    for (const node of result.nodes) {
      expect(node.position.y).toBe(0);
    }
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

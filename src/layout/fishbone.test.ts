// ── Fishbone layout tests (Round-based) ──────────────────────────────

import { describe, it, expect } from 'vitest';
import { computeFishboneLayout, MAX_NESTING_DEPTH } from './fishbone';
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

    // 3 round nodes + 1 sub-agent fork node = 4
    expect(result.nodes).toHaveLength(4);

    const normalNode = result.nodes.find((n) => n.id === 'round-0')!;
    expect((normalNode.data as Record<string, unknown>).roundType).toBe('normal');

    const toolNode = result.nodes.find((n) => n.id === 'round-1')!;
    expect((toolNode.data as Record<string, unknown>).roundType).toBe('tool_call');

    const subNode = result.nodes.find((n) => n.id === 'round-2')!;
    expect((subNode.data as Record<string, unknown>).roundType).toBe('subagent');
    expect((subNode.data as Record<string, unknown>).hasSubagent).toBe(true);

    // Verify the fork node
    const forkNode = result.nodes.find((n) => n.id === 'round-2-fork-0')!;
    expect(forkNode).toBeDefined();
    expect((forkNode.data as Record<string, unknown>).isSubagentFork).toBe(true);
    expect((forkNode.data as Record<string, unknown>).subagentSessionKey).toBe('subagent-session-1');
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

// ── Sub-agent fork layout tests ──────────────────────────────────────

describe('computeFishboneLayout — sub-agent forks', () => {
  it('renders a fork node for each subagent spawn (collapsed)', () => {
    const rounds = [
      makeSubagentRound(0),
    ];
    const result = computeFishboneLayout(rounds);

    // 1 round node + 1 fork node
    expect(result.nodes).toHaveLength(2);

    const forkNode = result.nodes.find((n) => n.id === 'round-0-fork-0')!;
    expect(forkNode).toBeDefined();

    const data = forkNode.data as Record<string, unknown>;
    expect(data.isSubagentFork).toBe(true);
    expect(data.subagentSessionKey).toBe('subagent-session-1');
    expect(data.subagentExpanded).toBe(false);
    expect(data.parentRoundId).toBe('round-0');

    // Fork should have an edge from the round
    const forkEdge = result.edges.find((e) => e.target === 'round-0-fork-0');
    expect(forkEdge).toBeDefined();
    expect(forkEdge!.source).toBe('round-0');
    expect(forkEdge!.type).toBe('subagentEdge');
  });

  it('renders multiple fork nodes for multiple subagent spawns', () => {
    const rounds = [
      makeRound(0, {
        type: 'subagent',
        subagentSpawns: ['sub-a', 'sub-b', 'sub-c'],
        toolCalls: [],
      }),
    ];
    const result = computeFishboneLayout(rounds);

    // 1 round + 3 forks
    expect(result.nodes).toHaveLength(4);

    expect(result.nodes.find((n) => n.id === 'round-0-fork-0')).toBeDefined();
    expect(result.nodes.find((n) => n.id === 'round-0-fork-1')).toBeDefined();
    expect(result.nodes.find((n) => n.id === 'round-0-fork-2')).toBeDefined();

    // Each fork has a subagentEdge from round-0
    const forkEdges = result.edges.filter((e) => e.type === 'subagentEdge');
    expect(forkEdges).toHaveLength(3);
    for (const edge of forkEdges) {
      expect(edge.source).toBe('round-0');
    }
  });

  it('renders sub-agent sub-graph when fork is expanded', () => {
    const rounds = [
      makeSubagentRound(0),
    ];

    // Sub-agent has its own rounds
    const subRounds = [
      makeRound(0, { totalTokens: 100 }),
      makeToolCallRound(1, ['exec']),
    ];

    const subagentTranscripts = new Map<string, Round[]>();
    subagentTranscripts.set('subagent-session-1', subRounds);

    const expandedSubagents = new Set(['subagent-session-1']);

    const result = computeFishboneLayout(
      rounds,
      new Set(),
      subagentTranscripts,
      expandedSubagents,
    );

    // 1 main round + 1 fork + 2 sub-agent round nodes = 4
    expect(result.nodes).toHaveLength(4);

    // Verify fork node is expanded
    const forkNode = result.nodes.find((n) => n.id === 'round-0-fork-0')!;
    expect((forkNode.data as Record<string, unknown>).subagentExpanded).toBe(true);

    // Sub-graph nodes should have prefixed ids
    const subNodes = result.nodes.filter((n) => n.id.startsWith('round-0-fork-0-sub-'));
    expect(subNodes).toHaveLength(2);

    // Sub-graph nodes should be below the fork node
    for (const subNode of subNodes) {
      expect(subNode.position.y).toBeGreaterThan(forkNode.position.y);
    }

    // Edge from fork to first sub-graph round
    const forkToSubEdge = result.edges.find(
      (e) => e.source === 'round-0-fork-0' && e.target.startsWith('round-0-fork-0-sub-')
    );
    expect(forkToSubEdge).toBeDefined();
    expect(forkToSubEdge!.type).toBe('subagentEdge');
  });

  it('sub-graph nodes are at deeper nesting depth', () => {
    const rounds = [makeSubagentRound(0)];
    const subRounds = [makeRound(0)];

    const subagentTranscripts = new Map<string, Round[]>();
    subagentTranscripts.set('subagent-session-1', subRounds);

    const result = computeFishboneLayout(
      rounds,
      new Set(),
      subagentTranscripts,
      new Set(['subagent-session-1']),
    );

    // Main round at depth 0
    const mainNode = result.nodes.find((n) => n.id === 'round-0')!;
    expect((mainNode.data as Record<string, unknown>).nestingDepth).toBe(0);

    // Sub-graph round at depth 1
    const subNode = result.nodes.find((n) => n.id.startsWith('round-0-fork-0-sub-'))!;
    expect((subNode.data as Record<string, unknown>).nestingDepth).toBe(1);
  });

  it('fork node position is below expanded tool call bones', () => {
    const rounds = [
      makeRound(0, {
        type: 'subagent',
        subagentSpawns: ['sub-1'],
        toolCalls: [
          { id: 'tc-0', name: 'exec', toolUseBlock: { type: 'tool_use', name: 'exec', id: 'tc-0' } },
          { id: 'tc-1', name: 'read', toolUseBlock: { type: 'tool_use', name: 'read', id: 'tc-1' } },
        ],
      }),
    ];

    // Expand the round's tool calls
    const expanded = new Set(['round-0']);
    const result = computeFishboneLayout(rounds, expanded);

    const bone1 = result.nodes.find((n) => n.id === 'round-0-bone-1')!;
    const forkNode = result.nodes.find((n) => n.id === 'round-0-fork-0')!;

    // Fork should be below the last bone
    expect(forkNode.position.y).toBeGreaterThan(bone1.position.y);
  });

  it('does not render sub-graph when fork is collapsed', () => {
    const rounds = [makeSubagentRound(0)];
    const subRounds = [makeRound(0), makeRound(1)];

    const subagentTranscripts = new Map<string, Round[]>();
    subagentTranscripts.set('subagent-session-1', subRounds);

    // expandedSubagents is empty → fork is collapsed
    const result = computeFishboneLayout(
      rounds,
      new Set(),
      subagentTranscripts,
      new Set(),
    );

    // Only 1 round + 1 fork, no sub-graph nodes
    expect(result.nodes).toHaveLength(2);
  });

  it('handles nested sub-agents (sub-agent within sub-agent)', () => {
    // Main session has a round that spawns sub-agent A
    const mainRounds = [
      makeRound(0, {
        type: 'subagent',
        subagentSpawns: ['sub-a'],
        toolCalls: [],
      }),
    ];

    // Sub-agent A has a round that spawns sub-agent B
    const subARounds: Round[] = [
      makeRound(0, {
        type: 'subagent',
        subagentSpawns: ['sub-b'],
        toolCalls: [],
      }),
    ];

    // Sub-agent B has simple rounds
    const subBRounds: Round[] = [
      makeRound(0, { totalTokens: 50 }),
    ];

    const transcripts = new Map<string, Round[]>();
    transcripts.set('sub-a', subARounds);
    transcripts.set('sub-b', subBRounds);

    const expandedSubs = new Set(['sub-a', 'sub-b']);

    const result = computeFishboneLayout(
      mainRounds,
      new Set(),
      transcripts,
      expandedSubs,
    );

    // Main: 1 round + 1 fork(sub-a) = 2
    // sub-a: 1 round + 1 fork(sub-b) = 2
    // sub-b: 1 round = 1
    // Total = 5
    expect(result.nodes).toHaveLength(5);

    // Find deepest node (sub-b's round)
    const deepNodes = result.nodes.filter(
      (n) => (n.data as Record<string, unknown>).nestingDepth === 2
    );
    expect(deepNodes).toHaveLength(1);
  });

  it('fork node uses subagentEdge type for edges', () => {
    const rounds = [makeSubagentRound(0)];
    const result = computeFishboneLayout(rounds);

    const subEdges = result.edges.filter((e) => e.type === 'subagentEdge');
    expect(subEdges.length).toBeGreaterThan(0);
  });
});

// ── Cycle detection and depth limit tests ────────────────────────────

describe('computeFishboneLayout — safety guards', () => {
  it('detects circular sub-agent references (A → B → A)', () => {
    // Main session spawns sub-agent "sub-a"
    const mainRounds: Round[] = [
      makeRound(0, {
        type: 'subagent',
        subagentSpawns: ['sub-a'],
        toolCalls: [],
      }),
    ];

    // sub-a spawns sub-b
    const subARounds: Round[] = [
      makeRound(0, {
        type: 'subagent',
        subagentSpawns: ['sub-b'],
        toolCalls: [],
      }),
    ];

    // sub-b tries to spawn sub-a again (circular!)
    const subBRounds: Round[] = [
      makeRound(0, {
        type: 'subagent',
        subagentSpawns: ['sub-a'],
        toolCalls: [],
      }),
    ];

    const transcripts = new Map<string, Round[]>();
    transcripts.set('sub-a', subARounds);
    transcripts.set('sub-b', subBRounds);

    const expandedSubs = new Set(['sub-a', 'sub-b']);

    // Should NOT stack overflow — the visited set prevents re-rendering sub-a
    const result = computeFishboneLayout(
      mainRounds,
      new Set(),
      transcripts,
      expandedSubs,
    );

    // Main: 1 round + 1 fork(sub-a) = 2
    // sub-a: 1 round + 1 fork(sub-b) = 2
    // sub-b: 1 round + 1 fork(sub-a) = 2, but sub-a is visited → no sub-graph
    // Total = 6
    expect(result.nodes).toHaveLength(6);

    // The deepest depth should be 2 (sub-b's round), not infinite
    const maxDepth = Math.max(
      ...result.nodes.map((n) => (n.data as Record<string, unknown>).nestingDepth as number)
    );
    expect(maxDepth).toBe(2);
  });

  it('stops recursion at MAX_NESTING_DEPTH', () => {
    // Build a chain of sub-agents deeper than MAX_NESTING_DEPTH
    const transcripts = new Map<string, Round[]>();
    const expandedSubs = new Set<string>();
    const depth = MAX_NESTING_DEPTH + 3;

    for (let i = 0; i < depth; i++) {
      const key = `sub-${i}`;
      const nextKey = `sub-${i + 1}`;
      expandedSubs.add(key);
      transcripts.set(key, [
        makeRound(0, {
          type: 'subagent',
          subagentSpawns: [nextKey],
          toolCalls: [],
        }),
      ]);
    }
    // Final leaf
    const lastKey = `sub-${depth}`;
    expandedSubs.add(lastKey);
    transcripts.set(lastKey, [makeRound(0)]);

    const mainRounds: Round[] = [
      makeRound(0, {
        type: 'subagent',
        subagentSpawns: ['sub-0'],
        toolCalls: [],
      }),
    ];

    const result = computeFishboneLayout(
      mainRounds,
      new Set(),
      transcripts,
      expandedSubs,
    );

    // Should not crash. Max depth in output should be ≤ MAX_NESTING_DEPTH
    const maxDepth = Math.max(
      ...result.nodes.map((n) => (n.data as Record<string, unknown>).nestingDepth as number)
    );
    expect(maxDepth).toBeLessThanOrEqual(MAX_NESTING_DEPTH);
  });

  it('handles empty sub-agent transcript (0 rounds)', () => {
    const rounds: Round[] = [makeSubagentRound(0)];

    const transcripts = new Map<string, Round[]>();
    transcripts.set('subagent-session-1', []); // empty!

    const result = computeFishboneLayout(
      rounds,
      new Set(),
      transcripts,
      new Set(['subagent-session-1']),
    );

    // 1 round + 1 fork, but no sub-graph nodes (empty transcript)
    expect(result.nodes).toHaveLength(2);
  });

  it('preserves round-type color coding in sub-graphs', () => {
    const rounds: Round[] = [makeSubagentRound(0)];

    // Sub-agent has both normal and tool_call rounds
    const subRounds: Round[] = [
      makeRound(0),
      makeToolCallRound(1, ['exec']),
    ];

    const transcripts = new Map<string, Round[]>();
    transcripts.set('subagent-session-1', subRounds);

    const result = computeFishboneLayout(
      rounds,
      new Set(),
      transcripts,
      new Set(['subagent-session-1']),
    );

    // Find sub-graph nodes
    const subNormal = result.nodes.find(
      (n) => n.id.includes('-sub-') && (n.data as Record<string, unknown>).roundType === 'normal'
    );
    const subTool = result.nodes.find(
      (n) => n.id.includes('-sub-') && (n.data as Record<string, unknown>).roundType === 'tool_call'
    );

    expect(subNormal).toBeDefined();
    expect(subTool).toBeDefined();

    // Colors should match their round types, not all be purple
    expect((subNormal!.data as Record<string, unknown>).color).toBe('#3b82f6'); // blue
    expect((subTool!.data as Record<string, unknown>).color).toBe('#f97316');   // orange
  });
});

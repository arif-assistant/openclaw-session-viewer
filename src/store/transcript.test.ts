// ── Round grouping tests ─────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { groupIntoRounds } from './transcript';
import type { TranscriptEntry } from '@/gateway/types';

// ── Helpers ──────────────────────────────────────────────────────────

function msg(
  id: string,
  role: 'user' | 'assistant' | 'tool' | 'system',
  content: string | any[] = 'hello',
  extra: Partial<TranscriptEntry> = {}
): TranscriptEntry {
  return {
    id,
    type: 'message',
    message: {
      role,
      content,
      usage: { input_tokens: 50, output_tokens: 50 },
    },
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

function sessionEntry(id: string): TranscriptEntry {
  return {
    id,
    type: 'session',
    timestamp: new Date().toISOString(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('groupIntoRounds', () => {
  it('returns empty array for empty input', () => {
    expect(groupIntoRounds([])).toEqual([]);
  });

  it('groups a simple user→assistant pair into one round', () => {
    const entries = [
      msg('1', 'user', 'What is 2+2?'),
      msg('2', 'assistant', 'It is 4.'),
    ];
    const rounds = groupIntoRounds(entries);

    expect(rounds).toHaveLength(1);
    expect(rounds[0].id).toBe('round-0');
    expect(rounds[0].type).toBe('normal');
    expect(rounds[0].userMessage?.id).toBe('1');
    expect(rounds[0].assistantMessage?.id).toBe('2');
    expect(rounds[0].toolCalls).toHaveLength(0);
    expect(rounds[0].totalTokens).toBe(200); // 2 messages × (50+50)
  });

  it('groups multiple conversation turns into separate rounds', () => {
    const entries = [
      msg('1', 'user', 'Hello'),
      msg('2', 'assistant', 'Hi!'),
      msg('3', 'user', 'How are you?'),
      msg('4', 'assistant', 'Good!'),
    ];
    const rounds = groupIntoRounds(entries);

    expect(rounds).toHaveLength(2);
    expect(rounds[0].userMessage?.id).toBe('1');
    expect(rounds[0].assistantMessage?.id).toBe('2');
    expect(rounds[1].userMessage?.id).toBe('3');
    expect(rounds[1].assistantMessage?.id).toBe('4');
  });

  it('collects tool calls in a single round', () => {
    const entries = [
      msg('1', 'user', 'Read the file'),
      msg('2', 'assistant', [
        { type: 'text', text: 'Reading...' },
        { type: 'tool_use', name: 'read', id: 'tu_1', input: { path: 'foo.ts' } },
      ]),
      msg('3', 'tool', [
        { type: 'tool_result', tool_use_id: 'tu_1', content: 'file contents here' },
      ]),
      msg('4', 'assistant', 'Here is the file content...'),
    ];
    const rounds = groupIntoRounds(entries);

    expect(rounds).toHaveLength(1);
    expect(rounds[0].type).toBe('tool_call');
    expect(rounds[0].toolCalls).toHaveLength(1);
    expect(rounds[0].toolCalls[0].name).toBe('read');
    expect(rounds[0].toolCalls[0].resultContent).toBe('file contents here');
    expect(rounds[0].assistantMessage?.id).toBe('4'); // final response
  });

  it('collects multiple tool calls in one round', () => {
    const entries = [
      msg('1', 'user', 'Do stuff'),
      msg('2', 'assistant', [
        { type: 'tool_use', name: 'exec', id: 'tu_1', input: {} },
      ]),
      msg('3', 'tool', [
        { type: 'tool_result', tool_use_id: 'tu_1', content: 'output1' },
      ]),
      msg('4', 'assistant', [
        { type: 'tool_use', name: 'read', id: 'tu_2', input: {} },
      ]),
      msg('5', 'tool', [
        { type: 'tool_result', tool_use_id: 'tu_2', content: 'output2' },
      ]),
      msg('6', 'assistant', 'All done.'),
    ];
    const rounds = groupIntoRounds(entries);

    expect(rounds).toHaveLength(1);
    expect(rounds[0].type).toBe('tool_call');
    expect(rounds[0].toolCalls).toHaveLength(2);
    expect(rounds[0].toolCalls[0].name).toBe('exec');
    expect(rounds[0].toolCalls[1].name).toBe('read');
    expect(rounds[0].assistantMessage?.id).toBe('6');
    expect(rounds[0].rawEntries).toHaveLength(6);
  });

  it('identifies subagent rounds', () => {
    const entries = [
      msg('1', 'user', 'Spawn a sub'),
      msg('2', 'assistant', [
        { type: 'text', text: 'Spawning...' },
        { type: 'tool_use', name: 'subagents', id: 'tu_1', input: {} },
      ]),
      msg('3', 'tool', [
        { type: 'tool_result', tool_use_id: 'tu_1', content: 'spawned' },
      ]),
      msg('4', 'assistant', 'Done spawning.'),
    ];
    const rounds = groupIntoRounds(entries);

    expect(rounds).toHaveLength(1);
    expect(rounds[0].type).toBe('subagent');
    expect(rounds[0].subagentSpawns.length).toBeGreaterThan(0);
  });

  it('handles pre-user system entries', () => {
    const entries = [
      sessionEntry('s1'),
      msg('1', 'user', 'Hi'),
      msg('2', 'assistant', 'Hello!'),
    ];
    const rounds = groupIntoRounds(entries);

    // System entry before first user → its own round
    // Then user→assistant → second round
    expect(rounds).toHaveLength(2);
    expect(rounds[0].rawEntries).toHaveLength(1);
    expect(rounds[0].rawEntries[0].id).toBe('s1');
    expect(rounds[1].userMessage?.id).toBe('1');
  });

  it('handles round with no final text assistant message', () => {
    // Assistant only produced tool calls, never a plain text reply
    const entries = [
      msg('1', 'user', 'Do thing'),
      msg('2', 'assistant', [
        { type: 'tool_use', name: 'exec', id: 'tu_1', input: {} },
      ]),
      msg('3', 'tool', [
        { type: 'tool_result', tool_use_id: 'tu_1', content: 'result' },
      ]),
    ];
    const rounds = groupIntoRounds(entries);

    expect(rounds).toHaveLength(1);
    // Post-processing should set assistantMessage to the last assistant entry
    expect(rounds[0].assistantMessage?.id).toBe('2');
  });
});

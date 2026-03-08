import { describe, it, expect } from 'vitest';
import {
  buildSessionTree,
  filterSessions,
  getSessionDisplayName,
  formatRelativeTime,
  formatTokens,
  shortenModel,
} from './sessions';
import type { SessionListItem } from '@/gateway/types';

// ── Test Helpers ─────────────────────────────────────────────────────

function makeSession(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return {
    sessionId: 'sid-' + (overrides.sessionKey ?? 'default'),
    sessionKey: 'default',
    sessionFile: '/path/to/session.jsonl',
    spawnDepth: 0,
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    createdAt: '2026-03-08T10:00:00Z',
    updatedAt: '2026-03-08T10:00:00Z',
    ...overrides,
  };
}

// ── buildSessionTree ─────────────────────────────────────────────────

describe('buildSessionTree', () => {
  it('should return empty array for empty input', () => {
    expect(buildSessionTree([])).toEqual([]);
  });

  it('should create root nodes for sessions without spawnedBy', () => {
    const sessions = [
      makeSession({ sessionKey: 'a', updatedAt: '2026-03-08T11:00:00Z' }),
      makeSession({ sessionKey: 'b', updatedAt: '2026-03-08T12:00:00Z' }),
    ];

    const tree = buildSessionTree(sessions);
    expect(tree).toHaveLength(2);
    // Sorted by updatedAt descending — b first
    expect(tree[0].session.sessionKey).toBe('b');
    expect(tree[1].session.sessionKey).toBe('a');
    expect(tree[0].children).toEqual([]);
    expect(tree[1].children).toEqual([]);
  });

  it('should nest children under their parent', () => {
    const sessions = [
      makeSession({ sessionKey: 'parent', updatedAt: '2026-03-08T10:00:00Z' }),
      makeSession({
        sessionKey: 'child-1',
        spawnedBy: 'parent',
        spawnDepth: 1,
        updatedAt: '2026-03-08T11:00:00Z',
      }),
      makeSession({
        sessionKey: 'child-2',
        spawnedBy: 'parent',
        spawnDepth: 1,
        updatedAt: '2026-03-08T12:00:00Z',
      }),
    ];

    const tree = buildSessionTree(sessions);
    expect(tree).toHaveLength(1);
    expect(tree[0].session.sessionKey).toBe('parent');
    expect(tree[0].children).toHaveLength(2);
    // Children sorted descending — child-2 first
    expect(tree[0].children[0].session.sessionKey).toBe('child-2');
    expect(tree[0].children[1].session.sessionKey).toBe('child-1');
  });

  it('should handle multi-level nesting', () => {
    const sessions = [
      makeSession({ sessionKey: 'root', updatedAt: '2026-03-08T10:00:00Z' }),
      makeSession({
        sessionKey: 'sub',
        spawnedBy: 'root',
        spawnDepth: 1,
        updatedAt: '2026-03-08T11:00:00Z',
      }),
      makeSession({
        sessionKey: 'sub-sub',
        spawnedBy: 'sub',
        spawnDepth: 2,
        updatedAt: '2026-03-08T12:00:00Z',
      }),
    ];

    const tree = buildSessionTree(sessions);
    expect(tree).toHaveLength(1);
    expect(tree[0].session.sessionKey).toBe('root');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].session.sessionKey).toBe('sub');
    expect(tree[0].children[0].children).toHaveLength(1);
    expect(tree[0].children[0].children[0].session.sessionKey).toBe('sub-sub');
  });

  it('should treat orphaned children as roots', () => {
    // spawnedBy references a non-existent session
    const sessions = [
      makeSession({
        sessionKey: 'orphan',
        spawnedBy: 'nonexistent',
        updatedAt: '2026-03-08T10:00:00Z',
      }),
    ];

    const tree = buildSessionTree(sessions);
    expect(tree).toHaveLength(1);
    expect(tree[0].session.sessionKey).toBe('orphan');
  });

  it('should set expanded to true by default', () => {
    const sessions = [
      makeSession({ sessionKey: 'a' }),
    ];

    const tree = buildSessionTree(sessions);
    expect(tree[0].expanded).toBe(true);
  });
});

// ── filterSessions ───────────────────────────────────────────────────

describe('filterSessions', () => {
  const sessions = [
    makeSession({ sessionKey: 'main:discord', displayName: 'Discord Chat', model: 'claude-opus-4', channel: 'discord' }),
    makeSession({ sessionKey: 'main:telegram', label: 'Telegram Bot', model: 'gpt-4o', channel: 'telegram' }),
    makeSession({ sessionKey: 'sub:coder', derivedTitle: 'Code Review Task', model: 'claude-opus-4' }),
  ];

  it('should return all sessions for empty query', () => {
    expect(filterSessions(sessions, '')).toHaveLength(3);
    expect(filterSessions(sessions, '   ')).toHaveLength(3);
  });

  it('should filter by displayName', () => {
    const result = filterSessions(sessions, 'discord');
    expect(result).toHaveLength(1);
    expect(result[0].sessionKey).toBe('main:discord');
  });

  it('should filter by label', () => {
    const result = filterSessions(sessions, 'telegram');
    expect(result).toHaveLength(1);
    expect(result[0].sessionKey).toBe('main:telegram');
  });

  it('should filter by sessionKey', () => {
    const result = filterSessions(sessions, 'sub:coder');
    expect(result).toHaveLength(1);
    expect(result[0].sessionKey).toBe('sub:coder');
  });

  it('should filter by model', () => {
    const result = filterSessions(sessions, 'opus');
    expect(result).toHaveLength(2); // main:discord + sub:coder
  });

  it('should filter by channel', () => {
    const result = filterSessions(sessions, 'telegram');
    expect(result).toHaveLength(1);
    expect(result[0].sessionKey).toBe('main:telegram');
  });

  it('should be case-insensitive', () => {
    const result = filterSessions(sessions, 'DISCORD');
    expect(result).toHaveLength(1);
  });

  it('should return empty for no matches', () => {
    const result = filterSessions(sessions, 'zzz-nonexistent');
    expect(result).toHaveLength(0);
  });

  it('should filter by derivedTitle', () => {
    const result = filterSessions(sessions, 'code review');
    expect(result).toHaveLength(1);
    expect(result[0].sessionKey).toBe('sub:coder');
  });
});

// ── getSessionDisplayName ────────────────────────────────────────────

describe('getSessionDisplayName', () => {
  it('should prefer displayName', () => {
    const s = makeSession({ displayName: 'My Session', label: 'label', derivedTitle: 'derived' });
    expect(getSessionDisplayName(s)).toBe('My Session');
  });

  it('should fall back to label', () => {
    const s = makeSession({ label: 'Label Here', derivedTitle: 'derived' });
    expect(getSessionDisplayName(s)).toBe('Label Here');
  });

  it('should fall back to derivedTitle', () => {
    const s = makeSession({ derivedTitle: 'Derived Title' });
    expect(getSessionDisplayName(s)).toBe('Derived Title');
  });

  it('should fall back to sessionKey', () => {
    const s = makeSession({ sessionKey: 'main:discord:123' });
    expect(getSessionDisplayName(s)).toBe('main:discord:123');
  });
});

// ── formatTokens ─────────────────────────────────────────────────────

describe('formatTokens', () => {
  it('should format small numbers as-is', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
  });

  it('should format thousands as k', () => {
    expect(formatTokens(1000)).toBe('1.0k');
    expect(formatTokens(1500)).toBe('1.5k');
    expect(formatTokens(45200)).toBe('45.2k');
  });

  it('should format millions as M', () => {
    expect(formatTokens(1_000_000)).toBe('1.0M');
    expect(formatTokens(2_500_000)).toBe('2.5M');
  });
});

// ── shortenModel ─────────────────────────────────────────────────────

describe('shortenModel', () => {
  it('should return empty string for undefined', () => {
    expect(shortenModel(undefined)).toBe('');
  });

  it('should extract last segment from path-like model', () => {
    expect(shortenModel('custom-proxy/claude-opus-4')).toBe('claude-opus-4');
  });

  it('should return short names as-is', () => {
    expect(shortenModel('gpt-4o')).toBe('gpt-4o');
  });

  it('should truncate long names', () => {
    const long = 'a-very-long-model-name-that-exceeds-twenty-chars';
    const result = shortenModel(long);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.endsWith('…')).toBe(true);
  });
});

// ── formatRelativeTime ───────────────────────────────────────────────

describe('formatRelativeTime', () => {
  it('should format recent times', () => {
    const now = new Date();
    expect(formatRelativeTime(now.toISOString())).toBe('just now');
  });

  it('should format minutes', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(fiveMinAgo.toISOString())).toBe('5m ago');
  });

  it('should format hours', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatRelativeTime(threeHoursAgo.toISOString())).toBe('3h ago');
  });

  it('should format days', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(twoDaysAgo.toISOString())).toBe('2d ago');
  });

  it('should format months', () => {
    const twoMonthsAgo = new Date(Date.now() - 65 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(twoMonthsAgo.toISOString())).toBe('2mo ago');
  });
});

// ── MetadataView — Entry metadata display ────────────────────────────
//
// Shows model, provider, token usage, timestamp, and entry type.

import type { TranscriptEntry } from '@/gateway/types';

interface MetadataViewProps {
  entry: TranscriptEntry;
}

/** Format a timestamp string to a readable locale string. */
function formatTimestamp(ts?: string): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

/** Format token numbers with k/M suffixes. */
export function formatTokenCount(n?: number): string {
  if (n == null || n === 0) return '0';
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function MetadataView({ entry }: MetadataViewProps) {
  const usage = entry.message?.usage;
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const totalTokens = inputTokens + outputTokens;

  const rows: [string, string][] = [
    ['Type', entry.type],
    ['Timestamp', formatTimestamp(entry.timestamp ?? entry.message?.timestamp)],
  ];

  if (entry.message?.role) {
    rows.push(['Role', entry.message.role]);
  }

  if (totalTokens > 0) {
    rows.push(
      ['Input tokens', formatTokenCount(inputTokens)],
      ['Output tokens', formatTokenCount(outputTokens)],
      ['Total tokens', formatTokenCount(totalTokens)],
    );
  }

  if (entry.type === 'compaction' && entry.tokensBefore != null) {
    rows.push(['Tokens before compaction', formatTokenCount(entry.tokensBefore)]);
  }

  return (
    <div className="px-3 py-2 border-t border-surface-tertiary">
      <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        Metadata
      </h4>
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <span className="text-gray-500">{label}</span>
            <span className="text-gray-300 font-mono truncate">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

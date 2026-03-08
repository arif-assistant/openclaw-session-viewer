// ── MessageView — Render message content ─────────────────────────────
//
// Displays user/assistant/system/tool message content with:
//   - Role badge
//   - Timestamp
//   - Markdown rendering (via react-markdown)
//   - Structured content blocks (text + tool_use indicators)

import Markdown from 'react-markdown';
import type { TranscriptMessage, ContentBlock } from '@/gateway/types';

interface MessageViewProps {
  message: TranscriptMessage;
  timestamp?: string;
}

const ROLE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  user:      { bg: 'bg-blue-500/20',   text: 'text-blue-300',   label: 'User' },
  assistant: { bg: 'bg-green-500/20',  text: 'text-green-300',  label: 'Assistant' },
  system:    { bg: 'bg-yellow-500/20', text: 'text-yellow-300', label: 'System' },
  tool:      { bg: 'bg-purple-500/20', text: 'text-purple-300', label: 'Tool' },
};

function getRoleStyle(role: string) {
  return ROLE_STYLES[role] ?? { bg: 'bg-gray-500/20', text: 'text-gray-300', label: role };
}

function formatTimestamp(ts?: string): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

/** Extract plain text from string or ContentBlock[]. */
function extractTextContent(content: string | ContentBlock[] | null): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  return content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text!)
    .join('\n\n');
}

/** Count tool_use blocks in structured content. */
function countToolUseBlocks(content: string | ContentBlock[] | null): number {
  if (!Array.isArray(content)) return 0;
  return content.filter((b) => b.type === 'tool_use').length;
}

export function MessageView({ message, timestamp }: MessageViewProps) {
  const roleStyle = getRoleStyle(message.role);
  const text = extractTextContent(message.content);
  const toolCallCount = countToolUseBlocks(message.content);
  const ts = formatTimestamp(timestamp ?? message.timestamp);

  return (
    <div className="px-3 py-2">
      {/* Role + timestamp header */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ${roleStyle.bg} ${roleStyle.text}`}
        >
          {roleStyle.label}
        </span>
        {ts && (
          <span className="text-[10px] text-gray-500 font-mono">{ts}</span>
        )}
      </div>

      {/* Message content */}
      {text ? (
        <div className="prose prose-invert prose-sm max-w-none text-xs text-gray-200 leading-relaxed [&_pre]:bg-surface [&_pre]:rounded [&_pre]:p-2 [&_pre]:text-[11px] [&_code]:text-accent [&_code]:text-[11px] [&_a]:text-accent [&_a]:no-underline [&_a:hover]:underline">
          <Markdown>{text}</Markdown>
        </div>
      ) : (
        <p className="text-xs text-gray-500 italic">No text content</p>
      )}

      {/* Tool call indicator */}
      {toolCallCount > 0 && (
        <div className="mt-2 text-[10px] text-purple-400">
          🔧 {toolCallCount} tool call{toolCallCount > 1 ? 's' : ''} in this message
        </div>
      )}
    </div>
  );
}

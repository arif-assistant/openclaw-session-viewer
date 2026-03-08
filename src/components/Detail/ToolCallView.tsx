// ── ToolCallView — Tool call details display ─────────────────────────
//
// Shows tool calls from structured content blocks (tool_use type):
//   - Tool name
//   - Input (collapsible JSON)
//   - Output / tool_result (collapsible)
//   - Execution status indicator

import { useState } from 'react';
import type { ContentBlock } from '@/gateway/types';

interface ToolCallViewProps {
  /** Content blocks from the message — we extract tool_use entries. */
  contentBlocks: ContentBlock[];
  /** Optional: corresponding tool_result messages' content, keyed by tool_use_id. */
  toolResults?: Map<string, string>;
}

interface SingleToolCallProps {
  block: ContentBlock;
  result?: string;
}

function SingleToolCall({ block, result }: SingleToolCallProps) {
  const [inputOpen, setInputOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);

  const toolName = block.name ?? 'unknown';
  const input = block.input ?? block.content;
  const toolUseId = block.id as string | undefined;

  // Format input as pretty JSON
  let inputStr: string;
  if (typeof input === 'string') {
    inputStr = input;
  } else if (input != null) {
    try {
      inputStr = JSON.stringify(input, null, 2);
    } catch {
      inputStr = String(input);
    }
  } else {
    inputStr = '(no input)';
  }

  return (
    <div className="border border-surface-tertiary rounded-md mb-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-surface-tertiary/30">
        <span className="text-sm">🔧</span>
        <span className="text-xs font-mono font-semibold text-purple-300">
          {toolName}
        </span>
        {toolUseId && (
          <span className="text-[9px] text-gray-600 font-mono ml-auto truncate max-w-[120px]">
            {toolUseId}
          </span>
        )}
      </div>

      {/* Input section */}
      <div className="border-t border-surface-tertiary">
        <button
          onClick={() => setInputOpen(!inputOpen)}
          className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] text-gray-400 hover:text-gray-200 transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform ${inputOpen ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="uppercase tracking-wider font-semibold">Input</span>
          <span className="text-gray-600 ml-1">
            ({inputStr.length > 100 ? `${(inputStr.length / 1024).toFixed(1)}KB` : `${inputStr.length} chars`})
          </span>
        </button>
        {inputOpen && (
          <pre className="px-2 pb-2 text-[11px] text-gray-300 font-mono whitespace-pre-wrap break-all max-h-60 overflow-y-auto bg-surface/50">
            {inputStr}
          </pre>
        )}
      </div>

      {/* Output section */}
      {result != null && (
        <div className="border-t border-surface-tertiary">
          <button
            onClick={() => setOutputOpen(!outputOpen)}
            className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] text-gray-400 hover:text-gray-200 transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${outputOpen ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span className="uppercase tracking-wider font-semibold">Output</span>
            <span className="text-gray-600 ml-1">
              ({result.length > 100 ? `${(result.length / 1024).toFixed(1)}KB` : `${result.length} chars`})
            </span>
          </button>
          {outputOpen && (
            <pre className="px-2 pb-2 text-[11px] text-gray-300 font-mono whitespace-pre-wrap break-all max-h-60 overflow-y-auto bg-surface/50">
              {result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolCallView({ contentBlocks, toolResults }: ToolCallViewProps) {
  const toolUseBlocks = contentBlocks.filter((b) => b.type === 'tool_use');

  if (toolUseBlocks.length === 0) return null;

  return (
    <div className="px-3 py-2 border-t border-surface-tertiary">
      <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        Tool Calls ({toolUseBlocks.length})
      </h4>
      {toolUseBlocks.map((block, i) => {
        const toolUseId = block.id as string | undefined;
        const result = toolUseId ? toolResults?.get(toolUseId) : undefined;
        return (
          <SingleToolCall
            key={toolUseId ?? `tool-${i}`}
            block={block}
            result={result}
          />
        );
      })}
    </div>
  );
}

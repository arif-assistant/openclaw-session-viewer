// ── JSON-RPC Protocol Types ──────────────────────────────────────────

export interface JsonRpcRequest {
  type: 'req';
  method: string;
  params?: Record<string, unknown>;
  id: string;
}

export interface JsonRpcResponse {
  type: 'res';
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { message: string };
}

export interface JsonRpcEvent {
  type: 'event';
  event: string;
  payload: unknown;
  seq?: number;
}

export type GatewayMessage = JsonRpcResponse | JsonRpcEvent;

// ── Connection State ─────────────────────────────────────────────────

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'error';

export interface ConnectionState {
  status: ConnectionStatus;
  url: string;
  error?: string;
  reconnectAttempt: number;
}

// ── Gateway Client Options ───────────────────────────────────────────

export interface GatewayClientOptions {
  url: string;
  token?: string;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectIntervalMs?: number;
}

// ── Event Handler ────────────────────────────────────────────────────

export type EventHandler = (event: string, payload: unknown) => void;

// ── Session Types (from sessions.list) ───────────────────────────────

export interface SessionEntry {
  sessionId: string;
  sessionKey: string;
  sessionFile: string;
  label?: string;
  displayName?: string;
  model?: string;
  modelProvider?: string;
  channel?: string;
  origin?: string;
  spawnedBy?: string;
  spawnDepth: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  createdAt: string;
  updatedAt: string;
}

// ── Session List API Response ────────────────────────────────────────

export interface SessionListItem {
  sessionId: string;
  sessionKey: string;
  sessionFile: string;
  label?: string;
  displayName?: string;
  model?: string;
  modelProvider?: string;
  channel?: string;
  origin?: string;
  spawnedBy?: string;
  spawnDepth: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  createdAt: string;
  updatedAt: string;
  derivedTitle?: string;
  lastMessage?: string;
}

export interface SessionsListResponse {
  sessions: SessionListItem[];
}

// ── Session Tree ─────────────────────────────────────────────────────

export interface TreeNode {
  session: SessionListItem;
  children: TreeNode[];
  expanded: boolean;
}

// ── Transcript Entry Types ───────────────────────────────────────────

/** A content block within a structured message (tool_use, text, etc.). */
export interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  [key: string]: unknown;
}

export interface TranscriptMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | ContentBlock[] | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  timestamp?: string;
}

export interface TranscriptEntry {
  id: string;
  parentId?: string;
  type: 'session' | 'message' | 'compaction' | 'branch_summary' | 'model_change' | 'thinking_level_change' | 'custom' | 'custom_message' | 'label';
  message?: TranscriptMessage;
  summary?: string;
  tokensBefore?: number;
  customType?: string;
  data?: unknown;
  timestamp?: string;
}

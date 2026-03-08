// ── JSON-RPC Protocol Types ──────────────────────────────────────────

export interface JsonRpcRequest {
  type: 'auth' | 'request';
  method?: string;
  params?: Record<string, unknown>;
  id?: number;
  token?: string;
}

export interface JsonRpcResponse {
  type: 'response';
  id: number;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface JsonRpcEvent {
  type: 'event';
  event: string;
  payload: unknown;
  seq: number;
}

export interface AuthChallenge {
  type: 'auth';
  status: 'required' | 'ok' | 'failed';
  message?: string;
}

export type GatewayMessage = JsonRpcResponse | JsonRpcEvent | AuthChallenge;

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

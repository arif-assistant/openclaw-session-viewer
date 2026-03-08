import type {
  GatewayClientOptions,
  GatewayMessage,
  EventHandler,
  ConnectionStatus,
  JsonRpcRequest,
} from './types';

/**
 * GatewayClient — WebSocket JSON-RPC client for the OpenClaw Gateway.
 *
 * Protocol:
 *   1. Client connects via WebSocket
 *   2. Server sends { type: "auth", status: "required" }
 *   3. Client sends { type: "auth", token: "..." }
 *   4. Server sends { type: "auth", status: "ok" } or { ..., status: "failed" }
 *   5. Client sends requests: { type: "request", method, params, id }
 *   6. Server responds: { type: "response", id, success, result/error }
 *   7. Server pushes events: { type: "event", event, payload, seq }
 */
export class GatewayClient {
  private ws: WebSocket | null = null;
  private options: Required<GatewayClientOptions>;
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();
  private eventHandlers: EventHandler[] = [];
  private statusListeners: Array<(status: ConnectionStatus, error?: string) => void> = [];
  private _status: ConnectionStatus = 'disconnected';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intentionalClose = false;

  constructor(options: GatewayClientOptions) {
    this.options = {
      url: options.url,
      token: options.token ?? '',
      reconnect: options.reconnect ?? true,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      reconnectIntervalMs: options.reconnectIntervalMs ?? 3000,
    };
  }

  // ── Public API ───────────────────────────────────────────────────

  get status(): ConnectionStatus {
    return this._status;
  }

  /**
   * Connect to the Gateway WebSocket and authenticate.
   */
  connect(url?: string, token?: string): void {
    if (url) this.options.url = url;
    if (token !== undefined) this.options.token = token;

    this.intentionalClose = false;
    this.reconnectAttempt = 0;
    this.doConnect();
  }

  /**
   * Disconnect from the Gateway.
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.rejectAllPending('Client disconnected');
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  /**
   * Send a JSON-RPC request and return a promise of the result.
   */
  request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this._status !== 'connected') {
        reject(new Error(`Not connected (status: ${this._status})`));
        return;
      }

      const id = ++this.requestId;
      const message: JsonRpcRequest = {
        type: 'request',
        method,
        params: params ?? {},
        id,
      };

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.ws!.send(JSON.stringify(message));
    });
  }

  /**
   * Subscribe to Gateway events.
   */
  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  /**
   * Subscribe to connection status changes.
   */
  onStatusChange(listener: (status: ConnectionStatus, error?: string) => void): () => void {
    this.statusListeners.push(listener);
    return () => {
      const idx = this.statusListeners.indexOf(listener);
      if (idx >= 0) this.statusListeners.splice(idx, 1);
    };
  }

  // ── Internals ────────────────────────────────────────────────────

  private doConnect(): void {
    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(this.options.url);
    } catch (err) {
      this.setStatus('error', (err as Error).message);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      // Wait for auth challenge from server
      this.setStatus('authenticating');
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as GatewayMessage;
        this.handleMessage(msg);
      } catch {
        // Ignore unparseable messages
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after this, so we just set the error status
      if (this._status !== 'error') {
        this.setStatus('error', 'WebSocket error');
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.rejectAllPending('Connection closed');
      if (!this.intentionalClose) {
        this.setStatus('disconnected');
        this.scheduleReconnect();
      }
    };
  }

  private handleMessage(msg: GatewayMessage): void {
    if (msg.type === 'auth') {
      if (msg.status === 'required') {
        // Send auth token
        this.ws?.send(
          JSON.stringify({ type: 'auth', token: this.options.token })
        );
      } else if (msg.status === 'ok') {
        this.reconnectAttempt = 0;
        this.setStatus('connected');
      } else if (msg.status === 'failed') {
        this.setStatus('error', msg.message ?? 'Authentication failed');
        this.intentionalClose = true; // Don't reconnect on auth failure
        this.ws?.close();
      }
    } else if (msg.type === 'response') {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        if (msg.success) {
          pending.resolve(msg.result);
        } else {
          pending.reject(new Error(msg.error ?? 'Request failed'));
        }
      }
    } else if (msg.type === 'event') {
      for (const handler of this.eventHandlers) {
        try {
          handler(msg.event, msg.payload);
        } catch {
          // Don't let handler errors crash the client
        }
      }
    }
  }

  private setStatus(status: ConnectionStatus, error?: string): void {
    this._status = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status, error);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private scheduleReconnect(): void {
    if (!this.options.reconnect) return;
    if (this.reconnectAttempt >= this.options.maxReconnectAttempts) {
      this.setStatus('error', 'Max reconnect attempts reached');
      return;
    }

    this.clearReconnectTimer();
    const delay = this.options.reconnectIntervalMs * Math.pow(1.5, this.reconnectAttempt);
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.doConnect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error(reason));
      this.pendingRequests.delete(id);
    }
  }
}

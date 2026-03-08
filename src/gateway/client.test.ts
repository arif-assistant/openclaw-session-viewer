import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GatewayClient } from './client';

// ── Mock WebSocket ─────────────────────────────────────────────────

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.onclose?.();
  }

  // Test helpers
  simulateOpen(): void {
    this.onopen?.();
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateError(): void {
    this.onerror?.();
  }

  simulateClose(): void {
    this.onclose?.();
  }
}

// ── Tests ──────────────────────────────────────────────────────────

describe('GatewayClient', () => {
  let originalWebSocket: typeof globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  function getLastWS(): MockWebSocket {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }

  /**
   * Helper: connect and authenticate through the full handshake.
   * 1. ws.simulateOpen() → triggers onopen
   * 2. Server sends connect.challenge event
   * 3. Client sends connect request (type: "req", method: "connect")
   * 4. Server responds with success
   */
  function connectAndAuth(client: GatewayClient): MockWebSocket {
    client.connect();
    const ws = getLastWS();
    ws.simulateOpen();

    // Server sends connect.challenge event
    ws.simulateMessage({
      type: 'event',
      event: 'connect.challenge',
      payload: { nonce: 'abc', ts: 123 },
    });

    // Client should have sent a connect request
    const connectMsg = JSON.parse(ws.sent[0]);
    expect(connectMsg.type).toBe('req');
    expect(connectMsg.method).toBe('connect');

    // Server responds with success
    ws.simulateMessage({
      type: 'res',
      id: connectMsg.id,
      ok: true,
      result: {},
    });

    return ws;
  }

  describe('connect', () => {
    it('should create a WebSocket connection and authenticate via connect protocol', () => {
      const client = new GatewayClient({
        url: 'ws://localhost:3578',
        token: 'test-token',
      });

      const statusChanges: string[] = [];
      client.onStatusChange((status) => statusChanges.push(status));

      client.connect();
      expect(getLastWS().url).toBe('ws://localhost:3578');
      expect(statusChanges).toContain('connecting');

      const ws = getLastWS();
      ws.simulateOpen();
      expect(statusChanges).toContain('authenticating');

      // Server sends connect.challenge event
      ws.simulateMessage({
        type: 'event',
        event: 'connect.challenge',
        payload: { nonce: 'test-nonce', ts: 1000 },
      });

      // Client should have sent a connect request
      const connectMsg = JSON.parse(ws.sent[0]);
      expect(connectMsg.type).toBe('req');
      expect(connectMsg.method).toBe('connect');
      expect(connectMsg.params.auth).toEqual({ token: 'test-token' });
      expect(connectMsg.params.minProtocol).toBe(3);
      expect(connectMsg.params.maxProtocol).toBe(3);
      expect(connectMsg.params.client).toEqual({
        id: 'gateway-client',
        version: '0.1.0',
        platform: 'linux',
        mode: 'backend',
      });
      expect(connectMsg.params.role).toBe('operator');
      expect(connectMsg.params.scopes).toEqual(['operator.admin']);
      expect(connectMsg.params.caps).toEqual([]);

      // Server approves
      ws.simulateMessage({
        type: 'res',
        id: connectMsg.id,
        ok: true,
        result: {},
      });
      expect(client.status).toBe('connected');
      expect(statusChanges).toContain('connected');
    });

    it('should set error status on auth failure', () => {
      const client = new GatewayClient({
        url: 'ws://localhost:3578',
        token: 'bad-token',
      });

      client.connect();
      const ws = getLastWS();
      ws.simulateOpen();

      // Server sends connect.challenge
      ws.simulateMessage({
        type: 'event',
        event: 'connect.challenge',
        payload: { nonce: 'abc', ts: 123 },
      });

      // Get the connect request id
      const connectMsg = JSON.parse(ws.sent[0]);

      // Server rejects auth
      ws.simulateMessage({
        type: 'res',
        id: connectMsg.id,
        ok: false,
        error: { message: 'Invalid token' },
      });

      expect(client.status).toBe('error');
    });
  });

  describe('request', () => {
    it('should send a JSON-RPC request and resolve with result', async () => {
      const client = new GatewayClient({
        url: 'ws://localhost:3578',
        token: 'test',
      });
      const ws = connectAndAuth(client);

      const promise = client.request('sessions.list', { limit: 10 });

      // Find the request message (after the connect request)
      const reqMsg = JSON.parse(ws.sent[ws.sent.length - 1]);
      expect(reqMsg.type).toBe('req');
      expect(reqMsg.method).toBe('sessions.list');
      expect(reqMsg.params).toEqual({ limit: 10 });

      // Server responds
      ws.simulateMessage({
        type: 'res',
        id: reqMsg.id,
        ok: true,
        payload: { sessions: [] },
      });

      const result = await promise;
      expect(result).toEqual({ sessions: [] });
    });

    it('should reject request when not connected', async () => {
      const client = new GatewayClient({
        url: 'ws://localhost:3578',
      });

      await expect(client.request('test')).rejects.toThrow('Not connected');
    });

    it('should reject request on error response', async () => {
      const client = new GatewayClient({
        url: 'ws://localhost:3578',
        token: 'test',
      });
      const ws = connectAndAuth(client);

      const promise = client.request('bad.method');
      const reqMsg = JSON.parse(ws.sent[ws.sent.length - 1]);

      ws.simulateMessage({
        type: 'res',
        id: reqMsg.id,
        ok: false,
        error: { message: 'Method not found' },
      });

      await expect(promise).rejects.toThrow('Method not found');
    });
  });

  describe('events', () => {
    it('should dispatch events to handlers', () => {
      const client = new GatewayClient({
        url: 'ws://localhost:3578',
        token: 'test',
      });
      const ws = connectAndAuth(client);

      const events: Array<{ event: string; payload: unknown }> = [];
      client.onEvent((event, payload) => events.push({ event, payload }));

      ws.simulateMessage({
        type: 'event',
        event: 'agent',
        payload: { action: 'run_start' },
        seq: 1,
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        event: 'agent',
        payload: { action: 'run_start' },
      });
    });

    it('should allow unsubscribing from events', () => {
      const client = new GatewayClient({
        url: 'ws://localhost:3578',
        token: 'test',
      });
      const ws = connectAndAuth(client);

      const events: unknown[] = [];
      const unsub = client.onEvent((_event, payload) => events.push(payload));

      ws.simulateMessage({ type: 'event', event: 'test', payload: 'first', seq: 1 });
      expect(events).toHaveLength(1);

      unsub();

      ws.simulateMessage({ type: 'event', event: 'test', payload: 'second', seq: 2 });
      expect(events).toHaveLength(1); // Still 1, handler was removed
    });

    it('should NOT dispatch connect.challenge to event handlers', () => {
      const client = new GatewayClient({
        url: 'ws://localhost:3578',
        token: 'test',
      });

      const events: Array<{ event: string; payload: unknown }> = [];
      client.onEvent((event, payload) => events.push({ event, payload }));

      // Go through the full connect flow
      connectAndAuth(client);

      // connect.challenge should NOT appear in dispatched events
      expect(events.filter((e) => e.event === 'connect.challenge')).toHaveLength(0);
    });
  });

  describe('reconnect', () => {
    it('should attempt to reconnect on unexpected close', () => {
      const client = new GatewayClient({
        url: 'ws://localhost:3578',
        token: 'test',
        reconnect: true,
        reconnectIntervalMs: 1000,
      });

      const ws = connectAndAuth(client);
      const initialInstanceCount = MockWebSocket.instances.length;

      // Simulate unexpected close
      ws.simulateClose();
      expect(client.status).toBe('disconnected');

      // Advance timer past reconnect delay
      vi.advanceTimersByTime(1500);
      expect(MockWebSocket.instances.length).toBe(initialInstanceCount + 1);
    });

    it('should NOT reconnect on intentional disconnect', () => {
      const client = new GatewayClient({
        url: 'ws://localhost:3578',
        token: 'test',
        reconnect: true,
        reconnectIntervalMs: 1000,
      });

      connectAndAuth(client);
      const countBefore = MockWebSocket.instances.length;

      client.disconnect();
      vi.advanceTimersByTime(5000);

      expect(MockWebSocket.instances.length).toBe(countBefore);
    });

    it('should stop reconnecting after max attempts', () => {
      const client = new GatewayClient({
        url: 'ws://localhost:3578',
        token: 'test',
        reconnect: true,
        maxReconnectAttempts: 2,
        reconnectIntervalMs: 100,
      });

      client.connect();
      let ws = getLastWS();

      // First connection fails
      ws.simulateClose();
      vi.advanceTimersByTime(200);

      // Second attempt
      ws = getLastWS();
      ws.simulateClose();
      vi.advanceTimersByTime(300);

      // Third attempt (should be rejected)
      ws = getLastWS();
      ws.simulateClose();
      vi.advanceTimersByTime(1000);

      expect(client.status).toBe('error');
    });
  });

  describe('disconnect', () => {
    it('should close the WebSocket and reject pending requests', async () => {
      const client = new GatewayClient({
        url: 'ws://localhost:3578',
        token: 'test',
      });
      connectAndAuth(client);

      const promise = client.request('sessions.list');
      client.disconnect();

      await expect(promise).rejects.toThrow('Client disconnected');
      expect(client.status).toBe('disconnected');
    });
  });
});

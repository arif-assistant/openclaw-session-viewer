import { create } from 'zustand';
import { GatewayClient } from '@/gateway/client';
import type { ConnectionStatus, EventHandler } from '@/gateway/types';

const STORAGE_KEY = 'openclaw-viewer-connection';
const DEFAULT_URL = 'ws://localhost:3578';

interface StoredConnection {
  url: string;
  token: string;
}

function loadStoredConnection(): StoredConnection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredConnection;
      return {
        url: parsed.url || DEFAULT_URL,
        token: parsed.token || '',
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { url: DEFAULT_URL, token: '' };
}

function saveConnection(url: string, token: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ url, token }));
}

interface ConnectionStore {
  // State
  status: ConnectionStatus;
  url: string;
  token: string;
  error: string | undefined;
  client: GatewayClient | null;

  // Actions
  connect: (url: string, token: string) => void;
  disconnect: () => void;
  onEvent: (handler: EventHandler) => () => void;
}

export const useConnectionStore = create<ConnectionStore>((set, get) => {
  const stored = loadStoredConnection();

  return {
    status: 'disconnected',
    url: stored.url,
    token: stored.token,
    error: undefined,
    client: null,

    connect: (url: string, token: string) => {
      // Disconnect existing connection
      const existing = get().client;
      if (existing) {
        existing.disconnect();
      }

      const client = new GatewayClient({
        url,
        token,
        reconnect: true,
        maxReconnectAttempts: 10,
        reconnectIntervalMs: 3000,
      });

      // Listen for status changes
      client.onStatusChange((status, error) => {
        set({ status, error });

        // Persist on successful connection
        if (status === 'connected') {
          saveConnection(url, token);
        }
      });

      set({ client, url, token, error: undefined });
      client.connect();
    },

    disconnect: () => {
      const { client } = get();
      if (client) {
        client.disconnect();
      }
      set({ status: 'disconnected', client: null, error: undefined });
    },

    onEvent: (handler: EventHandler) => {
      const { client } = get();
      if (client) {
        return client.onEvent(handler);
      }
      return () => {};
    },
  };
});

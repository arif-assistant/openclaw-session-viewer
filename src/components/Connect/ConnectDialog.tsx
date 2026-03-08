import { useState } from 'react';
import { useConnectionStore } from '@/store/connection';

const STATUS_COLORS: Record<string, string> = {
  disconnected: 'bg-status-disconnected',
  connecting: 'bg-status-connecting',
  authenticating: 'bg-status-connecting',
  connected: 'bg-status-connected',
  error: 'bg-status-error',
};

const STATUS_LABELS: Record<string, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting…',
  authenticating: 'Authenticating…',
  connected: 'Connected',
  error: 'Error',
};

export function ConnectDialog() {
  const { status, url, token, error, connect, disconnect } = useConnectionStore();
  const [formUrl, setFormUrl] = useState(url);
  const [formToken, setFormToken] = useState(token);

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting' || status === 'authenticating';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isConnected) {
      disconnect();
    } else {
      connect(formUrl, formToken);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="bg-surface-secondary rounded-xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-100 mb-2">
          OpenClaw Session Viewer
        </h1>
        <p className="text-gray-400 mb-6 text-sm">
          Connect to your OpenClaw Gateway to explore session history.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Gateway URL */}
          <div>
            <label
              htmlFor="gateway-url"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Gateway URL
            </label>
            <input
              id="gateway-url"
              type="text"
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="ws://localhost:3578"
              disabled={isConnected || isConnecting}
              className="w-full px-3 py-2 bg-surface rounded-lg border border-surface-tertiary
                         text-gray-200 placeholder-gray-500
                         focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent
                         disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Token */}
          <div>
            <label
              htmlFor="gateway-token"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Token
            </label>
            <input
              id="gateway-token"
              type="password"
              value={formToken}
              onChange={(e) => setFormToken(e.target.value)}
              placeholder="Optional — leave empty for local connections"
              disabled={isConnected || isConnecting}
              className="w-full px-3 py-2 bg-surface rounded-lg border border-surface-tertiary
                         text-gray-200 placeholder-gray-500
                         focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent
                         disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-2 py-2">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_COLORS[status] ?? 'bg-gray-500'}`}
            />
            <span className="text-sm text-gray-300">
              {STATUS_LABELS[status] ?? status}
            </span>
            {error && (
              <span className="text-sm text-status-error ml-2">— {error}</span>
            )}
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={isConnecting}
            className={`w-full py-2.5 px-4 rounded-lg font-medium transition-colors
              ${
                isConnected
                  ? 'bg-status-error/20 text-status-error hover:bg-status-error/30'
                  : 'bg-accent text-surface hover:bg-accent-hover'
              }
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isConnected ? 'Disconnect' : isConnecting ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      </div>
    </div>
  );
}

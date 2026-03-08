import { useConnectionStore } from '@/store/connection';
import { useSessionStore } from '@/store/sessions';
import { ConnectDialog } from '@/components/Connect/ConnectDialog';
import { SessionList } from '@/components/SessionList';

export default function App() {
  const status = useConnectionStore((s) => s.status);
  const activeSessionKey = useSessionStore((s) => s.activeSessionKey);

  if (status !== 'connected') {
    return <ConnectDialog />;
  }

  return (
    <div className="flex h-screen bg-surface">
      {/* Left sidebar — Session list */}
      <SessionList />

      {/* Main content — Graph placeholder */}
      <main className="flex-1 flex items-center justify-center min-w-0">
        {activeSessionKey ? (
          <div className="text-center text-gray-500">
            <p className="text-lg font-medium text-gray-300">Session Selected</p>
            <p className="text-sm mt-1 font-mono text-gray-500 max-w-md truncate px-4">
              {activeSessionKey}
            </p>
            <p className="text-xs mt-3 text-gray-600">
              Graph visualization coming soon…
            </p>
          </div>
        ) : (
          <div className="text-center text-gray-500">
            <p className="text-lg font-medium">Connected to Gateway</p>
            <p className="text-sm mt-1">Select a session to view its timeline.</p>
          </div>
        )}
      </main>
    </div>
  );
}

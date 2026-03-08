import { useConnectionStore } from '@/store/connection';
import { ConnectDialog } from '@/components/Connect/ConnectDialog';

export default function App() {
  const status = useConnectionStore((s) => s.status);

  if (status !== 'connected') {
    return <ConnectDialog />;
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar — placeholder for SessionList */}
      <aside className="w-64 bg-surface-secondary border-r border-surface-tertiary p-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Sessions
        </h2>
        <p className="text-sm text-gray-500">Session list coming soon…</p>
      </aside>

      {/* Main content — placeholder for GraphCanvas */}
      <main className="flex-1 flex items-center justify-center bg-surface">
        <div className="text-center text-gray-500">
          <p className="text-lg font-medium">Connected to Gateway</p>
          <p className="text-sm mt-1">Select a session to view its timeline.</p>
        </div>
      </main>
    </div>
  );
}

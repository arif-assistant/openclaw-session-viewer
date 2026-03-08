import { useState } from 'react';
import { useSessionStore } from '@/store/sessions';

export function SessionFilter() {
  const filterQuery = useSessionStore((s) => s.filterQuery);
  const setFilterQuery = useSessionStore((s) => s.setFilterQuery);
  const [focused, setFocused] = useState(false);

  return (
    <div className="relative px-2 mb-2">
      <div
        className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 transition-colors ${
          focused
            ? 'border-accent bg-surface'
            : 'border-surface-tertiary bg-surface/50'
        }`}
      >
        {/* Search icon */}
        <svg
          className="w-3.5 h-3.5 text-gray-500 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          type="text"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Filter sessions…"
          className="flex-1 bg-transparent text-xs text-gray-200 placeholder-gray-500 outline-none min-w-0"
        />
        {filterQuery && (
          <button
            onClick={() => setFilterQuery('')}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            title="Clear filter"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

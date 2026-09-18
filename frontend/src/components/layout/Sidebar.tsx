import type { Liegenschaft } from "../../types";
import { Spinner } from "../ui/Spinner";

interface SidebarProps {
  liegenschaften: Liegenschaft[];
  selected: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onVerbund: () => void;
  isLoading?: boolean;
}

export function Sidebar({
  liegenschaften,
  selected,
  onSelect,
  onNew,
  onEdit,
  onDelete,
  onVerbund,
  isLoading,
}: SidebarProps) {
  return (
    <aside className="w-56 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Liegenschaften
        </span>
        <button
          onClick={onNew}
          className="text-blue-600 hover:text-blue-800 text-lg leading-none font-bold"
          title="Neue Liegenschaft anlegen"
          aria-label="Neue Liegenschaft anlegen"
        >
          +
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner size="sm" />
          </div>
        ) : liegenschaften.length === 0 ? (
          <p className="text-xs text-gray-400 px-3 py-4 text-center">
            Noch keine Liegenschaft
          </p>
        ) : (
          liegenschaften.map((l) => (
            <div
              key={l.id}
              className={`group relative flex items-start px-3 py-2 transition-colors ${
                selected === l.id
                  ? "bg-blue-50"
                  : "hover:bg-gray-100"
              }`}
            >
              <button
                onClick={() => onSelect(l.id)}
                className={`flex-1 text-left min-w-0 ${
                  selected === l.id ? "text-blue-700 font-medium" : "text-gray-700"
                }`}
              >
                <div className="truncate text-sm">{l.name}</div>
                <div className="truncate text-xs text-gray-400">{l.ort}</div>
              </button>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(l.id); }}
                  className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  title="Liegenschaft bearbeiten"
                  aria-label={`${l.name} bearbeiten`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM4.75 13.5c-.69 0-1.25-.56-1.25-1.25V4.75c0-.69.56-1.25 1.25-1.25H7a.75.75 0 0 0 0-1.5H4.75A2.75 2.75 0 0 0 2 4.75v7.5A2.75 2.75 0 0 0 4.75 15h7.5A2.75 2.75 0 0 0 15 12.25V10a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-7.5Z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(l.id); }}
                  className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-100 focus:outline-none focus:ring-1 focus:ring-red-400"
                  title="Liegenschaft löschen"
                  aria-label={`${l.name} löschen`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Verbund-Button */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2">
        <button
          onClick={onVerbund}
          className="w-full flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-1"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Verbund / geteilte Kosten
        </button>
      </div>
    </aside>
  );
}

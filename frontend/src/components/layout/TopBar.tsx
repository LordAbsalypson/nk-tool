import type { ReactNode } from "react";

export type StageId = 1 | 2 | 3 | 4 | 5;

interface TopBarProps {
  stage: StageId;
  onStageChange: (s: StageId) => void;
  liegenschaftName?: string;
  /** Globale Suche — sitzt mittig in der Kopfzeile */
  suche?: ReactNode;
}

const STAGE_CONFIG: Record<StageId, { label: string; active: string; hover: string }> = {
  1: { label: "Stammdaten",     active: "bg-blue-600 text-white",    hover: "text-gray-500 hover:bg-blue-50 hover:text-blue-700" },
  2: { label: "Kostenarten",    active: "bg-amber-500 text-white",   hover: "text-gray-500 hover:bg-amber-50 hover:text-amber-700" },
  3: { label: "Zählerstände",   active: "bg-cyan-600 text-white",    hover: "text-gray-500 hover:bg-cyan-50 hover:text-cyan-700" },
  4: { label: "Vorauszahlungen",active: "bg-orange-500 text-white",  hover: "text-gray-500 hover:bg-orange-50 hover:text-orange-700" },
  5: { label: "Abrechnung",     active: "bg-emerald-600 text-white", hover: "text-gray-500 hover:bg-emerald-50 hover:text-emerald-700" },
};

export function TopBar({ stage, onStageChange, liegenschaftName, suche }: TopBarProps) {
  return (
    <header className="h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 gap-4 shrink-0">
      <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm tracking-tight select-none shrink-0">
        NK-Tool
      </span>
      {liegenschaftName && (
        <>
          <span className="text-gray-300 select-none shrink-0">|</span>
          <span className="text-sm text-gray-600 truncate max-w-[12rem] shrink-0">
            {liegenschaftName}
          </span>
        </>
      )}
      {suche}
      <div className="ml-auto flex items-center gap-1 shrink-0">
        {([1, 2, 3, 4, 5] as const).map((s) => {
          const cfg = STAGE_CONFIG[s];
          return (
            <button
              key={s}
              onClick={() => onStageChange(s)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400 ${
                stage === s ? cfg.active : cfg.hover
              }`}
            >
              {s} · {cfg.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}

import type { ReactNode } from "react";
import logo from "../../assets/logo.svg";

export type StageId = 1 | 2 | 3 | 4 | 5;

interface TopBarProps {
  stage: StageId;
  onStageChange: (s: StageId) => void;
  liegenschaftName?: string;
  /** Globale Suche — sitzt mittig in der Kopfzeile */
  suche?: ReactNode;
}

const STAGE_CONFIG: Record<StageId, { label: string }> = {
  1: { label: "Stammdaten" },
  2: { label: "Kostenarten" },
  3: { label: "Zählerstände" },
  4: { label: "Vorauszahlungen" },
  5: { label: "Abrechnung" },
};

export function TopBar({ stage, onStageChange, liegenschaftName, suche }: TopBarProps) {
  return (
    <header className="h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200/80 dark:border-slate-800 flex items-center px-5 gap-4 shrink-0">
      <span className="flex items-center gap-2 shrink-0 select-none">
        <img src={logo} alt="" className="h-5 w-5 rounded-md shadow-sm" />
        <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm tracking-tight">
          NK-Tool
        </span>
      </span>
      {liegenschaftName && (
        <>
          <span className="text-slate-300 dark:text-slate-700 select-none shrink-0">/</span>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md truncate max-w-[14rem] shrink-0">
            {liegenschaftName}
          </span>
        </>
      )}
      {suche}
      <nav
        aria-label="Arbeitsschritte"
        className="ml-auto flex items-center gap-0.5 bg-slate-100/90 dark:bg-slate-800/90 p-1 rounded-xl border border-slate-200/70 dark:border-slate-700/70 shrink-0"
      >
        {([1, 2, 3, 4, 5] as const).map((s) => {
          const cfg = STAGE_CONFIG[s];
          const isActive = stage === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onStageChange(s)}
              aria-current={isActive ? "step" : undefined}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                isActive
                  ? "bg-slate-900 dark:bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-700/60"
              }`}
            >
              <span
                className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-mono ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                }`}
              >
                {s}
              </span>
              {cfg.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

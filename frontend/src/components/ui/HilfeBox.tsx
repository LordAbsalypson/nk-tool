import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

interface Props {
  /** Eindeutiger Schlüssel — pro Kasten wird getrennt gemerkt, ob er eingeklappt ist. */
  id: string;
  titel: string;
  children: React.ReactNode;
}

/** Einklappbarer Erklär-Kasten. Beim ersten Mal offen (wer neu ist, braucht die
 *  Erklärung), danach bleibt er so, wie man ihn zuletzt hinterlassen hat — wer die
 *  Tabelle kennt, bekommt den Platz für die eigentlichen Daten zurück. */
export function HilfeBox({ id, titel, children }: Props) {
  const key = `nk-tool-hilfe-${id}`;
  const [offen, setOffen] = useState(() => {
    try {
      return localStorage.getItem(key) !== "zu";
    } catch {
      return true;
    }
  });

  function umschalten() {
    const neu = !offen;
    setOffen(neu);
    try {
      localStorage.setItem(key, neu ? "auf" : "zu");
    } catch {
      // localStorage nicht verfügbar — Zustand gilt dann nur für diese Sitzung.
    }
  }

  return (
    <div className="mb-4 rounded-xl bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-600 dark:text-slate-300 shadow-xs">
      <button
        type="button"
        onClick={umschalten}
        aria-expanded={offen}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
      >
        {offen ? <ChevronDownIcon className="w-3.5 h-3.5 text-indigo-500" /> : <ChevronRightIcon className="w-3.5 h-3.5 text-slate-400" />}
        {titel}
      </button>
      {offen && <div className="px-4 pb-3 pt-0.5 space-y-1.5 border-t border-slate-200/60 dark:border-slate-700/60">{children}</div>}
    </div>
  );
}

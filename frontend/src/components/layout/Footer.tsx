import { useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Modal } from "../ui/Modal";
import { useUiZoom } from "../../hooks/useUiZoom";

interface FooterProps {
  dark: boolean;
  setDark: Dispatch<SetStateAction<boolean>>;
  onGlossar: () => void;
  onTodo: () => void;
  onPdfVorlage: () => void;
  onSettings: () => void;
}

interface VersionInfo {
  version: string;
  changelog: string;
}

export function Footer({ dark, setDark, onGlossar, onTodo, onPdfVorlage, onSettings }: FooterProps) {
  const [changelogOffen, setChangelogOffen] = useState(false);
  const { zoom, zoomIn, zoomOut, resetZoom, minZoom, maxZoom } = useUiZoom();

  const { data: versionInfo } = useQuery({
    queryKey: ["app-version"],
    queryFn: () => api.get<VersionInfo>("/version"),
    staleTime: 1000 * 60 * 30,
  });

  const version = versionInfo?.version ?? "1.4.0";

  return (
    <>
      <footer className="h-9 bg-slate-100/90 dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 flex items-center px-5 gap-4 shrink-0 text-xs text-slate-700 dark:text-slate-300">
        <button
          type="button"
          onClick={() => setChangelogOffen(true)}
          title="Versions-Historie & Changelog anzeigen"
          className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          NK-Tool v{version}
        </button>
        <span className="text-slate-300 dark:text-slate-700 select-none">|</span>
        <button
          onClick={onGlossar}
          className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors font-medium"
        >
          Glossar &amp; Begriffe
        </button>
        <span className="text-slate-300 dark:text-slate-700 select-none">|</span>
        <button
          onClick={onTodo}
          className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-1 font-medium"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Aufgaben
        </button>
        <span className="text-slate-300 dark:text-slate-700 select-none">|</span>
        <button
          onClick={onPdfVorlage}
          className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-1 font-medium"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          PDF-Vorlage
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          {/* Inkrementelle Text- & UI-Vergrößerung (auch per ⌘+ / ⌘− / ⌘0) */}
          <div
            className="inline-flex items-center rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden"
            title="Schriftgröße anpassen (Tastenkürzel: ⌘+ vergrößern, ⌘− verkleinern, ⌘0 Standard)"
          >
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoom <= minZoom}
              aria-label="Schrift verkleinern"
              title="Schrift verkleinern (⌘−)"
              className="px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              A−
            </button>
            <button
              type="button"
              onClick={resetZoom}
              title="Auf 100% zurücksetzen (⌘0)"
              className="px-1.5 py-0.5 text-[11px] font-mono border-x border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              {zoom}%
            </button>
            <button
              type="button"
              onClick={zoomIn}
              disabled={zoom >= maxZoom}
              aria-label="Schrift vergrößern"
              title="Schrift vergrößern (⌘+)"
              className="px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              A+
            </button>
          </div>
          <button
            onClick={onSettings}
            title="Einstellungen"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300 font-medium"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Einstellungen
          </button>
          <button
            onClick={() => setDark((d) => !d)}
            title={dark ? "Hellen Modus aktivieren" : "Dunklen Modus aktivieren"}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400"
          >
            {dark ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM15.657 5.404a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM6.464 14.596a.75.75 0 1 0-1.06-1.06l-1.06 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10ZM14.596 15.657a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.06 1.06l1.06 1.061ZM5.404 6.464a.75.75 0 0 0 1.06-1.06L5.404 4.343a.75.75 0 1 0-1.06 1.06l1.06 1.061Z" />
                </svg>
                Hell
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z" clipRule="evenodd" />
                </svg>
                Dunkel
              </>
            )}
          </button>
        </div>
      </footer>

      <Modal
        open={changelogOffen}
        onClose={() => setChangelogOffen(false)}
        title={`NK-Tool v${version} — Versions-Historie & Changelog`}
        size="lg"
      >
        <div className="max-h-[65vh] overflow-y-auto pr-1">
          <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            {versionInfo?.changelog || `Version ${version}`}
          </pre>
        </div>
      </Modal>
    </>
  );
}

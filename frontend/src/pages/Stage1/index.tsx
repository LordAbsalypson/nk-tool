import { useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import type { Liegenschaft } from "../../types";
import { UebersichtTab } from "./UebersichtTab";
import { WohnungenMieterTab } from "./WohnungenMieterTab";
import { KostenartenTab } from "./KostenartenTab";
import { PeriodenTab } from "./PeriodenTab";

const TABS = [
  { key: "uebersicht",  label: "Übersicht" },
  { key: "wohnungen",   label: "Wohnungen & Mieter" },
  { key: "kostenarten", label: "Kostenarten" },
  { key: "perioden",    label: "Perioden" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface Props {
  liegenschaft: Liegenschaft;
  onSaved: () => void;
  onError: (msg: string) => void;
  onGoToStage2?: () => void;
}

export default function Stage1({ liegenschaft, onSaved, onError, onGoToStage2 }: Props) {
  const [params, setParams] = useSearchParams();
  const activeTab: TabKey = (params.get("tab") as TabKey) ?? "uebersicht";
  const pendingSaveFn = useRef<(() => void) | null>(null);

  const currentIdx = TABS.findIndex((t) => t.key === activeTab);
  const nextTab = currentIdx < TABS.length - 1 ? TABS[currentIdx + 1] : null;
  const isLastTab = currentIdx === TABS.length - 1;

  async function handleTabChange(tab: TabKey) {
    pendingSaveFn.current?.();
    setParams({ tab });
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <nav className="flex gap-0 border-b border-gray-200 dark:border-gray-700 px-6 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            className={`tab-btn ${
              activeTab === t.key ? "tab-btn-active" : "tab-btn-inactive"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 p-6">
        {activeTab === "uebersicht" && (
          <UebersichtTab
            liegenschaft={liegenschaft}
            onSaved={onSaved}
            onError={onError}
            onSetSaveFn={(fn) => { pendingSaveFn.current = fn; }}
          />
        )}
        {activeTab === "wohnungen" && (
          <WohnungenMieterTab
            liegenschaftId={liegenschaft.id}
            onSaved={onSaved}
            onError={onError}
          />
        )}
        {activeTab === "kostenarten" && (
          <KostenartenTab
            liegenschaftId={liegenschaft.id}
            onSaved={onSaved}
            onError={onError}
          />
        )}
        {activeTab === "perioden" && (
          <PeriodenTab
            liegenschaftId={liegenschaft.id}
            onSaved={onSaved}
            onError={onError}
          />
        )}
      </div>

      {/* Footer navigation */}
      <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        {nextTab && (
          <button
            onClick={() => handleTabChange(nextTab.key)}
            className="btn btn-primary flex items-center gap-1"
          >
            Weiter zu {nextTab.label} <ArrowRightIcon className="w-4 h-4" />
          </button>
        )}
        {isLastTab && onGoToStage2 && (
          <button
            onClick={() => { pendingSaveFn.current?.(); onGoToStage2(); }}
            className="btn btn-primary flex items-center gap-1"
          >
            Weiter zu Kosteneingabe <ArrowRightIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

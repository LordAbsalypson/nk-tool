import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { api } from "../../api/client";
import type { ValidationMessage, ValidationResult } from "../../types";

interface Props {
  periodeId: number;
  onJump: (stage: 1 | 2 | 3 | 4 | 5, tab?: string) => void;
}

function jumpTargetForCode(code: string): { stage: 1 | 2 | 3 | 4 | 5; tab?: string; label: string } | null {
  switch (code) {
    case "fehlende_anfangsablesung":
    case "fehlende_endablesung":
    case "mieterwechsel":
      return { stage: 3, label: "Zu Zählerstände →" };
    case "fehlende_vorauszahlungen":
      return { stage: 4, label: "Zu Vorauszahlungen →" };
    case "keine_mieter":
    case "datum_luecke":
      return { stage: 1, tab: "wohnungen", label: "Zu Wohnungen & Mieter →" };
    default:
      return null;
  }
}

/** Erklärt verständlich, warum das System diese Meldung erzeugt und wann man sie
 *  einfach als „Zur Kenntnis genommen" abhaken kann. */
function erklaerungFuerCode(code: string): string {
  switch (code) {
    case "fehlende_vorauszahlungen":
      return "Warum dieser Hinweis? Für einzelne Mietmonate steht der gezahlte Betrag (Ist) noch auf 0 €. Falls der Mieter in diesen Monaten tatsächlich nichts gezahlt hat oder erst später eingezogen ist, einfach abhaken.";
    case "datum_luecke":
      return "Warum dieser Hinweis? Zwischen Auszug des Vormieters und Periodenende (oder Nachmieter) ist kein aktiver Mieter eingetragen. Für eine unterjährige Auszugs-Abrechnung vor Neuvermietung ist das völlig normal — einfach abhaken.";
    case "mieterwechsel":
      return "Warum dieser Hinweis? In dieser Wohnung gab es einen Mieterwechsel ohne separaten Zwischen-Zählerstand. Die Engine teilt den Verbrauch automatisch taggenau nach Miettagen auf.";
    case "fehlende_anfangsablesung":
    case "fehlende_endablesung":
      return "Warum dieser Hinweis? Für diesen Zähler fehlt ein Ablesewert; ohne Anfangs- und Endstand (oder manuellen Verbrauch) wird für diesen Zähler 0 Verbrauch angesetzt.";
    case "keine_mieter":
      return "Warum dieser Hinweis? Der Wohnung ist im Abrechnungszeitraum kein Mieter zugeordnet (Leerstand).";
    default:
      return "Hinweis der automatischen Plausibilitätsprüfung.";
  }
}

function msgId(msg: ValidationMessage): string {
  return `${msg.typ}:${msg.code}:${msg.message}`;
}

function loadAckSet(periodeId: number): Set<string> {
  try {
    const raw = localStorage.getItem(`nk-tool-pruefung-ack-${periodeId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function saveAckSet(periodeId: number, acks: Set<string>) {
  try {
    localStorage.setItem(`nk-tool-pruefung-ack-${periodeId}`, JSON.stringify([...acks]));
  } catch {
    // localStorage nicht verfügbar
  }
}

/** Kompakte Status-Kachel + Side-Drawer für Prüfhinweise.
 *  Kein aufdringlicher gelber Warnblock mehr über der Tabelle: Hinweise lassen sich
 *  im rechten Seiten-Menü mit Erklärung ansehen und einzeln (oder gesammelt) abhaken. */
export function PruefungPanel({ periodeId, onJump }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showAcked, setShowAcked] = useState(false);
  const [ackRevision, setAckRevision] = useState(0);

  // Liest das Set pro periodeId frisch; ackRevision triggert Re-Render nach Abhaken
  void ackRevision;
  const acked = loadAckSet(periodeId);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  const { data, isError } = useQuery({
    queryKey: ["validierung", periodeId],
    queryFn: () => api.get<ValidationResult>(`/perioden/${periodeId}/validierung`),
  });

  if (isError) {
    return (
      <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-900/20 px-4 py-2 text-xs text-rose-700 dark:text-rose-300">
        Prüfung der Abrechnungsdaten konnte nicht geladen werden.
      </div>
    );
  }

  if (!data) return null;

  const alleMeldungen: ValidationMessage[] = [
    ...data.errors,
    ...data.warnings,
    ...data.infos,
  ];
  if (alleMeldungen.length === 0) return null;

  const offeneMeldungen = alleMeldungen.filter((m) => !acked.has(msgId(m)));
  const erledigteAnzahl = alleMeldungen.length - offeneMeldungen.length;
  const offeneErrors = offeneMeldungen.filter((m) => m.typ === "error").length;

  function toggleAck(m: ValidationMessage) {
    const id = msgId(m);
    const next = new Set(acked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    saveAckSet(periodeId, next);
    setAckRevision((r) => r + 1);
  }

  function alleAbhaken() {
    const next = new Set(acked);
    for (const m of alleMeldungen) next.add(msgId(m));
    saveAckSet(periodeId, next);
    setAckRevision((r) => r + 1);
  }

  function alleZuruecksetzen() {
    const next = new Set<string>();
    saveAckSet(periodeId, next);
    setAckRevision((r) => r + 1);
  }

  const sichtbareMeldungen = showAcked ? alleMeldungen : offeneMeldungen;

  return (
    <>
      {/* Kompakte Info-Kachel statt gelbem Warn-Banner */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-800/90 px-4 py-2.5 shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          {offeneMeldungen.length === 0 ? (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shrink-0">
              <CheckCircleIcon className="w-4 h-4" />
            </span>
          ) : offeneErrors > 0 ? (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 shrink-0">
              <XCircleIcon className="w-4 h-4" />
            </span>
          ) : (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
              <InformationCircleIcon className="w-4 h-4" />
            </span>
          )}
          <div className="min-w-0">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
              {offeneMeldungen.length === 0
                ? `Alle ${alleMeldungen.length} Prüfhinweise zur Kenntnis genommen`
                : `${offeneMeldungen.length} ${offeneMeldungen.length === 1 ? "offener Prüfhinweis" : "offene Prüfhinweise"}`}
            </span>
            {erledigteAnzahl > 0 && offeneMeldungen.length > 0 && (
              <span className="ml-2 text-[11px] text-slate-400 dark:text-slate-500">
                ({erledigteAnzahl} abgehakt)
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {offeneMeldungen.length > 0 && (
            <button
              type="button"
              onClick={alleAbhaken}
              className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
              title="Alle Hinweise für diese Periode als geprüft abhaken"
            >
              Alle abhaken
            </button>
          )}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
          >
            <span>Prüfhinweise öffnen</span>
            <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {offeneMeldungen.length}/{alleMeldungen.length}
            </span>
          </button>
        </div>
      </div>

      {/* Side-Drawer für Prüfhinweise */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px]"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pruefung-drawer-title"
            className="w-full max-w-lg bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 id="pruefung-drawer-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Prüfhinweise zur Abrechnungsperiode
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Hinweise prüfen und abhaken, wenn der Sachverhalt bekannt/gewollt ist.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Seitenmenü schließen"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between px-5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800 text-xs">
              <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showAcked}
                  onChange={(e) => setShowAcked(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Abgehakte einblenden ({erledigteAnzahl})</span>
              </label>
              <div className="flex items-center gap-2">
                {offeneMeldungen.length > 0 && (
                  <button
                    type="button"
                    onClick={alleAbhaken}
                    className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Alle abhaken
                  </button>
                )}
                {erledigteAnzahl > 0 && (
                  <button
                    type="button"
                    onClick={alleZuruecksetzen}
                    className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    Zurücksetzen
                  </button>
                )}
              </div>
            </div>

            {/* Liste */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {sichtbareMeldungen.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircleIcon className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    Alle Prüfhinweise sind abgehakt.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Aktiviere oben „Abgehakte einblenden", um sie erneut einzusehen.
                  </p>
                </div>
              ) : (
                sichtbareMeldungen.map((msg, i) => {
                  const id = msgId(msg);
                  const isAck = acked.has(id);
                  const target = jumpTargetForCode(msg.code);
                  const erklaerung = erklaerungFuerCode(msg.code);

                  return (
                    <div
                      key={`${id}-${i}`}
                      className={`rounded-xl border p-3.5 transition-all ${
                        isAck
                          ? "bg-slate-50/70 dark:bg-slate-800/30 border-slate-200/70 dark:border-slate-800 opacity-65"
                          : msg.typ === "error"
                          ? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/70"
                          : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80 shadow-xs"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => toggleAck(msg)}
                          aria-label={isAck ? "Hinweis wieder öffnen" : "Hinweis abhaken"}
                          className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                            isAck
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "border-slate-300 dark:border-slate-600 hover:border-indigo-500 bg-white dark:bg-slate-800"
                          }`}
                          title={isAck ? "Abgehakt — Klick zum Wiederöffnen" : "Zur Kenntnis genommen (Abhaken)"}
                        >
                          {isAck && <CheckIcon className="w-3.5 h-3.5 stroke-[2.5]" />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {msg.typ === "error" ? (
                              <XCircleIcon className="w-4 h-4 text-rose-500 shrink-0" />
                            ) : msg.typ === "warning" ? (
                              <ExclamationTriangleIcon className="w-4 h-4 text-indigo-500 shrink-0" />
                            ) : (
                              <InformationCircleIcon className="w-4 h-4 text-slate-400 shrink-0" />
                            )}
                            <p
                              className={`text-xs font-semibold ${
                                isAck
                                  ? "line-through text-slate-500 dark:text-slate-400"
                                  : "text-slate-900 dark:text-slate-100"
                              }`}
                            >
                              {msg.message}
                            </p>
                          </div>

                          {msg.context && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{msg.context}</p>
                          )}

                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed bg-slate-50 dark:bg-slate-900/50 rounded-lg px-2.5 py-1.5 border border-slate-100 dark:border-slate-800">
                            {erklaerung}
                          </p>

                          <div className="flex items-center justify-between gap-2 mt-2.5">
                            <button
                              type="button"
                              onClick={() => toggleAck(msg)}
                              className="text-[11px] font-medium text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
                            >
                              {isAck ? "Wieder als offen markieren" : "✓ Zur Kenntnis genommen"}
                            </button>
                            {target && (
                              <button
                                type="button"
                                onClick={() => {
                                  setDrawerOpen(false);
                                  onJump(target.stage, target.tab);
                                }}
                                className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                              >
                                {target.label}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

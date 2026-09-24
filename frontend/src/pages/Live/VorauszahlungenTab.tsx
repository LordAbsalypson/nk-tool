import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { VorauszahlungGrid, Vorauszahlung } from "../../types";
import { Spinner } from "../../components/ui/Spinner";
import { Modal } from "../../components/ui/Modal";

interface Props {
  periodeId: number;
  liegenschaftId: number;
  onSaved: () => void;
  onError: (msg: string) => void;
  /** Mieter-ID, zu der einmalig gescrollt/hervorgehoben werden soll (Sprung aus der
   * Abrechnung). null = kein Sprung ansteht. */
  focusMieterId?: number | null;
  /** Wird aufgerufen, sobald die Hervorhebung ausgelöst wurde. */
  onFocusConsumed?: () => void;
}

function fmt(n: number) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Nach dem Speichern per Enter die nächste Zelle im Grid zum Bearbeiten öffnen. */
function focusNextCell(order: number) {
  setTimeout(() => {
    const btns = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button[data-vz-order]")
    );
    const next = btns
      .filter((b) => Number(b.dataset.vzOrder) > order)
      .sort((a, b) => Number(a.dataset.vzOrder) - Number(b.dataset.vzOrder))[0];
    next?.click();
  }, 80);
}

function EditableCell({
  vz,
  order,
  periodeId,
  onSaved,
  onError,
}: {
  vz: Vorauszahlung;
  order: number;
  periodeId: number;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(vz.betrag_ist.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: (betrag_ist: number) =>
      api.put<Vorauszahlung>(`/vorauszahlungen/${vz.id}`, { betrag_ist }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vorauszahlungen", periodeId] });
      qc.invalidateQueries({ queryKey: ["validierung", periodeId] });
      setEditing(false);
      onSaved();
    },
    onError: (e: Error) => {
      onError(e.message);
      setEditing(false);
    },
  });

  function save() {
    if (mutation.isPending) return;
    const num = parseFloat(value.replace(",", "."));
    if (isNaN(num) || num < 0) {
      setValue(vz.betrag_ist.toString());
      setEditing(false);
      return;
    }
    if (num === vz.betrag_ist) {
      setEditing(false);
      return;
    }
    mutation.mutate(num);
  }

  const isPaid = vz.betrag_ist >= vz.betrag_soll && vz.betrag_soll > 0;
  const isZero = vz.betrag_ist === 0;

  if (editing) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <input
          ref={inputRef}
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              save();
              focusNextCell(order);
            }
            if (e.key === "Escape") {
              setValue(vz.betrag_ist.toString());
              setEditing(false);
            }
          }}
          className="w-20 px-1 py-0.5 text-xs border border-blue-400 rounded text-right focus:outline-none"
          autoFocus
        />
      </div>
    );
  }

  return (
    <button
      data-vz-order={order}
      className="w-full flex items-center justify-end gap-1 hover:bg-amber-50 rounded px-1 py-0.5 transition-colors group"
      onClick={() => {
        setValue(vz.betrag_ist.toString());
        setEditing(true);
      }}
      title={`Gezahlt: ${fmt(vz.betrag_ist)} € — Klicken zum Bearbeiten${
        vz.ist_override ? " (manuell fixiert)" : ""
      }`}
    >
      {vz.ist_override && <span className="w-1 h-1 rounded-full bg-blue-400 shrink-0" />}
      <span className={`text-xs font-medium block ${
        isPaid ? "text-green-600" : isZero ? "text-orange-500" : "text-gray-800"
      }`}>
        {fmt(vz.betrag_ist)} €
      </span>
    </button>
  );
}

/** Soll-Zelle: Bearbeitung löst immer das Scope-Popup aus (kein Direkt-Speichern). */
function SollCell({
  vz,
  onRequestScope,
}: {
  vz: Vorauszahlung;
  onRequestScope: (vz: Vorauszahlung, neuerWert: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(vz.betrag_soll.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  function save() {
    const num = parseFloat(value.replace(",", "."));
    setEditing(false);
    if (isNaN(num) || num < 0 || num === vz.betrag_soll) {
      setValue(vz.betrag_soll.toString());
      return;
    }
    onRequestScope(vz, num);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setValue(vz.betrag_soll.toString());
            setEditing(false);
          }
        }}
        className="w-16 px-1 py-0.5 text-[11px] border border-amber-400 rounded text-right focus:outline-none"
        autoFocus
      />
    );
  }

  return (
    <button
      className="flex items-center justify-end gap-1 w-full hover:text-amber-700 group"
      onClick={() => {
        setValue(vz.betrag_soll.toString());
        setEditing(true);
      }}
      title={`Vereinbarter Monatsbetrag — Klicken zum Ändern${
        vz.soll_override ? " (manuell fixiert)" : ""
      }`}
    >
      {vz.soll_override && <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />}
      <span className="text-gray-400 text-xs group-hover:text-amber-600">
        Soll: {fmt(vz.betrag_soll)}
      </span>
    </button>
  );
}

/** Popup beim Ändern des Soll-Betrags: für den ganzen Zeitraum oder nur diesen Monat. */
function ScopeModal({
  pending,
  periodeId,
  onDone,
  onError,
}: {
  pending: { vz: Vorauszahlung; neuerWert: number } | null;
  periodeId: number;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (scope: "monat" | "periode") =>
      api.put<Vorauszahlung>(`/vorauszahlungen/${pending!.vz.id}`, {
        betrag_soll: pending!.neuerWert,
        scope,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vorauszahlungen", periodeId] });
      qc.invalidateQueries({ queryKey: ["validierung", periodeId] });
      onDone();
    },
    onError: (e: Error) => {
      onError(e.message);
      onDone();
    },
  });

  return (
    <Modal
      open={pending !== null}
      title="Soll-Betrag ändern"
      onClose={onDone}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onDone} disabled={mutation.isPending}>
            Abbrechen
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => mutation.mutate("monat")}
            disabled={mutation.isPending}
          >
            Nur diesen Monat
          </button>
          <button
            className="btn btn-primary"
            onClick={() => mutation.mutate("periode")}
            disabled={mutation.isPending}
            autoFocus
          >
            Als Standard für den gesamten Zeitraum
          </button>
        </>
      }
    >
      {pending && (
        <p className="text-sm text-gray-700">
          Neuer Soll-Betrag: <strong>{fmt(pending.neuerWert)} €</strong> statt bisher{" "}
          {fmt(pending.vz.betrag_soll)} €.
          <br />
          <br />
          <strong>„Als Standard“</strong> setzt den neuen Betrag als Vorgabe für diesen Mieter
          (auch künftige Perioden) und für alle Monate dieser Periode, die nicht bereits einzeln
          fixiert wurden.
          <br />
          <strong>„Nur diesen Monat“</strong> ändert ausschließlich diese eine Zelle.
        </p>
      )}
    </Modal>
  );
}

/** Gesamtbetrag für die ganze Periode eintragen — wird gleichmäßig auf die
 * noch nicht individuell fixierten Monate verteilt. */
function GesamtbetragButton({
  mieter,
  periodeId,
  onSaved,
  onError,
}: {
  mieter: GridMieter;
  periodeId: number;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ziel, setZiel] = useState<"soll" | "ist">("ist");
  const [betrag, setBetrag] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/perioden/${periodeId}/mieter/${mieter.mieter_id}/vorauszahlung-gesamt`, {
        ziel,
        betrag_gesamt: parseFloat(betrag.replace(",", ".")),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vorauszahlungen", periodeId] });
      qc.invalidateQueries({ queryKey: ["validierung", periodeId] });
      setOpen(false);
      setBetrag("");
      onSaved();
    },
    onError: (e: Error) => onError(e.message),
  });

  const fixedRows = mieter.vorauszahlungen.filter((v) =>
    ziel === "soll" ? v.soll_override : v.ist_override
  );
  const fixedSum = Math.round(
    fixedRows.reduce((s, v) => s + (ziel === "soll" ? v.betrag_soll : v.betrag_ist), 0) * 100
  ) / 100;
  const betragNum = parseFloat(betrag.replace(",", "."));
  const wirdZurueckgesetzt = fixedRows.length > 0 && !isNaN(betragNum) && betragNum < fixedSum;

  return (
    <>
      <button
        className="btn btn-secondary btn-sm whitespace-nowrap"
        onClick={() => setOpen(true)}
        title="Gesamtbetrag für die ganze Periode eintragen — wird gleichmäßig auf die Monate verteilt"
      >
        Gesamtbetrag
      </button>
      <Modal
        open={open}
        title={`Gesamtbetrag — ${mieter.anzeigename}`}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setOpen(false)}>
              Abbrechen
            </button>
            <button
              className="btn btn-primary"
              disabled={mutation.isPending || !betrag}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "…" : "Verteilen"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Wird gleichmäßig auf alle Monate dieser Periode verteilt, die noch nicht einzeln
            fixiert wurden. Bereits fixierte Monate bleiben unverändert; der Rest des
            Gesamtbetrags (Gesamtbetrag minus Summe der fixierten Monate) wird auf die
            restlichen Monate aufgeteilt.
          </p>
          <div>
            <label className="label">Zielfeld</label>
            <select
              className="input"
              value={ziel}
              onChange={(e) => setZiel(e.target.value as "soll" | "ist")}
            >
              <option value="ist">Ist (tatsächlich gezahlt)</option>
              <option value="soll">Soll (vereinbarter Betrag)</option>
            </select>
          </div>
          <div>
            <label className="label">Gesamtbetrag für die Periode (€)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input"
              value={betrag}
              onChange={(e) => setBetrag(e.target.value)}
              autoFocus
            />
          </div>
          {wirdZurueckgesetzt && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {fixedRows.length} Monat{fixedRows.length !== 1 ? "e sind" : " ist"} bereits
              individuell fixiert (zusammen {fmt(fixedSum)} €). Beim Fortfahren werden diese
              Fixierungen aufgehoben und der neue Betrag gleichmäßig auf alle Monate verteilt.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

type GridMieter = VorauszahlungGrid["wohnungen"][number]["mieter"][number];

function RowFillButton({
  mieter,
  periodeId,
  onSaved,
  onError,
}: {
  mieter: GridMieter;
  periodeId: number;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const targets = mieter.vorauszahlungen.filter(
    (v) => v.betrag_ist === 0 && v.betrag_soll > 0
  );

  const mutation = useMutation({
    mutationFn: async () => {
      await Promise.all(
        targets.map((v) =>
          api.put<Vorauszahlung>(`/vorauszahlungen/${v.id}`, {
            betrag_ist: v.betrag_soll,
          })
        )
      );
      return targets.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vorauszahlungen", periodeId] });
      qc.invalidateQueries({ queryKey: ["validierung", periodeId] });
      onSaved();
    },
    onError: (e: Error) => onError(e.message),
  });

  if (targets.length === 0) return null;

  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="btn btn-secondary btn-sm whitespace-nowrap"
      title={`${targets.length} leere Monate (0 €) mit dem Soll-Betrag füllen — bereits eingetragene Werte bleiben unverändert`}
    >
      {mutation.isPending ? "…" : "Soll übernehmen"}
    </button>
  );
}

export function VorauszahlungenTab({ periodeId, onSaved, onError, focusMieterId, onFocusConsumed }: Props) {
  const [highlightMieterId, setHighlightMieterId] = useState<number | null>(null);
  const { data: grid, isLoading } = useQuery({
    queryKey: ["vorauszahlungen", periodeId],
    queryFn: () => api.get<VorauszahlungGrid>(`/perioden/${periodeId}/vorauszahlungen`),
  });

  const [pendingScope, setPendingScope] = useState<{ vz: Vorauszahlung; neuerWert: number } | null>(
    null
  );

  // Sprung aus der Abrechnung (Stift bei "Vorauszahlung"): einmalig zur Mieter-Zeile scrollen
  // und sie kurz hervorheben, sobald das Grid geladen ist.
  useEffect(() => {
    if (!grid || focusMieterId == null) return;
    const row = document.getElementById(`vz-mieter-${focusMieterId}`);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlightMieterId(focusMieterId);
    onFocusConsumed?.();
    const timeout = setTimeout(() => setHighlightMieterId(null), 2000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, focusMieterId]);

  if (isLoading)
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );

  if (!grid)
    return <p className="text-sm text-gray-400">Keine Daten verfügbar.</p>;

  if (grid.wohnungen.length === 0)
    return (
      <p className="text-sm text-gray-400">
        Keine Mieter für diese Periode gefunden. Bitte Mieter in Stammdaten anlegen.
      </p>
    );

  // Globale Zeilennummer pro Mieter für die Enter-Navigation durchs Grid
  const rowIndex: Record<number, number> = {};
  let rc = 0;
  for (const w of grid.wohnungen) for (const m of w.mieter) rowIndex[m.mieter_id] = rc++;

  return (
    <div>
      {/* Info-Banner */}
      <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 space-y-1">
        <p className="font-semibold">Wie funktioniert diese Tabelle?</p>
        <p>
          Jede Zelle zeigt oben den <strong>gezahlten Betrag (Ist)</strong> — klicken zum Bearbeiten.
          Darunter steht <span className="text-amber-600">Soll:</span> der vereinbarte Monatsbetrag —
          ebenfalls klickbar.
        </p>
        <p>
          Beim Ändern des Soll-Betrags fragt ein Popup, ob der neue Wert nur für diesen Monat
          gilt oder als Standard für den gesamten Zeitraum (und künftige Perioden) übernommen wird.
          Ein <span className="text-amber-600 font-medium">Punkt</span> markiert Monate, die
          einzeln fixiert wurden.
        </p>
        <p>
          Über <strong>„Gesamtbetrag“</strong> kann ein Betrag für die ganze Periode eingetragen
          werden — er wird gleichmäßig auf alle noch nicht fixierten Monate verteilt.
        </p>
        <p>
          <span className="text-green-600 font-medium">Grün</span> = vollständig bezahlt.{" "}
          <span className="text-orange-500 font-medium">Orange</span> = noch nicht eingetragen (0 €).
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs w-full min-w-[1300px] border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left font-semibold text-gray-700 pb-2 pr-3 min-w-[90px]">
                Wohnung
              </th>
              <th className="text-left font-semibold text-gray-700 pb-2 pr-3 min-w-[110px]">
                Mieter
              </th>
              {grid.monate.map((m) => (
                <th
                  key={`${m.monat}-${m.jahr}`}
                  className="text-right font-semibold text-gray-700 pb-2 px-1 min-w-[72px]"
                >
                  {m.label}
                </th>
              ))}
              <th className="text-right font-semibold text-gray-700 pb-2 pl-3 min-w-[80px] border-l border-gray-200">
                Soll ges.
              </th>
              <th className="text-right font-semibold text-gray-700 pb-2 pl-2 min-w-[80px]">
                Ist ges.
              </th>
              <th className="text-right font-semibold text-gray-700 pb-2 pl-2 min-w-[70px]">
                Differenz
              </th>
              <th className="pb-2 pl-2" />
            </tr>
          </thead>
          <tbody>
            {grid.wohnungen.map((w) =>
              w.mieter.map((m, mi) => {
                const differenz = m.total_ist - m.total_soll;

                return (
                  <tr
                    key={m.mieter_id}
                    id={`vz-mieter-${m.mieter_id}`}
                    className={`border-b border-gray-100 transition-colors duration-500 ${
                      highlightMieterId === m.mieter_id
                        ? "bg-blue-50 dark:bg-blue-950/30"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    {mi === 0 && (
                      <td
                        className="pr-3 py-2 font-medium text-gray-700 align-top"
                        rowSpan={w.mieter.length}
                      >
                        {w.bezeichnung}
                      </td>
                    )}
                    <td className="pr-3 py-2 text-gray-600 align-middle">{m.anzeigename}</td>
                    {grid.monate.map((monat, mIdx) => {
                      const vz = m.vorauszahlungen.find(
                        (v) => v.monat === monat.monat && v.jahr === monat.jahr
                      );
                      return (
                        <td key={`${monat.monat}-${monat.jahr}`} className="px-1 py-1.5 align-middle">
                          {vz ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <EditableCell
                                vz={vz}
                                order={rowIndex[m.mieter_id] * grid.monate.length + mIdx}
                                periodeId={periodeId}
                                onSaved={onSaved}
                                onError={onError}
                              />
                              <SollCell
                                vz={vz}
                                onRequestScope={(v, neuerWert) => setPendingScope({ vz: v, neuerWert })}
                              />
                            </div>
                          ) : (
                            <span className="text-gray-200 block text-right">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="pl-3 py-2 text-right text-gray-500 border-l border-gray-100 align-middle">
                      {fmt(m.total_soll)} €
                    </td>
                    <td className="pl-2 py-2 text-right text-gray-800 font-semibold align-middle">
                      {fmt(m.total_ist)} €
                    </td>
                    <td
                      className={`pl-2 py-2 text-right font-bold align-middle ${
                        differenz >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {differenz >= 0 ? "+" : ""}
                      {fmt(differenz)} €
                    </td>
                    <td className="pl-2 py-2 align-middle text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <RowFillButton
                          mieter={m}
                          periodeId={periodeId}
                          onSaved={onSaved}
                          onError={onError}
                        />
                        <GesamtbetragButton
                          mieter={m}
                          periodeId={periodeId}
                          onSaved={onSaved}
                          onError={onError}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ScopeModal
        pending={pendingScope}
        periodeId={periodeId}
        onDone={() => setPendingScope(null)}
        onError={onError}
      />
    </div>
  );
}

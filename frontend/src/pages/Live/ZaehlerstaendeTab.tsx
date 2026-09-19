import { Fragment, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowUpIcon,
  PencilIcon,
  EllipsisHorizontalIcon,
} from "@heroicons/react/24/outline";
import { api } from "../../api/client";
import type {
  Mieter,
  Wohnung,
  Zaehler,
  Zaehlerstand,
  ZaehlerstandArt,
  ZaehlerstaendeGruppe,
  ZaehlerTyp,
} from "../../types";
import { Spinner } from "../../components/ui/Spinner";
import { Modal, ConfirmModal } from "../../components/ui/Modal";
import { typLabels, typEinheit, HEIZUNG_TYPEN } from "../Stage1/ZaehlerTab";
import { VerbrauchAufteilungInhalt } from "../../components/ui/VerbrauchAufteilung";

const artLabels: Record<ZaehlerstandArt, string> = {
  periode_start: "Periodenanfang",
  periode_ende: "Periodenende",
  zwischenablesung: "Zwischenablesung",
  ewe_ablesung: "EWE-Ablesung",
};

const schema = z.object({
  ablesedatum: z.string().min(1, "Pflichtfeld"),
  wert: z.preprocess(Number, z.number().min(0, "Muss ≥ 0 sein")),
  art: z.enum(["periode_start", "periode_ende", "zwischenablesung", "ewe_ablesung"]),
  abgelesen_von: z.string().nullable().optional(),
  notiz: z.string().nullable().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  periodeId: number;
  liegenschaftId: number;
  onSaved: () => void;
  onError: (msg: string) => void;
}

/** Spalten des Grids — HEIZUNG_TYPEN deckt sowohl kWh- als auch HKV-Zähler ab, da eine
 * Wohnung nie beide gleichzeitig als Hauptzähler hat. */
const SPALTEN: { key: string; label: string; typen: ZaehlerTyp[] }[] = [
  { key: "waerme", label: "Wärme", typen: HEIZUNG_TYPEN as ZaehlerTyp[] },
  { key: "warmwasser", label: "Warmwasser", typen: ["warmwasser_m3"] },
  { key: "kaltwasser", label: "Kaltwasser", typen: ["kaltwasser_m3"] },
  { key: "strom", label: "Strom", typen: ["strom_kwh"] },
];

function whgNummer(bezeichnung: string): number {
  const m = bezeichnung.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 999;
}

function fmt(n: number) {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 3 });
}

/** Voller Bearbeitungs-Dialog für einen Zähler: Liste aller Ablesungen (inkl. Zwischenablesung
 * / EWE-Ablesung), Bearbeiten/Löschen. Wird über das "⋯"-Icon einer Grid-Zelle geöffnet. */
function AblesungForm({
  onSubmit,
  onCancel,
  isPending,
  hatStart,
  hatEnde,
  initial,
}: {
  onSubmit: (d: FormData) => void;
  onCancel: () => void;
  isPending: boolean;
  hatStart: boolean;
  hatEnde: boolean;
  initial?: Partial<FormData>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof schema>, any, FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      ablesedatum: "",
      wert: undefined,
      art: !hatStart ? "periode_start" : !hatEnde ? "periode_ende" : "zwischenablesung",
      abgelesen_von: "",
      notiz: "",
      ...initial,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Ablesedatum *</label>
          <input type="date" className="input" {...register("ablesedatum")} />
          {errors.ablesedatum && <p className="error-msg">{errors.ablesedatum.message}</p>}
        </div>
        <div>
          <label className="label">Zählerstand *</label>
          <input type="number" step="0.001" className="input" {...register("wert")} />
          {errors.wert && <p className="error-msg">{errors.wert.message}</p>}
        </div>
        <div>
          <label className="label">Art</label>
          <select className="input" {...register("art")}>
            <option value="periode_start" disabled={hatStart}>
              Periodenanfang {hatStart ? "(bereits vorhanden)" : ""}
            </option>
            <option value="periode_ende" disabled={hatEnde}>
              Periodenende {hatEnde ? "(bereits vorhanden)" : ""}
            </option>
            <option value="zwischenablesung">Zwischenablesung</option>
            <option value="ewe_ablesung">EWE-Ablesung (EWE-Abrechnungsdatum)</option>
          </select>
        </div>
        <div>
          <label className="label">Abgelesen von</label>
          <input className="input" {...register("abgelesen_von")} />
        </div>
        <div className="col-span-2">
          <label className="label">Notiz</label>
          <input className="input" {...register("notiz")} />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={isPending} className="btn btn-primary btn-sm">
          {isPending ? "Speichern…" : "Speichern"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-secondary btn-sm">
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function fmtDatum(iso: string | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

/** Verbrauchszeile einer Zelle: grün = aus den Ständen berechnet, gelb = von Hand
 *  eingetragen (Schätzung/Rundung — überschreibt die Berechnung auch in Stage 3).
 *  Klick zum Anpassen; Feld leeren entfernt den manuellen Wert wieder. */
function VerbrauchZeile({
  periodeId,
  wohnungId,
  zaehlerTyp,
  berechnet,
  override,
  einheit,
  onSaved,
  onError,
}: {
  periodeId: number;
  wohnungId: number;
  zaehlerTyp: ZaehlerTyp;
  berechnet: number | null;
  override: number | null;
  einheit: string;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [wert, setWert] = useState("");

  const mutation = useMutation({
    mutationFn: (neu: number | null) =>
      api.put(`/perioden/${periodeId}/wohnungen/${wohnungId}/wohnung-verbrauch`, {
        zaehler_typ: zaehlerTyp,
        wert: neu,
        notiz: neu === null ? null : "manuell angepasst (Zählerstände-Tabelle)",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wohnung-verbrauch", periodeId] });
      setEditing(false);
      onSaved();
    },
    onError: (e: Error) => {
      onError(e.message);
      setEditing(false);
    },
  });

  if (editing) {
    return (
      <input
        type="number"
        step="0.001"
        autoFocus
        value={wert}
        onChange={(e) => setWert(e.target.value)}
        onBlur={() => {
          const t = wert.trim();
          if (t === "") mutation.mutate(null);
          else {
            const n = parseFloat(t.replace(",", "."));
            if (isNaN(n) || n < 0) setEditing(false);
            else mutation.mutate(n);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        placeholder="leer = zurück zur Berechnung"
        className="w-full text-xs px-1 py-0.5 border border-yellow-400 rounded text-right"
      />
    );
  }

  const zeigeWert = override ?? berechnet;
  return (
    <button
      onClick={() => {
        setWert(zeigeWert !== null ? String(zeigeWert) : "");
        setEditing(true);
      }}
      className={`flex items-baseline justify-between w-full text-[11px] px-1 py-0.5 rounded border-t border-gray-100 mt-0.5 ${
        override !== null
          ? "text-yellow-700 bg-yellow-50 hover:bg-yellow-100 font-semibold"
          : "text-green-700 hover:bg-green-50 font-medium"
      }`}
      title={
        override !== null
          ? `Manuell eingetragen (aus den Ständen berechnet wären ${berechnet !== null ? fmt(berechnet) : "—"} ${einheit}). Klick zum Ändern — Feld leeren stellt die Berechnung wieder her.`
          : "Verbrauch aus Anfang/Ende berechnet. Klick, um einen eigenen Wert einzutragen (z. B. Schätzung oder Rundung) — wird dann gelb markiert."
      }
    >
      <span className="text-gray-400 font-normal flex items-center gap-0.5">
        Verbrauch{override !== null && <PencilIcon className="w-2.5 h-2.5" />}
      </span>
      <span className="tabular-nums">
        {zeigeWert !== null ? `${fmt(zeigeWert)} ${einheit}` : "—"}
      </span>
    </button>
  );
}

/** Eine editierbare Mini-Zelle für Periodenanfang ODER Periodenende eines einzelnen Zählers.
 * Klick öffnet Datum + Wert inline, analog zum Editier-Muster aus VorauszahlungenTab. */
function MiniWert({
  zaehler,
  gruppe,
  art,
  periodeId,
  onSaved,
  onError,
}: {
  zaehler: Zaehler;
  gruppe: ZaehlerstaendeGruppe | undefined;
  art: "periode_start" | "periode_ende";
  periodeId: number;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const existing = (gruppe?.staende ?? []).find((s) => s.art === art);
  const [editing, setEditing] = useState(false);
  const [wert, setWert] = useState(existing ? String(existing.wert) : "");
  const [datum, setDatum] = useState(existing?.ablesedatum ?? new Date().toISOString().slice(0, 10));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["zaehlerstaende", zaehler.id, periodeId] });
    qc.invalidateQueries({ queryKey: ["validierung", periodeId] });
  };

  const mutation = useMutation({
    mutationFn: () => {
      const w = parseFloat(wert.replace(",", "."));
      if (existing) {
        return api.put(`/zaehlerstaende/${existing.id}`, { wert: w, ablesedatum: datum });
      }
      return api.post(`/zaehler/${zaehler.id}/staende`, {
        periode_id: periodeId,
        wert: w,
        ablesedatum: datum,
        art,
      });
    },
    onSuccess: () => {
      invalidate();
      setEditing(false);
      onSaved();
    },
    onError: (e: Error) => {
      onError(e.message);
      setEditing(false);
    },
  });

  function save() {
    if (wert.trim() === "" || isNaN(parseFloat(wert.replace(",", ".")))) {
      setEditing(false);
      return;
    }
    mutation.mutate();
  }

  if (editing) {
    // Erst Datum, dann Wert. Gespeichert wird beim Verlassen der Zelle oder mit
    // Enter — nicht schon beim Wechsel zwischen den beiden Feldern.
    return (
      <div
        className="flex flex-col items-end gap-0.5"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) save();
        }}
      >
        <input
          type="date"
          autoFocus
          value={datum}
          onChange={(e) => setDatum(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          title="1. Ablesedatum — darf auch außerhalb der Periode liegen, der Verbrauch wird dann automatisch anteilig auf die Periode umgerechnet"
          className="w-[110px] text-[10px] px-1 py-0.5 border border-blue-300 rounded"
        />
        <input
          type="number"
          step="0.001"
          value={wert}
          onChange={(e) => setWert(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder="2. Zählerstand"
          title="2. Zählerstand — Enter oder Klick außerhalb speichert"
          className="w-[110px] text-xs px-1 py-0.5 border border-blue-400 rounded text-right"
        />
      </div>
    );
  }

  const kurz = art === "periode_start" ? "Anfang" : "Ende";
  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-baseline gap-1.5 w-full text-xs px-1 py-0.5 rounded hover:bg-amber-50"
      title={existing ? `${artLabels[art]} — klicken zum Bearbeiten` : `${artLabels[art]} eintragen`}
    >
      <span className="text-gray-400 w-[38px] shrink-0 text-left">{kurz}</span>
      {existing ? (
        <>
          <span className="text-gray-400 tabular-nums">{fmtDatum(existing.ablesedatum)}</span>
          <span className="text-gray-800 font-medium tabular-nums ml-auto">{fmt(existing.wert)}</span>
        </>
      ) : (
        <span className="text-orange-400 italic ml-auto">eintragen</span>
      )}
    </button>
  );
}

/** Eine Grid-Zelle (Wohnung × Kostenart): normalerweise ein Zähler mit Start/Ende;
 * bei Zähler-Ersatz zwei übereinander (Haupt + aufklappbarer Zweit-Zähler). */
function ZaehlerZelle({
  zaehlerListe,
  staendeByZaehlerId,
  periodeId,
  wohnungId,
  override,
  onSaved,
  onError,
}: {
  zaehlerListe: Zaehler[];
  staendeByZaehlerId: Record<number, ZaehlerstaendeGruppe>;
  periodeId: number;
  wohnungId: number;
  /** Manuell festgelegter De-facto-Verbrauch (überschreibt die Berechnung) */
  override: number | null;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [detailZaehler, setDetailZaehler] = useState<Zaehler | null>(null);
  const [zeigeZweiten, setZeigeZweiten] = useState(false);

  if (zaehlerListe.length === 0) {
    return <span className="text-gray-200 text-xs">—</span>;
  }

  // aktiver Zähler zuerst, dann inaktive (Ersatz-Fall)
  const sortiert = [...zaehlerListe].sort((a, b) => Number(b.aktiv) - Number(a.aktiv));
  const primary = sortiert[0];
  const weitere = sortiert.slice(1);
  const einheit = typEinheit[primary.typ] ?? "";

  function renderZaehlerZeile(z: Zaehler) {
    const gruppe = staendeByZaehlerId[z.id];
    const vorperiodeWert = gruppe?.vorperiode_endwert ?? null;
    const hatStart = gruppe?.hat_start ?? false;

    return (
      <div key={z.id} className="flex items-start gap-1.5">
        <div className="flex flex-col gap-0.5 flex-1">
          <MiniWert
            zaehler={z}
            gruppe={gruppe}
            art="periode_start"
            periodeId={periodeId}
            onSaved={onSaved}
            onError={onError}
          />
          <MiniWert
            zaehler={z}
            gruppe={gruppe}
            art="periode_ende"
            periodeId={periodeId}
            onSaved={onSaved}
            onError={onError}
          />
          {!hatStart && vorperiodeWert !== null && (
            <button
              onClick={() =>
                api
                  .post(`/zaehler/${z.id}/staende`, {
                    periode_id: periodeId,
                    ablesedatum: new Date().toISOString().slice(0, 10),
                    wert: vorperiodeWert,
                    art: "periode_start",
                    notiz: "aus Vorjahr übernommen",
                  })
                  .then(() => {
                    qc.invalidateQueries({ queryKey: ["zaehlerstaende", z.id, periodeId] });
                    onSaved();
                  })
                  .catch((e: Error) => onError(e.message))
              }
              className="flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-700 text-left"
              title={`Vorjahres-Endwert ${fmt(vorperiodeWert)} ${einheit} übernehmen`}
            >
              <ArrowUpIcon className="w-2.5 h-2.5" /> Vorjahr
            </button>
          )}

        </div>
        <button
          onClick={() => setDetailZaehler(z)}
          className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 px-0.5"
          title="Details, Zwischenablesungen, Notizen bearbeiten"
        >
          <EllipsisHorizontalIcon className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-[110px]">
      {renderZaehlerZeile(primary)}
      {weitere.length > 0 && (
        <>
          <button
            onClick={() => setZeigeZweiten((v) => !v)}
            className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-600 mt-1"
          >
            {zeigeZweiten ? (
              <ChevronDownIcon className="w-2.5 h-2.5" />
            ) : (
              <ChevronRightIcon className="w-2.5 h-2.5" />
            )}
            +{weitere.length} {weitere.length === 1 ? "weiterer Zähler" : "weitere Zähler"}
            {weitere.some((z) => z.bezeichnung) && ` (${weitere.map((z) => z.bezeichnung).join(", ")})`}
          </button>
          {zeigeZweiten && (
            <div className="mt-1 pt-1 border-t border-gray-100 space-y-1">
              {weitere.map((z) => (
                <div key={z.id}>
                  {z.bezeichnung && (
                    <div className="text-[10px] text-gray-400 mb-0.5">{z.bezeichnung}</div>
                  )}
                  {renderZaehlerZeile(z)}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <VerbrauchZeile
        periodeId={periodeId}
        wohnungId={wohnungId}
        zaehlerTyp={primary.typ}
        berechnet={(() => {
          const werte = zaehlerListe
            .map((z) => staendeByZaehlerId[z.id]?.verbrauch)
            .filter((v): v is number => v !== null && v !== undefined);
          if (werte.length === 0) return null;
          return Math.round(werte.reduce((a, b) => a + b, 0) * 1000) / 1000;
        })()}
        override={override}
        einheit={einheit}
        onSaved={onSaved}
        onError={onError}
      />

      <ZaehlerDetailModal
        zaehler={detailZaehler}
        gruppe={detailZaehler ? staendeByZaehlerId[detailZaehler.id] : undefined}
        periodeId={periodeId}
        onClose={() => setDetailZaehler(null)}
        onSaved={onSaved}
        onError={onError}
      />
    </div>
  );
}

/** Detail-Dialog für einen einzelnen Zähler: volle Liste aller Ablesungen inkl.
 * Zwischenablesung/EWE-Ablesung, Bearbeiten/Löschen — erreichbar über "⋯" in der Grid-Zelle. */
function ZaehlerDetailModal({
  zaehler,
  gruppe,
  periodeId,
  onClose,
  onSaved,
  onError,
}: {
  zaehler: Zaehler | null;
  gruppe: ZaehlerstaendeGruppe | undefined;
  periodeId: number;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Zaehlerstand | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const invalidate = () => {
    if (!zaehler) return;
    qc.invalidateQueries({ queryKey: ["zaehlerstaende", zaehler.id, periodeId] });
    qc.invalidateQueries({ queryKey: ["validierung", periodeId] });
  };

  const createMutation = useMutation({
    mutationFn: (d: FormData) => api.post(`/zaehler/${zaehler!.id}/staende`, { ...d, periode_id: periodeId }),
    onSuccess: () => { invalidate(); setShowAdd(false); onSaved(); },
    onError: (e: Error) => onError(e.message),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) => api.put(`/zaehlerstaende/${id}`, data),
    onSuccess: () => { invalidate(); setEditTarget(null); onSaved(); },
    onError: (e: Error) => onError(e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/zaehlerstaende/${id}`),
    onSuccess: () => { invalidate(); setDeleteTarget(null); onSaved(); },
    onError: (e: Error) => onError(e.message),
  });

  if (!zaehler) return null;

  const hatStart = gruppe?.hat_start ?? false;
  const hatEnde = gruppe?.hat_ende ?? false;
  const einheit = typEinheit[zaehler.typ] ?? "";
  const label = `${typLabels[zaehler.typ] ?? zaehler.typ}${zaehler.geraete_nummer ? ` ${zaehler.geraete_nummer}` : ""}${zaehler.bezeichnung ? ` — ${zaehler.bezeichnung}` : ""}`;

  return (
    <>
      <Modal open={zaehler !== null} title={label} onClose={onClose}>
        <div className="space-y-3">
          {(gruppe?.staende ?? []).length > 0 ? (
            <div className="space-y-1">
              {(gruppe?.staende ?? []).map((s) => (
                <div key={s.id} className="flex items-center gap-3 text-xs py-1 border-b border-gray-50 last:border-0">
                  <span className="text-gray-500 w-28">{artLabels[s.art as ZaehlerstandArt]}</span>
                  <span className="text-gray-400">{s.ablesedatum}</span>
                  <span className="font-medium text-gray-800">{fmt(s.wert)} {einheit}</span>
                  {s.abgelesen_von && <span className="text-gray-400">({s.abgelesen_von})</span>}
                  {s.notiz === "aus Vorjahr übernommen" && (
                    <span className="text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded text-xs">aus Vorjahr</span>
                  )}
                  <div className="ml-auto flex gap-1">
                    <button onClick={() => setEditTarget(s)} className="btn btn-secondary btn-sm" title="Bearbeiten"><PencilIcon className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setDeleteTarget(s.id)} className="btn btn-danger btn-sm">Löschen</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">Noch keine Ablesungen.</p>
          )}
          <button onClick={() => setShowAdd(true)} className="btn btn-secondary btn-sm">
            + Ablesung (Zwischenablesung / EWE-Ablesung …)
          </button>
        </div>
      </Modal>

      <Modal open={showAdd} title={`Ablesung — ${label}`} onClose={() => setShowAdd(false)}>
        <AblesungForm
          hatStart={hatStart}
          hatEnde={hatEnde}
          onSubmit={(d) => createMutation.mutate(d)}
          onCancel={() => setShowAdd(false)}
          isPending={createMutation.isPending}
        />
      </Modal>

      <Modal open={editTarget !== null} title={`Ablesung bearbeiten — ${label}`} onClose={() => setEditTarget(null)}>
        {editTarget && (
          <AblesungForm
            hatStart={hatStart && editTarget.art !== "periode_start"}
            hatEnde={hatEnde && editTarget.art !== "periode_ende"}
            initial={{
              ablesedatum: editTarget.ablesedatum,
              wert: editTarget.wert,
              art: editTarget.art as ZaehlerstandArt,
              abgelesen_von: editTarget.abgelesen_von ?? "",
              notiz: editTarget.notiz ?? "",
            }}
            onSubmit={(d) => updateMutation.mutate({ id: editTarget.id, data: d })}
            onCancel={() => setEditTarget(null)}
            isPending={updateMutation.isPending}
          />
        )}
      </Modal>

      <ConfirmModal
        open={deleteTarget !== null}
        title="Ablesung löschen"
        message="Diese Ablesung wirklich löschen?"
        onConfirm={() => deleteTarget !== null && deleteMutation.mutate(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

export function ZaehlerstaendeTab({ periodeId, liegenschaftId, onSaved, onError }: Props) {
  const [aufteilungOffen, setAufteilungOffen] = useState<Record<number, boolean>>({});

  const { data: wohnungen = [], isLoading: laW } = useQuery({
    queryKey: ["wohnungen", liegenschaftId],
    queryFn: () => api.get<Wohnung[]>(`/liegenschaften/${liegenschaftId}/wohnungen`),
    select: (d) => d.filter((w) => w.aktiv).sort((a, b) => whgNummer(a.bezeichnung) - whgNummer(b.bezeichnung)),
  });

  const zaehlerQueries = useQueries({
    queries: wohnungen.map((w) => ({
      queryKey: ["zaehler", w.id],
      queryFn: () => api.get<Zaehler[]>(`/wohnungen/${w.id}/zaehler`),
      enabled: wohnungen.length > 0,
    })),
  });

  const allZaehler: Zaehler[] = wohnungen.flatMap(
    (_w, i) => ((zaehlerQueries[i].data as Zaehler[] | undefined) ?? []).filter((z) => z.aktiv || true)
    // aktiv+inaktiv: inaktive Ersatz-Zähler sollen im "weitere Zähler"-Aufklapper sichtbar bleiben
  );

  // Wie viele Mieter hat jede Wohnung? Nur bei Mieterwechsel ist eine
  // Verbrauchs-Aufteilung überhaupt sinnvoll.
  const mieterQueries = useQueries({
    queries: wohnungen.map((w) => ({
      queryKey: ["mieter", w.id],
      queryFn: () => api.get<Mieter[]>(`/wohnungen/${w.id}/mieter`),
      enabled: wohnungen.length > 0,
    })),
  });
  const mieterAnzahl: Record<number, number> = {};
  const mieterNamen: Record<number, string> = {};
  wohnungen.forEach((w, i) => {
    const ml = ((mieterQueries[i].data as Mieter[] | undefined) ?? []).filter(
      (m) => !m.ist_leerstand
    );
    mieterAnzahl[w.id] = ml.length;
    // Bei Mieterwechsel chronologisch: "Alt → Neu"
    mieterNamen[w.id] = [...ml]
      .sort((a, b) => a.einzug_datum.localeCompare(b.einzug_datum))
      .map((m) => m.anzeigename)
      .join(" → ");
  });

  // Manuell festgelegte De-facto-Verbräuche der Periode (gelbe Werte)
  const { data: verbrauchOverrides = [] } = useQuery({
    queryKey: ["wohnung-verbrauch", periodeId],
    queryFn: () =>
      api.get<{ wohnung_id: number; zaehler_typ: string; wert: number }[]>(
        `/perioden/${periodeId}/wohnung-verbrauch`
      ),
  });
  const overrideMap: Record<string, number> = {};
  verbrauchOverrides.forEach((o) => {
    overrideMap[`${o.wohnung_id}:${o.zaehler_typ}`] = o.wert;
  });

  const staendeQueries = useQueries({
    queries: allZaehler.map((zaehler) => ({
      queryKey: ["zaehlerstaende", zaehler.id, periodeId],
      queryFn: () => api.get<ZaehlerstaendeGruppe>(`/zaehler/${zaehler.id}/staende?periode_id=${periodeId}`),
      enabled: allZaehler.length > 0,
    })),
  });

  const staendeByZaehlerId: Record<number, ZaehlerstaendeGruppe> = {};
  allZaehler.forEach((zaehler, i) => {
    const g = staendeQueries[i].data as ZaehlerstaendeGruppe | undefined;
    if (g) staendeByZaehlerId[zaehler.id] = g;
  });

  if (laW || zaehlerQueries.some((q) => q.isLoading))
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );

  if (wohnungen.length === 0)
    return <p className="text-sm text-gray-400">Keine aktiven Wohnungen vorhanden.</p>;

  const zeigeStrom = wohnungen.some((w) => w.strom_ueber_vermieter);
  const spalten = SPALTEN.filter((s) => s.key !== "strom" || zeigeStrom);

  return (
    <div>
      <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 space-y-1">
        <p className="font-semibold">Wie funktioniert diese Tabelle?</p>
        <p>
          Jede Zelle zeigt <strong>Anfang</strong> und <strong>Ende</strong> mit Datum und Zählerstand —
          klicken zum Bearbeiten. Darunter der <strong className="text-green-700">Verbrauch</strong>:
          grün = aus den Ständen berechnet, <strong className="text-yellow-700">gelb</strong> = von Hand
          eingetragen (z. B. Schätzung) — anklicken zum Anpassen, Feld leeren stellt die Berechnung
          wieder her. Orange „eintragen" = noch offen.
        </p>
        <p>
          Bei <strong>Mieterwechsel</strong> wird der Verbrauch automatisch nach Miettagen aufgeteilt —
          über die Checkbox „Verbrauch je Mieter angeben" unter der Wohnung lässt sich stattdessen der
          tatsächliche Verbrauch je Mieter festlegen (z. B. aus einer Zwischenablesung).
        </p>
        <p>
          Bei Zähler-Ersatz (z. B. nach Defekt) zeigt die Zelle den aktiven Zähler; über „+1 weiterer
          Zähler" lässt sich der alte/ersetzte Zähler aufklappen. Das „…"-Icon öffnet Zwischenablesungen,
          Notizen und Löschen.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left font-semibold text-gray-700 pb-2 pr-3 min-w-[80px]">Wohnung</th>
              {spalten.map((s) => (
                <th key={s.key} className="text-left font-semibold text-gray-700 pb-2 px-2 min-w-[130px]">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {wohnungen.map((w, wi) => {
              const zaehlerFuerWohnung = (zaehlerQueries[wi].data as Zaehler[] | undefined) ?? [];
              const mehrereMieter = (mieterAnzahl[w.id] ?? 0) > 1;
              const offen = mehrereMieter && !!aufteilungOffen[w.id];
              return (
                <Fragment key={w.id}>
                  <tr className="border-b border-gray-100 hover:bg-gray-50 align-top">
                    <td className="py-2 pr-3">
                      <div className="font-medium text-gray-700">{w.bezeichnung}</div>
                      {mieterNamen[w.id] && (
                        <div
                          className="text-[10px] text-gray-400 max-w-[130px] truncate"
                          title={mieterNamen[w.id]}
                        >
                          {mieterNamen[w.id]}
                        </div>
                      )}
                      {mehrereMieter && (
                        <>
                          <span className="inline-block mt-0.5 text-[9px] bg-blue-50 text-blue-600 border border-blue-200 px-1 py-px rounded">
                            Mieterwechsel
                          </span>
                          <label className="flex items-center gap-1 mt-1 text-[10px] text-blue-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={offen}
                              onChange={(e) =>
                                setAufteilungOffen((v) => ({ ...v, [w.id]: e.target.checked }))
                              }
                              className="w-3 h-3"
                            />
                            Verbrauch je Mieter angeben
                          </label>
                        </>
                      )}
                    </td>
                    {spalten.map((s) => {
                      const passend = zaehlerFuerWohnung.filter((z) => s.typen.includes(z.typ));
                      return (
                        <td key={s.key} className="py-2 px-2">
                          <ZaehlerZelle
                            zaehlerListe={passend}
                            staendeByZaehlerId={staendeByZaehlerId}
                            periodeId={periodeId}
                            wohnungId={w.id}
                            override={
                              passend.length > 0
                                ? overrideMap[`${w.id}:${passend.sort((a, b) => Number(b.aktiv) - Number(a.aktiv))[0].typ}`] ?? null
                                : null
                            }
                            onSaved={onSaved}
                            onError={onError}
                          />
                        </td>
                      );
                    })}
                  </tr>
                  {offen && (
                    <tr className="border-b border-gray-100 bg-blue-50/40">
                      <td colSpan={spalten.length + 1} className="py-3 px-3">
                        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                          {spalten.map((s) => {
                            const passend = zaehlerFuerWohnung.filter((z) => s.typen.includes(z.typ));
                            if (passend.length === 0) return null;
                            const primary = [...passend].sort(
                              (a, b) => Number(b.aktiv) - Number(a.aktiv)
                            )[0];
                            const berechnet = (() => {
                              const werte = passend
                                .map((z) => staendeByZaehlerId[z.id]?.verbrauch)
                                .filter((v): v is number => v !== null && v !== undefined);
                              if (werte.length === 0) return null;
                              return Math.round(werte.reduce((a, b) => a + b, 0) * 1000) / 1000;
                            })();
                            const override = overrideMap[`${w.id}:${primary.typ}`] ?? null;
                            return (
                              <div
                                key={s.key}
                                className="bg-white rounded border border-blue-200 p-2.5"
                              >
                                <VerbrauchAufteilungInhalt
                                  periodeId={periodeId}
                                  wohnungId={w.id}
                                  zaehlerTyp={primary.typ}
                                  gesamtVerbrauch={override ?? berechnet}
                                  onSaved={onSaved}
                                  onError={onError}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

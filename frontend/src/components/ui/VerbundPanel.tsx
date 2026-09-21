import { useState, useEffect } from "react";
import { useQueries, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeftIcon,
  ArrowUturnLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { api } from "../../api/client";
import type {
  Liegenschaft,
  VerbundDetail,
  VerbundKosten,
  VerbundVorschau,
  Abrechnungsperiode,
  DirektKostenart,
} from "../../types";
import { Spinner } from "./Spinner";
import { Modal, ConfirmModal } from "./Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  liegenschaften: Liegenschaft[];
}

const SCHLUESSEL_LABELS: Record<string, string> = {
  wohnungsanzahl: "Wohnungsanzahl (auto)",
  wohnflaeche_m2: "Wohnfläche m² (auto)",
  personen: "Personenanzahl (auto)",
  kwh_gas: "Gas-Verbrauch kWh",
  m3_wasser: "Wasser-Verbrauch m³",
  manuell_prozent: "Manuell (%) ",
};

const AUTO_SCHLUESSEL = new Set(["wohnungsanzahl", "wohnflaeche_m2", "personen"]);

// ── Formulare ─────────────────────────────────────────────────────────────────

const verbundSchema = z.object({ name: z.string().min(1, "Pflichtfeld") });
type VerbundForm = z.infer<typeof verbundSchema>;

const kostenSchema = z.object({
  bezeichnung: z.string().min(1, "Pflichtfeld"),
  betrag_gesamt: z.preprocess(Number, z.number().positive("Muss > 0 sein")),
  schluessel_typ: z.string().min(1),
  datum: z.string().optional().default(""),
});
type KostenForm = z.infer<typeof kostenSchema>;

// ── Hilfsfunktion: Euro-Format ────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

// ── Vorschau-Modal ────────────────────────────────────────────────────────────

function VorschauModal({
  open,
  onClose,
  kosten,
  verbundId,
  liegenschaften,
  onAngewendet,
}: {
  open: boolean;
  onClose: () => void;
  kosten: VerbundKosten | null;
  verbundId: number;
  liegenschaften: Liegenschaft[];
  onAngewendet: () => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"vorschau" | "periode">("vorschau");
  // periode_id + kostenart_id pro Liegenschaft
  const [periodeConfig, setPeriodeConfig] = useState<
    Record<number, { periode_id: number; kostenart_id: number }>
  >({});

  const { data: vorschau, isLoading: loadingVorschau } = useQuery({
    queryKey: ["verbund-vorschau", verbundId, kosten?.id],
    queryFn: () =>
      api.post<VerbundVorschau>(
        `/verbund/${verbundId}/kosten/${kosten!.id}/vorschau`,
        {}
      ),
    enabled: open && !!kosten,
  });

  // Perioden + Kostenarten pro Liegenschaft laden — useQueries statt useQuery in .map(),
  // da die Zahl der Liegenschaften sich zwischen Renders ändern kann (Rules of Hooks
  // verbieten Hook-Aufrufe mit wechselnder Anzahl/Reihenfolge in einer Schleife).
  const periodenResults = useQueries({
    queries: liegenschaften.map((l) => ({
      queryKey: ["perioden", l.id],
      queryFn: () => api.get<Abrechnungsperiode[]>(`/liegenschaften/${l.id}/perioden`),
      enabled: open && step === "periode",
    })),
  });
  // Global (nicht pro Liegenschaft) — direkt-kostenarten ist liegenschaftsübergreifend,
  // ein einzelner Query reicht; pro Haus wird unten nur noch gefiltert.
  const { data: alleDirektKostenarten = [] } = useQuery({
    queryKey: ["direkt-kostenarten"],
    queryFn: () => api.get<DirektKostenart[]>("/direkt-kostenarten"),
    enabled: open && step === "periode",
  });
  const periodeQueries = liegenschaften.map((l, i) => ({
    liegenschaft: l,
    perioden: periodenResults[i],
    // Nur einfache (nicht Grundkosten/Verbrauch-gesplittete) Kostenarten, die entweder
    // global gelten oder explizit dieser Liegenschaft zugeordnet sind — der Verbund-
    // Satz-Zuschlag lässt sich nur auf einen einzelnen preis_pro_einheit schreiben.
    kostenarten: alleDirektKostenarten.filter(
      (k) => !k.hat_grundkosten_split && (k.nur_liegenschaft_id === null || k.nur_liegenschaft_id === l.id)
    ),
  }));

  const anwendenMutation = useMutation({
    mutationFn: () => {
      const perioden: Record<string, { periode_id: number; kostenart_id: number }> = {};
      for (const [lid, cfg] of Object.entries(periodeConfig)) {
        perioden[lid] = cfg;
      }
      return api.post(`/verbund/${verbundId}/kosten/${kosten!.id}/anwenden`, { perioden });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verbund", verbundId] });
      qc.invalidateQueries({ queryKey: ["direkt-kostenarten-werte"] });
      qc.invalidateQueries({ queryKey: ["schluessel-abrechnung"] });
      onAngewendet();
      onClose();
    },
  });

  useEffect(() => {
    if (open) return;
    return () => {
      setStep("vorschau");
      setPeriodeConfig({});
    };
  }, [open]);

  if (!open || !kosten) return null;

  const allPeriodenSet = liegenschaften.every(
    (l) => periodeConfig[l.id]?.periode_id && periodeConfig[l.id]?.kostenart_id
  );

  return (
    <Modal
      open={open}
      title={`Vorschau: ${kosten.bezeichnung}`}
      onClose={onClose}
      size="lg"
    >
      {step === "vorschau" ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Schlüssel: <strong>{SCHLUESSEL_LABELS[kosten.schluessel_typ] ?? kosten.schluessel_typ}</strong> —
            Gesamt: <strong>{fmt(kosten.betrag_gesamt)}</strong>
          </p>

          {loadingVorschau ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : vorschau ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 font-semibold text-gray-600">Liegenschaft</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 text-right">Basis-Wert</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 text-right">Anteil</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 text-right">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {liegenschaften.map((l) => {
                  const item = vorschau.aufteilung[String(l.id)];
                  if (!item) return null;
                  return (
                    <tr key={l.id} className="border-t border-gray-100">
                      <td className="px-3 py-2.5 text-gray-800 font-medium">{l.name}</td>
                      <td className="px-3 py-2.5 text-right text-gray-600">
                        {item.basis_wert.toLocaleString("de-DE", { maximumFractionDigits: 1 })}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600">
                        {item.anteil_prozent.toFixed(2)} %
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                        {fmt(item.betrag)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50">
                  <td className="px-3 py-2 font-bold text-gray-800" colSpan={3}>Gesamt</td>
                  <td className="px-3 py-2 text-right font-bold text-gray-900">{fmt(vorschau.gesamt)}</td>
                </tr>
              </tfoot>
            </table>
          ) : null}

          <div className="flex gap-2 pt-2">
            <button className="btn btn-primary flex items-center gap-1" onClick={() => setStep("periode")}>
              <ChevronRightIcon className="w-4 h-4" /> Anwenden — Periode &amp; Kostenart wählen
            </button>
            <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 mb-3">
            Wähle für jede Liegenschaft die Abrechnungsperiode und Kostenart. Der berechnete
            Betrag wird als €/Einheit-Zuschlag auf diese Kostenart-Kachel addiert und fließt
            damit direkt in die Abrechnung ein.
          </p>
          {periodeQueries.map(({ liegenschaft: l, perioden, kostenarten }) => {
            const aufteilungItem = vorschau?.aufteilung[String(l.id)];
            const cfg = periodeConfig[l.id] ?? { periode_id: 0, kostenart_id: 0 };
            return (
              <div key={l.id} className="card">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-800 text-sm">{l.name}</h4>
                  {aufteilungItem && (
                    <span className="text-sm font-bold text-blue-700">{fmt(aufteilungItem.betrag)}</span>
                  )}
                </div>
                {perioden.isLoading ? (
                  <Spinner size="sm" />
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Abrechnungsperiode</label>
                      <select
                        className="input"
                        value={cfg.periode_id || ""}
                        onChange={(e) =>
                          setPeriodeConfig((prev) => ({
                            ...prev,
                            [l.id]: { ...cfg, periode_id: Number(e.target.value) },
                          }))
                        }
                      >
                        <option value="">— wählen —</option>
                        {(perioden.data ?? [])
                          .filter((p) => p.status !== "abgeschlossen")
                          .map((p) => (
                            <option key={p.id} value={p.id}>{p.bezeichnung}</option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Kostenart</label>
                      <select
                        className="input"
                        value={cfg.kostenart_id || ""}
                        onChange={(e) =>
                          setPeriodeConfig((prev) => ({
                            ...prev,
                            [l.id]: { ...cfg, kostenart_id: Number(e.target.value) },
                          }))
                        }
                      >
                        <option value="">— wählen —</option>
                        {kostenarten
                          .filter((k) => k.aktiv)
                          .map((k) => (
                            <option key={k.id} value={k.id}>{k.name}</option>
                          ))}
                      </select>
                      {kostenarten.length === 0 && (
                        <p className="text-xs text-amber-600 mt-1">
                          Keine passende Kostenart — erst unter „2 · Kostenarten" eine einfache
                          (nicht gesplittete) Kachel anlegen.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex gap-2 pt-2">
            <button
              className="btn btn-primary"
              disabled={!allPeriodenSet || anwendenMutation.isPending}
              onClick={() => anwendenMutation.mutate()}
            >
              {anwendenMutation.isPending ? (
                <span className="flex items-center gap-2"><Spinner size="sm" /> Wird eingetragen…</span>
              ) : (
                <span className="flex items-center gap-1"><CheckIcon className="w-4 h-4" /> Sätze anwenden</span>
              )}
            </button>
            <button className="btn btn-secondary flex items-center gap-1" onClick={() => setStep("vorschau")}>
              <ArrowLeftIcon className="w-4 h-4" /> Zurück zur Vorschau
            </button>
          </div>
          {anwendenMutation.error && (
            <p className="text-sm text-red-600">{(anwendenMutation.error as Error).message}</p>
          )}
        </div>
      )}
    </Modal>
  );
}

// ── Verbund-Name-Formular ─────────────────────────────────────────────────────

function VerbundNameForm({
  onSubmit,
  onCancel,
  isPending,
}: {
  onSubmit: (d: VerbundForm) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VerbundForm>({ resolver: zodResolver(verbundSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div>
        <label className="label">Name des Verbunds</label>
        <input
          className="input"
          placeholder="z.B. Musterstraße 1+2"
          {...register("name")}
        />
        {errors.name && <p className="error-msg">{errors.name.message}</p>}
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={isPending} className="btn btn-primary">
          {isPending ? "Speichern…" : "Anlegen"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          Abbrechen
        </button>
      </div>
    </form>
  );
}

// ── Kosten-Formular ───────────────────────────────────────────────────────────

function KostenForm({
  onSubmit,
  onCancel,
  isPending,
  liegenschaften,
  initial,
}: {
  onSubmit: (d: KostenForm, werte: Record<number, number>) => void;
  onCancel: () => void;
  isPending: boolean;
  liegenschaften: Liegenschaft[];
  initial?: Partial<KostenForm>;
}) {
  const [werte, setWerte] = useState<Record<number, number>>({});
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<z.input<typeof kostenSchema>, unknown, KostenForm>({
    resolver: zodResolver(kostenSchema),
    defaultValues: { schluessel_typ: "wohnungsanzahl", ...initial },
  });

  const schluessel = watch("schluessel_typ");
  const needsWerte = !AUTO_SCHLUESSEL.has(schluessel);

  return (
    <form
      onSubmit={handleSubmit((d) => onSubmit(d, werte))}
      className="space-y-3"
    >
      <div>
        <label className="label">Bezeichnung *</label>
        <input className="input" {...register("bezeichnung")} />
        {errors.bezeichnung && <p className="error-msg">{errors.bezeichnung.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Betrag Gesamt (€) *</label>
          <input type="number" step="0.01" className="input" {...register("betrag_gesamt")} />
          {errors.betrag_gesamt && <p className="error-msg">{errors.betrag_gesamt.message}</p>}
        </div>
        <div>
          <label className="label">Datum (optional)</label>
          <input type="date" className="input" {...register("datum")} />
        </div>
      </div>
      <div>
        <label className="label">Verteilungsschlüssel *</label>
        <select className="input" {...register("schluessel_typ")}>
          {Object.entries(SCHLUESSEL_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {AUTO_SCHLUESSEL.has(schluessel) && (
          <p className="text-xs text-gray-400 mt-1">
            Wird automatisch aus den Stammdaten berechnet.
          </p>
        )}
      </div>

      {needsWerte && (
        <div className="space-y-2">
          <label className="label">
            {schluessel === "manuell_prozent"
              ? "Prozentualer Anteil pro Liegenschaft (muss 100 ergeben)"
              : `${schluessel === "kwh_gas" ? "Gas-Verbrauch kWh" : "Wasser-Verbrauch m³"} pro Liegenschaft`}
          </label>
          {liegenschaften.map((l) => (
            <div key={l.id} className="flex items-center gap-3">
              <span className="text-sm text-gray-700 w-48 shrink-0">{l.name}</span>
              <input
                type="number"
                step={schluessel === "manuell_prozent" ? "0.01" : "1"}
                className="input"
                placeholder={schluessel === "manuell_prozent" ? "%" : "Wert"}
                value={werte[l.id] ?? ""}
                onChange={(e) =>
                  setWerte((prev) => ({ ...prev, [l.id]: Number(e.target.value) }))
                }
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={isPending} className="btn btn-primary">
          {isPending ? <span className="flex items-center gap-2"><Spinner size="sm" /> Speichern…</span> : "Speichern"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">Abbrechen</button>
      </div>
    </form>
  );
}

// ── Haupt-Panel ───────────────────────────────────────────────────────────────

export function VerbundPanel({ open, onClose, liegenschaften }: Props) {
  const qc = useQueryClient();
  const [showNewVerbund, setShowNewVerbund] = useState(false);
  const [showNewKosten, setShowNewKosten] = useState(false);
  const [vorschauKosten, setVorschauKosten] = useState<VerbundKosten | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VerbundKosten | null>(null);
  const [revertTarget, setRevertTarget] = useState<VerbundKosten | null>(null);

  const { data: verbundList = [], isLoading } = useQuery({
    queryKey: ["verbund"],
    queryFn: () => api.get<VerbundDetail[]>("/verbund"),
    enabled: open,
  });

  const verbund = verbundList[0] ?? null;

  const { data: verbundDetail } = useQuery({
    queryKey: ["verbund", verbund?.id],
    queryFn: () => api.get<VerbundDetail>(`/verbund/${verbund!.id}`),
    enabled: open && !!verbund,
  });

  const createVerbundMutation = useMutation({
    mutationFn: (d: VerbundForm) => api.post("/verbund", d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verbund"] });
      setShowNewVerbund(false);
    },
  });

  const addMitgliedMutation = useMutation({
    mutationFn: ({ lid, sort }: { lid: number; sort: number }) =>
      api.post(`/verbund/${verbund!.id}/mitglieder`, { liegenschaft_id: lid, sort }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["verbund", verbund?.id] }),
  });

  const removeMitgliedMutation = useMutation({
    mutationFn: (lid: number) =>
      api.delete(`/verbund/${verbund!.id}/mitglieder/${lid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["verbund", verbund?.id] }),
  });

  const createKostenMutation = useMutation({
    mutationFn: ({ d, werte }: { d: KostenForm; werte: Record<number, number> }) => {
      const werte_json = !AUTO_SCHLUESSEL.has(d.schluessel_typ)
        ? JSON.stringify(Object.fromEntries(Object.entries(werte).map(([k, v]) => [k, v])))
        : null;
      return api.post<VerbundKosten>(`/verbund/${verbund!.id}/kosten`, {
        bezeichnung: d.bezeichnung,
        betrag_gesamt: Number(d.betrag_gesamt),
        schluessel_typ: d.schluessel_typ,
        schluessel_werte_json: werte_json,
        datum: d.datum || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verbund", verbund?.id] });
      setShowNewKosten(false);
    },
  });

  const deleteKostenMutation = useMutation({
    mutationFn: (kid: number) => api.delete(`/verbund/${verbund!.id}/kosten/${kid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verbund", verbund?.id] });
      qc.invalidateQueries({ queryKey: ["kostenpositionen"] });
      setDeleteTarget(null);
    },
  });

  const revertMutation = useMutation({
    mutationFn: (kid: number) =>
      api.delete(`/verbund/${verbund!.id}/kosten/${kid}/anwenden`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verbund", verbund?.id] });
      qc.invalidateQueries({ queryKey: ["kostenpositionen"] });
      setRevertTarget(null);
    },
  });

  const mitgliedIds = new Set((verbundDetail?.mitglieder ?? []).map((m) => m.liegenschaft_id));
  const mitgliedLiegenschaften = liegenschaften.filter((l) => mitgliedIds.has(l.id));

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Slide-over Panel */}
      <div className="fixed right-0 top-0 h-full w-[620px] max-w-full bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base">
              Liegenschafts-Verbund
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Geteilte Kosten auf mehrere Häuser verteilen
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Inhalt */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {isLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : !verbund ? (
            /* Kein Verbund vorhanden */
            <div className="text-center py-10">
              <p className="text-gray-500 text-sm mb-4">
                Noch kein Verbund angelegt. Erstelle einen, um gemeinsame Kosten
                auf mehrere Liegenschaften aufzuteilen.
              </p>
              <button className="btn btn-primary" onClick={() => setShowNewVerbund(true)}>
                + Verbund anlegen
              </button>
            </div>
          ) : (
            <>
              {/* Verbund-Header */}
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-100">{verbund.name}</h3>
                </div>
                {/* Mitglieder */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Mitglieder
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {liegenschaften.map((l) => {
                      const isMember = mitgliedIds.has(l.id);
                      return (
                        <div key={l.id} className="flex items-center gap-1">
                          <span
                            className={`text-xs px-2.5 py-1 rounded-full border ${
                              isMember
                                ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300"
                                : "bg-gray-50 border-gray-200 text-gray-400 dark:bg-gray-800 dark:border-gray-700"
                            }`}
                          >
                            {l.name}
                          </span>
                          {isMember ? (
                            <button
                              onClick={() => removeMitgliedMutation.mutate(l.id)}
                              className="text-gray-400 dark:text-gray-500 hover:text-red-500"
                              title="Entfernen"
                            >
                              <XMarkIcon className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                addMitgliedMutation.mutate({
                                  lid: l.id,
                                  sort: mitgliedIds.size,
                                })
                              }
                              className="text-xs text-blue-500 hover:text-blue-700"
                              title="Hinzufügen"
                            >
                              +
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Geteilte Kosten */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">
                    Geteilte Kostenpositionen
                  </h3>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowNewKosten(true)}
                    disabled={mitgliedIds.size < 2}
                    title={mitgliedIds.size < 2 ? "Mindestens 2 Mitglieder nötig" : ""}
                  >
                    + Neue Position
                  </button>
                </div>

                {(verbundDetail?.kosten ?? []).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">
                    Noch keine gemeinsamen Kosten. Klicke „+ Neue Position".
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(verbundDetail?.kosten ?? []).map((k) => (
                      <div
                        key={k.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        {/* Status-Indikator */}
                        <span
                          className={`flex-shrink-0 w-2 h-2 rounded-full ${
                            k.angewendet ? "bg-green-500" : "bg-amber-400"
                          }`}
                        />

                        {/* Bezeichnung + Meta */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                            {k.bezeichnung}
                          </p>
                          <p className="text-xs text-gray-400">
                            {SCHLUESSEL_LABELS[k.schluessel_typ] ?? k.schluessel_typ}
                            {k.datum && ` · ${k.datum}`}
                          </p>
                        </div>

                        {/* Betrag */}
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 shrink-0">
                          {fmt(k.betrag_gesamt)}
                        </span>

                        {/* Status-Badge */}
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                            k.angewendet
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          }`}
                        >
                          {k.angewendet ? (
                            <span className="flex items-center gap-0.5"><CheckIcon className="w-3 h-3" /> eingetragen</span>
                          ) : "offen"}
                        </span>

                        {/* Aktionen */}
                        <div className="flex gap-1 shrink-0">
                          {!k.angewendet ? (
                            <button
                              className="btn btn-primary btn-sm flex items-center gap-1"
                              onClick={() => setVorschauKosten(k)}
                            >
                              <ChevronRightIcon className="w-3.5 h-3.5" /> Anwenden
                            </button>
                          ) : (
                            <button
                              className="btn btn-secondary btn-sm text-xs flex items-center gap-1"
                              onClick={() => setRevertTarget(k)}
                            >
                              <ArrowUturnLeftIcon className="w-3.5 h-3.5" /> Rückgängig
                            </button>
                          )}
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setDeleteTarget(k)}
                          >
                            <XMarkIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Zusammenfassung */}
                {(verbundDetail?.kosten ?? []).length > 0 && (
                  <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs text-gray-500 space-y-1">
                    <div className="flex justify-between">
                      <span>Gesamt (alle Positionen):</span>
                      <span className="font-semibold">
                        {fmt(
                          (verbundDetail?.kosten ?? []).reduce(
                            (s, k) => s + k.betrag_gesamt, 0
                          )
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Davon bereits eingetragen:</span>
                      <span className="font-semibold text-green-600">
                        {fmt(
                          (verbundDetail?.kosten ?? [])
                            .filter((k) => k.angewendet)
                            .reduce((s, k) => s + k.betrag_gesamt, 0)
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Hinweis */}
              <div className="text-xs text-gray-400 border-t border-gray-100 dark:border-gray-800 pt-3">
                Angewendete Positionen erhöhen den €/Einheit-Satz der gewählten Kostenart-Kachel
                in „2 · Kostenarten" der jeweiligen Liegenschaft — sichtbar dort, nicht als
                separate Zeile. Rückgängig machen nimmt genau diesen Zuschlag wieder zurück.
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      <Modal
        open={showNewVerbund}
        title="Verbund anlegen"
        onClose={() => setShowNewVerbund(false)}
      >
        <VerbundNameForm
          onSubmit={(d) => createVerbundMutation.mutate(d)}
          onCancel={() => setShowNewVerbund(false)}
          isPending={createVerbundMutation.isPending}
        />
      </Modal>

      <Modal
        open={showNewKosten}
        title="Gemeinsame Kostenposition"
        onClose={() => setShowNewKosten(false)}
        size="lg"
      >
        <KostenForm
          liegenschaften={mitgliedLiegenschaften}
          onSubmit={(d, werte) => createKostenMutation.mutate({ d, werte })}
          onCancel={() => setShowNewKosten(false)}
          isPending={createKostenMutation.isPending}
        />
      </Modal>

      <VorschauModal
        open={!!vorschauKosten}
        onClose={() => setVorschauKosten(null)}
        kosten={vorschauKosten}
        verbundId={verbund?.id ?? 0}
        liegenschaften={mitgliedLiegenschaften}
        onAngewendet={() => {
          qc.invalidateQueries({ queryKey: ["verbund"] });
          qc.invalidateQueries({ queryKey: ["kostenpositionen"] });
        }}
      />

      <ConfirmModal
        open={!!revertTarget}
        title="Anwendung rückgängig machen"
        message={`Der €/Einheit-Zuschlag für „${revertTarget?.bezeichnung}" wird aus den Kostenarten-Sätzen der Liegenschaften wieder herausgerechnet.`}
        confirmLabel="Rückgängig machen"
        danger={false}
        onConfirm={() => revertTarget && revertMutation.mutate(revertTarget.id)}
        onClose={() => setRevertTarget(null)}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Verbund-Kosten löschen"
        message={`„${deleteTarget?.bezeichnung}" (${deleteTarget ? fmt(deleteTarget.betrag_gesamt) : ""}) löschen?${deleteTarget?.angewendet ? " Die bereits addierten €/Einheit-Zuschläge in den Liegenschaften werden dabei zurückgenommen." : ""}`}
        confirmLabel="Löschen"
        onConfirm={() => deleteTarget && deleteKostenMutation.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

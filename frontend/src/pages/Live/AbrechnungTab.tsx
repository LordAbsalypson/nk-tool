import { Fragment, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, ChevronUpIcon, BeakerIcon, PencilIcon } from "@heroicons/react/24/outline";
import { api } from "../../api/client";
import type { SchluesselMieter } from "../../types";
import { Spinner } from "../../components/ui/Spinner";
import { AusprobierenModal } from "../../components/ui/AusprobierenModal";
import { PersonenSplitModal } from "../../components/ui/PersonenSplitModal";
import { SammelabrechnungModal } from "../../components/ui/SammelabrechnungModal";
import { PdfPreviewModal } from "../../components/ui/PdfPreviewModal";
import { useToast } from "../../hooks/useToast";

interface PdfAbschnitte {
  datum_anzeigen: boolean;
  datum: string;
  absender_anzeigen: boolean;
  empfaenger_anzeigen: boolean;
}

function heuteIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const ABSCHNITTE_DEFAULT: PdfAbschnitte = {
  datum_anzeigen: true,
  datum: heuteIso(),
  absender_anzeigen: true,
  empfaenger_anzeigen: true,
};

function pdfAbschnitteKey(periodeId: number): string {
  return `nk-tool-pdf-abschnitte-${periodeId}`;
}

/** Lädt die zuletzt gewählten PDF-Abschnitte (insbesondere das Datum) je Periode aus
 * localStorage — ohne das würde z. B. das manuell gesetzte Datum bei jedem Stage-/
 * Liegenschaftswechsel (Neu-Mount von AbrechnungTab) auf "heute" zurückspringen, obwohl
 * man oft alle Abrechnungen einer Periode mit demselben Datum ausstellen möchte. */
function ladeAbschnitte(periodeId: number): PdfAbschnitte {
  try {
    const raw = localStorage.getItem(pdfAbschnitteKey(periodeId));
    if (!raw) return ABSCHNITTE_DEFAULT;
    return { ...ABSCHNITTE_DEFAULT, ...JSON.parse(raw) };
  } catch {
    return ABSCHNITTE_DEFAULT;
  }
}

function fmtEur(n: number) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-semibold text-gray-900 dark:text-gray-50 tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

const ZAEHLER_TYP_EINHEIT: Record<string, string> = {
  waerme_kwh: "kWh",
  hkv_einheiten: "Einh.",
  warmwasser_m3: "m³",
  kaltwasser_m3: "m³",
  strom_kwh: "kWh",
};

function MieterZeile({
  m,
  periodeId,
  onError,
  kombiModus,
  kombiAusgewaehlt,
  onKombiToggle,
  abschnitte,
  segmentAnzahl,
  onGoToVorauszahlung,
}: {
  m: SchluesselMieter;
  periodeId: number;
  onError: (msg: string) => void;
  kombiModus: boolean;
  kombiAusgewaehlt: boolean;
  onKombiToggle: () => void;
  abschnitte: PdfAbschnitte;
  segmentAnzahl: number;
  onGoToVorauszahlung: (mieterId: number) => void;
}) {
  const [offen, setOffen] = useState(false);
  const [nameBearbeiten, setNameBearbeiten] = useState(false);
  const [nameEntwurf, setNameEntwurf] = useState(m.anzeigename);
  const [splitOffen, setSplitOffen] = useState(false);
  const [verbrauchBearbeitung, setVerbrauchBearbeitung] = useState<string | null>(null);
  const [verbrauchEntwurf, setVerbrauchEntwurf] = useState("");
  const [verbrauchVorschau, setVerbrauchVorschau] = useState<SchluesselMieter | null>(null);
  const [verbrauchVorschauLoading, setVerbrauchVorschauLoading] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; dateiname: string } | null>(null);
  const { addToast } = useToast();
  const qc = useQueryClient();

  // Live-Vorschau (debounced): rein lesend, exakt wie Ausprobieren — nichts
  // wird gespeichert, bis "Übernehmen" geklickt wird.
  useEffect(() => {
    if (verbrauchBearbeitung) return;
    return () => setVerbrauchVorschau(null);
  }, [verbrauchBearbeitung]);

  useEffect(() => {
    if (!verbrauchBearbeitung) return;
    const wert = parseFloat(verbrauchEntwurf.replace(",", "."));
    if (isNaN(wert)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Live-Vorschau zurücksetzen bei ungültiger Eingabe, gleiches Muster wie AusprobierenModal.tsx
      setVerbrauchVorschau(null);
      return;
    }
    const zeile = m.zeilen.find((z) => z.schluessel === verbrauchBearbeitung);
    if (!zeile?.zaehler_typ) return;
    const handle = setTimeout(() => {
      setVerbrauchVorschauLoading(true);
      api
        .post<SchluesselMieter>(
          `/perioden/${periodeId}/mieter/${m.mieter_id}/schluessel-abrechnung/vorschau`,
          {
            verbrauch_overrides: [
              segmentAnzahl > 1
                ? { mieter_id: m.mieter_id, zaehler_typ: zeile.zaehler_typ, wert }
                : { wohnung_id: m.wohnung_id, zaehler_typ: zeile.zaehler_typ, wert },
            ],
          }
        )
        .then(setVerbrauchVorschau)
        .catch((e: Error) => onError(e.message))
        .finally(() => setVerbrauchVorschauLoading(false));
    }, 450);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verbrauchBearbeitung, verbrauchEntwurf]);

  const verbrauchUebernehmenMutation = useMutation({
    mutationFn: async () => {
      const zeile = m.zeilen.find((z) => z.schluessel === verbrauchBearbeitung);
      if (!zeile?.zaehler_typ) return;
      const wert = parseFloat(verbrauchEntwurf.replace(",", "."));
      if (isNaN(wert)) return;
      if (segmentAnzahl > 1) {
        await api.put(`/perioden/${periodeId}/mieter/${m.mieter_id}/verbrauch-override`, {
          zaehler_typ: zeile.zaehler_typ,
          wert,
          als_schaetzung_anzeigen: false,
        });
      } else {
        await api.put(`/perioden/${periodeId}/wohnungen/${m.wohnung_id}/wohnung-verbrauch`, {
          zaehler_typ: zeile.zaehler_typ,
          wert,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schluessel-abrechnung", periodeId] });
      setVerbrauchBearbeitung(null);
      addToast("success", "Verbrauchswert übernommen");
    },
    onError: (e: Error) => onError(e.message),
  });

  const pdf = useMutation({
    mutationFn: () =>
      api.post<{ dateiname: string; download_url: string }>(
        `/perioden/${periodeId}/mieter/${m.mieter_id}/schluessel-abrechnung/pdf`,
        abschnitte
      ),
    onSuccess: (d) => {
      setPdfPreview({ url: d.download_url, dateiname: d.dateiname });
    },
    onError: (e: Error) => onError(e.message),
  });

  const nameSpeichern = useMutation({
    mutationFn: (anzeigename: string) =>
      api.patch<{ anzeigename: string }>(`/mieter/${m.mieter_id}/name`, { anzeigename }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schluessel-abrechnung", periodeId] });
      setNameBearbeiten(false);
      addToast("success", "Name aktualisiert");
    },
    onError: (e: Error) => onError(e.message),
  });

  const guthaben = m.saldo >= 0;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => {
          if (kombiModus) {
            if (m.berechenbar) onKombiToggle();
            return;
          }
          setOffen((o) => !o);
        }}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          {kombiModus && (
            <input
              type="checkbox"
              checked={kombiAusgewaehlt}
              disabled={!m.berechenbar}
              onChange={onKombiToggle}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0"
            />
          )}
          <div className="min-w-0">
          {nameBearbeiten ? (
            <div
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                autoFocus
                className="input py-0.5 text-sm"
                value={nameEntwurf}
                onChange={(e) => setNameEntwurf(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && nameEntwurf.trim()) nameSpeichern.mutate(nameEntwurf.trim());
                  if (e.key === "Escape") {
                    setNameEntwurf(m.anzeigename);
                    setNameBearbeiten(false);
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm py-0.5"
                disabled={!nameEntwurf.trim() || nameSpeichern.isPending}
                onClick={() => nameSpeichern.mutate(nameEntwurf.trim())}
              >
                ✓
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm py-0.5"
                onClick={() => {
                  setNameEntwurf(m.anzeigename);
                  setNameBearbeiten(false);
                }}
              >
                ✕
              </button>
            </div>
          ) : (
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 flex items-center gap-1.5 group">
              {m.anzeigename} <span className="text-xs font-normal text-gray-400">{m.wohnung_bezeichnung}</span>
              <button
                type="button"
                title="Namen bearbeiten"
                onClick={(e) => {
                  e.stopPropagation();
                  setNameEntwurf(m.anzeigename);
                  setNameBearbeiten(true);
                }}
                className="opacity-0 group-hover:opacity-100 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-opacity"
              >
                <PencilIcon className="w-3 h-3" />
              </button>
            </p>
          )}
          {m.miettage !== m.periode_tage && (
            <p className="text-[10px] text-blue-600">
              {m.miet_von} – {m.miet_bis} ({m.miettage}/{m.periode_tage} Tage)
            </p>
          )}
          {!m.berechenbar && <p className="text-[10px] text-red-600">{m.fehlende_daten.join("; ")}</p>}
          {m.warnungen.length > 0 && <p className="text-[10px] text-amber-600">{m.warnungen.join(" ")}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {m.berechenbar ? (
            <span className={`text-sm font-semibold tabular-nums ${guthaben ? "text-emerald-600" : "text-red-600"}`}>
              {guthaben ? "+" : ""}
              {fmtEur(m.saldo)} €
            </span>
          ) : (
            <span className="text-xs text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
              unvollständig
            </span>
          )}
          <span className="text-gray-400">
            {offen ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
          </span>
        </div>
      </button>

      {offen && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700">
          {m.zeilen.length > 0 && (
            <table className="w-full text-xs mt-3">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="pb-1 font-normal">Kostenart</th>
                  <th className="pb-1 font-normal">Berechnungsgrundlage</th>
                  <th className="pb-1 font-normal text-right">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {m.zeilen.map((z) => {
                  const anzeige = verbrauchVorschau?.zeilen.find((v) => v.schluessel === z.schluessel) ?? z;
                  const wirdBearbeitet = verbrauchBearbeitung === z.schluessel;
                  return (
                    <Fragment key={z.schluessel}>
                      <tr className="border-t border-gray-50 dark:border-gray-800">
                        <td className="py-1 text-gray-700 dark:text-gray-200 flex items-center gap-1">
                          {z.kostenart}
                          {z.zaehler_typ && !kombiModus && (
                            <button
                              type="button"
                              title="Verbrauchswert bearbeiten"
                              onClick={() => {
                                if (wirdBearbeitet) {
                                  setVerbrauchBearbeitung(null);
                                } else {
                                  setVerbrauchBearbeitung(z.schluessel);
                                  setVerbrauchEntwurf(String(z.einheiten ?? ""));
                                }
                              }}
                              className="text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              <PencilIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                        <td className="py-1 text-gray-400">{anzeige.grundlage}</td>
                        <td className="py-1 text-right tabular-nums text-gray-800 dark:text-gray-100">
                          {fmtEur(anzeige.betrag)} €
                        </td>
                      </tr>
                      {wirdBearbeitet && (
                        <tr className="bg-blue-50/40 dark:bg-blue-950/20">
                          <td colSpan={3} className="py-2 px-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <input
                                type="number"
                                step="0.001"
                                autoFocus
                                value={verbrauchEntwurf}
                                onChange={(e) => setVerbrauchEntwurf(e.target.value)}
                                className="input w-28 py-1 text-xs text-right"
                              />
                              <span className="text-gray-400">
                                {z.zaehler_typ ? ZAEHLER_TYP_EINHEIT[z.zaehler_typ] : ""}
                              </span>
                              {verbrauchVorschauLoading ? (
                                <Spinner size="sm" />
                              ) : verbrauchVorschau ? (
                                <span className="text-gray-500">
                                  → neue Summe {fmtEur(verbrauchVorschau.summe)} € · neuer Saldo{" "}
                                  <strong className={verbrauchVorschau.saldo >= 0 ? "text-emerald-600" : "text-red-600"}>
                                    {fmtEur(verbrauchVorschau.saldo)} €
                                  </strong>
                                </span>
                              ) : null}
                              <button
                                type="button"
                                className="btn btn-primary btn-sm ml-auto"
                                disabled={verbrauchUebernehmenMutation.isPending || !verbrauchVorschau}
                                onClick={() => verbrauchUebernehmenMutation.mutate()}
                              >
                                Übernehmen
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setVerbrauchBearbeitung(null)}
                              >
                                Verwerfen
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                <tr className="border-t-2 border-gray-200 dark:border-gray-600 font-medium">
                  <td colSpan={2} className="py-1.5 text-right text-gray-600 dark:text-gray-300">
                    Summe Nebenkosten
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{fmtEur(m.summe)} €</td>
                </tr>
                <tr>
                  <td colSpan={2} className="py-0.5 text-right text-gray-500">
                    <button
                      type="button"
                      title="Zu Vorauszahlungen springen und bearbeiten"
                      onClick={() => onGoToVorauszahlung(m.mieter_id)}
                      className="inline-flex items-center gap-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      Vorauszahlung <PencilIcon className="w-3 h-3" />
                    </button>
                  </td>
                  <td className="py-0.5 text-right tabular-nums">{fmtEur(m.vorauszahlung_ist)} €</td>
                </tr>
                <tr className="font-semibold">
                  <td colSpan={2} className="py-1 text-right">
                    {guthaben ? "Guthaben" : "Nachzahlung"}
                  </td>
                  <td className={`py-1 text-right tabular-nums ${guthaben ? "text-emerald-600" : "text-red-600"}`}>
                    {fmtEur(Math.abs(m.saldo))} €
                  </td>
                </tr>
              </tbody>
            </table>
          )}
          <div className="flex gap-2 mt-3">
            <button
              className="btn btn-primary btn-sm"
              disabled={!m.berechenbar || pdf.isPending}
              onClick={() => pdf.mutate()}
            >
              {pdf.isPending ? "Erstelle PDF…" : "PDF erstellen"}
            </button>
            {m.personen > 1 && (
              <button
                className="btn btn-secondary btn-sm"
                disabled={!m.berechenbar}
                onClick={() => setSplitOffen(true)}
                title="Getrennte Abrechnungen für mehrere Bewohner mit individuellem Anteil erstellen"
              >
                Auf Bewohner aufteilen
              </button>
            )}
          </div>
        </div>
      )}

      {splitOffen && (
        <PersonenSplitModal
          open={splitOffen}
          onClose={() => setSplitOffen(false)}
          periodeId={periodeId}
          mieterId={m.mieter_id}
          wohnungId={m.wohnung_id}
          wohnungBezeichnung={m.wohnung_bezeichnung}
          vorgeschlagenerName={m.anzeigename}
          onError={onError}
        />
      )}

      {pdfPreview && (
        <PdfPreviewModal
          downloadUrl={pdfPreview.url}
          dateiname={pdfPreview.dateiname}
          onClose={() => setPdfPreview(null)}
          onSaved={(path) => addToast("success", `PDF gespeichert: ${path}`)}
          onError={onError}
        />
      )}
    </div>
  );
}

interface Props {
  periodeId: number;
  liegenschaftName: string;
  onError: (msg: string) => void;
  onGoToVorauszahlung: (mieterId: number) => void;
}

export function AbrechnungTab({ periodeId, liegenschaftName, onError, onGoToVorauszahlung }: Props) {
  const { addToast } = useToast();
  const qc = useQueryClient();
  const [kombiModus, setKombiModus] = useState(false);
  const [kombiAusgewaehlt, setKombiAusgewaehlt] = useState<Set<number>>(new Set());
  const [kombiName, setKombiName] = useState("");
  const [abschnitte, setAbschnitte] = useState<PdfAbschnitte>(() => ladeAbschnitte(periodeId));
  const [sammelOffen, setSammelOffen] = useState(false);
  const [ausprobierenOffen, setAusprobierenOffen] = useState(false);
  const [kombiSplitOffen, setKombiSplitOffen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(pdfAbschnitteKey(periodeId), JSON.stringify(abschnitte));
    } catch {
      // localStorage nicht verfügbar (z. B. privater Modus) — Datum bleibt nur für diese Sitzung erhalten.
    }
  }, [periodeId, abschnitte]);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; dateiname: string } | null>(null);

  const { data: mieterListe = [], isLoading } = useQuery({
    queryKey: ["schluessel-abrechnung", periodeId],
    queryFn: () => api.get<SchluesselMieter[]>(`/perioden/${periodeId}/schluessel-abrechnung`),
  });

  // Vorschlag statt fest gesetzter Name: leitet sich live aus der aktuellen
  // Auswahl ab (erster ausgewählter Mieter in Listenreihenfolge), statt beim
  // ersten Klick einzufrieren — sonst bliebe nach Ab-/Neuwahl ein falscher
  // Name im Feld stehen, ohne dass das jemand bemerkt.
  const vorgeschlagenerKombiName =
    mieterListe.find((m) => kombiAusgewaehlt.has(m.mieter_id))?.anzeigename ?? "";

  const kombiSegmente = mieterListe
    .filter((m) => kombiAusgewaehlt.has(m.mieter_id))
    .sort((a, b) => a.miet_von.localeCompare(b.miet_von));
  const kombiWohnungBezeichnung = [...new Set(kombiSegmente.map((s) => s.wohnung_bezeichnung))].join(" → ");

  const kombiPdf = useMutation({
    mutationFn: () =>
      api.post<{ dateiname: string; download_url: string }>(
        `/perioden/${periodeId}/mieter-kombiniert/pdf`,
        {
          mieter_ids: Array.from(kombiAusgewaehlt),
          anzeigename: kombiName.trim() || vorgeschlagenerKombiName || undefined,
          ...abschnitte,
        }
      ),
    onSuccess: (d) => {
      setPdfPreview({ url: d.download_url, dateiname: d.dateiname });
      setKombiModus(false);
      setKombiAusgewaehlt(new Set());
      setKombiName("");
    },
    onError: (e: Error) => onError(e.message),
  });

  function toggleKombiAuswahl(mieterId: number) {
    setKombiAusgewaehlt((prev) => {
      const next = new Set(prev);
      if (next.has(mieterId)) next.delete(mieterId);
      else next.add(mieterId);
      return next;
    });
  }

  if (isLoading)
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );

  const berechenbare = mieterListe.filter((m) => m.berechenbar);
  const summeKosten = berechenbare.reduce((s, m) => s + m.summe, 0);
  const summeVz = berechenbare.reduce((s, m) => s + m.vorauszahlung_ist, 0);
  const summeSaldo = berechenbare.reduce((s, m) => s + m.saldo, 0);
  const unvollstaendig = mieterListe.filter((m) => !m.berechenbar);

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2">
        <button
          className="btn btn-secondary btn-sm flex items-center gap-1"
          disabled={mieterListe.length === 0}
          onClick={() => setAusprobierenOffen(true)}
          title="Kostenart-Sätze anpassen und live sehen, wie sich die Salden aller Mieter ändern"
        >
          <BeakerIcon className="w-3.5 h-3.5" /> Mit angepassten Stammdaten ausprobieren
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setSammelOffen(true)}>
          Sammelabrechnung erstellen
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Nebenkosten gesamt" value={`${fmtEur(summeKosten)} €`} />
        <SummaryCard label="Vorauszahlungen erhalten" value={`${fmtEur(summeVz)} €`} />
        <SummaryCard
          label="Saldo aller Mieter"
          value={`${summeSaldo >= 0 ? "+" : ""}${fmtEur(summeSaldo)} €`}
          sub="+ = Guthaben · − = Nachzahlung"
        />
      </div>

      {unvollstaendig.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {unvollstaendig.length} Mieter noch nicht berechenbar — fehlende Ablesungen oder Preise.
          Details beim Aufklappen der jeweiligen Zeile.
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Abrechnung je Mieter
          </h3>
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="text-gray-400">PDF-Abschnitte:</span>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={abschnitte.datum_anzeigen}
                onChange={(e) =>
                  setAbschnitte((a) => ({ ...a, datum_anzeigen: e.target.checked }))
                }
              />
              Datum
            </label>
            {abschnitte.datum_anzeigen && (
              <input
                type="date"
                value={abschnitte.datum}
                onChange={(e) => setAbschnitte((a) => ({ ...a, datum: e.target.value || heuteIso() }))}
                className="input py-0.5 text-xs w-[135px]"
              />
            )}
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={abschnitte.absender_anzeigen}
                onChange={(e) =>
                  setAbschnitte((a) => ({ ...a, absender_anzeigen: e.target.checked }))
                }
              />
              Absender
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={abschnitte.empfaenger_anzeigen}
                onChange={(e) =>
                  setAbschnitte((a) => ({ ...a, empfaenger_anzeigen: e.target.checked }))
                }
              />
              Adressat-Zeile
            </label>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setKombiModus((v) => !v);
              setKombiAusgewaehlt(new Set());
              setKombiName("");
            }}
            title="Mehrere Mieter-Zeiträume zu einer Abrechnung zusammenführen — z. B. bei Wohnungstausch innerhalb der Periode"
          >
            {kombiModus ? "Abbrechen" : "Zeiträume kombinieren"}
          </button>
        </div>

        {kombiModus && (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-3 py-2 mb-2 text-xs text-blue-800 dark:text-blue-200">
            Mieter-Zeiträume ausw&auml;hlen, die zu <strong>einer</strong> Abrechnung zusammengef&uuml;hrt
            werden sollen (z. B. Wohnungstausch: Whg 1 Jun&ndash;Aug + Whg 2 Sep&ndash;Mai). Die
            Kostenzeilen werden chronologisch untereinander aufgef&uuml;hrt und aufsummiert.
            {kombiAusgewaehlt.size >= 2 && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  className="input py-1 text-xs flex-1"
                  placeholder={vorgeschlagenerKombiName || "Anzeigename auf der Abrechnung"}
                  value={kombiName}
                  onChange={(e) => setKombiName(e.target.value)}
                />
                <button
                  className="btn btn-primary btn-sm whitespace-nowrap"
                  disabled={kombiPdf.isPending}
                  onClick={() => kombiPdf.mutate()}
                >
                  {kombiPdf.isPending
                    ? "Erstelle…"
                    : `${kombiAusgewaehlt.size} Zeiträume → PDF`}
                </button>
                <button
                  className="btn btn-secondary btn-sm whitespace-nowrap"
                  onClick={() => setKombiSplitOffen(true)}
                  title="Getrennte Abrechnungen für mehrere Bewohner über den ganzen kombinierten Zeitraum erstellen"
                >
                  Auf Bewohner aufteilen
                </button>
              </div>
            )}
          </div>
        )}

        {mieterListe.length === 0 ? (
          <p className="text-sm text-gray-400">Keine Mieter in dieser Periode.</p>
        ) : (
          <div className="space-y-2">
            {mieterListe.map((m) => (
              <MieterZeile
                key={m.mieter_id}
                m={m}
                periodeId={periodeId}
                onError={onError}
                kombiModus={kombiModus}
                kombiAusgewaehlt={kombiAusgewaehlt.has(m.mieter_id)}
                onKombiToggle={() => toggleKombiAuswahl(m.mieter_id)}
                abschnitte={abschnitte}
                segmentAnzahl={mieterListe.filter((x) => x.wohnung_id === m.wohnung_id).length}
                onGoToVorauszahlung={onGoToVorauszahlung}
              />
            ))}
          </div>
        )}
      </div>

      {sammelOffen && (
        <SammelabrechnungModal
          open={sammelOffen}
          onClose={() => setSammelOffen(false)}
          periodeId={periodeId}
          liegenschaftName={liegenschaftName}
          onError={onError}
        />
      )}

      {kombiSplitOffen && (
        <PersonenSplitModal
          open={kombiSplitOffen}
          onClose={() => setKombiSplitOffen(false)}
          periodeId={periodeId}
          mieterIds={kombiSegmente.map((s) => s.mieter_id)}
          wohnungId={kombiSegmente[kombiSegmente.length - 1]?.wohnung_id}
          wohnungBezeichnung={kombiWohnungBezeichnung}
          vorgeschlagenerName={vorgeschlagenerKombiName}
          onError={onError}
        />
      )}

      {ausprobierenOffen && (
        <AusprobierenModal
          open={ausprobierenOffen}
          onClose={() => setAusprobierenOffen(false)}
          periodeId={periodeId}
          mieterListe={mieterListe}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["schluessel-abrechnung"] });
            qc.invalidateQueries({ queryKey: ["direkt-kostenarten-werte"] });
            qc.invalidateQueries({ queryKey: ["direkt-uebersteuerungen"] });
            qc.invalidateQueries({ queryKey: ["wohnung-detail"] });
            qc.invalidateQueries({ queryKey: ["mieter-detail"] });
            addToast("success", "Änderungen gespeichert");
          }}
          onError={onError}
        />
      )}

      {pdfPreview && (
        <PdfPreviewModal
          downloadUrl={pdfPreview.url}
          dateiname={pdfPreview.dateiname}
          onClose={() => setPdfPreview(null)}
          onSaved={(path) => addToast("success", `PDF gespeichert: ${path}`)}
          onError={onError}
        />
      )}
    </div>
  );
}

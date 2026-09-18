import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { DirektKostenart, DirektKostenartWert, Mieter, SchluesselMieter, Wohnung } from "../../types";
import { BASIS_LABELS } from "../../types";
import { Modal, ConfirmModal } from "./Modal";
import { Spinner } from "./Spinner";

function fmtEur(n: number) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface SatzEntwurf {
  preis_pro_einheit: string;
  preis_grund_pro_m2: string;
  preis_verbrauch_pro_einheit: string;
}

function satzToEntwurf(w: DirektKostenartWert | undefined): SatzEntwurf {
  return {
    preis_pro_einheit: w?.preis_pro_einheit != null ? String(w.preis_pro_einheit) : "",
    preis_grund_pro_m2: w?.preis_grund_pro_m2 != null ? String(w.preis_grund_pro_m2) : "",
    preis_verbrauch_pro_einheit: w?.preis_verbrauch_pro_einheit != null ? String(w.preis_verbrauch_pro_einheit) : "",
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  periodeId: number;
  mieter: SchluesselMieter;
  onSaved: () => void;
  onError: (msg: string) => void;
}

/** Ausprobieren-Modus: alle Basiswerte und Sätze editierbar, unten live sichtbar
 *  wie sich Guthaben/Nachzahlung ändert. Die Vorschau läuft über einen rein
 *  lesenden Backend-Endpunkt (echte Engine, Rollback nach jeder Anfrage) —
 *  keine Nachbildung der Berechnungsformeln im Frontend. Gespeichert wird erst
 *  nach expliziter Bestätigung, getrennt nach Tragweite: Sätze gelten für die
 *  ganze Periode (und spiegeln automatisch auf Schwesterhäuser), Personen/
 *  Fläche/Endbetrag nur für diesen Mieter in dieser Periode. */
export function AusprobierenModal({ open, onClose, periodeId, mieter, onSaved, onError }: Props) {
  const qc = useQueryClient();

  const { data: mieterVoll } = useQuery({
    queryKey: ["mieter-detail", mieter.mieter_id],
    queryFn: () => api.get<Mieter>(`/mieter/${mieter.mieter_id}`),
    enabled: open,
  });
  const { data: wohnung } = useQuery({
    queryKey: ["wohnung-detail", mieter.wohnung_id],
    queryFn: () => api.get<Wohnung>(`/wohnungen/${mieter.wohnung_id}`),
    enabled: open,
  });
  const { data: kostenarten = [] } = useQuery({
    queryKey: ["direkt-kostenarten"],
    queryFn: () => api.get<DirektKostenart[]>("/direkt-kostenarten"),
    enabled: open,
  });
  const { data: kostenartenWerte = [] } = useQuery({
    queryKey: ["direkt-kostenarten-werte", periodeId],
    queryFn: () => api.get<DirektKostenartWert[]>(`/perioden/${periodeId}/direkt-kostenarten-werte`),
    enabled: open,
  });

  const [personen, setPersonen] = useState("");
  const [flaeche, setFlaeche] = useState("");
  const [saetze, setSaetze] = useState<Record<number, SatzEntwurf>>({});
  const [betraege, setBetraege] = useState<Record<number, string>>({});
  const [initialized, setInitialized] = useState(false);

  const [preview, setPreview] = useState<SchluesselMieter | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [pendingConfirm, setPendingConfirm] = useState<"satz" | "mieter" | null>(null);
  const [saving, setSaving] = useState(false);

  const kostenartById = useMemo(() => new Map(kostenarten.map((k) => [k.id, k])), [kostenarten]);
  const wertById = useMemo(() => new Map(kostenartenWerte.map((w) => [w.kostenart_id, w])), [kostenartenWerte]);

  const relevanteKostenartIds = useMemo(
    () => [...new Set(mieter.zeilen.map((z) => z.kostenart_id).filter((id): id is number => id !== null))],
    [mieter.zeilen]
  );

  // Einmalig initialisieren, sobald alle Grunddaten da sind (nicht bei jedem Re-Fetch überschreiben)
  useEffect(() => {
    if (!open) {
      setInitialized(false);
      setPreview(null);
      setPendingConfirm(null);
      return;
    }
    if (initialized || !mieterVoll || !wohnung || kostenartenWerte.length === 0) return;
    setPersonen(String(mieterVoll.anzahl_personen));
    setFlaeche(String(wohnung.flaeche_m2));
    const saetzeInit: Record<number, SatzEntwurf> = {};
    const betraegeInit: Record<number, string> = {};
    for (const id of relevanteKostenartIds) {
      saetzeInit[id] = satzToEntwurf(wertById.get(id));
      const ka = kostenartById.get(id);
      const zeile = mieter.zeilen.find((z) => z.kostenart_id === id);
      if (ka && !ka.hat_grundkosten_split && zeile) {
        betraegeInit[id] = String(zeile.betrag);
      }
    }
    setSaetze(saetzeInit);
    setBetraege(betraegeInit);
    setInitialized(true);
  }, [open, initialized, mieterVoll, wohnung, kostenartenWerte, relevanteKostenartIds, wertById, kostenartById, mieter.zeilen]);

  const personenGeaendert = mieterVoll != null && personen !== "" && Number(personen) !== mieterVoll.anzahl_personen;
  const flaecheGeaendert = wohnung != null && flaeche !== "" && Number(flaeche) !== wohnung.flaeche_m2;

  function satzGeaendert(id: number): boolean {
    const entwurf = saetze[id];
    if (!entwurf) return false;
    const original = satzToEntwurf(wertById.get(id));
    return (
      entwurf.preis_pro_einheit !== original.preis_pro_einheit ||
      entwurf.preis_grund_pro_m2 !== original.preis_grund_pro_m2 ||
      entwurf.preis_verbrauch_pro_einheit !== original.preis_verbrauch_pro_einheit
    );
  }
  function betragGeaendert(id: number): boolean {
    const original = mieter.zeilen.find((z) => z.kostenart_id === id);
    return betraege[id] !== undefined && original !== undefined && betraege[id] !== String(original.betrag);
  }

  const periodeAllgemeinTouched = relevanteKostenartIds.some(satzGeaendert);
  const mieterSpezifischTouched =
    personenGeaendert || flaecheGeaendert || relevanteKostenartIds.some(betragGeaendert);
  const anyTouched = periodeAllgemeinTouched || mieterSpezifischTouched;

  // Live-Vorschau (debounced): ruft den rein lesenden Vorschau-Endpunkt auf
  useEffect(() => {
    if (!open || !initialized) return;
    if (!anyTouched) {
      setPreview(null);
      return;
    }
    const handle = setTimeout(() => {
      setPreviewLoading(true);
      const uebersteuerungen: Record<string, unknown>[] = [];
      if (personenGeaendert) {
        uebersteuerungen.push({ feld: "personen", mieter_id: mieter.mieter_id, wert: Number(personen) });
      }
      if (flaecheGeaendert) {
        uebersteuerungen.push({ feld: "flaeche_m2", wohnung_id: mieter.wohnung_id, wert: Number(flaeche) });
      }
      for (const id of relevanteKostenartIds) {
        if (betragGeaendert(id)) {
          uebersteuerungen.push({ feld: "betrag", mieter_id: mieter.mieter_id, kostenart_id: id, wert: Number(betraege[id]) });
        }
      }
      const kostenart_werte: Record<string, unknown>[] = [];
      for (const id of relevanteKostenartIds) {
        if (satzGeaendert(id)) {
          const e = saetze[id];
          kostenart_werte.push({
            kostenart_id: id,
            preis_pro_einheit: e.preis_pro_einheit === "" ? null : Number(e.preis_pro_einheit),
            preis_grund_pro_m2: e.preis_grund_pro_m2 === "" ? null : Number(e.preis_grund_pro_m2),
            preis_verbrauch_pro_einheit: e.preis_verbrauch_pro_einheit === "" ? null : Number(e.preis_verbrauch_pro_einheit),
          });
        }
      }
      api
        .post<SchluesselMieter>(`/perioden/${periodeId}/mieter/${mieter.mieter_id}/schluessel-abrechnung/vorschau`, {
          uebersteuerungen,
          kostenart_werte,
        })
        .then(setPreview)
        .catch((e: Error) => onError(e.message))
        .finally(() => setPreviewLoading(false));
    }, 450);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialized, personen, flaeche, saetze, betraege]);

  const anzeige = preview ?? mieter;
  const guthaben = anzeige.saldo >= 0;

  async function speichereSatz() {
    for (const id of relevanteKostenartIds) {
      if (!satzGeaendert(id)) continue;
      const e = saetze[id];
      await api.put(`/perioden/${periodeId}/direkt-kostenarten-werte/${id}`, {
        preis_pro_einheit: e.preis_pro_einheit === "" ? null : Number(e.preis_pro_einheit),
        preis_grund_pro_m2: e.preis_grund_pro_m2 === "" ? null : Number(e.preis_grund_pro_m2),
        preis_verbrauch_pro_einheit: e.preis_verbrauch_pro_einheit === "" ? null : Number(e.preis_verbrauch_pro_einheit),
      });
    }
  }
  async function speichereMieter() {
    if (personenGeaendert) {
      await api.put(`/perioden/${periodeId}/direkt-uebersteuerungen`, {
        feld: "personen",
        mieter_id: mieter.mieter_id,
        wert: Number(personen),
      });
    }
    if (flaecheGeaendert) {
      await api.put(`/perioden/${periodeId}/direkt-uebersteuerungen`, {
        feld: "flaeche_m2",
        wohnung_id: mieter.wohnung_id,
        wert: Number(flaeche),
      });
    }
    for (const id of relevanteKostenartIds) {
      if (!betragGeaendert(id)) continue;
      await api.put(`/perioden/${periodeId}/direkt-uebersteuerungen`, {
        feld: "betrag",
        mieter_id: mieter.mieter_id,
        kostenart_id: id,
        wert: Number(betraege[id]),
      });
    }
  }

  const abschliessenMutation = useMutation({
    mutationFn: async () => {},
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schluessel-abrechnung"] });
      qc.invalidateQueries({ queryKey: ["direkt-kostenarten-werte"] });
      qc.invalidateQueries({ queryKey: ["direkt-uebersteuerungen"] });
      qc.invalidateQueries({ queryKey: ["wohnung-detail"] });
      qc.invalidateQueries({ queryKey: ["mieter-detail"] });
      onSaved();
      onClose();
    },
  });

  function finalize() {
    abschliessenMutation.mutate();
  }

  async function weiterNachSatzFrage(uebernehmen: boolean) {
    setPendingConfirm(null);
    setSaving(true);
    try {
      if (uebernehmen) await speichereSatz();
      if (mieterSpezifischTouched) {
        setSaving(false);
        setPendingConfirm("mieter");
        return;
      }
      finalize();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function weiterNachMieterFrage(uebernehmen: boolean) {
    setPendingConfirm(null);
    setSaving(true);
    try {
      if (uebernehmen) await speichereMieter();
      finalize();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleSpeichernKlick() {
    if (periodeAllgemeinTouched) setPendingConfirm("satz");
    else if (mieterSpezifischTouched) setPendingConfirm("mieter");
  }

  const ladeGrunddaten = !mieterVoll || !wohnung || kostenartenWerte.length === 0;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Ausprobieren — ${mieter.anzeigename} (${mieter.wohnung_bezeichnung})`}
        size="xl"
        footer={
          <div className="flex items-center justify-between w-full gap-4">
            <div className="text-xs text-gray-500">
              {previewLoading ? (
                <span className="flex items-center gap-1.5">
                  <Spinner size="sm" /> berechne …
                </span>
              ) : preview ? (
                <span>Vorschau aktiv — noch nicht gespeichert</span>
              ) : (
                <span>Original-Werte</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                Summe {fmtEur(anzeige.summe)} € · VZ {fmtEur(anzeige.vorauszahlung_ist)} €
              </span>
              <span className={`text-base font-semibold tabular-nums ${guthaben ? "text-emerald-600" : "text-red-600"}`}>
                {guthaben ? "Guthaben" : "Nachzahlung"}: {fmtEur(Math.abs(anzeige.saldo))} €
              </span>
              <button className="btn btn-secondary" onClick={onClose}>
                Abbrechen
              </button>
              <button className="btn btn-primary" disabled={!anyTouched || saving} onClick={handleSpeichernKlick}>
                {saving ? "Speichern…" : "Speichern"}
              </button>
            </div>
          </div>
        }
      >
        {ladeGrunddaten ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-xs text-gray-500">
              Werte anpassen und rechts unten live sehen, wie sich Guthaben/Nachzahlung ändern. Gespeichert wird
              erst nach Bestätigung — Sätze gelten dann für die ganze Periode, Personen/Fläche/Endbetrag nur für
              diesen Mieter.
            </p>

            <section>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Mieter-Basiswerte</h3>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div>
                  <label className="label">Personen</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={`input ${personenGeaendert ? "border-blue-400" : ""}`}
                    value={personen}
                    onChange={(e) => setPersonen(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Fläche der Wohnung (m²)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    className={`input ${flaecheGeaendert ? "border-blue-400" : ""}`}
                    value={flaeche}
                    onChange={(e) => setFlaeche(e.target.value)}
                  />
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                Kostenarten &amp; Sätze
              </h3>
              <div className="space-y-2">
                {relevanteKostenartIds.map((id) => {
                  const ka = kostenartById.get(id);
                  const entwurf = saetze[id];
                  if (!ka || !entwurf) return null;
                  const zeilenDieserKostenart = mieter.zeilen.filter((z) => z.kostenart_id === id);
                  const previewZeilen = anzeige.zeilen.filter((z) => z.kostenart_id === id);
                  const summeAktuell = previewZeilen.reduce((s, z) => s + z.betrag, 0);
                  const veraendert = satzGeaendert(id) || betragGeaendert(id);
                  return (
                    <div
                      key={id}
                      className={`rounded-lg border p-3 ${
                        veraendert
                          ? "border-blue-300 bg-blue-50/40 dark:bg-blue-950/20"
                          : "border-gray-200 dark:border-gray-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{ka.name}</span>
                        <span className="text-sm tabular-nums text-gray-700 dark:text-gray-200">
                          {fmtEur(summeAktuell)} €
                        </span>
                      </div>
                      {ka.hat_grundkosten_split ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="label text-[10px]">Grundkosten (€/m²)</label>
                            <input
                              type="number"
                              step="0.00001"
                              className="input text-sm"
                              value={entwurf.preis_grund_pro_m2}
                              onChange={(e) =>
                                setSaetze((s) => ({
                                  ...s,
                                  [id]: { ...s[id], preis_grund_pro_m2: e.target.value },
                                }))
                              }
                            />
                          </div>
                          <div>
                            <label className="label text-[10px]">
                              Verbrauch ({BASIS_LABELS[ka.verteilungsbasis]})
                            </label>
                            <input
                              type="number"
                              step="0.00001"
                              className="input text-sm"
                              value={entwurf.preis_verbrauch_pro_einheit}
                              onChange={(e) =>
                                setSaetze((s) => ({
                                  ...s,
                                  [id]: { ...s[id], preis_verbrauch_pro_einheit: e.target.value },
                                }))
                              }
                            />
                          </div>
                          <p className="col-span-2 text-[10px] text-gray-400">
                            Aufgeteilte Kostenart — der Endbetrag ergibt sich aus den beiden Sätzen und ist hier
                            nicht direkt überschreibbar.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3 items-end">
                          <div>
                            <label className="label text-[10px]">Satz ({BASIS_LABELS[ka.verteilungsbasis]})</label>
                            <input
                              type="number"
                              step="0.00001"
                              className="input text-sm"
                              value={entwurf.preis_pro_einheit}
                              onChange={(e) =>
                                setSaetze((s) => ({ ...s, [id]: { ...s[id], preis_pro_einheit: e.target.value } }))
                              }
                            />
                          </div>
                          <div>
                            <label className="label text-[10px]">Endbetrag direkt (€)</label>
                            <input
                              type="number"
                              step="0.01"
                              className="input text-sm"
                              value={betraege[id] ?? ""}
                              onChange={(e) => setBetraege((b) => ({ ...b, [id]: e.target.value }))}
                            />
                          </div>
                        </div>
                      )}
                      {zeilenDieserKostenart[0] && (
                        <p className="text-[10px] text-gray-400 mt-1">{zeilenDieserKostenart[0].grundlage}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={pendingConfirm === "satz"}
        title="Sätze auf die ganze Periode übertragen?"
        message="Die geänderten Sätze gelten dann für alle Mieter dieser Periode (und werden automatisch für Schwesterhäuser mit demselben Zeitraum übernommen)."
        confirmLabel="Übertragen"
        danger={false}
        onConfirm={() => weiterNachSatzFrage(true)}
        onClose={() => weiterNachSatzFrage(false)}
      />
      <ConfirmModal
        open={pendingConfirm === "mieter"}
        title="Für diesen Mieter für diese Periode anpassen?"
        message={`Die geänderten Basiswerte (Personen/Fläche/Endbetrag) gelten dann nur für ${mieter.anzeigename} in dieser Periode.`}
        confirmLabel="Anpassen"
        danger={false}
        onConfirm={() => weiterNachMieterFrage(true)}
        onClose={() => weiterNachMieterFrage(false)}
      />
    </>
  );
}

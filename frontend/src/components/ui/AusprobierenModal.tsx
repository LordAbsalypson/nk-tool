import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  mieterListe: SchluesselMieter[];
  onSaved: () => void;
  onError: (msg: string) => void;
}

/** Ausprobieren-Modus (period-weit): Kostenart-Sätze anpassen und sofort sehen, wie sich
 *  die Salden ALLER Mieter der Periode ändern — Sätze wirken schon in der echten Abrechnung
 *  period-weit, die Vorschau bildet das jetzt auch so ab statt nur einen einzelnen Mieter zu
 *  zeigen. Optional zusätzlich EIN Mieter aus einer Auswahl wählbar, um dessen Personen/
 *  Fläche/Endbetrag anzupassen (bisheriges Verhalten, nur an eine Auswahl gebunden statt fest
 *  an einen von außen übergebenen Mieter). Die Vorschau läuft über einen rein lesenden
 *  Backend-Endpunkt (echte Engine, Rollback nach jeder Anfrage) — keine Nachbildung der
 *  Berechnungsformeln im Frontend. Gespeichert wird erst nach expliziter Bestätigung, getrennt
 *  nach Tragweite: Sätze gelten für die ganze Periode (und spiegeln automatisch auf
 *  Schwesterhäuser), Personen/Fläche/Endbetrag nur für den gewählten Mieter in dieser Periode. */
export function AusprobierenModal({ open, onClose, periodeId, mieterListe, onSaved, onError }: Props) {
  const [mieterId, setMieterId] = useState<number | "">("");
  const mieter = mieterListe.find((m) => m.mieter_id === mieterId) ?? null;

  const { data: mieterVoll } = useQuery({
    queryKey: ["mieter-detail", mieterId],
    queryFn: () => api.get<Mieter>(`/mieter/${mieterId}`),
    enabled: open && mieterId !== "",
  });
  const { data: wohnung } = useQuery({
    queryKey: ["wohnung-detail", mieter?.wohnung_id],
    queryFn: () => api.get<Wohnung>(`/wohnungen/${mieter?.wohnung_id}`),
    enabled: open && mieter !== null,
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
  const [mieterInitId, setMieterInitId] = useState<number | "">("");

  const [preview, setPreview] = useState<SchluesselMieter[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [pendingConfirm, setPendingConfirm] = useState<"satz" | "mieter" | null>(null);
  const [saving, setSaving] = useState(false);

  const kostenartById = useMemo(() => new Map(kostenarten.map((k) => [k.id, k])), [kostenarten]);
  const wertById = useMemo(() => new Map(kostenartenWerte.map((w) => [w.kostenart_id, w])), [kostenartenWerte]);

  // Alle in der Periode tatsächlich verwendeten Kostenarten — über alle Mieter hinweg.
  const relevanteKostenartIds = useMemo(
    () => [
      ...new Set(
        mieterListe.flatMap((m) => m.zeilen.map((z) => z.kostenart_id).filter((id): id is number => id !== null))
      ),
    ],
    [mieterListe]
  );
  // Nur die Kostenarten des gewählten Mieters — für den Endbetrag-Override.
  const mieterKostenartIds = useMemo(
    () => [...new Set((mieter?.zeilen ?? []).map((z) => z.kostenart_id).filter((id): id is number => id !== null))],
    [mieter]
  );

  // Nach dem Schließen zurücksetzen (Modal bleibt gemountet, siehe VorschauModal-Pattern).
  useEffect(() => {
    if (open) return;
    return () => {
      setMieterId("");
      setMieterInitId("");
      setPersonen("");
      setFlaeche("");
      setSaetze({});
      setBetraege({});
      setPreview(null);
      setPendingConfirm(null);
    };
  }, [open]);

  // Satz-Entwürfe einmalig initialisieren, sobald die Kostenart-Werte geladen sind.
  useEffect(() => {
    if (!open || kostenartenWerte.length === 0) return;
    if (Object.keys(saetze).length > 0) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    const saetzeInit: Record<number, SatzEntwurf> = {};
    for (const id of relevanteKostenartIds) {
      saetzeInit[id] = satzToEntwurf(wertById.get(id));
    }
    setSaetze(saetzeInit);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kostenartenWerte, relevanteKostenartIds, wertById]);

  // Mieter-spezifische Entwürfe einmalig initialisieren, sobald ein Mieter gewählt ist und
  // dessen Grunddaten geladen sind (nicht bei jedem Re-Fetch überschreiben).
  useEffect(() => {
    if (!open || mieterId === "" || mieterInitId === mieterId || !mieterVoll || !wohnung || !mieter) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setPersonen(String(mieterVoll.anzahl_personen));
    setFlaeche(String(wohnung.flaeche_m2));
    const betraegeInit: Record<number, string> = {};
    for (const id of mieterKostenartIds) {
      const ka = kostenartById.get(id);
      const zeile = mieter.zeilen.find((z) => z.kostenart_id === id);
      if (ka && !ka.hat_grundkosten_split && zeile) {
        betraegeInit[id] = String(zeile.betrag);
      }
    }
    setBetraege(betraegeInit);
    setMieterInitId(mieterId);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, mieterId, mieterInitId, mieterVoll, wohnung, mieter, mieterKostenartIds, kostenartById]);

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
    const original = mieter?.zeilen.find((z) => z.kostenart_id === id);
    return betraege[id] !== undefined && original !== undefined && betraege[id] !== String(original.betrag);
  }

  const periodeAllgemeinTouched = relevanteKostenartIds.some(satzGeaendert);
  const mieterSpezifischTouched =
    mieter !== null && (personenGeaendert || flaecheGeaendert || mieterKostenartIds.some(betragGeaendert));
  const anyTouched = periodeAllgemeinTouched || mieterSpezifischTouched;

  // Live-Vorschau (debounced): ruft den period-weiten, rein lesenden Vorschau-Endpunkt auf.
  useEffect(() => {
    if (!open) return;
    if (!anyTouched) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(null);
      return;
    }
    const handle = setTimeout(() => {
      setPreviewLoading(true);
      const uebersteuerungen: Record<string, unknown>[] = [];
      if (mieter && personenGeaendert) {
        uebersteuerungen.push({ feld: "personen", mieter_id: mieter.mieter_id, wert: Number(personen) });
      }
      if (mieter && flaecheGeaendert) {
        uebersteuerungen.push({ feld: "flaeche_m2", wohnung_id: mieter.wohnung_id, wert: Number(flaeche) });
      }
      if (mieter) {
        for (const id of mieterKostenartIds) {
          if (betragGeaendert(id)) {
            uebersteuerungen.push({ feld: "betrag", mieter_id: mieter.mieter_id, kostenart_id: id, wert: Number(betraege[id]) });
          }
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
        .post<SchluesselMieter[]>(`/perioden/${periodeId}/schluessel-abrechnung/vorschau`, {
          uebersteuerungen,
          kostenart_werte,
        })
        .then(setPreview)
        .catch((e: Error) => onError(e.message))
        .finally(() => setPreviewLoading(false));
    }, 450);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, personen, flaeche, saetze, betraege]);

  const anzeigeListe = preview ?? mieterListe;
  const summeSaldoAlt = mieterListe.filter((m) => m.berechenbar).reduce((s, m) => s + m.saldo, 0);
  const summeSaldoNeu = anzeigeListe.filter((m) => m.berechenbar).reduce((s, m) => s + m.saldo, 0);

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
    if (!mieter) return;
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
    for (const id of mieterKostenartIds) {
      if (!betragGeaendert(id)) continue;
      await api.put(`/perioden/${periodeId}/direkt-uebersteuerungen`, {
        feld: "betrag",
        mieter_id: mieter.mieter_id,
        kostenart_id: id,
        wert: Number(betraege[id]),
      });
    }
  }

  function finalize() {
    onSaved();
    onClose();
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

  const ladeGrunddaten = kostenartenWerte.length === 0;
  const ladeMieterDaten = mieterId !== "" && (!mieterVoll || !wohnung);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Mit angepassten Stammdaten ausprobieren"
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
                Saldo aller Mieter: {fmtEur(summeSaldoAlt)} €
                {preview && (
                  <>
                    {" → "}
                    <strong className={summeSaldoNeu >= 0 ? "text-emerald-600" : "text-red-600"}>
                      {fmtEur(summeSaldoNeu)} €
                    </strong>
                  </>
                )}
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
              Sätze wirken sofort auf alle Mieter dieser Periode (Tabelle unten) — noch nicht
              gespeichert. Optional zusätzlich einen Mieter wählen, um dessen Personen/Fläche/
              Endbetrag anzupassen.
            </p>

            <section>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                Kostenarten &amp; Sätze (gesamte Periode)
              </h3>
              <div className="space-y-2">
                {relevanteKostenartIds.map((id) => {
                  const ka = kostenartById.get(id);
                  const entwurf = saetze[id];
                  if (!ka || !entwurf) return null;
                  const veraendert = satzGeaendert(id);
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
                        </div>
                      ) : (
                        <div>
                          <label className="label text-[10px]">Satz ({BASIS_LABELS[ka.verteilungsbasis]})</label>
                          <input
                            type="number"
                            step="0.00001"
                            className="input text-sm max-w-[200px]"
                            value={entwurf.preis_pro_einheit}
                            onChange={(e) =>
                              setSaetze((s) => ({ ...s, [id]: { ...s[id], preis_pro_einheit: e.target.value } }))
                            }
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                Mieter-spezifische Anpassung (optional)
              </h3>
              <select
                className="input max-w-sm"
                value={mieterId}
                onChange={(e) => setMieterId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">— keiner —</option>
                {mieterListe.map((m) => (
                  <option key={m.mieter_id} value={m.mieter_id}>
                    {m.wohnung_bezeichnung} — {m.anzeigename}
                  </option>
                ))}
              </select>

              {mieterId !== "" && (
                <div className="mt-3 space-y-3">
                  {ladeMieterDaten ? (
                    <Spinner size="sm" />
                  ) : (
                    <>
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
                      <div className="space-y-2">
                        {mieterKostenartIds.map((id) => {
                          const ka = kostenartById.get(id);
                          if (!ka || ka.hat_grundkosten_split) return null;
                          return (
                            <div key={id} className="max-w-xs">
                              <label className="label text-[10px]">{ka.name} — Endbetrag direkt (€)</label>
                              <input
                                type="number"
                                step="0.01"
                                className={`input text-sm ${betragGeaendert(id) ? "border-blue-400" : ""}`}
                                value={betraege[id] ?? ""}
                                onChange={(e) => setBetraege((b) => ({ ...b, [id]: e.target.value }))}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                Salden aller Mieter {preview && <span className="font-normal text-gray-400">(mit Vorschau)</span>}
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400">
                    <th className="pb-1 font-normal">Wohnung</th>
                    <th className="pb-1 font-normal">Mieter</th>
                    <th className="pb-1 font-normal text-right">Alter Saldo</th>
                    {preview && <th className="pb-1 font-normal text-right">Neuer Saldo</th>}
                  </tr>
                </thead>
                <tbody>
                  {mieterListe.map((orig) => {
                    const neu = anzeigeListe.find((x) => x.mieter_id === orig.mieter_id) ?? orig;
                    return (
                      <tr key={orig.mieter_id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="py-1 text-gray-700 dark:text-gray-200">{orig.wohnung_bezeichnung}</td>
                        <td className="py-1 text-gray-700 dark:text-gray-200">{orig.anzeigename}</td>
                        <td className="py-1 text-right tabular-nums text-gray-500">
                          {orig.berechenbar ? `${fmtEur(orig.saldo)} €` : "—"}
                        </td>
                        {preview && (
                          <td
                            className={`py-1 text-right tabular-nums font-medium ${
                              neu.berechenbar ? (neu.saldo >= 0 ? "text-emerald-600" : "text-red-600") : "text-gray-400"
                            }`}
                          >
                            {neu.berechenbar ? `${fmtEur(neu.saldo)} €` : "—"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
        message={`Die geänderten Basiswerte (Personen/Fläche/Endbetrag) gelten dann nur für ${mieter?.anzeigename ?? ""} in dieser Periode.`}
        confirmLabel="Anpassen"
        danger={false}
        onConfirm={() => weiterNachMieterFrage(true)}
        onClose={() => weiterNachMieterFrage(false)}
      />
    </>
  );
}

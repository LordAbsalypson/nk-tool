import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { api } from "../../api/client";
import type { Abrechnungsperiode, Mieter, MieterVerbrauch, ZaehlerTyp } from "../../types";
import { Modal } from "./Modal";

const TYP_LABEL: Record<string, { label: string; einheit: string }> = {
  waerme_kwh: { label: "Wärme", einheit: "kWh" },
  hkv_einheiten: { label: "Wärme (HKV)", einheit: "Einh." },
  warmwasser_m3: { label: "Warmwasser", einheit: "m³" },
  kaltwasser_m3: { label: "Kaltwasser", einheit: "m³" },
  strom_kwh: { label: "Strom", einheit: "kWh" },
};

interface InhaltProps {
  periodeId: number;
  wohnungId: number;
  /** Typ des Zählers, um dessen Verbrauch es geht */
  zaehlerTyp: ZaehlerTyp;
  /** Gesamtverbrauch der Wohnung laut Zähler */
  gesamtVerbrauch: number | null;
  onSaved: () => void;
  onError: (msg: string) => void;
}

/** Bei Mieterwechsel: Verbrauch je Mieter fest vorgeben statt nach Tagen zu teilen.
 *  Reiner Inhalt ohne Hülle — einsetzbar im Modal (siehe VerbrauchAufteilung unten)
 *  oder direkt inline/aufklappbar (siehe ZaehlerstaendeTab). */
export function VerbrauchAufteilungInhalt({
  periodeId,
  wohnungId,
  zaehlerTyp,
  gesamtVerbrauch,
  onSaved,
  onError,
}: InhaltProps) {
  const qc = useQueryClient();
  const info = TYP_LABEL[zaehlerTyp] ?? { label: zaehlerTyp, einheit: "" };
  const [entwurf, setEntwurf] = useState<Record<number, string>>({});
  const [schaetzungAnzeigen, setSchaetzungAnzeigen] = useState<Record<number, boolean>>({});

  const { data: mieterAlle = [] } = useQuery({
    queryKey: ["mieter", wohnungId],
    queryFn: () => api.get<Mieter[]>(`/wohnungen/${wohnungId}/mieter`),
  });
  // Leerstand bekommt im Verbrauchspool nichts zugeteilt — hier ausblenden
  const mieter = mieterAlle.filter((m) => !m.ist_leerstand);

  const { data: periode } = useQuery({
    queryKey: ["periode", periodeId],
    queryFn: () => api.get<Abrechnungsperiode>(`/perioden/${periodeId}`),
  });

  const { data: overrides = [] } = useQuery({
    queryKey: ["verbrauch-override", periodeId, wohnungId],
    queryFn: () =>
      api.get<MieterVerbrauch[]>(
        `/perioden/${periodeId}/wohnungen/${wohnungId}/verbrauch-override`
      ),
  });

  const setzen = useMutation({
    mutationFn: ({
      mieterId,
      wert,
      alsSchaetzungAnzeigen,
    }: {
      mieterId: number;
      wert: number | null;
      alsSchaetzungAnzeigen: boolean;
    }) =>
      api.put(`/perioden/${periodeId}/mieter/${mieterId}/verbrauch-override`, {
        zaehler_typ: zaehlerTyp,
        wert,
        als_schaetzung_anzeigen: alsSchaetzungAnzeigen,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verbrauch-override", periodeId, wohnungId] });
      qc.invalidateQueries({ queryKey: ["kostenverteilung"] });
      qc.invalidateQueries({ queryKey: ["checkup"] });
      qc.invalidateQueries({ queryKey: ["schluessel-abrechnung"] });
      onSaved();
    },
    onError: (e: Error) => onError(e.message),
  });

  const overrideFuer = (mieterId: number) =>
    overrides.find((o) => o.mieter_id === mieterId && o.zaehler_typ === zaehlerTyp);

  /** Miettage innerhalb der Abrechnungsperiode (beide Grenzen inklusive, wie die Engine). */
  function miettage(m: Mieter): number {
    if (!periode) return 0;
    const von = new Date(Math.max(+new Date(m.einzug_datum), +new Date(periode.von_datum)));
    const bis = new Date(
      Math.min(+new Date(m.auszug_datum ?? periode.bis_datum), +new Date(periode.bis_datum))
    );
    return Math.max(0, Math.round((+bis - +von) / 86400000) + 1);
  }

  /** Spiegelt die Engine-Verteilung: fixierte Mieter → ihr Wert; Rest nach Miettagen. */
  const vorschau: Record<number, { wert: number; art: "fix" | "rest" | "tage" }> = {};
  if (gesamtVerbrauch !== null && mieter.length > 0) {
    const fixe = mieter.filter((m) => overrideFuer(m.id));
    const offene = mieter.filter((m) => !overrideFuer(m.id));
    const fixSumme = fixe.reduce((s2, m) => s2 + (overrideFuer(m.id)?.wert ?? 0), 0);
    for (const m of fixe) vorschau[m.id] = { wert: overrideFuer(m.id)!.wert, art: "fix" };
    const rest = Math.max(0, gesamtVerbrauch - fixSumme);
    const tageSumme = offene.reduce((s2, m) => s2 + miettage(m), 0);
    for (const m of offene) {
      const anteil = tageSumme > 0 ? miettage(m) / tageSumme : 0;
      vorschau[m.id] = {
        wert: Math.round(rest * anteil * 1000) / 1000,
        art: fixe.length > 0 ? "rest" : "tage",
      };
    }
  }

  const fixiertSumme = overrides
    .filter((o) => o.zaehler_typ === zaehlerTyp)
    .reduce((s, o) => s + o.wert, 0);
  const rest = (gesamtVerbrauch ?? 0) - fixiertSumme;
  const zuViel = gesamtVerbrauch !== null && fixiertSumme > gesamtVerbrauch;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{info.label}</span>
        <span className="text-xs text-gray-500">
          Gesamt laut Zähler:{" "}
          <strong>
            {gesamtVerbrauch !== null
              ? `${gesamtVerbrauch.toLocaleString("de-DE", { maximumFractionDigits: 3 })} ${info.einheit}`
              : "noch nicht bekannt"}
          </strong>
        </span>
      </div>

      {mieter.length < 2 ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          In dieser Wohnung ist nur ein Mieter erfasst — eine Aufteilung ist erst bei einem
          Mieterwechsel nötig.
        </p>
      ) : (
        <div className="space-y-2">
          {mieter.map((m) => {
            const ov = overrideFuer(m.id);
            const wertText = entwurf[m.id] ?? (ov ? String(ov.wert) : "");
            return (
              <div key={m.id} className="flex flex-col gap-1.5 rounded border border-gray-100 dark:border-gray-700 p-2">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-100 truncate">{m.anzeigename}</p>
                  <p className="text-xs text-gray-400 whitespace-nowrap">
                    {m.einzug_datum} – {m.auszug_datum ?? "heute"}
                    {periode && ` · ${miettage(m)} Tage`}
                  </p>
                  {vorschau[m.id] && (
                    <p
                      className={`text-xs font-medium ${
                        vorschau[m.id].art === "fix"
                          ? "text-yellow-700"
                          : vorschau[m.id].art === "rest"
                          ? "text-blue-700"
                          : "text-green-700"
                      }`}
                    >
                      {vorschau[m.id].art === "fix" && "→ fest eingetragen: "}
                      {vorschau[m.id].art === "rest" && "→ bekommt die Differenz: "}
                      {vorschau[m.id].art === "tage" && "→ nach Tagessatz: "}
                      {vorschau[m.id].wert.toLocaleString("de-DE", { maximumFractionDigits: 3 })}{" "}
                      {info.einheit}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    step="0.001"
                    placeholder="nach Tagen"
                    value={wertText}
                    onChange={(e) => setEntwurf((v) => ({ ...v, [m.id]: e.target.value }))}
                    className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded text-right"
                  />
                  <span className="text-xs text-gray-400">{info.einheit}</span>
                  <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={schaetzungAnzeigen[m.id] ?? ov?.als_schaetzung_anzeigen ?? false}
                      onChange={(e) =>
                        setSchaetzungAnzeigen((v) => ({ ...v, [m.id]: e.target.checked }))
                      }
                    />
                    „Wert geschätzt" in Abrechnung anzeigen
                  </label>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={setzen.isPending}
                    onClick={() => {
                      const roh = (entwurf[m.id] ?? "").trim();
                      const wert = roh === "" ? null : parseFloat(roh.replace(",", "."));
                      if (wert !== null && isNaN(wert)) return;
                      setzen.mutate({
                        mieterId: m.id,
                        wert,
                        alsSchaetzungAnzeigen: schaetzungAnzeigen[m.id] ?? ov?.als_schaetzung_anzeigen ?? false,
                      });
                    }}
                  >
                    {ov ? "Ändern" : "Festlegen"}
                  </button>
                  {ov && (
                    <button
                      className="btn btn-secondary btn-sm"
                      title="Vorgabe entfernen — wieder nach Tagen aufteilen"
                      onClick={() => {
                        setEntwurf((v) => ({ ...v, [m.id]: "" }));
                        setzen.mutate({ mieterId: m.id, wert: null, alsSchaetzungAnzeigen: false });
                      }}
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {fixiertSumme > 0 && (
        <div
          className={`rounded px-3 py-2 text-sm ${
            zuViel
              ? "bg-red-50 border border-red-200 text-red-700"
              : "bg-blue-50 border border-blue-200 text-blue-800"
          }`}
        >
          Fest eingetragen: {fixiertSumme.toLocaleString("de-DE", { maximumFractionDigits: 3 })}{" "}
          {info.einheit}
          {gesamtVerbrauch !== null && (
            <>
              {" · "}
              {zuViel ? (
                <strong>mehr als der Gesamtverbrauch — die übrigen Mieter bekommen 0 {info.einheit}</strong>
              ) : (
                <>
                  Rest für die übrigen Mieter:{" "}
                  <strong>
                    {rest.toLocaleString("de-DE", { maximumFractionDigits: 3 })} {info.einheit}
                  </strong>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface ModalProps extends InhaltProps {
  open: boolean;
  onClose: () => void;
  wohnungBezeichnung: string;
}

/** Popup-Variante (falls an anderer Stelle als eigenständiges Modal gebraucht). */
export function VerbrauchAufteilung({ open, onClose, wohnungBezeichnung, ...inhalt }: ModalProps) {
  const info = TYP_LABEL[inhalt.zaehlerTyp] ?? { label: inhalt.zaehlerTyp, einheit: "" };
  return (
    <Modal open={open} title={`Verbrauch aufteilen — ${wohnungBezeichnung}, ${info.label}`} onClose={onClose}>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
        <strong>Standard (Tagessatz):</strong> Gesamtverbrauch ÷ Tage der Periode × Miettage des
        Mieters. <strong>Sonderfall:</strong> trägst du bei einem Mieter seinen tatsächlichen
        Verbrauch ein, bekommt der andere automatisch die Differenz.
      </p>
      <VerbrauchAufteilungInhalt {...inhalt} />
      <p className="text-xs text-gray-400 mt-3">
        Nach dem Ändern in Stufe 5 „Abrechnung" prüfen, ob sich die Beträge wie erwartet aktualisiert haben.
      </p>
    </Modal>
  );
}

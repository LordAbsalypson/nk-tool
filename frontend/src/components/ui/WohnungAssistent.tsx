import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "@heroicons/react/24/outline";
import { api } from "../../api/client";
import type { Mieter, Wohnung, Zaehler } from "../../types";
import { Modal } from "./Modal";

/** Zählertypen, die eine Wohnung üblicherweise hat. Strom nur, wenn er über
 *  den Vermieter abgerechnet wird. */
const ZAEHLER_AUSWAHL = [
  { typ: "waerme_kwh", label: "Wärmemengenzähler", hinweis: "zeigt kWh" },
  { typ: "hkv_einheiten", label: "Heizkostenverteiler", hinweis: "am Heizkörper, zeigt Einheiten" },
  { typ: "warmwasser_m3", label: "Warmwasserzähler", hinweis: "zeigt m³" },
  { typ: "kaltwasser_m3", label: "Kaltwasserzähler", hinweis: "zeigt m³" },
] as const;

interface Props {
  open: boolean;
  liegenschaftId: number;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

export function WohnungAssistent({ open, liegenschaftId, onClose, onSaved, onError }: Props) {
  const qc = useQueryClient();
  const [schritt, setSchritt] = useState(1);

  // Schritt 1 — Wohnung
  const [bezeichnung, setBezeichnung] = useState("");
  const [flaeche, setFlaeche] = useState("");
  const [stromUeberVermieter, setStromUeberVermieter] = useState(false);
  const [strompreis, setStrompreis] = useState("");

  // Schritt 2 — Mieter (optional)
  const [mieterAnlegen, setMieterAnlegen] = useState(true);
  const [mieterName, setMieterName] = useState("");
  const [einzug, setEinzug] = useState("");
  const [personen, setPersonen] = useState("1");
  const [vorauszahlung, setVorauszahlung] = useState("");

  // Schritt 3 — Zähler
  const [zaehlerNummern, setZaehlerNummern] = useState<Record<string, string>>({});
  const [zaehlerAktiv, setZaehlerAktiv] = useState<Record<string, boolean>>({
    waerme_kwh: true,
    warmwasser_m3: true,
    kaltwasser_m3: true,
  });
  const [stromNummer, setStromNummer] = useState("");

  function zuruecksetzen() {
    setSchritt(1);
    setBezeichnung(""); setFlaeche(""); setStromUeberVermieter(false); setStrompreis("");
    setMieterAnlegen(true); setMieterName(""); setEinzug(""); setPersonen("1"); setVorauszahlung("");
    setZaehlerNummern({}); setStromNummer("");
    setZaehlerAktiv({ waerme_kwh: true, warmwasser_m3: true, kaltwasser_m3: true });
  }

  const anlegen = useMutation({
    mutationFn: async () => {
      const flaecheNum = parseFloat(flaeche.replace(",", "."));
      const wohnung = await api.post<Wohnung>(`/liegenschaften/${liegenschaftId}/wohnungen`, {
        bezeichnung: bezeichnung.trim(),
        flaeche_m2: flaecheNum,
        anzahl_rwm: 0,
        strom_ueber_vermieter: stromUeberVermieter,
        strom_preis_kwh: stromUeberVermieter && strompreis
          ? parseFloat(strompreis.replace(",", "."))
          : null,
        sortierung: parseInt((bezeichnung.match(/(\d+)/)?.[1] ?? "999"), 10),
        aktiv: true,
      });

      if (mieterAnlegen && mieterName.trim()) {
        await api.post<Mieter>(`/wohnungen/${wohnung.id}/mieter`, {
          anzeigename: mieterName.trim(),
          einzug_datum: einzug,
          auszug_datum: null,
          anzahl_personen: parseInt(personen, 10) || 1,
          monatliche_vorauszahlung: vorauszahlung
            ? parseFloat(vorauszahlung.replace(",", "."))
            : 0,
          ist_leerstand: false,
          notizen: null,
        });
      }

      for (const z of ZAEHLER_AUSWAHL) {
        if (!zaehlerAktiv[z.typ]) continue;
        await api.post<Zaehler>(`/wohnungen/${wohnung.id}/zaehler`, {
          typ: z.typ,
          geraete_nummer: zaehlerNummern[z.typ]?.trim() || null,
          bezeichnung: null,
          eingebaut_am: null,
          aktiv: true,
          ewe_vertragsnummer: null,
        });
      }
      if (stromUeberVermieter) {
        await api.post<Zaehler>(`/wohnungen/${wohnung.id}/zaehler`, {
          typ: "strom_kwh",
          geraete_nummer: stromNummer.trim() || null,
          bezeichnung: null,
          eingebaut_am: null,
          aktiv: true,
          ewe_vertragsnummer: null,
        });
      }
      return wohnung;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      zuruecksetzen();
      onClose();
      onSaved();
    },
    onError: (e: Error) => onError(e.message),
  });

  const schritt1Ok = bezeichnung.trim().length > 0 && parseFloat(flaeche.replace(",", ".")) > 0;
  const schritt2Ok = !mieterAnlegen || (mieterName.trim().length > 0 && einzug.length > 0);

  function schliessen() {
    zuruecksetzen();
    onClose();
  }

  return (
    <Modal open={open} title="Neue Wohnung anlegen" onClose={schliessen}>
      {/* Fortschritt */}
      <div className="flex items-center gap-2 mb-4">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                schritt === s
                  ? "bg-blue-600 text-white"
                  : schritt > s
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {schritt > s ? <CheckIcon className="w-3.5 h-3.5" /> : s}
            </div>
            <span className={`text-xs ${schritt === s ? "text-gray-800 font-medium" : "text-gray-400"}`}>
              {s === 1 ? "Wohnung" : s === 2 ? "Mieter" : "Zähler"}
            </span>
            {s < 3 && <div className="h-px bg-gray-200 flex-1" />}
          </div>
        ))}
      </div>

      {schritt === 1 && (
        <div className="space-y-3">
          <div>
            <label className="label">Wie heißt die Wohnung?</label>
            <input
              className="input"
              placeholder="z. B. Whg 3"
              value={bezeichnung}
              onChange={(e) => setBezeichnung(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-0.5">
              Die Nummer bestimmt die Reihenfolge in allen Listen.
            </p>
          </div>
          <div>
            <label className="label">Wie groß ist sie? (m²)</label>
            <input
              className="input"
              type="number"
              step="0.1"
              placeholder="z. B. 52"
              value={flaeche}
              onChange={(e) => setFlaeche(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-0.5">
              Wichtig: viele Kosten werden nach Wohnfläche aufgeteilt.
            </p>
          </div>
          <label className="flex items-start gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={stromUeberVermieter}
              onChange={(e) => setStromUeberVermieter(e.target.checked)}
              className="w-4 h-4 mt-0.5"
            />
            <span className="text-sm text-gray-700">
              Strom läuft über den Vermieter
              <span className="block text-xs text-gray-400">
                Nur ankreuzen, wenn der Mieter den Strom über euch bezahlt und nicht
                selbst einen Vertrag hat.
              </span>
            </span>
          </label>
          {stromUeberVermieter && (
            <div>
              <label className="label">Strompreis pro kWh (€)</label>
              <input
                className="input"
                type="number"
                step="0.0001"
                placeholder="z. B. 0,30"
                value={strompreis}
                onChange={(e) => setStrompreis(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {schritt === 2 && (
        <div className="space-y-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={mieterAnlegen}
              onChange={(e) => setMieterAnlegen(e.target.checked)}
              className="w-4 h-4 mt-0.5"
            />
            <span className="text-sm text-gray-700">
              Es wohnt jemand in dieser Wohnung
              <span className="block text-xs text-gray-400">
                Häkchen wegnehmen, wenn die Wohnung leer steht — Mieter kann später
                ergänzt werden.
              </span>
            </span>
          </label>
          {mieterAnlegen && (
            <>
              <div>
                <label className="label">Name des Mieters</label>
                <input
                  className="input"
                  placeholder="z. B. Doris Alert"
                  value={mieterName}
                  onChange={(e) => setMieterName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Seit wann wohnt er/sie da?</label>
                  <input
                    type="date"
                    className="input"
                    value={einzug}
                    onChange={(e) => setEinzug(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Wie viele Personen?</label>
                  <input
                    type="number"
                    min="1"
                    className="input"
                    value={personen}
                    onChange={(e) => setPersonen(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="label">Monatliche Vorauszahlung (€)</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  placeholder="z. B. 150"
                  value={vorauszahlung}
                  onChange={(e) => setVorauszahlung(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-0.5">
                  Der Betrag, den der Mieter jeden Monat für Nebenkosten zahlt.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {schritt === 3 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Welche Zähler gibt es in dieser Wohnung? Gerätenummern sind optional —
            die können auch später nachgetragen werden.
          </p>
          {ZAEHLER_AUSWAHL.map((z) => (
            <div key={z.typ} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={!!zaehlerAktiv[z.typ]}
                onChange={(e) =>
                  setZaehlerAktiv((v) => ({ ...v, [z.typ]: e.target.checked }))
                }
                className="w-4 h-4 mt-2"
              />
              <div className="flex-1">
                <label className="text-sm text-gray-700">
                  {z.label}
                  <span className="text-xs text-gray-400 ml-1">({z.hinweis})</span>
                </label>
                {zaehlerAktiv[z.typ] && (
                  <input
                    className="input mt-1"
                    placeholder="Gerätenummer (optional)"
                    value={zaehlerNummern[z.typ] ?? ""}
                    onChange={(e) =>
                      setZaehlerNummern((v) => ({ ...v, [z.typ]: e.target.value }))
                    }
                  />
                )}
              </div>
            </div>
          ))}
          {stromUeberVermieter && (
            <div className="flex items-start gap-2 pt-1 border-t border-gray-100">
              <input type="checkbox" checked readOnly className="w-4 h-4 mt-2" />
              <div className="flex-1">
                <label className="text-sm text-gray-700">
                  Stromzähler
                  <span className="text-xs text-gray-400 ml-1">
                    (wird angelegt, weil Strom über den Vermieter läuft)
                  </span>
                </label>
                <input
                  className="input mt-1"
                  placeholder="Gerätenummer (optional)"
                  value={stromNummer}
                  onChange={(e) => setStromNummer(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-4 mt-4 border-t border-gray-100">
        {schritt > 1 && (
          <button className="btn btn-secondary flex items-center gap-1" onClick={() => setSchritt((s) => s - 1)}>
            <ArrowLeftIcon className="w-4 h-4" /> Zurück
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button className="btn btn-secondary" onClick={schliessen}>
            Abbrechen
          </button>
          {schritt < 3 ? (
            <button
              className="btn btn-primary flex items-center gap-1"
              disabled={schritt === 1 ? !schritt1Ok : !schritt2Ok}
              onClick={() => setSchritt((s) => s + 1)}
            >
              Weiter <ArrowRightIcon className="w-4 h-4" />
            </button>
          ) : (
            <button
              className="btn btn-primary"
              disabled={anlegen.isPending}
              onClick={() => anlegen.mutate()}
            >
              {anlegen.isPending ? "Wird angelegt…" : "Wohnung anlegen"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

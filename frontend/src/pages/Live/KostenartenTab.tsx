import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, TrashIcon, CalculatorIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { api } from "../../api/client";
import {
  BASIS_KURZ,
  BASIS_LABELS,
  DIREKT_VERTEILUNGSBASIS,
  SPLITFAEHIGE_BASEN,
  type DirektKostenart,
  type DirektKostenartWert,
  type DirektVerteilungsbasis,
  type GesamteinheitenVorschlag,
} from "../../types";
import { Spinner } from "../../components/ui/Spinner";
import { ConfirmModal } from "../../components/ui/Modal";

function parseZahl(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return isNaN(n) ? null : n;
}

function fmt(n: number, digits = 2) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Rechner: Gesamtbetrag ÷ Gesamteinheiten (+ Verhältnis bei Split) → Satz/Sätze. */
function SplitRechner({
  kostenart,
  vorschlagM2,
  vorschlagVerbrauch,
  periodeId,
  onClose,
  onSaved,
}: {
  kostenart: DirektKostenart;
  vorschlagM2: number | undefined;
  vorschlagVerbrauch: number | undefined;
  periodeId: number;
  onClose: () => void;
  onSaved: (namen: string[]) => void;
}) {
  const [gesamtbetrag, setGesamtbetrag] = useState("");
  const [gesamtM2, setGesamtM2] = useState(vorschlagM2 !== undefined ? String(vorschlagM2) : "");
  const [gesamtVerbrauch, setGesamtVerbrauch] = useState(
    vorschlagVerbrauch !== undefined ? String(vorschlagVerbrauch) : ""
  );
  const [verhaeltnis, setVerhaeltnis] = useState("30");

  const gb = parseZahl(gesamtbetrag);
  const gm2 = parseZahl(gesamtM2);
  const gv = parseZahl(gesamtVerbrauch);
  const vh = Math.min(50, Math.max(30, parseZahl(verhaeltnis) ?? 30)) / 100;

  const grundBetrag = gb !== null ? gb * vh : null;
  const verbrauchBetrag = gb !== null ? gb * (1 - vh) : null;
  const preisGrund = grundBetrag !== null && gm2 ? grundBetrag / gm2 : null;
  const preisVerbrauch = verbrauchBetrag !== null && gv ? verbrauchBetrag / gv : null;

  const rechnen = useMutation({
    mutationFn: () =>
      api.post<{ preis_grund_pro_m2: number; preis_verbrauch_pro_einheit: number; auch_uebernommen_fuer: string[] }>(
        `/perioden/${periodeId}/direkt-kostenarten-werte/${kostenart.id}/split-rechner`,
        { gesamtbetrag: gb, gesamt_m2: gm2, gesamt_verbrauch: gv, verhaeltnis_grund: vh }
      ),
    onSuccess: (res) => {
      onSaved(res.auch_uebernommen_fuer);
      onClose();
    },
  });

  return (
    <div className="mt-2 p-3 rounded bg-blue-50 dark:bg-gray-900 border border-blue-200 dark:border-gray-700 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-600">Gesamtbetrag (€)</label>
          <input
            type="text"
            inputMode="decimal"
            className="input text-sm"
            value={gesamtbetrag}
            onChange={(e) => setGesamtbetrag(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-600">Grundkosten-Anteil (%)</label>
          <input
            type="number"
            min={30}
            max={50}
            className="input text-sm"
            value={verhaeltnis}
            onChange={(e) => setVerhaeltnis(e.target.value)}
          />
          <p className="text-[10px] text-gray-400">30–50%, HeizkostenV §7 — kann jährlich anders sein</p>
        </div>
        <div>
          <label className="text-xs text-gray-600">Gesamtfläche (m²)</label>
          <input
            type="text"
            inputMode="decimal"
            className="input text-sm"
            value={gesamtM2}
            onChange={(e) => setGesamtM2(e.target.value)}
          />
          {vorschlagM2 !== undefined && (
            <button
              type="button"
              onClick={() => setGesamtM2(String(vorschlagM2))}
              className="text-[10px] text-blue-500 hover:text-blue-700"
            >
              Vorschlag: {fmt(vorschlagM2, 1)}
            </button>
          )}
        </div>
        <div>
          <label className="text-xs text-gray-600">Gesamtverbrauch ({BASIS_LABELS[kostenart.verteilungsbasis].split("/")[1]})</label>
          <input
            type="text"
            inputMode="decimal"
            className="input text-sm"
            value={gesamtVerbrauch}
            onChange={(e) => setGesamtVerbrauch(e.target.value)}
          />
          {vorschlagVerbrauch !== undefined && (
            <button
              type="button"
              onClick={() => setGesamtVerbrauch(String(vorschlagVerbrauch))}
              className="text-[10px] text-blue-500 hover:text-blue-700"
            >
              Vorschlag: {fmt(vorschlagVerbrauch, 1)}
            </button>
          )}
        </div>
      </div>
      <div className="text-xs text-gray-600 border-t border-blue-200 dark:border-gray-700 pt-2">
        {preisGrund !== null && preisVerbrauch !== null ? (
          <>
            = Grundkosten <strong>{fmt(preisGrund, 5)} €/m²</strong> ({fmt(grundBetrag!, 2)} €) + Verbrauch{" "}
            <strong>{fmt(preisVerbrauch, 5)} {BASIS_LABELS[kostenart.verteilungsbasis]}</strong> ({fmt(verbrauchBetrag!, 2)} €)
          </>
        ) : (
          "Alle Felder ausfüllen für die Vorschau"
        )}
      </div>
      <div className="flex gap-2">
        <button
          className="btn btn-primary btn-sm"
          disabled={preisGrund === null || preisVerbrauch === null || rechnen.isPending}
          onClick={() => rechnen.mutate()}
        >
          {rechnen.isPending ? "Speichern…" : "Übernehmen"}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

function KostenartKachel({
  kostenart,
  wert,
  vorschlag,
  periodeId,
  onSaved,
  onDeleted,
  onError,
}: {
  kostenart: DirektKostenart;
  wert: DirektKostenartWert | undefined;
  vorschlag: GesamteinheitenVorschlag | undefined;
  periodeId: number;
  onSaved: (namen: string[]) => void;
  onDeleted: () => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [rechnerOffen, setRechnerOffen] = useState(false);
  const [deleteOffen, setDeleteOffen] = useState(false);
  const [entwurf, setEntwurf] = useState<{ pro_einheit?: string; grund?: string; verbrauch?: string }>({});

  const proEinheit = entwurf.pro_einheit ?? (wert?.preis_pro_einheit !== undefined && wert?.preis_pro_einheit !== null ? String(wert.preis_pro_einheit) : "");
  const grund = entwurf.grund ?? (wert?.preis_grund_pro_m2 !== undefined && wert?.preis_grund_pro_m2 !== null ? String(wert.preis_grund_pro_m2) : "");
  const verbrauch = entwurf.verbrauch ?? (wert?.preis_verbrauch_pro_einheit !== undefined && wert?.preis_verbrauch_pro_einheit !== null ? String(wert.preis_verbrauch_pro_einheit) : "");

  const speichern = useMutation({
    mutationFn: () =>
      api.put<{ auch_uebernommen_fuer: string[] }>(
        `/perioden/${periodeId}/direkt-kostenarten-werte/${kostenart.id}`,
        kostenart.hat_grundkosten_split
          ? {
              preis_grund_pro_m2: parseZahl(grund),
              preis_verbrauch_pro_einheit: parseZahl(verbrauch),
            }
          : { preis_pro_einheit: parseZahl(proEinheit) }
      ),
    onSuccess: (res) => {
      setEntwurf({});
      onSaved(res.auch_uebernommen_fuer);
    },
    onError: (e: Error) => onError(e.message),
  });

  const loeschen = useMutation({
    mutationFn: () => api.delete(`/direkt-kostenarten/${kostenart.id}`),
    onSuccess: () => {
      qc.invalidateQueries();
      onDeleted();
    },
    onError: (e: Error) => onError(e.message),
  });

  const kannSplit = SPLITFAEHIGE_BASEN.includes(kostenart.verteilungsbasis);
  const unvollstaendig =
    kostenart.hat_grundkosten_split &&
    ((grund !== "" && verbrauch === "") || (grund === "" && verbrauch !== ""));

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{kostenart.name}</h4>
          <p className="text-xs text-gray-400">
            {BASIS_KURZ[kostenart.verteilungsbasis]}
            {kostenart.hat_grundkosten_split && " · Grund+Verbrauch-Split"}
          </p>
        </div>
        <button
          onClick={() => setDeleteOffen(true)}
          className="text-gray-400 dark:text-gray-500 hover:text-red-500"
          title="Kostenart löschen"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>

      {unvollstaendig && (
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
          Nur einer der beiden Sätze gesetzt — HeizkostenV verlangt beide (mind. 30% Grundkosten).
        </p>
      )}

      {kostenart.hat_grundkosten_split ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500">Grundkosten</label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                inputMode="decimal"
                placeholder="—"
                value={grund}
                onChange={(e) => setEntwurf((v) => ({ ...v, grund: e.target.value }))}
                className="input text-sm py-1 text-right"
              />
              <span className="text-[10px] text-gray-400 shrink-0">€/m²</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Verbrauch</label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                inputMode="decimal"
                placeholder="—"
                value={verbrauch}
                onChange={(e) => setEntwurf((v) => ({ ...v, verbrauch: e.target.value }))}
                className="input text-sm py-1 text-right"
              />
              <span className="text-[10px] text-gray-400 shrink-0">{BASIS_LABELS[kostenart.verteilungsbasis].split("/")[1]}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <input
            type="text"
            inputMode="decimal"
            placeholder="—"
            value={proEinheit}
            onChange={(e) => setEntwurf((v) => ({ ...v, pro_einheit: e.target.value }))}
            className="input text-sm py-1 text-right"
          />
          <span className="text-[10px] text-gray-400 w-24 shrink-0">{BASIS_LABELS[kostenart.verteilungsbasis]}</span>
        </div>
      )}

      {wert?.saetze_manuell_angepasst && kostenart.hat_grundkosten_split && (
        <p className="text-[10px] text-blue-600 mt-1">Von Hand eingetragen (nicht aus dem Rechner abgeleitet)</p>
      )}

      <div className="flex items-center gap-2 mt-2">
        <button
          className="btn btn-primary btn-sm"
          disabled={speichern.isPending}
          onClick={() => speichern.mutate()}
        >
          {speichern.isPending ? "…" : "Speichern"}
        </button>
        {kannSplit && kostenart.hat_grundkosten_split && (
          <button
            onClick={() => setRechnerOffen((o) => !o)}
            className={`text-xs px-2 py-1 rounded border flex items-center gap-1 ${
              rechnerOffen ? "bg-blue-50 border-blue-300 text-blue-700" : "border-gray-200 text-gray-500 hover:text-gray-700"
            }`}
          >
            <CalculatorIcon className="w-3.5 h-3.5" /> Rechner
          </button>
        )}
      </div>

      {rechnerOffen && (
        <SplitRechner
          kostenart={kostenart}
          vorschlagM2={vorschlag?.m2}
          vorschlagVerbrauch={vorschlag?.[kostenart.verteilungsbasis]}
          periodeId={periodeId}
          onClose={() => setRechnerOffen(false)}
          onSaved={onSaved}
        />
      )}

      <ConfirmModal
        open={deleteOffen}
        title="Kostenart löschen"
        message={`"${kostenart.name}" wirklich löschen? Betrifft alle Perioden und Häuser.`}
        onConfirm={() => loeschen.mutate()}
        onClose={() => setDeleteOffen(false)}
      />
    </div>
  );
}

function NeueKostenartForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [basis, setBasis] = useState<DirektVerteilungsbasis>("m2");
  const [split, setSplit] = useState(false);

  const erstellen = useMutation({
    mutationFn: () =>
      api.post("/direkt-kostenarten", {
        name,
        verteilungsbasis: basis,
        hat_grundkosten_split: split,
        nur_liegenschaft_id: null,
        sortierung: 999,
        aktiv: true,
      }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  return (
    <div className="card border-2 border-dashed border-gray-300 dark:border-gray-600">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">Neue Kostenart</h4>
      <div className="space-y-2">
        <div>
          <label className="text-xs text-gray-500">Name</label>
          <input className="input text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Kabelanschluss" />
        </div>
        <div>
          <label className="text-xs text-gray-500">Wie wird aufgeteilt?</label>
          <select
            className="input text-sm"
            value={basis}
            onChange={(e) => {
              const b = e.target.value as DirektVerteilungsbasis;
              setBasis(b);
              if (!SPLITFAEHIGE_BASEN.includes(b)) setSplit(false);
            }}
          >
            {DIREKT_VERTEILUNGSBASIS.map((b) => (
              <option key={b} value={b}>{BASIS_KURZ[b]}</option>
            ))}
          </select>
        </div>
        {SPLITFAEHIGE_BASEN.includes(basis) && (
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} className="w-4 h-4" />
            Grundkosten + Verbrauchskosten trennen (wie Heizung/Warmwasser)
          </label>
        )}
        <div className="flex gap-2 pt-1">
          <button
            className="btn btn-primary btn-sm"
            disabled={!name.trim() || erstellen.isPending}
            onClick={() => erstellen.mutate()}
          >
            {erstellen.isPending ? "Anlegen…" : "Anlegen"}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  periodeId: number;
  onSaved: () => void;
}

export function KostenartenTab({ periodeId, onSaved }: Props) {
  const qc = useQueryClient();
  const [neuOffen, setNeuOffen] = useState(false);
  const [uebernommenFuer, setUebernommenFuer] = useState<string[]>([]);

  const { data: kostenarten = [], isLoading } = useQuery({
    queryKey: ["direkt-kostenarten"],
    queryFn: () => api.get<DirektKostenart[]>("/direkt-kostenarten"),
  });
  const { data: werteListe = [] } = useQuery({
    queryKey: ["direkt-kostenarten-werte", periodeId],
    queryFn: () => api.get<DirektKostenartWert[]>(`/perioden/${periodeId}/direkt-kostenarten-werte`),
  });
  const { data: vorschlag } = useQuery({
    queryKey: ["gesamteinheiten-vorschlag", periodeId],
    queryFn: () => api.get<GesamteinheitenVorschlag>(`/perioden/${periodeId}/gesamteinheiten-vorschlag`),
  });

  const werteMap: Record<number, DirektKostenartWert> = {};
  werteListe.forEach((w) => (werteMap[w.kostenart_id] = w));

  function invalidateAlles(namen: string[] = []) {
    qc.invalidateQueries({ queryKey: ["direkt-kostenarten"] });
    qc.invalidateQueries({ queryKey: ["direkt-kostenarten-werte"] });
    qc.invalidateQueries({ queryKey: ["schluessel-abrechnung"] });
    setUebernommenFuer(namen);
    onSaved();
  }

  if (isLoading)
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Kostenarten</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Jede Kachel ist eine eigene Kostenart — Satz direkt eintragen oder über den Rechner aus
            Gesamtbetrag ÷ Gesamteinheiten ableiten.{" "}
            <strong>Gilt automatisch für alle Häuser mit gleichem Abrechnungszeitraum.</strong>
          </p>
        </div>
        <button onClick={() => setNeuOffen(true)} className="btn btn-primary btn-sm flex items-center gap-1">
          <PlusIcon className="w-4 h-4" /> Neue Kostenart
        </button>
      </div>

      {uebernommenFuer.length > 0 && (
        <p className="text-xs text-emerald-600 flex items-center gap-1">
          <CheckCircleIcon className="w-3.5 h-3.5" /> Auch übernommen für: {uebernommenFuer.join(", ")}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {kostenarten.map((k) => (
          <KostenartKachel
            key={k.id}
            kostenart={k}
            wert={werteMap[k.id]}
            vorschlag={vorschlag}
            periodeId={periodeId}
            onSaved={invalidateAlles}
            onDeleted={() => invalidateAlles()}
            onError={() => {}}
          />
        ))}
        {neuOffen && (
          <NeueKostenartForm onClose={() => setNeuOffen(false)} onSaved={() => invalidateAlles()} />
        )}
      </div>

      {kostenarten.length === 0 && !neuOffen && (
        <p className="text-sm text-gray-400">Noch keine Kostenarten angelegt.</p>
      )}
    </div>
  );
}

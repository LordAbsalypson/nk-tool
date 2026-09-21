import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FireIcon } from "@heroicons/react/24/outline";
import { api } from "../../api/client";
import type { Liegenschaft, Wohnung } from "../../types";
import { Spinner } from "../../components/ui/Spinner";
import { Tooltip } from "../../components/ui/Tooltip";

const schema = z.object({
  name: z.string().min(1, "Pflichtfeld"),
  adresse: z.string().min(1, "Pflichtfeld"),
  plz: z.string().min(4, "Ungültige PLZ"),
  ort: z.string().min(1, "Pflichtfeld"),
  heizungsart: z.enum(["oel", "gas_heizwert", "gas_brennwert", "waermepumpe"]),
  brennstoff_einheit: z.enum(["kwh", "liter_oel", "m3_gas"]),
  brennstoff_heizwert_kwh: z.preprocess(
    (v) => (v === "" || v === null ? null : Number(v)),
    z.number().positive().nullable()
  ),
  heiz_grundkosten_anteil: z.preprocess(
    (v) => Number(v) / 100,
    z.number().min(0.3).max(0.5)
  ),
  ww_grundkosten_anteil: z.preprocess(
    (v) => Number(v) / 100,
    z.number().min(0.3).max(0.5)
  ),
  co2_klasse: z.string().nullable().optional(),
  gemeinschaftsflaeche_m2: z.preprocess(Number, z.number().min(0)),
});

type FormData = z.infer<typeof schema>;

const heizungsartLabels: Record<string, string> = {
  oel: "Öl",
  gas_heizwert: "Gas (Heizwert)",
  gas_brennwert: "Gas (Brennwert)",
  waermepumpe: "Wärmepumpe",
};

const einheitLabels: Record<string, string> = {
  kwh: "kWh",
  liter_oel: "Liter (Öl)",
  m3_gas: "m³ (Gas)",
};

interface Props {
  liegenschaft: Liegenschaft;
  onSaved: () => void;
  onError: (msg: string) => void;
  onSetSaveFn?: (fn: (() => void) | null) => void;
}

export function UebersichtTab({ liegenschaft, onSaved, onError, onSetSaveFn }: Props) {
  const qc = useQueryClient();

  const { data: wohnungen = [] } = useQuery({
    queryKey: ["wohnungen", liegenschaft.id],
    queryFn: () => api.get<Wohnung[]>(`/liegenschaften/${liegenschaft.id}/wohnungen`),
  });
  const summeWohnflaechen = wohnungen
    .filter((w) => w.aktiv)
    .reduce((s, w) => s + w.flaeche_m2, 0);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = useForm<z.input<typeof schema>, unknown, FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: liegenschaft.name,
      adresse: liegenschaft.adresse,
      plz: liegenschaft.plz,
      ort: liegenschaft.ort,
      heizungsart: liegenschaft.heizungsart,
      brennstoff_einheit: liegenschaft.brennstoff_einheit,
      brennstoff_heizwert_kwh: liegenschaft.brennstoff_heizwert_kwh,
      heiz_grundkosten_anteil: liegenschaft.heiz_grundkosten_anteil * 100,
      ww_grundkosten_anteil: liegenschaft.ww_grundkosten_anteil * 100,
      co2_klasse: liegenschaft.co2_klasse ?? "",
      gemeinschaftsflaeche_m2: liegenschaft.gemeinschaftsflaeche_m2,
    },
  });

  const gemeinschaftsflaeche = watch("gemeinschaftsflaeche_m2");
  const gesamtflaeche = summeWohnflaechen + (Number(gemeinschaftsflaeche) || 0);

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      api.put<Liegenschaft>(`/liegenschaften/${liegenschaft.id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["liegenschaften"] });
      onSaved();
    },
    onError: (e: Error) => onError(e.message),
  });

  useEffect(() => {
    onSetSaveFn?.(
      isDirty ? () => handleSubmit((d) => mutation.mutate(d))() : null
    );
  }, [isDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form
      onSubmit={handleSubmit((d) => mutation.mutate(d))}
      className="max-w-2xl space-y-6"
    >
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Allgemeine Daten
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Name / Bezeichnung</label>
            <input className="input" {...register("name")} />
            {errors.name && <p className="error-msg">{errors.name.message}</p>}
          </div>
          <div className="col-span-2">
            <label className="label">Adresse</label>
            <input className="input" {...register("adresse")} />
            {errors.adresse && (
              <p className="error-msg">{errors.adresse.message}</p>
            )}
          </div>
          <div>
            <label className="label">PLZ</label>
            <input className="input" {...register("plz")} />
            {errors.plz && <p className="error-msg">{errors.plz.message}</p>}
          </div>
          <div>
            <label className="label">Ort</label>
            <input className="input" {...register("ort")} />
            {errors.ort && <p className="error-msg">{errors.ort.message}</p>}
          </div>
          <div>
            <label className="label">CO₂-Klasse (optional)</label>
            <input
              className="input"
              placeholder="z.B. D"
              {...register("co2_klasse")}
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Heizsystem
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Heizungsart</label>
            <select className="input" {...register("heizungsart")}>
              {Object.entries(heizungsartLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Brennstoff-Einheit</label>
            <select className="input" {...register("brennstoff_einheit")}>
              {Object.entries(einheitLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Heizwert (kWh/Einheit, optional)</label>
            <input
              type="number"
              step="0.01"
              className="input"
              {...register("brennstoff_heizwert_kwh")}
            />
            {errors.brennstoff_heizwert_kwh && (
              <p className="error-msg">
                {errors.brennstoff_heizwert_kwh.message}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">
              z.B. 10,08 kWh/l (Öl) oder 10,55 kWh/m³ (Gas)
            </p>
          </div>
          <div className="flex items-start gap-2 pt-5 text-xs text-gray-500">
            <FireIcon className="w-4 h-4 shrink-0" />
            <span>WW-Temperatur: Standard 60 °C (HeizkostenVO §9 Abs. 2, DVGW W551)</span>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-1 flex items-center">
          Flächen
          <Tooltip content="Die Gesamtfläche des Hauses ist mehr als die Summe der vermieteten Wohnflächen — Flure, Keller, Waschküche etc. zählen mit. Manche Kostenarten (z. B. Allg. Strom) beziehen sich auf die Gesamtfläche statt nur auf die Wohnungen." />
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Summe Wohnflächen</label>
            <div className="input bg-gray-50 dark:bg-gray-800 text-gray-500">
              {summeWohnflaechen.toLocaleString("de-DE", { maximumFractionDigits: 1 })} m²
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Automatisch aus den aktiven Wohnungen</p>
          </div>
          <div>
            <label className="label">Gemeinschaftsfläche (m²)</label>
            <input
              type="number"
              step="0.01"
              className="input"
              {...register("gemeinschaftsflaeche_m2")}
            />
            {errors.gemeinschaftsflaeche_m2 && (
              <p className="error-msg">{errors.gemeinschaftsflaeche_m2.message}</p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">Flure, Keller, Waschküche etc.</p>
          </div>
          <div>
            <label className="label">Gesamtfläche Haus</label>
            <div className="input bg-gray-50 dark:bg-gray-800 font-medium text-gray-700 dark:text-gray-200">
              {gesamtflaeche.toLocaleString("de-DE", { maximumFractionDigits: 1 })} m²
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-1 flex items-center">
          Grundkosten-Anteile (HeizkostenVO §7)
          <Tooltip content="Die HeizkostenVO §7 schreibt vor, dass 50–70 % der Heiz- und Warmwasserkosten nach Verbrauch verteilt werden müssen. Der Grundkostenanteil (30–50 %) wird nach Wohnfläche verteilt und deckt verbrauchsunabhängige Fixkosten ab. Üblich: 30 % Grundkosten, 70 % Verbrauch." />
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Zulässiger Bereich: 30–50 %. Verbrauchsanteil = 100 % − Grundkostenanteil.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label flex items-center">
              Heizung Grundkosten (%)
              <Tooltip content="Anteil der Heizkosten, der nach m² Wohnfläche verteilt wird (unabhängig vom Heizverbrauch). Typischer Wert: 30 %. Bei starken Verbrauchsunterschieden zwischen Wohnungen empfiehlt sich 30 %; bei gleichmäßiger Nutzung kann auch 50 % sachgerecht sein." />
            </label>
            <input
              type="number"
              step="1"
              min="30"
              max="50"
              className="input"
              {...register("heiz_grundkosten_anteil")}
            />
            {errors.heiz_grundkosten_anteil && (
              <p className="error-msg">
                {errors.heiz_grundkosten_anteil.message}
              </p>
            )}
          </div>
          <div>
            <label className="label flex items-center">
              Warmwasser Grundkosten (%)
              <Tooltip content="Anteil der Warmwasserkosten, der nach m² Wohnfläche verteilt wird. Typischer Wert: 30 %. Der restliche Anteil (70 %) wird nach gemessenem m³-Verbrauch verteilt." />
            </label>
            <input
              type="number"
              step="1"
              min="30"
              max="50"
              className="input"
              {...register("ww_grundkosten_anteil")}
            />
            {errors.ww_grundkosten_anteil && (
              <p className="error-msg">
                {errors.ww_grundkosten_anteil.message}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!isDirty || mutation.isPending}
          className="btn btn-primary"
        >
          {mutation.isPending ? (
            <span className="flex items-center gap-2">
              <Spinner size="sm" /> Speichern…
            </span>
          ) : (
            "Speichern"
          )}
        </button>
        {!isDirty && (
          <span className="text-xs text-gray-400">Keine Änderungen</span>
        )}
      </div>
    </form>
  );
}

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { Kostenart, Liegenschaft } from "../../types";
import { Spinner } from "../../components/ui/Spinner";
import { Badge } from "../../components/ui/Badge";
import { Modal, ConfirmModal } from "../../components/ui/Modal";
import { Tooltip } from "../../components/ui/Tooltip";

const verteilungsKeys = [
  "nutzeinheit",
  "m2_wohnflaeche",
  "personen",
  "verbrauch_kwh_heizung",
  "verbrauch_m3_warmwasser",
  "verbrauch_m3_kalt_plus_warm",
  "anzahl_rwm",
  "anzahl_kaltwasserzaehler",
  "miete_rwm",
  "direkt",
  "strom_kwh_direkt",
] as const;

/** Klartext für die Auswahl — beschreibt, was mit den Kosten passiert,
 *  nicht wie das Feld in der Datenbank heißt. */
const verteilungsLabels: Record<string, string> = {
  nutzeinheit: "Pro Wohnung — jede Wohnung zahlt gleich viel",
  m2_wohnflaeche: "Nach Wohnfläche — größere Wohnung zahlt mehr",
  personen: "Nach Personen — mehr Bewohner zahlen mehr",
  verbrauch_kwh_heizung: "Nach Heizungsverbrauch (kWh vom Zähler)",
  verbrauch_m3_warmwasser: "Nach Warmwasserverbrauch (m³ vom Zähler)",
  verbrauch_m3_kalt_plus_warm: "Nach Wasserverbrauch gesamt (kalt + warm)",
  anzahl_rwm: "Nach Anzahl Rauchwarnmelder",
  anzahl_kaltwasserzaehler: "Nach Anzahl Kaltwasserzähler",
  miete_rwm: "Nach Anzahl gemieteter Rauchwarnmelder",
  direkt: "Direkt zugeordnet — wird nicht aufgeteilt",
  strom_kwh_direkt: "Nach Stromverbrauch (kWh vom Zähler)",
};

const kategorieLabels: Record<string, string> = {
  brennstoff: "Brennstoff",
  heiznebenkosten: "Heiznebenkosten",
  heizung_zusatz: "Heizung Zusatz",
  warmwasser_zusatz: "Warmwasser Zusatz",
  hausnebenkosten: "Hausnebenkosten",
  strom_individuell: "Strom individuell",
};

const schema = z.object({
  name: z.string().min(1, "Pflichtfeld"),
  verteilungsschluessel: z.enum(verteilungsKeys),
  kategorie: z.enum([
    "brennstoff",
    "heiznebenkosten",
    "heizung_zusatz",
    "warmwasser_zusatz",
    "hausnebenkosten",
    "strom_individuell",
  ]),
  ist_brennstoff: z.boolean(),
  ist_heiz_zusatz: z.boolean(),
  ist_ww_zusatz: z.boolean(),
  aktiv: z.boolean(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  liegenschaftId: number;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function KostenartForm({
  initial,
  onSubmit,
  onCancel,
  isPending,
}: {
  initial?: Partial<FormData>;
  onSubmit: (d: FormData) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      verteilungsschluessel: "nutzeinheit",
      kategorie: "hausnebenkosten",
      ist_brennstoff: false,
      ist_heiz_zusatz: false,
      ist_ww_zusatz: false,
      aktiv: true,
      ...initial,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Name</label>
          <input className="input" {...register("name")} />
          {errors.name && <p className="error-msg">{errors.name.message}</p>}
        </div>
        <div>
          <label className="label">Wie werden diese Kosten aufgeteilt?</label>
          <select className="input" {...register("verteilungsschluessel")}>
            {verteilungsKeys.map((k) => (
              <option key={k} value={k}>
                {verteilungsLabels[k]}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-0.5">
            Fachbegriff: Verteilungsschlüssel
          </p>
        </div>
        <div>
          <label className="label">Kategorie</label>
          <select className="input" {...register("kategorie")}>
            {Object.entries(kategorieLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Eigenschaften</label>
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-0.5">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" {...register("ist_brennstoff")} className="w-4 h-4 rounded" />
              <span className="text-sm text-gray-700">Brennstoff</span>
              <Tooltip content="Markiert diese Kostenart als Brennstoffkosten (z.B. Öl, Gas). Die Heizkosten-Verordnung §9 Abs.2 verwendet den Brennstoffkostenbetrag zur Berechnung des Warmwasser-Anteils. Mindestens eine Kostenart pro Liegenschaft muss dieses Flag tragen." />
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" {...register("ist_heiz_zusatz")} className="w-4 h-4 rounded" />
              <span className="text-sm text-gray-700">Heizung Zusatz</span>
              <Tooltip content="Kosten, die dem Heizkosten-Pool zugeschlagen werden (z.B. Schornsteinfeger, Wartung Heizkessel). Diese Kosten werden zusammen mit den Brennstoffkosten auf Basis von Grundkosten % + Verbrauch verteilt." />
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" {...register("ist_ww_zusatz")} className="w-4 h-4 rounded" />
              <span className="text-sm text-gray-700">WW Zusatz</span>
              <Tooltip content="Kosten, die dem Warmwasser-Pool zugeschlagen werden (z.B. Legionellenprüfung, WW-Zirkulation). Diese Kosten werden nach m² Wohnfläche (Grundanteil) und m³ Warmwasserverbrauch (Verbrauchsanteil) aufgeteilt." />
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" {...register("aktiv")} className="w-4 h-4 rounded" />
              <span className="text-sm text-gray-700">Aktiv</span>
            </label>
          </div>
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

function DragHandle() {
  return (
    <svg
      className="w-4 h-4 text-gray-300 cursor-grab active:cursor-grabbing"
      fill="currentColor"
      viewBox="0 0 16 16"
    >
      <circle cx="5" cy="4" r="1.2" />
      <circle cx="11" cy="4" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="11" cy="8" r="1.2" />
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="11" cy="12" r="1.2" />
    </svg>
  );
}

export function KostenartenTab({ liegenschaftId, onSaved, onError }: Props) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Kostenart | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Kostenart | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const isSavingOrder = useRef(false);

  // Copy-to-Liegenschaften dialog
  const [copySource, setCopySource] = useState<{ data: FormData; sortierung: number } | null>(null);
  const [copyTargets, setCopyTargets] = useState<Record<number, boolean>>({});
  const [copyPending, setCopyPending] = useState(false);

  const { data: kostenarten = [], isLoading } = useQuery({
    queryKey: ["kostenarten", liegenschaftId],
    queryFn: () =>
      api.get<Kostenart[]>(`/liegenschaften/${liegenschaftId}/kostenarten`),
  });

  const { data: alleLiegenschaften = [] } = useQuery({
    queryKey: ["liegenschaften"],
    queryFn: () => api.get<Liegenschaft[]>("/liegenschaften"),
  });

  const andereLiegenschaften = alleLiegenschaften.filter((l) => l.id !== liegenschaftId);

  function buildPayload(k: Kostenart, sortierung: number) {
    return {
      name: k.name,
      verteilungsschluessel: k.verteilungsschluessel,
      kategorie: k.kategorie,
      ist_brennstoff: k.ist_brennstoff,
      ist_heiz_zusatz: k.ist_heiz_zusatz,
      ist_ww_zusatz: k.ist_ww_zusatz,
      sortierung,
      aktiv: k.aktiv,
      ist_voreinstellung: k.ist_voreinstellung,
    };
  }

  async function handleDrop(targetId: number) {
    if (!draggedId || draggedId === targetId || isSavingOrder.current) return;
    isSavingOrder.current = true;

    const items = [...kostenarten];
    const fromIdx = items.findIndex((k) => k.id === draggedId);
    const toIdx = items.findIndex((k) => k.id === targetId);
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);

    try {
      await Promise.all(
        items.map((item, i) =>
          api.put<Kostenart>(`/kostenarten/${item.id}`, buildPayload(item, (i + 1) * 10))
        )
      );
      qc.invalidateQueries({ queryKey: ["kostenarten", liegenschaftId] });
    } catch (e) {
      onError((e as Error).message);
    } finally {
      isSavingOrder.current = false;
      setDraggedId(null);
      setDragOverId(null);
    }
  }

  async function handleCreate(d: FormData) {
    const newSortierung = kostenarten.length > 0
      ? Math.max(...kostenarten.map((k) => k.sortierung)) + 10
      : 10;
    try {
      await api.post<Kostenart>(`/liegenschaften/${liegenschaftId}/kostenarten`, {
        ...d,
        sortierung: newSortierung,
      });
      qc.invalidateQueries({ queryKey: ["kostenarten", liegenschaftId] });
      setShowAdd(false);
      onSaved();
      // Open copy dialog if other Liegenschaften exist
      if (andereLiegenschaften.length > 0) {
        const init: Record<number, boolean> = {};
        andereLiegenschaften.forEach((l) => { init[l.id] = false; });
        setCopyTargets(init);
        setCopySource({ data: d, sortierung: newSortierung });
      }
    } catch (e) {
      onError((e as Error).message);
    }
  }

  async function handleCopyConfirm() {
    if (!copySource) return;
    setCopyPending(true);
    const targets = andereLiegenschaften.filter((l) => copyTargets[l.id]);
    try {
      await Promise.all(
        targets.map((l) =>
          api.post<Kostenart>(`/liegenschaften/${l.id}/kostenarten`, {
            ...copySource.data,
            sortierung: copySource.sortierung,
          })
        )
      );
      if (targets.length > 0) onSaved();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setCopyPending(false);
      setCopySource(null);
    }
  }

  async function handleUpdate(d: FormData) {
    if (!editTarget) return;
    try {
      await api.put<Kostenart>(`/kostenarten/${editTarget.id}`, {
        ...d,
        sortierung: editTarget.sortierung,
        ist_voreinstellung: editTarget.ist_voreinstellung,
      });
      qc.invalidateQueries({ queryKey: ["kostenarten", liegenschaftId] });
      setEditTarget(null);
      onSaved();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete<void>(`/kostenarten/${deleteTarget.id}`);
      qc.invalidateQueries({ queryKey: ["kostenarten", liegenschaftId] });
      setDeleteTarget(null);
      onSaved();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  if (isLoading)
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">
          {kostenarten.length} Kostenart{kostenarten.length !== 1 ? "en" : ""}
        </h3>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="btn btn-primary btn-sm"
          >
            + Neue Kostenart
          </button>
        )}
      </div>

      {showAdd && (
        <div className="card mb-4">
          <KostenartForm
            onSubmit={handleCreate}
            onCancel={() => setShowAdd(false)}
            isPending={false}
          />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-200">
              <th className="pb-2 pr-1 w-6" title="Reihenfolge per Drag & Drop ändern">
                <span className="sr-only">Sortierung</span>
              </th>
              <th className="pb-2 pr-2 font-medium text-gray-600 w-20">Typ</th>
              <th className="pb-2 pr-3 font-medium text-gray-600">Name</th>
              <th className="pb-2 pr-3 font-medium text-gray-600">Schlüssel</th>
              <th className="pb-2 pr-3 font-medium text-gray-600">Kategorie</th>
              <th className="pb-2 pr-3 font-medium text-gray-600">Flags</th>
              <th className="pb-2 font-medium text-gray-600">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {kostenarten.map((k) => (
              <tr
                key={k.id}
                draggable
                onDragStart={() => setDraggedId(k.id)}
                onDragOver={(e) => { e.preventDefault(); setDragOverId(k.id); }}
                onDrop={() => handleDrop(k.id)}
                onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                className={`border-b border-gray-100 transition-colors
                  ${!k.aktiv ? "opacity-50" : ""}
                  ${draggedId === k.id ? "opacity-40" : ""}
                  ${dragOverId === k.id && draggedId !== k.id
                    ? "bg-blue-50 border-t-2 border-t-blue-400"
                    : "hover:bg-gray-50"
                  }`}
              >
                <td className="py-2 pr-1">
                  <DragHandle />
                </td>
                <td className="py-2 pr-2">
                  <Badge variant={k.ist_voreinstellung ? "info" : "neutral"}>
                    {k.ist_voreinstellung ? "Standard" : "Custom"}
                  </Badge>
                </td>
                <td className="py-2 pr-3 font-medium text-gray-800">{k.name}</td>
                <td className="py-2 pr-3 text-xs text-gray-600">
                  {verteilungsLabels[k.verteilungsschluessel]}
                </td>
                <td className="py-2 pr-3 text-xs text-gray-600">
                  {kategorieLabels[k.kategorie]}
                </td>
                <td className="py-2 pr-3">
                  <div className="flex gap-1 flex-wrap">
                    {k.ist_brennstoff && (
                      <Badge variant="warning">Brennstoff</Badge>
                    )}
                    {k.ist_heiz_zusatz && (
                      <Badge variant="info">Heiz+</Badge>
                    )}
                    {k.ist_ww_zusatz && (
                      <Badge variant="blue">WW+</Badge>
                    )}
                  </div>
                </td>
                <td className="py-2">
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditTarget(k)}
                      className="btn btn-secondary btn-sm"
                    >
                      Bearbeiten
                    </button>
                    <button
                      onClick={() => setDeleteTarget(k)}
                      className="btn btn-danger btn-sm"
                    >
                      Löschen
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={editTarget !== null}
        title="Kostenart bearbeiten"
        onClose={() => setEditTarget(null)}
      >
        {editTarget && (
          <KostenartForm
            initial={{
              name: editTarget.name,
              verteilungsschluessel: editTarget.verteilungsschluessel,
              kategorie: editTarget.kategorie,
              ist_brennstoff: editTarget.ist_brennstoff,
              ist_heiz_zusatz: editTarget.ist_heiz_zusatz,
              ist_ww_zusatz: editTarget.ist_ww_zusatz,
              aktiv: editTarget.aktiv,
            }}
            onSubmit={handleUpdate}
            onCancel={() => setEditTarget(null)}
            isPending={false}
          />
        )}
      </Modal>

      <ConfirmModal
        open={deleteTarget !== null}
        title="Kostenart löschen"
        message={`Kostenart "${deleteTarget?.name}" wirklich löschen?`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Copy-to-Liegenschaften dialog */}
      <Modal
        open={copySource !== null}
        title="Kostenart auch für andere Liegenschaften?"
        onClose={() => setCopySource(null)}
      >
        <p className="text-sm text-gray-600 mb-4">
          Soll die Kostenart <strong>„{copySource?.data.name}"</strong> auch für folgende
          Liegenschaften angelegt werden?
        </p>
        <div className="space-y-2 mb-5">
          {andereLiegenschaften.map((l) => (
            <label key={l.id} className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 rounded"
                checked={!!copyTargets[l.id]}
                onChange={(e) =>
                  setCopyTargets((prev) => ({ ...prev, [l.id]: e.target.checked }))
                }
              />
              <span className="text-sm text-gray-800">
                {l.name}
                <span className="text-gray-400 ml-1 text-xs">
                  {l.adresse}, {l.ort}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopyConfirm}
            disabled={copyPending || !andereLiegenschaften.some((l) => copyTargets[l.id])}
            className="btn btn-primary btn-sm"
          >
            {copyPending ? "Wird angelegt…" : "Anlegen"}
          </button>
          <button onClick={() => setCopySource(null)} className="btn btn-secondary btn-sm">
            Überspringen
          </button>
        </div>
      </Modal>
    </div>
  );
}

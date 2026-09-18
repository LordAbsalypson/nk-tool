import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { Wohnung, Zaehler } from "../../types";
import { Spinner } from "../../components/ui/Spinner";
import { Badge } from "../../components/ui/Badge";
import { Modal, ConfirmModal } from "../../components/ui/Modal";
import { nachWohnungsnummer } from "../../utils/sort";

const schema = z.object({
  typ: z.enum(["waerme_kwh", "hkv_einheiten", "warmwasser_m3", "kaltwasser_m3", "strom_kwh"]),
  geraete_nummer: z.string().nullable().optional(),
  bezeichnung: z.string().nullable().optional(),
  eingebaut_am: z.string().nullable().optional(),
  aktiv: z.boolean(),
  ewe_vertragsnummer: z.string().nullable().optional(),
});

type FormData = z.infer<typeof schema>;

export const typLabels: Record<string, string> = {
  waerme_kwh: "Wärmemengenzähler (kWh)",
  hkv_einheiten: "Heizkostenverteiler (HKV, Einheiten)",
  warmwasser_m3: "Warmwasserzähler (m³)",
  kaltwasser_m3: "Kaltwasserzähler (m³)",
  strom_kwh: "Stromzähler (kWh)",
};

export const typEinheit: Record<string, string> = {
  waerme_kwh: "kWh",
  hkv_einheiten: "Einh.",
  warmwasser_m3: "m³",
  kaltwasser_m3: "m³",
  strom_kwh: "kWh",
};

export const HEIZUNG_TYPEN = ["waerme_kwh", "hkv_einheiten"];

interface Props {
  liegenschaftId: number;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function ZaehlerForm({
  initial,
  wohnung,
  onSubmit,
  onCancel,
  isPending,
}: {
  initial?: Partial<FormData>;
  wohnung: Wohnung;
  onSubmit: (d: FormData) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      typ: "waerme_kwh",
      geraete_nummer: "",
      bezeichnung: "",
      eingebaut_am: null,
      aktiv: true,
      ewe_vertragsnummer: "",
      ...initial,
    },
  });

  // EWE-Vertragsnummer ist nur bei Stromzählern relevant (Wasser und Wärme
  // laufen nicht über die EWE) — deshalb nur dort einblenden.
  const istStrom = watch("typ") === "strom_kwh";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Typ</label>
          <select className="input" {...register("typ")}>
            <option value="waerme_kwh">Wärmemengenzähler (kWh)</option>
            <option value="hkv_einheiten">Heizkostenverteiler (HKV, Einheiten)</option>
            <option value="warmwasser_m3">Warmwasserzähler (m³)</option>
            <option value="kaltwasser_m3">Kaltwasserzähler (m³)</option>
            {wohnung.strom_ueber_vermieter && (
              <option value="strom_kwh">Stromzähler (kWh)</option>
            )}
          </select>
          {!wohnung.strom_ueber_vermieter && (
            <p className="text-xs text-gray-400 mt-1">
              Stromzähler nur bei aktiviertem "Strom über Vermieter"
            </p>
          )}
          {errors.typ && <p className="error-msg">{errors.typ.message}</p>}
        </div>
        <div>
          <label className="label">Gerätenummer</label>
          <input className="input" {...register("geraete_nummer")} />
        </div>
        <div>
          <label className="label">Bezeichnung</label>
          <input className="input" {...register("bezeichnung")} />
        </div>
        <div>
          <label className="label">Eingebaut am</label>
          <input type="date" className="input" {...register("eingebaut_am")} />
        </div>
        <div className="flex items-center gap-2 mt-5">
          <input
            type="checkbox"
            id="aktiv_z"
            {...register("aktiv")}
            className="w-4 h-4"
          />
          <label htmlFor="aktiv_z" className="label mb-0 cursor-pointer">
            Aktiv
          </label>
        </div>
        {istStrom && (
          <div className="col-span-2">
            <label className="label">
              EWE-Vertragsnummer{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              className="input"
              placeholder="z. B. 1003384777"
              {...register("ewe_vertragsnummer")}
            />
            <p className="text-xs text-gray-400 mt-0.5">
              Nur zum Nachschlagen — hat keinen Einfluss auf die Abrechnung.
            </p>
          </div>
        )}
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

function ZaehlerGruppe({
  label,
  zaehler,
  onEdit,
  onDelete,
}: {
  label: string;
  zaehler: Zaehler[];
  wohnung: Wohnung;
  onEdit: (z: Zaehler) => void;
  onDelete: (z: Zaehler) => void;
}) {
  const [open, setOpen] = useState(true);
  if (zaehler.length === 0) return null;

  // EWE-Spalte nur zeigen, wenn in dieser Gruppe überhaupt Stromzähler sind
  const zeigeEwe = zaehler.some((z) => z.typ === "strom_kwh");

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 hover:text-gray-700"
      >
        <span>{open ? "▼" : "▶"}</span>
        {label}
        <span className="font-normal text-gray-400 normal-case tracking-normal ml-1">
          ({zaehler.length})
        </span>
      </button>
      {open && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-100">
              <th className="pb-1 pr-3 text-xs font-medium text-gray-500">Typ</th>
              <th className="pb-1 pr-3 text-xs font-medium text-gray-500">Gerätenr.</th>
              <th className="pb-1 pr-3 text-xs font-medium text-gray-500">Bezeichnung</th>
              <th className="pb-1 pr-3 text-xs font-medium text-gray-500">Eingebaut</th>
              {zeigeEwe && (
                <th className="pb-1 pr-3 text-xs font-medium text-gray-500">EWE-Vertrag</th>
              )}
              <th className="pb-1 pr-3 text-xs font-medium text-gray-500">Status</th>
              <th className="pb-1"></th>
            </tr>
          </thead>
          <tbody>
            {zaehler.map((z) => (
              <tr
                key={z.id}
                className={`border-b border-gray-50 ${!z.aktiv ? "opacity-50" : ""}`}
              >
                <td className="py-1.5 pr-3">{typLabels[z.typ] ?? z.typ}</td>
                <td className="py-1.5 pr-3">{z.geraete_nummer ?? "—"}</td>
                <td className="py-1.5 pr-3">{z.bezeichnung ?? "—"}</td>
                <td className="py-1.5 pr-3">{z.eingebaut_am ?? "—"}</td>
                {zeigeEwe && (
                  <td className="py-1.5 pr-3">
                    {z.ewe_vertragsnummer ? (
                      <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded font-mono">
                        {z.ewe_vertragsnummer}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                )}
                <td className="py-1.5 pr-3">
                  <Badge variant={z.aktiv ? "success" : "neutral"}>
                    {z.aktiv ? "Aktiv" : "Inaktiv"}
                  </Badge>
                </td>
                <td className="py-1.5">
                  <div className="flex gap-1">
                    <button onClick={() => onEdit(z)} className="btn btn-secondary btn-sm">
                      Bearbeiten
                    </button>
                    <button onClick={() => onDelete(z)} className="btn btn-danger btn-sm">
                      Löschen
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function WohnungGroup({
  wohnung,
  onSaved,
  onError,
}: {
  wohnung: Wohnung;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Zaehler | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Zaehler | null>(null);

  const { data: zaehler = [], isLoading } = useQuery({
    queryKey: ["zaehler", wohnung.id],
    queryFn: () => api.get<Zaehler[]>(`/wohnungen/${wohnung.id}/zaehler`),
  });

  const createMutation = useMutation({
    mutationFn: (d: FormData) =>
      api.post<Zaehler>(`/wohnungen/${wohnung.id}/zaehler`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zaehler", wohnung.id] });
      setShowAdd(false);
      onSaved();
    },
    onError: (e: Error) => onError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) =>
      api.put<Zaehler>(`/zaehler/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zaehler", wohnung.id] });
      setEditTarget(null);
      onSaved();
    },
    onError: (e: Error) => onError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete<void>(`/zaehler/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zaehler", wohnung.id] });
      setDeleteTarget(null);
      onSaved();
    },
    onError: (e: Error) => onError(e.message),
  });

  const heizungZaehler = zaehler.filter((z) => HEIZUNG_TYPEN.includes(z.typ));
  const wasserZaehler = zaehler.filter(
    (z) => z.typ === "warmwasser_m3" || z.typ === "kaltwasser_m3"
  );
  const stromZaehler = zaehler.filter((z) => z.typ === "strom_kwh");

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-gray-800 text-sm">
          {wohnung.bezeichnung}{" "}
          {wohnung.strom_ueber_vermieter && (
            <span className="ml-1">
              <Badge variant="blue">Strom</Badge>
            </span>
          )}
        </h4>
        <button onClick={() => setShowAdd(true)} className="btn btn-secondary btn-sm">
          + Zähler
        </button>
      </div>

      {isLoading ? (
        <Spinner size="sm" />
      ) : zaehler.length === 0 ? (
        <p className="text-xs text-gray-400">Keine Zähler erfasst</p>
      ) : (
        <>
          <ZaehlerGruppe
            label="Heizung"
            zaehler={heizungZaehler}
            wohnung={wohnung}
            onEdit={setEditTarget}
            onDelete={setDeleteTarget}
          />
          <ZaehlerGruppe
            label="Wasser"
            zaehler={wasserZaehler}
            wohnung={wohnung}
            onEdit={setEditTarget}
            onDelete={setDeleteTarget}
          />
          <ZaehlerGruppe
            label="Strom"
            zaehler={stromZaehler}
            wohnung={wohnung}
            onEdit={setEditTarget}
            onDelete={setDeleteTarget}
          />
        </>
      )}

      <Modal
        open={showAdd}
        title={`Zähler – ${wohnung.bezeichnung}`}
        onClose={() => setShowAdd(false)}
      >
        <ZaehlerForm
          wohnung={wohnung}
          onSubmit={(d) => createMutation.mutate(d)}
          onCancel={() => setShowAdd(false)}
          isPending={createMutation.isPending}
        />
      </Modal>

      <Modal
        open={editTarget !== null}
        title="Zähler bearbeiten"
        onClose={() => setEditTarget(null)}
      >
        {editTarget && (
          <ZaehlerForm
            wohnung={wohnung}
            initial={{
              typ: editTarget.typ,
              geraete_nummer: editTarget.geraete_nummer,
              bezeichnung: editTarget.bezeichnung,
              eingebaut_am: editTarget.eingebaut_am,
              aktiv: editTarget.aktiv,
              ewe_vertragsnummer: editTarget.ewe_vertragsnummer ?? "",
            }}
            onSubmit={(d) => updateMutation.mutate({ id: editTarget.id, data: d })}
            onCancel={() => setEditTarget(null)}
            isPending={updateMutation.isPending}
          />
        )}
      </Modal>

      <ConfirmModal
        open={deleteTarget !== null}
        title="Zähler löschen"
        message={`Zähler "${deleteTarget?.geraete_nummer ?? deleteTarget?.bezeichnung ?? deleteTarget?.typ}" wirklich löschen?`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export function ZaehlerTab({ liegenschaftId, onSaved, onError }: Props) {
  const { data: wohnungen = [], isLoading } = useQuery({
    queryKey: ["wohnungen", liegenschaftId],
    queryFn: () =>
      api.get<Wohnung[]>(`/liegenschaften/${liegenschaftId}/wohnungen`),
    select: nachWohnungsnummer,
  });

  if (isLoading)
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );

  if (wohnungen.length === 0)
    return (
      <p className="text-sm text-gray-400">Bitte zuerst Wohnungen anlegen.</p>
    );

  return (
    <div>
      {wohnungen.map((w) => (
        <WohnungGroup key={w.id} wohnung={w} onSaved={onSaved} onError={onError} />
      ))}
    </div>
  );
}

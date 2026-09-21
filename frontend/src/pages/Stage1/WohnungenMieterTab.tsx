import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  InformationCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { api } from "../../api/client";
import type { Wohnung, Mieter, Zaehler } from "../../types";
import { Spinner } from "../../components/ui/Spinner";
import { Badge } from "../../components/ui/Badge";
import { Modal, ConfirmModal } from "../../components/ui/Modal";
import { WohnungAssistent } from "../../components/ui/WohnungAssistent";
import { nachWohnungsnummer } from "../../utils/sort";
import { typLabels, HEIZUNG_TYPEN } from "./zaehlerConstants";

// ── Wohnung bearbeiten (im Detail-Popup) ─────────────────────────────────────

const wohnungSchema = z.object({
  bezeichnung: z.string().min(1, "Pflichtfeld"),
  flaeche_m2: z.preprocess(Number, z.number().positive("Muss > 0 sein")),
  anzahl_rwm: z.preprocess(Number, z.number().int().min(0)),
  strom_ueber_vermieter: z.boolean(),
  strom_preis_kwh: z.preprocess(
    (v) => (v === "" || v === null ? null : Number(v)),
    z.number().positive().nullable()
  ),
  strom_bezug_ab: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  sortierung: z.preprocess(Number, z.number().int().min(0)),
  aktiv: z.boolean(),
});
type WohnungFormData = z.infer<typeof wohnungSchema>;

function WohnungForm({
  initial,
  onSubmit,
  isPending,
}: {
  initial: WohnungFormData;
  onSubmit: (d: WohnungFormData) => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = useForm<z.input<typeof wohnungSchema>, unknown, WohnungFormData>({
    resolver: zodResolver(wohnungSchema),
    defaultValues: initial,
  });
  const stromUeberVermieter = watch("strom_ueber_vermieter");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Bezeichnung</label>
          <input className="input" {...register("bezeichnung")} />
          {errors.bezeichnung && <p className="error-msg">{errors.bezeichnung.message}</p>}
        </div>
        <div>
          <label className="label">Fläche m²</label>
          <input type="number" step="0.01" className="input" {...register("flaeche_m2")} />
          {errors.flaeche_m2 && <p className="error-msg">{errors.flaeche_m2.message}</p>}
        </div>
        <div>
          <label className="label">RWM-Anzahl</label>
          <input type="number" className="input" {...register("anzahl_rwm")} />
        </div>
        <div>
          <label className="label">Sortierung</label>
          <input type="number" className="input" {...register("sortierung")} />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="aktiv" {...register("aktiv")} className="w-4 h-4" />
          <label htmlFor="aktiv" className="label mb-0 cursor-pointer">Aktiv</label>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="strom"
            {...register("strom_ueber_vermieter")}
            className="w-4 h-4"
          />
          <label htmlFor="strom" className="label mb-0 cursor-pointer">Strom über Vermieter</label>
        </div>
        {stromUeberVermieter && (
          <>
            <div>
              <label className="label">Preis (€/kWh)</label>
              <input type="number" step="0.0001" className="input" {...register("strom_preis_kwh")} />
              {errors.strom_preis_kwh && <p className="error-msg">{errors.strom_preis_kwh.message}</p>}
            </div>
            <div>
              <label className="label">Strombezug ab</label>
              <input type="date" className="input" {...register("strom_bezug_ab")} />
              <p className="text-xs text-gray-400 mt-0.5">
                Ab wann der Vermieter den Strom für diese Wohnung bezieht/abrechnet.
              </p>
            </div>
          </>
        )}
      </div>
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={isPending || !isDirty} className="btn btn-primary btn-sm">
          {isPending ? "Speichern…" : "Wohnungsdaten speichern"}
        </button>
      </div>
    </form>
  );
}

// ── Zähler (im Detail-Popup) ──────────────────────────────────────────────────

const zaehlerSchema = z.object({
  typ: z.enum(["waerme_kwh", "hkv_einheiten", "warmwasser_m3", "kaltwasser_m3", "strom_kwh"]),
  geraete_nummer: z.string().nullable().optional(),
  bezeichnung: z.string().nullable().optional(),
  eingebaut_am: z.string().nullable().optional(),
  aktiv: z.boolean(),
  ewe_vertragsnummer: z.string().nullable().optional(),
});
type ZaehlerFormData = z.infer<typeof zaehlerSchema>;

function ZaehlerForm({
  initial,
  wohnung,
  onSubmit,
  onCancel,
  isPending,
}: {
  initial?: Partial<ZaehlerFormData>;
  wohnung: Wohnung;
  onSubmit: (d: ZaehlerFormData) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    watch,
  } = useForm<ZaehlerFormData>({
    resolver: zodResolver(zaehlerSchema),
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
            {wohnung.strom_ueber_vermieter && <option value="strom_kwh">Stromzähler (kWh)</option>}
          </select>
          {!wohnung.strom_ueber_vermieter && (
            <p className="text-xs text-gray-400 mt-1">
              Stromzähler nur bei aktiviertem "Strom über Vermieter"
            </p>
          )}
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
          <input type="checkbox" id="aktiv_z" {...register("aktiv")} className="w-4 h-4" />
          <label htmlFor="aktiv_z" className="label mb-0 cursor-pointer">Aktiv</label>
        </div>
        {istStrom && (
          <div className="col-span-2">
            <label className="label">
              EWE-Vertragsnummer <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input className="input" placeholder="z. B. 1003384777" {...register("ewe_vertragsnummer")} />
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
  onEdit: (z: Zaehler) => void;
  onDelete: (z: Zaehler) => void;
}) {
  const [open, setOpen] = useState(true);
  if (zaehler.length === 0) return null;
  const zeigeEwe = zaehler.some((z) => z.typ === "strom_kwh");

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 hover:text-gray-700"
      >
        {open ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />}
        {label}
        <span className="font-normal text-gray-400 normal-case tracking-normal ml-1">({zaehler.length})</span>
      </button>
      {open && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-100">
              <th className="pb-1 pr-3 text-xs font-medium text-gray-500">Typ</th>
              <th className="pb-1 pr-3 text-xs font-medium text-gray-500">Gerätenr.</th>
              <th className="pb-1 pr-3 text-xs font-medium text-gray-500">Bezeichnung</th>
              <th className="pb-1 pr-3 text-xs font-medium text-gray-500">Eingebaut</th>
              {zeigeEwe && <th className="pb-1 pr-3 text-xs font-medium text-gray-500">EWE-Vertrag</th>}
              <th className="pb-1 pr-3 text-xs font-medium text-gray-500">Status</th>
              <th className="pb-1"></th>
            </tr>
          </thead>
          <tbody>
            {zaehler.map((z) => (
              <tr key={z.id} className={`border-b border-gray-50 ${!z.aktiv ? "opacity-50" : ""}`}>
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
                  <Badge variant={z.aktiv ? "success" : "neutral"}>{z.aktiv ? "Aktiv" : "Inaktiv"}</Badge>
                </td>
                <td className="py-1.5">
                  <div className="flex gap-1">
                    <button onClick={() => onEdit(z)} className="btn btn-secondary btn-sm">Bearbeiten</button>
                    <button onClick={() => onDelete(z)} className="btn btn-danger btn-sm">Löschen</button>
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

/** Wohnungs-Detailpopup: Stammdaten der Wohnung + zugehörige Zähler an einem Ort.
 *  Ersetzt den früheren eigenständigen "Zähler"-Tab — die Zähler-Daten selbst
 *  bleiben unverändert in der DB, nur der Bedienort ändert sich. */
function WohnungDetailPopup({
  wohnung,
  onClose,
  onSaved,
  onError,
}: {
  wohnung: Wohnung | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [showAddZaehler, setShowAddZaehler] = useState(false);
  const [editZaehler, setEditZaehler] = useState<Zaehler | null>(null);
  const [deleteZaehler, setDeleteZaehler] = useState<Zaehler | null>(null);

  const { data: zaehler = [], isLoading } = useQuery({
    queryKey: ["zaehler", wohnung?.id],
    queryFn: () => api.get<Zaehler[]>(`/wohnungen/${wohnung!.id}/zaehler`),
    enabled: wohnung !== null,
  });

  const wohnungUpdate = useMutation({
    mutationFn: (d: WohnungFormData) => api.put<Wohnung>(`/wohnungen/${wohnung!.id}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wohnungen"] });
      onSaved();
    },
    onError: (e: Error) => onError(e.message),
  });

  const invalidateZaehler = () => qc.invalidateQueries({ queryKey: ["zaehler", wohnung?.id] });

  const createZaehler = useMutation({
    mutationFn: (d: ZaehlerFormData) => api.post<Zaehler>(`/wohnungen/${wohnung!.id}/zaehler`, d),
    onSuccess: () => { invalidateZaehler(); setShowAddZaehler(false); onSaved(); },
    onError: (e: Error) => onError(e.message),
  });
  const updateZaehler = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ZaehlerFormData }) => api.put<Zaehler>(`/zaehler/${id}`, data),
    onSuccess: () => { invalidateZaehler(); setEditZaehler(null); onSaved(); },
    onError: (e: Error) => onError(e.message),
  });
  const deleteZaehlerMut = useMutation({
    mutationFn: (id: number) => api.delete<void>(`/zaehler/${id}`),
    onSuccess: () => { invalidateZaehler(); setDeleteZaehler(null); onSaved(); },
    onError: (e: Error) => onError(e.message),
  });

  if (!wohnung) return null;
  const heizungZaehler = zaehler.filter((z) => HEIZUNG_TYPEN.includes(z.typ));
  const wasserZaehler = zaehler.filter((z) => z.typ === "warmwasser_m3" || z.typ === "kaltwasser_m3");
  const stromZaehler = zaehler.filter((z) => z.typ === "strom_kwh");

  return (
    <Modal open size="xl" title={`Wohnung — ${wohnung.bezeichnung}`} onClose={onClose}>
      <div className="space-y-6">
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Stammdaten</h3>
          <WohnungForm
            initial={{
              bezeichnung: wohnung.bezeichnung,
              flaeche_m2: wohnung.flaeche_m2,
              anzahl_rwm: wohnung.anzahl_rwm,
              strom_ueber_vermieter: wohnung.strom_ueber_vermieter,
              strom_preis_kwh: wohnung.strom_preis_kwh,
              strom_bezug_ab: wohnung.strom_bezug_ab,
              sortierung: wohnung.sortierung,
              aktiv: wohnung.aktiv,
            }}
            onSubmit={(d) => wohnungUpdate.mutate(d)}
            isPending={wohnungUpdate.isPending}
          />
        </section>

        <section className="pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Zähler</h3>
            <button onClick={() => setShowAddZaehler(true)} className="btn btn-secondary btn-sm">
              + Zähler zuweisen
            </button>
          </div>
          {isLoading ? (
            <Spinner size="sm" />
          ) : zaehler.length === 0 ? (
            <p className="text-xs text-gray-400">Keine Zähler erfasst</p>
          ) : (
            <>
              <ZaehlerGruppe label="Heizung" zaehler={heizungZaehler} onEdit={setEditZaehler} onDelete={setDeleteZaehler} />
              <ZaehlerGruppe label="Wasser" zaehler={wasserZaehler} onEdit={setEditZaehler} onDelete={setDeleteZaehler} />
              <ZaehlerGruppe label="Strom" zaehler={stromZaehler} onEdit={setEditZaehler} onDelete={setDeleteZaehler} />
            </>
          )}

          {showAddZaehler && (
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <ZaehlerForm
                wohnung={wohnung}
                onSubmit={(d) => createZaehler.mutate(d)}
                onCancel={() => setShowAddZaehler(false)}
                isPending={createZaehler.isPending}
              />
            </div>
          )}
        </section>
      </div>

      <Modal open={editZaehler !== null} title="Zähler bearbeiten" onClose={() => setEditZaehler(null)}>
        {editZaehler && (
          <ZaehlerForm
            wohnung={wohnung}
            initial={{
              typ: editZaehler.typ,
              geraete_nummer: editZaehler.geraete_nummer,
              bezeichnung: editZaehler.bezeichnung,
              eingebaut_am: editZaehler.eingebaut_am,
              aktiv: editZaehler.aktiv,
              ewe_vertragsnummer: editZaehler.ewe_vertragsnummer ?? "",
            }}
            onSubmit={(d) => updateZaehler.mutate({ id: editZaehler.id, data: d })}
            onCancel={() => setEditZaehler(null)}
            isPending={updateZaehler.isPending}
          />
        )}
      </Modal>

      <ConfirmModal
        open={deleteZaehler !== null}
        title="Zähler löschen"
        message={`Zähler "${deleteZaehler?.geraete_nummer ?? deleteZaehler?.bezeichnung ?? deleteZaehler?.typ}" wirklich löschen?`}
        onConfirm={() => deleteZaehler && deleteZaehlerMut.mutate(deleteZaehler.id)}
        onClose={() => setDeleteZaehler(null)}
      />
    </Modal>
  );
}

// ── Mieter (unter jeder Wohnung) ──────────────────────────────────────────────

const mieterSchema = z.object({
  anzeigename: z.string().min(1, "Pflichtfeld"),
  einzug_datum: z.string().min(1, "Pflichtfeld"),
  auszug_datum: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  anzahl_personen: z.preprocess(Number, z.number().int().min(1)),
  monatliche_vorauszahlung: z.preprocess(Number, z.number().min(0)),
  ist_leerstand: z.boolean(),
  notizen: z.string().nullable().optional(),
});
type MieterFormData = z.infer<typeof mieterSchema>;

function isAktiv(m: Mieter): boolean {
  if (m.auszug_datum === null) return true;
  return new Date(m.auszug_datum) >= new Date();
}
function fmtDate(iso: string | null) {
  if (!iso) return "heute";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function MieterwechselHinweis({ mieter }: { mieter: Mieter[] }) {
  const aktive = mieter.filter((m) => !m.ist_leerstand);
  if (aktive.length <= 1) return null;
  return (
    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex items-center gap-1.5 mb-2">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-500 shrink-0">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
        </svg>
        <span className="text-xs font-semibold text-amber-800">Mieterwechsel erkannt</span>
      </div>
      <div className="space-y-1">
        {aktive.slice().sort((a, b) => a.einzug_datum.localeCompare(b.einzug_datum)).map((m) => (
          <div key={m.id} className="flex items-center gap-2 text-xs text-amber-700">
            <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <span className="font-medium">{m.anzeigename}</span>
            <span className="text-amber-500">{fmtDate(m.einzug_datum)} – {fmtDate(m.auszug_datum)}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-amber-600 mt-2">
        Bei der Abrechnung wird der Gesamtverbrauch anteilig nach Mietdauer (Tagessatz) auf alle Mieter verteilt.
      </p>
    </div>
  );
}

function MieterForm({
  initial,
  onSubmit,
  onCancel,
  isPending,
}: {
  initial?: Partial<MieterFormData>;
  onSubmit: (d: MieterFormData) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof mieterSchema>, unknown, MieterFormData>({
    resolver: zodResolver(mieterSchema),
    defaultValues: {
      anzeigename: "",
      einzug_datum: "",
      auszug_datum: null,
      anzahl_personen: 1,
      monatliche_vorauszahlung: 0,
      ist_leerstand: false,
      notizen: "",
      ...initial,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Anzeigename</label>
          <input className="input" {...register("anzeigename")} />
          {errors.anzeigename && <p className="error-msg">{errors.anzeigename.message}</p>}
        </div>
        <div className="flex items-center gap-2 mt-5">
          <input type="checkbox" id="leerstand" {...register("ist_leerstand")} className="w-4 h-4" />
          <label htmlFor="leerstand" className="label mb-0 cursor-pointer">Leerstand</label>
        </div>
        <div>
          <label className="label">Einzug</label>
          <input type="date" className="input" {...register("einzug_datum")} />
          {errors.einzug_datum && <p className="error-msg">{errors.einzug_datum.message}</p>}
        </div>
        <div>
          <label className="label">Auszug (leer = aktuell)</label>
          <input type="date" className="input" {...register("auszug_datum")} />
        </div>
        <div>
          <label className="label">Personen</label>
          <input type="number" className="input" {...register("anzahl_personen")} />
        </div>
        <div>
          <label className="label">Vorauszahlung (€/Monat)</label>
          <input type="number" step="0.01" className="input" {...register("monatliche_vorauszahlung")} />
        </div>
        <div className="col-span-2">
          <label className="label">Notizen</label>
          <textarea rows={2} className="input" {...register("notizen")} />
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

// ── Eine Wohnungs-Karte: Kopf + Mieterliste ──────────────────────────────────

function WohnungCard({
  wohnung,
  onOpenDetail,
  onSaved,
  onError,
}: {
  wohnung: Wohnung;
  onOpenDetail: (w: Wohnung) => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Mieter | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Mieter | null>(null);

  const { data: mieter = [], isLoading } = useQuery({
    queryKey: ["mieter", wohnung.id],
    queryFn: () => api.get<Mieter[]>(`/wohnungen/${wohnung.id}/mieter`),
  });

  const createMutation = useMutation({
    mutationFn: (d: MieterFormData) => api.post<Mieter>(`/wohnungen/${wohnung.id}/mieter`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mieter", wohnung.id] }); setShowAdd(false); onSaved(); },
    onError: (e: Error) => onError(e.message),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: MieterFormData }) => api.put<Mieter>(`/mieter/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mieter", wohnung.id] }); setEditTarget(null); onSaved(); },
    onError: (e: Error) => onError(e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete<void>(`/mieter/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mieter", wohnung.id] }); setDeleteTarget(null); onSaved(); },
    onError: (e: Error) => onError(e.message),
  });

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-gray-800 text-sm">
            {wohnung.bezeichnung}{" "}
            <span className="text-gray-400 font-normal">({wohnung.flaeche_m2} m²)</span>
          </h4>
          {wohnung.strom_ueber_vermieter && <Badge variant="blue">Strom</Badge>}
          {!wohnung.aktiv && <Badge variant="neutral">Inaktiv</Badge>}
          <button
            onClick={() => onOpenDetail(wohnung)}
            className="text-gray-400 hover:text-blue-600"
            title="Wohnungsdetails, Stammdaten und Zähler bearbeiten"
          >
            <InformationCircleIcon className="w-4 h-4" />
          </button>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn btn-secondary btn-sm">+ Mieter</button>
      </div>

      {isLoading ? (
        <Spinner size="sm" />
      ) : mieter.length === 0 ? (
        <p className="text-xs text-gray-400">Keine Mieter erfasst</p>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-100">
                <th className="pb-1 pr-3 text-xs font-medium text-gray-500">Name</th>
                <th className="pb-1 pr-3 text-xs font-medium text-gray-500">Einzug</th>
                <th className="pb-1 pr-3 text-xs font-medium text-gray-500">Auszug</th>
                <th className="pb-1 pr-3 text-xs font-medium text-gray-500">Pers.</th>
                <th className="pb-1 pr-3 text-xs font-medium text-gray-500">Vorauszahlung</th>
                <th className="pb-1 text-xs font-medium text-gray-500">Status</th>
                <th className="pb-1"></th>
              </tr>
            </thead>
            <tbody>
              {mieter.map((m) => (
                <tr key={m.id} className="border-b border-gray-50">
                  <td className="py-1.5 pr-3">
                    {m.ist_leerstand ? <span className="text-gray-400 italic">Leerstand</span> : m.anzeigename}
                  </td>
                  <td className="py-1.5 pr-3">{fmtDate(m.einzug_datum)}</td>
                  <td className="py-1.5 pr-3">{m.auszug_datum ? fmtDate(m.auszug_datum) : "—"}</td>
                  <td className="py-1.5 pr-3">{m.ist_leerstand ? "—" : m.anzahl_personen}</td>
                  <td className="py-1.5 pr-3">
                    {m.ist_leerstand ? "—" : `${m.monatliche_vorauszahlung.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
                  </td>
                  <td className="py-1.5 pr-3">
                    {m.ist_leerstand ? (
                      <Badge variant="warning">Leerstand</Badge>
                    ) : isAktiv(m) ? (
                      <Badge variant="success">Aktuell</Badge>
                    ) : (
                      <Badge variant="neutral">Ausgezogen</Badge>
                    )}
                  </td>
                  <td className="py-1.5">
                    <div className="flex gap-1">
                      <button onClick={() => setEditTarget(m)} className="btn btn-secondary btn-sm">Bearbeiten</button>
                      <button onClick={() => setDeleteTarget(m)} className="btn btn-danger btn-sm">Löschen</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <MieterwechselHinweis mieter={mieter} />
        </>
      )}

      <Modal open={showAdd} title={`Mieter – ${wohnung.bezeichnung}`} onClose={() => setShowAdd(false)}>
        <MieterForm onSubmit={(d) => createMutation.mutate(d)} onCancel={() => setShowAdd(false)} isPending={createMutation.isPending} />
      </Modal>

      <Modal open={editTarget !== null} title="Mieter bearbeiten" onClose={() => setEditTarget(null)}>
        {editTarget && (
          <MieterForm
            initial={{
              anzeigename: editTarget.anzeigename,
              einzug_datum: editTarget.einzug_datum,
              auszug_datum: editTarget.auszug_datum,
              anzahl_personen: editTarget.anzahl_personen,
              monatliche_vorauszahlung: editTarget.monatliche_vorauszahlung,
              ist_leerstand: editTarget.ist_leerstand,
              notizen: editTarget.notizen,
            }}
            onSubmit={(d) => updateMutation.mutate({ id: editTarget.id, data: d })}
            onCancel={() => setEditTarget(null)}
            isPending={updateMutation.isPending}
          />
        )}
      </Modal>

      <ConfirmModal
        open={deleteTarget !== null}
        title="Mieter löschen"
        message={`Mieter "${deleteTarget?.anzeigename}" wirklich löschen?`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────

interface Props {
  liegenschaftId: number;
  onSaved: () => void;
  onError: (msg: string) => void;
}

export function WohnungenMieterTab({ liegenschaftId, onSaved, onError }: Props) {
  const [showAssistent, setShowAssistent] = useState(false);
  const [detailWohnung, setDetailWohnung] = useState<Wohnung | null>(null);

  const { data: wohnungen = [], isLoading } = useQuery({
    queryKey: ["wohnungen", liegenschaftId],
    queryFn: () => api.get<Wohnung[]>(`/liegenschaften/${liegenschaftId}/wohnungen`),
    select: nachWohnungsnummer,
  });

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
          {wohnungen.length} Wohnung{wohnungen.length !== 1 ? "en" : ""}
        </h3>
        <button
          onClick={() => setShowAssistent(true)}
          className="btn btn-primary btn-sm"
          title="Wohnung, Mieter und Zähler in einem Durchgang anlegen"
        >
          + Wohnung anlegen
        </button>
      </div>

      <WohnungAssistent
        open={showAssistent}
        liegenschaftId={liegenschaftId}
        onClose={() => setShowAssistent(false)}
        onSaved={onSaved}
        onError={onError}
      />

      {wohnungen.length === 0 ? (
        <p className="text-sm text-gray-400">Noch keine Wohnungen angelegt.</p>
      ) : (
        wohnungen.map((w) => (
          <WohnungCard key={w.id} wohnung={w} onOpenDetail={setDetailWohnung} onSaved={onSaved} onError={onError} />
        ))
      )}

      <WohnungDetailPopup
        wohnung={detailWohnung}
        onClose={() => setDetailWohnung(null)}
        onSaved={onSaved}
        onError={onError}
      />
    </div>
  );
}

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BrowserRouter, useSearchParams } from "react-router-dom";
import { api, getAuthToken, setUnauthorizedHandler } from "./api/client";
import type { Liegenschaft } from "./types";
import { useToast } from "./hooks/useToast";
import { useDarkMode } from "./hooks/useDarkMode";
import { ToastList } from "./components/ui/Toast";
import { Modal, ConfirmModal } from "./components/ui/Modal";
import { GlossarModal } from "./components/ui/GlossarModal";
import { PdfVorlageModal } from "./components/ui/PdfVorlageModal";
import { TodoPanel } from "./components/ui/TodoPanel";
import { VerbundPanel } from "./components/ui/VerbundPanel";
import { DesktopSettingsModal } from "./components/ui/DesktopSettingsModal";
import { DbMissingOverlay } from "./components/ui/DbMissingOverlay";
import { LoginOverlay } from "./components/ui/LoginOverlay";
import { isDesktopApp, getDesktopApi } from "./hooks/getDesktopApi";
import { Spinner } from "./components/ui/Spinner";
import { GlobalSearch, type SuchZiel } from "./components/ui/GlobalSearch";
import { TopBar, type StageId } from "./components/layout/TopBar";
import { Sidebar } from "./components/layout/Sidebar";
import { Footer } from "./components/layout/Footer";
import Stage1 from "./pages/Stage1";
import Live from "./pages/Live";

const newLiegSchema = z.object({
  name: z.string().min(1, "Pflichtfeld"),
  adresse: z.string().min(1, "Pflichtfeld"),
  plz: z.string().min(4, "Ungültige PLZ"),
  ort: z.string().min(1, "Pflichtfeld"),
  heizungsart: z.enum(["oel", "gas_heizwert", "gas_brennwert", "waermepumpe"]),
  brennstoff_einheit: z.enum(["kwh", "liter_oel", "m3_gas"]),
});

type NewLiegForm = z.infer<typeof newLiegSchema>;

function NewLiegFormComponent({
  onSubmit,
  onCancel,
  isPending,
  initial,
}: {
  onSubmit: (d: NewLiegForm) => void;
  onCancel: () => void;
  isPending: boolean;
  initial?: Partial<NewLiegForm>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewLiegForm>({
    resolver: zodResolver(newLiegSchema),
    defaultValues: {
      heizungsart: "oel",
      brennstoff_einheit: "liter_oel",
      ...initial,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div>
        <label className="label">Name / Bezeichnung</label>
        <input className="input" {...register("name")} />
        {errors.name && <p className="error-msg">{errors.name.message}</p>}
      </div>
      <div>
        <label className="label">Adresse</label>
        <input className="input" {...register("adresse")} />
        {errors.adresse && (
          <p className="error-msg">{errors.adresse.message}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
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
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Heizungsart</label>
          <select className="input" {...register("heizungsart")}>
            <option value="oel">Öl</option>
            <option value="gas_heizwert">Gas (Heizwert)</option>
            <option value="gas_brennwert">Gas (Brennwert)</option>
            <option value="waermepumpe">Wärmepumpe</option>
          </select>
        </div>
        <div>
          <label className="label">Brennstoff-Einheit</label>
          <select className="input" {...register("brennstoff_einheit")}>
            <option value="kwh">kWh</option>
            <option value="liter_oel">Liter (Öl)</option>
            <option value="m3_gas">m³ (Gas)</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Weitere Details können nach dem Anlegen in Stage 1 bearbeitet werden.
      </p>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={isPending} className="btn btn-primary">
          {isPending ? (
            <span className="flex items-center gap-2">
              <Spinner size="sm" /> Speichern…
            </span>
          ) : (
            "Speichern"
          )}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function AppInner() {
  const qc = useQueryClient();
  const { toasts, addToast, removeToast } = useToast();
  const [dark, setDark] = useDarkMode();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [stage, setStage] = useState<StageId>(1);
  const [vzFocusMieterId, setVzFocusMieterId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showGlossar, setShowGlossar] = useState(false);
  const [showPdfVorlage, setShowPdfVorlage] = useState(false);
  const [showTodo, setShowTodo] = useState(false);
  const [showVerbund, setShowVerbund] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editTarget, setEditTarget] = useState<Liegenschaft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Liegenschaft | null>(null);
  const [, setParams] = useSearchParams();
  const [dbMissingPath, setDbMissingPath] = useState<string | null>(null);
  const [authNeeded, setAuthNeeded] = useState<boolean | null>(null); // null = wird geprüft

  useEffect(() => {
    if (!isDesktopApp()) return;
    const desktopApi = getDesktopApi();
    desktopApi.app_info().then((info) => {
      if (info.dbMissing) setDbMissingPath(info.dbPath);
    });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuthNeeded(true));
    api
      .get<{ protected: boolean }>("/auth/status")
      .then((status) => setAuthNeeded(status.protected && !getAuthToken()))
      .catch(() => setAuthNeeded(false));
    return () => setUnauthorizedHandler(null);
  }, []);

  const { data: liegenschaften = [], isLoading } = useQuery({
    queryKey: ["liegenschaften"],
    queryFn: () => api.get<Liegenschaft[]>("/liegenschaften"),
    enabled: authNeeded === false,
    select: (data) => {
      if (selectedId === null && data.length > 0) {
        setSelectedId(data[0].id);
      }
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (d: NewLiegForm) =>
      api.post<Liegenschaft>("/liegenschaften", d),
    onSuccess: (l) => {
      qc.invalidateQueries({ queryKey: ["liegenschaften"] });
      setSelectedId(l.id);
      setShowNew(false);
      setParams({ tab: "uebersicht" });
      addToast("success", `Liegenschaft „${l.name}" angelegt`);
    },
    onError: (e: Error) =>
      addToast("error", `Fehler beim Anlegen: ${e.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: NewLiegForm }) =>
      api.put<Liegenschaft>(`/liegenschaften/${id}`, data),
    onSuccess: (l) => {
      qc.invalidateQueries({ queryKey: ["liegenschaften"] });
      setEditTarget(null);
      addToast("success", `Liegenschaft „${l.name}" gespeichert`);
    },
    onError: (e: Error) =>
      addToast("error", `Fehler beim Speichern: ${e.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete<void>(`/liegenschaften/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["liegenschaften"] });
      const name = deleteTarget?.name;
      setDeleteTarget(null);
      if (selectedId === deleteTarget?.id) setSelectedId(null);
      addToast("success", `Liegenschaft „${name}" gelöscht`);
    },
    onError: (e: Error) =>
      addToast("error", `Fehler beim Löschen: ${e.message}`),
  });

  const selected = liegenschaften.find((l) => l.id === selectedId) ?? null;

  function handleSelect(id: number) {
    setSelectedId(id);
    setParams({ tab: "uebersicht" });
  }

  function handleEdit(id: number) {
    const l = liegenschaften.find((x) => x.id === id);
    if (l) setEditTarget(l);
  }

  function handleDelete(id: number) {
    const l = liegenschaften.find((x) => x.id === id);
    if (l) setDeleteTarget(l);
  }

  /** Sprung aus der globalen Suche: Liegenschaft, Stage, Tab und Periode in einem Rutsch. */
  function handleSuchNavigation(ziel: SuchZiel) {
    setSelectedId(ziel.liegenschaftId);
    setStage(ziel.stage as StageId);
    const params: Record<string, string> = { tab: ziel.tab };
    if (ziel.periodeId !== null) params.periode = String(ziel.periodeId);
    setParams(params);
  }

  if (dbMissingPath) {
    return <DbMissingOverlay dbPath={dbMissingPath} />;
  }

  if (authNeeded) {
    return <LoginOverlay onSuccess={() => setAuthNeeded(false)} />;
  }

  if (authNeeded === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar
        stage={stage}
        onStageChange={setStage}
        liegenschaftName={selected?.name}
        suche={
          <GlobalSearch
            onNavigate={handleSuchNavigation}
            onSaved={() => addToast("success", "Gespeichert")}
            onError={(msg) => addToast("error", `Fehler: ${msg}`)}
          />
        }
      />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          liegenschaften={liegenschaften}
          selected={selectedId}
          onSelect={handleSelect}
          onNew={() => setShowNew(true)}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onVerbund={() => setShowVerbund(true)}
          isLoading={isLoading}
        />
        <main className="flex flex-1 min-w-0 min-h-0">
          {selected === null ? (
            <div className="flex flex-1 items-center justify-center text-gray-400 text-sm flex-col gap-3">
              {isLoading ? (
                <Spinner />
              ) : liegenschaften.length === 0 && isDesktopApp() ? (
                <>
                  <p className="text-base text-gray-500 dark:text-gray-300">
                    Willkommen bei NK-Tool.
                  </p>
                  <p className="max-w-sm text-center">
                    Neu anfangen oder eine bestehende Datenbank aus einer früheren Installation
                    übernehmen?
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setShowNew(true)} className="btn btn-primary">
                      Erste Liegenschaft anlegen
                    </button>
                    <button onClick={() => setShowSettings(true)} className="btn btn-secondary">
                      Datenbank importieren …
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>Keine Liegenschaft ausgewählt.</p>
                  <button
                    onClick={() => setShowNew(true)}
                    className="btn btn-primary"
                  >
                    Erste Liegenschaft anlegen
                  </button>
                </>
              )}
            </div>
          ) : stage === 1 ? (
            <Stage1
              liegenschaft={selected}
              onSaved={() => addToast("success", "Gespeichert")}
              onError={(msg) => addToast("error", `Fehler: ${msg}`)}
              onGoToStage2={() => setStage(2)}
            />
          ) : (
            <Live
              key={selected.id}
              stage={stage as 2 | 3 | 4 | 5}
              liegenschaft={selected}
              onSaved={() => addToast("success", "Gespeichert")}
              onError={(msg) => addToast("error", `Fehler: ${msg}`)}
              vzFocusMieterId={vzFocusMieterId}
              onVzFocusConsumed={() => setVzFocusMieterId(null)}
              onGoToVorauszahlung={(mieterId) => {
                setVzFocusMieterId(mieterId);
                setStage(4);
              }}
            />
          )}
        </main>
      </div>

      {/* Neue Liegenschaft */}
      <Modal
        open={showNew}
        title="Neue Liegenschaft anlegen"
        onClose={() => setShowNew(false)}
      >
        <NewLiegFormComponent
          onSubmit={(d) => createMutation.mutate(d)}
          onCancel={() => setShowNew(false)}
          isPending={createMutation.isPending}
        />
      </Modal>

      {/* Liegenschaft bearbeiten */}
      <Modal
        open={editTarget !== null}
        title={`Liegenschaft bearbeiten — ${editTarget?.name ?? ""}`}
        onClose={() => setEditTarget(null)}
      >
        {editTarget && (
          <NewLiegFormComponent
            initial={{
              name: editTarget.name,
              adresse: editTarget.adresse,
              plz: editTarget.plz,
              ort: editTarget.ort,
              heizungsart: editTarget.heizungsart as NewLiegForm["heizungsart"],
              brennstoff_einheit: editTarget.brennstoff_einheit as NewLiegForm["brennstoff_einheit"],
            }}
            onSubmit={(d) => updateMutation.mutate({ id: editTarget.id, data: d })}
            onCancel={() => setEditTarget(null)}
            isPending={updateMutation.isPending}
          />
        )}
      </Modal>

      {/* Liegenschaft löschen */}
      <ConfirmModal
        open={deleteTarget !== null}
        title="Liegenschaft löschen"
        message={`Liegenschaft „${deleteTarget?.name}" und alle zugehörigen Daten (Wohnungen, Mieter, Zähler, Kostenpositionen, Abrechnung) unwiderruflich löschen?`}
        confirmLabel="Endgültig löschen"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />

      <Footer
        dark={dark}
        setDark={setDark}
        onGlossar={() => setShowGlossar(true)}
        onTodo={() => setShowTodo(true)}
        onPdfVorlage={() => setShowPdfVorlage(true)}
        onSettings={() => setShowSettings(true)}
      />

      <DesktopSettingsModal open={showSettings} onClose={() => setShowSettings(false)} />

      <GlossarModal open={showGlossar} onClose={() => setShowGlossar(false)} />

      <PdfVorlageModal
        open={showPdfVorlage}
        onClose={() => setShowPdfVorlage(false)}
        onSaved={() => addToast("success", "PDF-Vorlage gespeichert")}
        onError={(msg) => addToast("error", `Fehler: ${msg}`)}
      />

      <TodoPanel open={showTodo} onClose={() => setShowTodo(false)} />

      <VerbundPanel
        open={showVerbund}
        onClose={() => setShowVerbund(false)}
        liegenschaften={liegenschaften}
      />

      <ToastList toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}

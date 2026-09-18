import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { isDesktopApp, useDesktopApi } from "../../hooks/useDesktopApi";

interface DesktopSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const DOCS_LINKS = [
  { label: "README (Erste Schritte)", url: "https://github.com/LordAbsalypson/nk-tool#readme" },
  { label: "Funktionsumfang & Roadmap", url: "https://github.com/LordAbsalypson/nk-tool/blob/main/FEATURES_ROADMAP.md" },
  { label: "Architektur (für Entwickler)", url: "https://github.com/LordAbsalypson/nk-tool/blob/main/ARCHITECTURE.md" },
  { label: "Fehler melden / Feature vorschlagen", url: "https://github.com/LordAbsalypson/nk-tool/issues/new" },
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Einstellungen-Dialog der Desktop-App: Datenbank-Info, Import/Export/
 * Zurücksetzen, Doku-Links. Rendert nichts im Browser-Dev-Modus (dort gibt
 * es kein pywebview-Bridge und keine lokale Datei zum Verwalten). */
export function DesktopSettingsModal({ open, onClose }: DesktopSettingsModalProps) {
  const desktop = isDesktopApp();
  const api = desktop ? useDesktopApi() : null;

  const [info, setInfo] = useState<{ version: string; platform: string; dbPath: string; dbSizeBytes: number; dbLabel: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"new" | "reset" | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [editingLabel, setEditingLabel] = useState(false);

  useEffect(() => {
    if (open && api) {
      api.app_info().then((i) => {
        setInfo(i);
        setLabelDraft(i.dbLabel);
      }).catch(() => setInfo(null));
    }
    setError(null);
    setConfirmAction(null);
    setBusy(false);
    setRestarting(false);
    setEditingLabel(false);
  }, [open, api]);

  const saveLabel = async () => {
    if (!api) return;
    await api.set_db_label(labelDraft);
    setInfo((prev) => (prev ? { ...prev, dbLabel: labelDraft.trim() } : prev));
    setEditingLabel(false);
  };

  if (!open) return null;

  if (!desktop || !api) {
    return (
      <Modal open={open} title="Einstellungen" onClose={onClose}>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Datenbank-Verwaltung (Import/Export/Zurücksetzen) ist nur in der Desktop-App verfügbar,
          nicht im Browser-Dev-Modus.
        </p>
        <LinksSection openExternal={(url) => window.open(url, "_blank")} />
      </Modal>
    );
  }

  const handleImport = async () => {
    setError(null);
    const picked = await api.pick_import_file();
    if (!picked.path) return; // abgebrochen
    setBusy(true);
    const verify = await api.verify_import_file(picked.path);
    if (!verify.ok) {
      setBusy(false);
      setError(verify.error ?? "Datei ungültig.");
      return;
    }
    const result = await api.import_db(picked.path);
    if (!result.ok) {
      setBusy(false);
      setError(result.error ?? "Import fehlgeschlagen.");
      return;
    }
    setRestarting(true); // App startet jetzt neu (desktop/app.py::_schedule_restart)
  };

  const handleExport = async () => {
    setError(null);
    const dest = await api.pick_export_destination();
    if (!dest.path) return;
    setBusy(true);
    const result = await api.export_db(dest.path);
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Export fehlgeschlagen.");
  };

  const handleConfirmedAction = async () => {
    if (!confirmAction) return;
    setBusy(true);
    const result = confirmAction === "new" ? await api.create_new_db() : await api.reset_link();
    if (!result.ok) {
      setBusy(false);
      setError(result.error ?? "Aktion fehlgeschlagen.");
      return;
    }
    setRestarting(true);
  };

  return (
    <Modal open={open} title="Einstellungen" onClose={onClose}>
      <div className="space-y-5">
        {busy && (
          <div className="text-sm text-blue-600 dark:text-blue-400">
            {restarting ? "App wird neu gestartet …" : "Bitte warten …"}
          </div>
        )}

        {error && (
          <div className="text-sm bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded px-3 py-2">
            {error}
          </div>
        )}

        <section>
          <h3 className="text-sm font-semibold mb-2">Datenbank</h3>
          {info && (
            <div className="mb-3">
              {editingLabel ? (
                <div className="flex items-center gap-2 mb-1">
                  <input
                    className="input text-sm py-1"
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    placeholder="z. B. „Jeversche Str. 15+15A — echte Daten“"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && saveLabel()}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={saveLabel}>Speichern</button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">
                    {info.dbLabel || "Kein Name vergeben"}
                  </span>
                  <button
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    onClick={() => setEditingLabel(true)}
                  >
                    {info.dbLabel ? "Umbenennen" : "Namen vergeben"}
                  </button>
                </div>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 break-all">
                {info.dbPath} ({formatBytes(info.dbSizeBytes)})
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={handleImport}>
              Datenbank importieren …
            </button>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={handleExport}>
              Datenbank exportieren …
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Import ersetzt die aktive Datenbank — die bisherige wird archiviert, nicht gelöscht
            (<code>archive/</code> im App-Datenverzeichnis).
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold mb-2 text-red-600 dark:text-red-400">Zurücksetzen</h3>
          {confirmAction ? (
            <div className="text-sm space-y-2">
              <p>
                {confirmAction === "new"
                  ? "Neue, leere Datenbank anlegen? Die aktuelle wird archiviert (nicht gelöscht)."
                  : "Wirklich zurücksetzen? Die aktuelle Datenbank wird archiviert (nicht gelöscht), die App startet neu und zeigt wieder die Einrichtung."}
              </p>
              <div className="flex gap-2">
                <button className="btn btn-danger btn-sm" disabled={busy} onClick={handleConfirmedAction}>
                  Ja, fortfahren
                </button>
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setConfirmAction(null)}>
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setConfirmAction("new")}>
                Neue Datenbank anlegen
              </button>
              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setConfirmAction("reset")}>
                Verknüpfung zurücksetzen
              </button>
            </div>
          )}
        </section>

        <LinksSection openExternal={(url) => api.open_external(url)} />

        {info && (
          <p className="text-xs text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
            NK-Tool Desktop v{info.version} ({info.platform})
          </p>
        )}
      </div>
    </Modal>
  );
}

function LinksSection({ openExternal }: { openExternal: (url: string) => void }) {
  return (
    <section>
      <h3 className="text-sm font-semibold mb-2">Dokumentation &amp; Hilfe</h3>
      <ul className="space-y-1">
        {DOCS_LINKS.map((l) => (
          <li key={l.url}>
            <button
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              onClick={() => openExternal(l.url)}
            >
              {l.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

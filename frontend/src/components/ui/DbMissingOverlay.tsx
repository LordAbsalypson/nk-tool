import { useState } from "react";
import { getDesktopApi } from "../../hooks/getDesktopApi";

interface DbMissingOverlayProps {
  dbPath: string;
}

/** Blockierender Vollbild-Dialog, wenn die verknüpfte Datenbank-Datei beim
 * Start nicht gefunden wurde (umbenannt, verschoben, Laufwerk/iCloud nicht
 * verfügbar) — wie der "Datei suchen"/Link-Finder-Dialog bei Medien-
 * Schnittprogrammen, wenn ein verknüpftes Medium fehlt. Lässt absichtlich
 * KEINEN Zugriff auf die restliche App zu, bevor eine gültige Datei
 * verknüpft oder bewusst neu angelegt wurde — verhindert, dass jemand
 * versehentlich mit einer leeren Scratch-DB weiterarbeitet und das für die
 * echten Daten hält. */
export function DbMissingOverlay({ dbPath }: DbMissingOverlayProps) {
  const api = getDesktopApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLocate = async () => {
    setError(null);
    setBusy(true);
    const result = await api.locate_missing_file();
    if (!result.path) {
      setBusy(false);
      return; // abgebrochen
    }
    if (result.ok === false) {
      setBusy(false);
      setError(result.error ?? "Datei ungültig.");
      return;
    }
    // App startet neu (desktop/app.py::_schedule_restart), busy bleibt an.
  };

  const handleCreateHere = async () => {
    setError(null);
    setBusy(true);
    await api.create_at_missing_location();
  };

  const handleUseDefault = async () => {
    setError(null);
    setBusy(true);
    await api.use_default_location();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6">
        <h2 className="text-lg font-semibold mb-2">Datenbank nicht gefunden</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
          Die verknüpfte Datenbank-Datei wurde an dieser Stelle nicht gefunden:
        </p>
        <p className="text-xs font-mono bg-gray-100 dark:bg-gray-900 rounded px-2 py-1.5 mb-4 break-all">
          {dbPath}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Möglich: die Datei wurde umbenannt oder verschoben, ein Ordner ist noch nicht
          synchronisiert (z. B. iCloud), oder ein Laufwerk ist nicht eingesteckt.
        </p>

        {error && (
          <div className="text-sm bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button className="btn btn-primary" disabled={busy} onClick={handleLocate}>
            Datei suchen …
          </button>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={handleCreateHere}>
            Neue, leere Datenbank genau hier anlegen
          </button>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={handleUseDefault}>
            Stattdessen Standardspeicherort verwenden
          </button>
        </div>

        {busy && (
          <p className="text-xs text-gray-400 mt-3">Bitte warten — die App startet danach neu.</p>
        )}
      </div>
    </div>
  );
}

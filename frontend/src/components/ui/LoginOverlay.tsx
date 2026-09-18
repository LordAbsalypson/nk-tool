import { useState } from "react";
import { api, setAuthToken } from "../../api/client";

interface LoginOverlayProps {
  onSuccess: () => void;
}

interface LoginResponse {
  token: string;
  usedRecoveryCode: boolean;
}

/** Blockierender Vollbild-Login, wenn für diese Datenbank ein Passwort
 * gesetzt ist (siehe backend/routers/auth.py — "protected"). Läuft gegen die
 * REST-API, identisch ob Web-Browser oder Desktop-App: gleiche Funktion,
 * gleiche Datenbank, kein separater Code-Pfad. */
export function LoginOverlay({ onSuccess }: LoginOverlayProps) {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<LoginResponse>("/auth/login", { secret });
      setAuthToken(result.token);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6"
      >
        <h2 className="text-lg font-semibold mb-2">Passwort erforderlich</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Diese Datenbank ist mit einem Passwort geschützt.
        </p>

        {error && (
          <div className="text-sm bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded px-3 py-2 mb-3">
            {error}
          </div>
        )}

        <input
          type="password"
          className="input w-full mb-3"
          placeholder="Passwort oder Recovery-Code"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoFocus
        />

        <button type="submit" className="btn btn-primary w-full" disabled={busy || !secret}>
          {busy ? "Prüfe …" : "Anmelden"}
        </button>

        <p className="text-xs text-gray-400 mt-3">
          Passwort vergessen? Der beim Einrichten einmalig gezeigte Recovery-Code funktioniert
          hier ebenfalls als Anmeldung.
        </p>
      </form>
    </div>
  );
}

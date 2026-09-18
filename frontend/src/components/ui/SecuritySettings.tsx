import { useEffect, useState } from "react";
import { api, setAuthToken } from "../../api/client";

/** Passwort-Verwaltung für diese Datenbank — reine REST-Aufrufe (backend/
 * routers/auth.py), funktioniert identisch in Web-Browser und Desktop-App:
 * gleiche Datenbank, gleiche Funktion, kein separater Code-Pfad. Teil von
 * DesktopSettingsModal.tsx (trotz Namens dort auch im Browser-Dev-Modus
 * gerendert), aber als eigene Komponente, weil sie NICHT von der
 * pywebview-Brücke abhängt. */
export function SecuritySettings() {
  const [protectedState, setProtectedState] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  const [mode, setMode] = useState<"idle" | "setup" | "change" | "disable">("idle");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordRepeat, setNewPasswordRepeat] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");

  const refresh = () => {
    api.get<{ protected: boolean }>("/auth/status").then((s) => setProtectedState(s.protected));
  };

  useEffect(refresh, []);

  const resetForm = () => {
    setMode("idle");
    setNewPassword("");
    setNewPasswordRepeat("");
    setCurrentPassword("");
    setError(null);
  };

  const handleSetup = async () => {
    setError(null);
    if (newPassword.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen haben.");
      return;
    }
    if (newPassword !== newPasswordRepeat) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.post<{ token: string; recoveryCode: string }>("/auth/setup", {
        password: newPassword,
      });
      setAuthToken(result.token);
      setRecoveryCode(result.recoveryCode);
      resetForm();
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Einrichten fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  const handleChange = async () => {
    setError(null);
    if (newPassword.length < 8) {
      setError("Neues Passwort muss mindestens 8 Zeichen haben.");
      return;
    }
    if (newPassword !== newPasswordRepeat) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ändern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setError(null);
    setBusy(true);
    try {
      // /auth/disable braucht ein gültiges Token -> erst per Passwort einloggen,
      // um sicherzugehen, dass wirklich der/die Berechtigte deaktiviert.
      const login = await api.post<{ token: string }>("/auth/login", { secret: currentPassword });
      setAuthToken(login.token);
      await api.post("/auth/disable", {});
      setAuthToken(null);
      resetForm();
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deaktivieren fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  if (protectedState === null) return null;

  return (
    <section>
      <h3 className="text-sm font-semibold mb-2">Sicherheit</h3>

      {recoveryCode && (
        <div className="text-sm bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 rounded px-3 py-2 mb-3 space-y-1">
          <p className="font-medium">Recovery-Code — jetzt notieren, wird nie wieder angezeigt:</p>
          <p className="font-mono text-base tracking-wider">{recoveryCode}</p>
          <p className="text-xs">Funktioniert wie das Passwort, falls du es vergisst.</p>
          <button className="text-xs underline" onClick={() => setRecoveryCode(null)}>
            Verstanden, ausblenden
          </button>
        </div>
      )}

      {error && (
        <div className="text-sm bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded px-3 py-2 mb-3">
          {error}
        </div>
      )}

      {mode === "idle" && (
        <>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            {protectedState
              ? "Diese Datenbank ist mit einem Passwort geschützt."
              : "Kein Passwort gesetzt — diese Datenbank ist ohne Anmeldung erreichbar."}
          </p>
          <div className="flex flex-wrap gap-2">
            {!protectedState ? (
              <button className="btn btn-secondary btn-sm" onClick={() => setMode("setup")}>
                Passwort einrichten
              </button>
            ) : (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => setMode("change")}>
                  Passwort ändern
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setMode("disable")}>
                  Passwortschutz entfernen
                </button>
              </>
            )}
          </div>
        </>
      )}

      {mode === "setup" && (
        <div className="space-y-2">
          <input
            type="password"
            className="input w-full"
            placeholder="Neues Passwort (mind. 8 Zeichen)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <input
            type="password"
            className="input w-full"
            placeholder="Passwort wiederholen"
            value={newPasswordRepeat}
            onChange={(e) => setNewPasswordRepeat(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={handleSetup}>
              Einrichten
            </button>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={resetForm}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {mode === "change" && (
        <div className="space-y-2">
          <input
            type="password"
            className="input w-full"
            placeholder="Aktuelles Passwort"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <input
            type="password"
            className="input w-full"
            placeholder="Neues Passwort (mind. 8 Zeichen)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <input
            type="password"
            className="input w-full"
            placeholder="Neues Passwort wiederholen"
            value={newPasswordRepeat}
            onChange={(e) => setNewPasswordRepeat(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={handleChange}>
              Ändern
            </button>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={resetForm}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {mode === "disable" && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Passwort zur Bestätigung eingeben:
          </p>
          <input
            type="password"
            className="input w-full"
            placeholder="Aktuelles Passwort"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={handleDisable}>
              Passwortschutz entfernen
            </button>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={resetForm}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

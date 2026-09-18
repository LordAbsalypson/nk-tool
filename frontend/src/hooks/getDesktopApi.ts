/** Zugriff auf die pywebview-Brücke (desktop/app.py::DesktopApi) — nur
 * vorhanden, wenn die App als Desktop-App läuft (nicht im Browser/Dev-Modus).
 * Siehe ARCHITECTURE.md Abschnitt "Desktop-App". */

interface AppInfo {
  version: string;
  platform: string;
  dbPath: string;
  dbSizeBytes: number;
  appDataDir: string;
  dbLabel: string;
  /** true, wenn eine verknüpfte externe Datei beim Start nicht gefunden wurde. */
  dbMissing: boolean;
  /** true, wenn die aktive DB eine verknüpfte externe Datei ist (nicht der Standardspeicherort). */
  dbLinked: boolean;
}

interface PickResult {
  path: string | null;
}

interface OkResult {
  ok: boolean;
  error: string | null;
}

interface DesktopApi {
  app_info: () => Promise<AppInfo>;
  set_db_label: (label: string) => Promise<OkResult>;
  pick_import_file: () => Promise<PickResult>;
  verify_import_file: (path: string) => Promise<OkResult>;
  /** Kopiert eine Datei in den Standardspeicherort. */
  import_db: (path: string) => Promise<OkResult>;
  /** Verknüpft eine Datei an ihrem aktuellen Ort, ohne sie zu kopieren. */
  link_existing_file: (path: string) => Promise<OkResult>;
  /** Öffnet einen Speicherort-Dialog für eine NEUE Datenbank an frei wählbarem Ort. */
  choose_new_location: () => Promise<OkResult & { path?: string }>;
  /** Trennt die Verknüpfung, fällt zurück auf den Standardspeicherort. */
  use_default_location: () => Promise<OkResult>;
  /** "Datei suchen"-Dialog, wenn die verknüpfte Datei nicht gefunden wurde. */
  locate_missing_file: () => Promise<PickResult & Partial<OkResult>>;
  /** Legt eine neue leere DB genau an der erwarteten (fehlenden) Stelle an. */
  create_at_missing_location: () => Promise<OkResult>;
  create_new_db: () => Promise<OkResult>;
  reset_link: () => Promise<OkResult>;
  pick_export_destination: () => Promise<PickResult>;
  export_db: (destPath: string) => Promise<OkResult>;
  open_external: (url: string) => Promise<OkResult>;
}

declare global {
  interface Window {
    pywebview?: { api: DesktopApi };
  }
}

export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && window.pywebview !== undefined;
}

/** Wirft, wenn außerhalb der Desktop-App aufgerufen — immer erst isDesktopApp() prüfen. */
export function getDesktopApi(): DesktopApi {
  if (!window.pywebview) {
    throw new Error("getDesktopApi() außerhalb der Desktop-App aufgerufen — isDesktopApp() prüfen.");
  }
  return window.pywebview.api;
}

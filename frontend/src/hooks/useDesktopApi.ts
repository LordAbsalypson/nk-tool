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
  import_db: (path: string) => Promise<OkResult>;
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
export function useDesktopApi(): DesktopApi {
  if (!window.pywebview) {
    throw new Error("useDesktopApi() außerhalb der Desktop-App aufgerufen — isDesktopApp() prüfen.");
  }
  return window.pywebview.api;
}

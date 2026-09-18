"""NK-Tool Desktop — native App-Hülle (pywebview) um Backend + Frontend-Build.

Ersetzt für Endnutzer den Dev-Workflow (uvicorn --reload + npm run dev) durch
eine installierbare App ohne sichtbaren Server, ohne Netzwerk-Exposure per
Default. Siehe FEATURES_ROADMAP.md Abschnitt "Desktop-App" für den vollen Plan.

Architektur (Stand 2026-09-18, überarbeitet): EIN dauerhaftes Fenster über die
gesamte Prozesslaufzeit — kein separates Onboarding-Fenster mehr, das erzeugt
und wieder zerstört wird (frühere Version, verursachte einen Freeze: die
file_types-Filterstrings enthielten einen Bindestrich, den pywebviews
Validierungs-Regex ablehnt — der Fehler flog innerhalb des js_api-Aufrufs,
das JS-Promise blieb für immer hängen, wirkte wie ein eingefrorenes Fenster).
Import/Export/Zurücksetzen laufen jetzt über `DesktopApi`, aufgerufen aus der
normalen React-UI heraus (Einstellungen-Dialog, siehe
frontend/src/components/ui/DesktopSettingsModal.tsx).

Ablauf:
1. App-Datenverzeichnis pro OS bestimmen (siehe ``app_data_dir``). Eine leere
   Datenbank dort wird beim ersten Start automatisch von SQLAlchemy angelegt
   (wie im Dev-Modus auch) — "erster Start" wird im Frontend rein daran
   erkannt, dass noch keine Liegenschaft existiert, kein separater Zustand.
2. FastAPI-Backend (bestehendes ``backend/main.py``, unverändert) in einem
   Hintergrund-Thread starten. Frontend-Production-Build (``frontend/dist``)
   wird als Static Files an denselben Server gehängt.
3. Natives Fenster auf den lokalen Server öffnen, mit ``DesktopApi`` als
   js_api — bleibt bis zum Beenden der App bestehen.

Datenbank wechseln/zurücksetzen (Import, "Neue Datenbank", Reset) archiviert
die bisherige Datei immer nach ``<app-data>/archive/<Zeitstempel>_nk_tool.db``
(``shutil.move`` — nie löschen) und startet den Prozess neu (nötig, weil
SQLAlchemy die Engine einmalig beim Import bindet, ein DB-Wechsel zur Laufzeit
ist mit dem aktuellen main.py nicht vorgesehen).
"""

from __future__ import annotations

import os
import shutil
import socket
import sqlite3
import sys
import threading
import time
import webbrowser
from datetime import datetime
from pathlib import Path

import webview
from webview import FileDialog

APP_NAME = "NK-Tool"
APP_VERSION = "0.1.0"


def _resource_root() -> Path:
    """Wurzel für gebündelte Ressourcen (backend/, frontend/dist).

    Im PyInstaller-Bundle (--onedir) liegt alles unter ``sys._MEIPASS`` in
    derselben relativen Struktur wie im Dev-Checkout (siehe --add-data in
    desktop/nk-tool.spec / nk-tool-windows.spec) — im Dev-Modus ist es
    einfach das Repo-Root.
    """
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS"))
    return Path(__file__).resolve().parent.parent


REPO_ROOT = _resource_root()
BACKEND_DIR = REPO_ROOT / "backend"
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"

REQUIRED_TABLES = {"liegenschaft", "mieter", "wohnung", "abrechnungsperiode"}


def app_data_dir() -> Path:
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    elif sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", str(Path.home())))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share")))
    target = base / APP_NAME
    target.mkdir(parents=True, exist_ok=True)
    return target


def verify_db(path: Path) -> tuple[bool, str]:
    """Prüft, ob ``path`` eine valide SQLite-Datei mit den NK-Tool-Kerntabellen ist."""
    if not path.is_file():
        return False, "Datei nicht gefunden."
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        cur = con.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cur.fetchall()}
        con.close()
    except sqlite3.DatabaseError as exc:
        return False, f"Keine gültige SQLite-Datenbank: {exc}"
    missing = REQUIRED_TABLES - tables
    if missing:
        return False, (
            "Das sieht nicht nach einer NK-Tool-Datenbank aus (fehlende Tabellen: "
            + ", ".join(sorted(missing))
            + ")."
        )
    return True, ""


def _label_path(db_path: Path) -> Path:
    return db_path.parent / "db_label.txt"


def _read_db_label(db_path: Path) -> str:
    p = _label_path(db_path)
    if p.exists():
        return p.read_text(encoding="utf-8").strip()
    return ""


def _write_db_label(db_path: Path, label: str) -> None:
    _label_path(db_path).write_text(label, encoding="utf-8")


def _archive_current_db(db_path: Path) -> Path | None:
    """Verschiebt (nie löscht) eine bestehende DB nach archive/. Gibt den
    neuen Pfad zurück, oder None, wenn keine DB vorhanden war."""
    if not db_path.exists():
        return None
    archive_dir = db_path.parent / "archive"
    archive_dir.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = archive_dir / f"{ts}_{db_path.name}"
    shutil.move(str(db_path), str(dest))
    return dest


def _schedule_restart(delay: float = 0.6) -> None:
    """Startet den Prozess nach kurzer Verzögerung neu (lässt die aktuelle
    HTTP-Antwort noch beim Frontend ankommen, bevor der Prozess ersetzt wird)."""

    def _do_restart() -> None:
        time.sleep(delay)
        python = sys.executable
        os.execv(python, [python] + sys.argv)

    threading.Thread(target=_do_restart, daemon=True).start()


class DesktopApi:
    """Von der React-UI aus aufrufbare Python-Funktionen (pywebview js_api).
    Siehe frontend/src/hooks/useDesktopApi.ts für die JS-seitige Nutzung."""

    def __init__(self, db_path: Path):
        self.db_path = db_path

    def app_info(self) -> dict:
        return {
            "version": APP_VERSION,
            "platform": sys.platform,
            "dbPath": str(self.db_path),
            "dbSizeBytes": self.db_path.stat().st_size if self.db_path.exists() else 0,
            "appDataDir": str(self.db_path.parent),
            "dbLabel": _read_db_label(self.db_path),
        }

    def set_db_label(self, label: str) -> dict:
        _write_db_label(self.db_path, label.strip()[:80])
        return {"ok": True}

    def pick_import_file(self) -> dict:
        window = webview.windows[0]
        result = window.create_file_dialog(
            FileDialog.OPEN,
            file_types=("SQLite Datenbank (*.db)", "Alle Dateien (*.*)"),
        )
        if not result:
            return {"path": None}
        return {"path": result[0]}

    def verify_import_file(self, path: str) -> dict:
        ok, err = verify_db(Path(path))
        return {"ok": ok, "error": err if not ok else None}

    def import_db(self, path: str) -> dict:
        src = Path(path)
        ok, err = verify_db(src)
        if not ok:
            return {"ok": False, "error": err}
        _archive_current_db(self.db_path)
        shutil.copy2(src, self.db_path)  # Quelle bleibt unangetastet
        _write_db_label(self.db_path, "")  # neue Daten -> alter Name passt nicht mehr
        _schedule_restart()
        return {"ok": True}

    def create_new_db(self) -> dict:
        _archive_current_db(self.db_path)
        _write_db_label(self.db_path, "")
        _schedule_restart()
        return {"ok": True}

    def reset_link(self) -> dict:
        """Settings-Aktion "Zurücksetzen": identisch zu create_new_db() —
        eigener Name, weil die UI hier andere Bestätigungs-/Warntexte zeigt."""
        return self.create_new_db()

    def pick_export_destination(self) -> dict:
        window = webview.windows[0]
        result = window.create_file_dialog(
            FileDialog.SAVE,
            save_filename="nk_tool_export.db",
            file_types=("SQLite Datenbank (*.db)",),
        )
        if not result:
            return {"path": None}
        return {"path": result if isinstance(result, str) else result[0]}

    def export_db(self, dest_path: str) -> dict:
        if not self.db_path.exists():
            return {"ok": False, "error": "Keine Datenbank vorhanden."}
        try:
            shutil.copy2(self.db_path, Path(dest_path))
        except OSError as exc:
            return {"ok": False, "error": str(exc)}
        return {"ok": True}

    def open_external(self, url: str) -> dict:
        if not (url.startswith("https://") or url.startswith("http://")):
            return {"ok": False, "error": "Nur http(s)-URLs erlaubt."}
        webbrowser.open(url)
        return {"ok": True}


def wait_for_server(port: int, timeout: float = 15.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.3):
                return True
        except OSError:
            time.sleep(0.15)
    return False


def start_backend(db_path: Path, port: int) -> None:
    data_dir = db_path.parent
    os.environ["NK_TOOL_DB_PATH"] = str(db_path)
    # uploads/ und abrechnungen_pdf/ sind im Backend-Quellcode relativ zum CWD
    # bzw. zum Quellbaum verankert — im App-Bundle weder beschreibbar noch
    # CWD-stabil, deshalb ins App-Datenverzeichnis umgeleitet.
    os.environ["NK_TOOL_UPLOADS_DIR"] = str(data_dir / "uploads")
    os.environ["NK_TOOL_PDF_DIR"] = str(data_dir / "abrechnungen_pdf")
    sys.path.insert(0, str(BACKEND_DIR))

    import uvicorn  # noqa: E402
    import main as backend_main  # noqa: E402  (mountet Router, legt Tabellen an)

    if FRONTEND_DIST.is_dir():
        from fastapi.staticfiles import StaticFiles  # noqa: E402

        backend_main.app.mount(
            "/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend"
        )
    else:
        print(
            f"WARNUNG: {FRONTEND_DIST} fehlt — 'npm run build' im frontend/-Verzeichnis "
            "vorher ausführen.",
            file=sys.stderr,
        )

    config = uvicorn.Config(
        backend_main.app, host="127.0.0.1", port=port, log_level="warning", loop="asyncio"
    )
    uvicorn.Server(config).run()


def main() -> None:
    db_path = app_data_dir() / "nk_tool.db"

    port = 8731
    thread = threading.Thread(target=start_backend, args=(db_path, port), daemon=True)
    thread.start()

    if not wait_for_server(port):
        print("FEHLER: Backend ist nicht gestartet.", file=sys.stderr)
        sys.exit(1)

    webview.create_window(
        APP_NAME,
        f"http://127.0.0.1:{port}",
        width=1280,
        height=860,
        min_size=(1000, 700),
        js_api=DesktopApi(db_path),
    )
    webview.start()


if __name__ == "__main__":
    main()

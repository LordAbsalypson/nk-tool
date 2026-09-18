"""NK-Tool Desktop — native App-Hülle (pywebview) um Backend + Frontend-Build.

Ersetzt für Endnutzer den Dev-Workflow (uvicorn --reload + npm run dev) durch
eine installierbare App ohne sichtbaren Server, ohne Netzwerk-Exposure per
Default. Siehe FEATURES_ROADMAP.md Abschnitt "Desktop-App" für den vollen Plan.

Ablauf:
1. App-Datenverzeichnis pro OS bestimmen (siehe ``app_data_dir``).
2. Falls dort noch keine ``nk_tool.db`` existiert: Onboarding-Fenster
   (neue DB anlegen [Default] oder bestehende Datei auswählen+verifizieren+
   importieren).
3. FastAPI-Backend (bestehendes ``backend/main.py``, unverändert) in einem
   Hintergrund-Thread starten, ``NK_TOOL_DB_PATH`` zeigt auf das App-
   Datenverzeichnis. Frontend-Production-Build (``frontend/dist``) wird als
   Static Files an denselben Server gehängt.
4. Natives Fenster auf den lokalen Server öffnen.
"""

from __future__ import annotations

import os
import shutil
import socket
import sqlite3
import sys
import threading
import time
from pathlib import Path
from typing import Optional

import webview

APP_NAME = "NK-Tool"
DESKTOP_DIR = Path(__file__).resolve().parent
REPO_ROOT = DESKTOP_DIR.parent
BACKEND_DIR = REPO_ROOT / "backend"
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"

# Kern-Tabellen, die jede echte NK-Tool-Datenbank haben muss — verhindert den
# Import einer beliebigen/fremden .db-Datei ohne jede Prüfung.
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


class OnboardingApi:
    """Von JS (onboarding.html) aufrufbare Python-Funktionen (pywebview js_api)."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.decided = threading.Event()

    def create_new(self) -> dict:
        self.decided.set()
        webview.windows[0].destroy()
        return {"ok": True}

    def choose_and_import(self) -> dict:
        window = webview.windows[0]
        result = window.create_file_dialog(
            webview.OPEN_DIALOG,
            file_types=("SQLite-Datenbank (*.db)", "Alle Dateien (*.*)"),
        )
        if not result:
            return {"ok": False, "error": None}  # Nutzer hat abgebrochen

        src = Path(result[0])
        ok, err = verify_db(src)
        if not ok:
            return {"ok": False, "error": err}

        shutil.copy2(src, self.db_path)
        self.decided.set()
        window.destroy()
        return {"ok": True}


def run_onboarding(db_path: Path) -> None:
    api = OnboardingApi(db_path)
    webview.create_window(
        f"{APP_NAME} — Einrichtung",
        str(DESKTOP_DIR / "onboarding.html"),
        js_api=api,
        width=440 + 64,
        height=340,
        resizable=False,
    )
    webview.start()
    # Fenster vom Nutzer per OS-Close-Button geschlossen, ohne Auswahl zu
    # treffen -> Standardverhalten laut Anforderung: neue (leere) DB anlegen.


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
    os.environ["NK_TOOL_DB_PATH"] = str(db_path)
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

    config = uvicorn.Config(backend_main.app, host="127.0.0.1", port=port, log_level="warning")
    uvicorn.Server(config).run()


def main() -> None:
    db_path = app_data_dir() / "nk_tool.db"

    if not db_path.exists():
        run_onboarding(db_path)

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
    )
    webview.start()


if __name__ == "__main__":
    main()

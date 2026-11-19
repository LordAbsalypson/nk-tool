"""MCP-Server für NK-Tool — gibt LLM-Clients (Claude Code, Claude Desktop, Antigravity, Cursor etc.)
Zugriff auf die NK-Tool-API und eine schreibgeschützte Sicht auf die SQLite-Datenbank.

Design:
- ``get_status``: Liefert App-Version, aktive Datenbank (inkl. Desktop-App-Verknüpfung über
  ``db_location.json``), aktiven API-Modus (laufende Desktop-App :52741, Dev-Server :8000 oder
  automatischer In-Process-Fallback) sowie eine Übersicht aller Liegenschaften und Perioden.
- ``get_api_reference``: Kompakte, automatisch generierte Liste aller 114+ Endpunkte und Request-Schemas.
- ``request``: HTTP-Aufruf (GET/POST/PUT/PATCH/DELETE) gegen die echte NK-Tool-REST-API
  (oder automatisch in-process über FastAPI TestClient, falls weder Desktop-App noch uvicorn laufen).
- ``get_db_schema`` / ``query_db``: Schreibgeschützte SQL-Abfrage direkt gegen die SQLite-Datei
  (``mode=ro`` + Keyword-Sperre).
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any

import httpx
from mcp.server.mcpserver import MCPServer

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
API_REFERENCE_PATH = Path(__file__).resolve().parent / "API_REFERENCE.md"

DEFAULT_CANDIDATE_BASES = (
    "http://127.0.0.1:52741/api/v1",  # Desktop-App (pywebview stabiler Port)
    "http://127.0.0.1:8000/api/v1",   # Lokaler uvicorn Dev-Server
)


def _desktop_app_data_dir() -> Path:
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "NK-Tool"
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        if appdata:
            return Path(appdata) / "NK-Tool"
    return Path.home() / ".local" / "share" / "NK-Tool"


def resolve_db_path() -> tuple[Path, str]:
    """Ermittelt die aktive SQLite-Datenbank in sinnvoller Priorität:
    1. Explizite Umgebungsvariable ``NK_TOOL_DB_PATH``
    2. Verknüpfte Datenbank der Desktop-App (``db_location.json``)
    3. Standard-Datenbank der Desktop-App (``<AppData>/nk_tool.db``)
    4. ``backend/nk_tool_test.db`` (aktuelle Arbeits-DB im Repo)
    5. ``backend/nk_tool.db`` (Fallback)
    """
    env_db = os.environ.get("NK_TOOL_DB_PATH")
    if env_db:
        return Path(env_db), "env:NK_TOOL_DB_PATH"

    app_dir = _desktop_app_data_dir()
    pointer_file = app_dir / "db_location.json"
    if pointer_file.exists():
        try:
            data = json.loads(pointer_file.read_text(encoding="utf-8"))
            linked = data.get("path")
            if linked and Path(linked).exists():
                return Path(linked), f"desktop-linked ({data.get('label') or 'db_location.json'})"
        except Exception:
            pass

    desktop_default = app_dir / "nk_tool.db"
    if desktop_default.exists():
        return desktop_default, "desktop-default"

    test_db = BACKEND_DIR / "nk_tool_test.db"
    if test_db.exists():
        return test_db, "repo:nk_tool_test.db"

    return BACKEND_DIR / "nk_tool.db", "repo:nk_tool.db"


def detect_live_api_base() -> str | None:
    """Prüft, ob ein expliziter oder bekannter lokaler NK-Tool-Server erreichbar ist."""
    explicit = os.environ.get("NK_TOOL_API_BASE")
    candidates = (explicit,) if explicit else DEFAULT_CANDIDATE_BASES
    for base in candidates:
        if not base:
            continue
        health_url = base.rstrip("/")
        if health_url.endswith("/api/v1"):
            health_url = health_url[: -len("/api/v1")] + "/api/health"
        else:
            health_url = health_url + "/api/health"
        try:
            r = httpx.get(health_url, timeout=1.2)
            if r.status_code == 200:
                return base.rstrip("/")
        except httpx.HTTPError:
            continue
    return None


_inprocess_client: Any = None


def _get_inprocess_client() -> Any:
    """Erzeugt bei Bedarf einen In-Process FastAPI TestClient gegen die aktive DB,
    damit der MCP-Server auch dann funktioniert, wenn weder Desktop-App noch uvicorn laufen."""
    global _inprocess_client
    if _inprocess_client is not None:
        return _inprocess_client

    db_path, _ = resolve_db_path()
    os.environ["NK_TOOL_DB_PATH"] = str(db_path)
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))
    from fastapi.testclient import TestClient
    import main as backend_main

    _inprocess_client = TestClient(backend_main.app)
    return _inprocess_client


INSTRUCTIONS = """NK-Tool: lokal gehostete Nebenkostenabrechnung (deutsches Betriebskostenrecht).

Werkzeuge:
- get_status(): Zeigt App-Version, aktive Datenbank, Server-Modus sowie alle Liegenschaften & Perioden. Immer zuerst aufrufen!
- get_api_reference(): Kompakte, automatisch generierte Liste aller ~114 REST-Endpunkte + Request-Body-Schemas.
- request(method, path, json_body=None): Ruft die NK-Tool-REST-API auf (GET/POST/PUT/PATCH/DELETE).
  Nutzt automatisch die laufende Desktop-App (:52741), den Dev-Server (:8000) oder einen direkten In-Process-Fallback.
- get_db_schema() / query_db(sql): Schreibgeschützte SELECT-Abfragen direkt gegen die SQLite-Datenbank (mode=ro).

Vor schreibenden Aufrufen (POST/PUT/PATCH/DELETE) auf echten Mieterdaten beim Nutzer rückversichern, wenn nicht explizit angefordert."""

mcp = MCPServer("nk-tool", instructions=INSTRUCTIONS)


@mcp.tool()
def get_status() -> dict[str, Any]:
    """Gibt Version, aktiven Server-/DB-Status sowie eine Übersicht aller Liegenschaften
    und Abrechnungsperioden zurück. Idealer Einstiegspunkt für jede KI-Session."""
    db_path, db_source = resolve_db_path()
    live_base = detect_live_api_base()
    version_file = REPO_ROOT / "VERSION"
    version = version_file.read_text(encoding="utf-8").strip() if version_file.exists() else "unbekannt"

    summary: list[dict[str, Any]] = []
    if db_path.exists():
        con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        con.row_factory = sqlite3.Row
        try:
            cur = con.cursor()
            cur.execute("SELECT id, name, adresse, plz, ort FROM liegenschaft ORDER BY id")
            for lieg in cur.fetchall():
                cur.execute(
                    "SELECT id, bezeichnung, von_datum, bis_datum, status "
                    "FROM abrechnungsperiode WHERE liegenschaft_id = ? ORDER BY von_datum DESC",
                    (lieg["id"],),
                )
                perioden = [dict(p) for p in cur.fetchall()]
                summary.append({**dict(lieg), "perioden": perioden})
        except sqlite3.Error:
            pass
        finally:
            con.close()

    return {
        "ok": True,
        "version": version,
        "api_mode": "live_http" if live_base else "in_process_fallback",
        "active_api_base": live_base or "in-process://fastapi/api/v1",
        "db_path": str(db_path),
        "db_source": db_source,
        "db_exists": db_path.exists(),
        "liegenschaften": summary,
    }


@mcp.tool()
def get_api_reference() -> str:
    """Gibt die kompakte, automatisch generierte API-Referenz zurück (Methode,
    Pfad, Body-Typ pro Endpunkt + Schema-Felder). Vor dem ersten ``request``-Aufruf
    lesen statt Endpunkte zu erraten."""
    if not API_REFERENCE_PATH.exists():
        return (
            "API_REFERENCE.md fehlt — einmalig `python3 generate_api_reference.py` "
            "im mcp-server/-Verzeichnis ausführen."
        )
    return API_REFERENCE_PATH.read_text(encoding="utf-8")


@mcp.tool()
def request(method: str, path: str, json_body: dict[str, Any] | None = None) -> dict[str, Any]:
    """Ruft die NK-Tool-REST-API auf (dieselbe Logik/Validierung wie die Web-UI).
    ``method``: GET/POST/PUT/PATCH/DELETE. ``path``: z. B. "/liegenschaften" oder
    "/perioden/3/zaehlerstaende-uebersicht" (relativ zu /api/v1).
    ``json_body``: Request-Body für POST/PUT/PATCH, sonst weglassen."""
    method = method.upper().strip()
    if method not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
        return {"ok": False, "error": f"Ungültige Methode: {method}"}

    clean_path = path.lstrip("/")
    if clean_path.startswith("api/v1/"):
        clean_path = clean_path[len("api/v1/") :]

    live_base = detect_live_api_base()
    if live_base:
        url = live_base.rstrip("/") + "/" + clean_path
        try:
            resp = httpx.request(method, url, json=json_body, timeout=30.0)
            try:
                return resp.json()
            except ValueError:
                return {
                    "ok": False,
                    "error": f"Keine JSON-Antwort (HTTP {resp.status_code}): {resp.text[:500]}",
                }
        except httpx.HTTPError as exc:
            return {"ok": False, "error": f"HTTP-Fehler gegen {url}: {exc}"}

    # Automatischer In-Process-Fallback, falls weder Desktop-App noch Dev-Server laufen
    client = _get_inprocess_client()
    full_path = "/api/v1/" + clean_path
    resp = client.request(method, full_path, json=json_body)
    try:
        return resp.json()
    except ValueError:
        return {
            "ok": False,
            "error": f"Keine JSON-Antwort (HTTP {resp.status_code}): {resp.text[:500]}",
        }


@mcp.tool()
def get_db_schema() -> str:
    """Gibt Tabellen- und Spaltennamen der aktiven NK-Tool-Datenbank zurück (kompakt,
    ohne Constraints/Indizes). Vor query_db() aufrufen, um gültige Namen zu kennen."""
    db_path, _ = resolve_db_path()
    if not db_path.exists():
        return f"Datenbank nicht gefunden: {db_path}"
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        cur = con.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        tables = [r[0] for r in cur.fetchall()]
        lines = []
        for t in tables:
            cur.execute(f'PRAGMA table_info("{t}")')
            cols = [row[1] for row in cur.fetchall()]
            lines.append(f"{t}: {', '.join(cols)}")
        return "\n".join(lines)
    finally:
        con.close()


_FORBIDDEN_KEYWORDS = (
    "insert", "update", "delete", "drop", "alter", "create", "attach",
    "pragma", "vacuum", "replace",
)


@mcp.tool()
def query_db(sql: str) -> list[dict[str, Any]] | dict[str, str]:
    """Schreibgeschützte SQL-Abfrage gegen die aktive NK-Tool-Datenbank. Nur SELECT-
    Statements erlaubt (mehrfach abgesichert: Keyword-Filter + read-only
    Connection). Für Änderungen immer request() mit der passenden API nutzen."""
    normalized = sql.strip().lower()
    if not normalized.startswith("select"):
        return {"error": "Nur SELECT-Abfragen erlaubt. Für Änderungen das request()-Tool nutzen."}
    if any(f" {kw} " in f" {normalized} " or normalized.startswith(kw) for kw in _FORBIDDEN_KEYWORDS):
        return {"error": "Verbotenes Schlüsselwort erkannt — nur reine SELECT-Abfragen erlaubt."}
    db_path, _ = resolve_db_path()
    if not db_path.exists():
        return {"error": f"Datenbank nicht gefunden: {db_path}"}

    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        cur = con.cursor()
        cur.execute(sql)
        rows = cur.fetchmany(500)
        return [dict(r) for r in rows]
    except sqlite3.Error as exc:
        return {"error": str(exc)}
    finally:
        con.close()


if __name__ == "__main__":
    mcp.run()

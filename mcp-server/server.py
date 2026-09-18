"""MCP-Server für NK-Tool — gibt LLM-Clients (Claude etc.) Zugriff auf die laufende
NK-Tool-API und eine schreibgeschützte Sicht auf die SQLite-Datenbank.

Zwei generische Tools statt 103 einzelner Wrapper (ein Wrapper pro Endpunkt wäre
kaum wartbar und würde bei jeder API-Änderung hier nachziehen müssen):

- ``request``: HTTP-Proxy gegen die echte NK-Tool-REST-API (`main.py`, unverändert
  über uvicorn erreichbar). Nutzt exakt dieselbe Business-Logik/Validierung wie
  die Web-UI — keine Duplikation von Berechnungslogik hier.
- ``query_db``: schreibgeschützte SQL-Abfrage direkt gegen die SQLite-Datei, für
  Fälle, die die REST-API nicht abdeckt (Ad-hoc-Auswertungen, Debugging).

Siehe README.md für Einrichtung, API_REFERENCE.md für die kompakte Endpunktliste
(automatisch generiert, siehe generate_api_reference.py).
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any

import httpx
from mcp.server.mcpserver import MCPServer

API_BASE = os.environ.get("NK_TOOL_API_BASE", "http://127.0.0.1:8000/api/v1")
DB_PATH = Path(
    os.environ.get("NK_TOOL_DB_PATH", str(Path(__file__).resolve().parent.parent / "backend" / "nk_tool.db"))
)
API_REFERENCE_PATH = Path(__file__).resolve().parent / "API_REFERENCE.md"

INSTRUCTIONS = f"""NK-Tool: lokal gehostete Nebenkostenabrechnung (deutsches Betriebskostenrecht).

Zwei Tools:
- request(method, path, json_body=None): HTTP-Aufruf gegen die laufende NK-Tool-API
  (Basis-URL: {API_BASE}). Antwort immer {{"ok": true, "data": ...}} oder
  {{"ok": false, "error": "..."}}. Für die vollständige, kompakte Endpunktliste
  zuerst get_api_reference() aufrufen (ca. 100 Endpunkte, ~1500 Tokens) statt zu raten.
- query_db(sql): schreibgeschützte SELECT-Abfrage direkt gegen die SQLite-Datenbank
  ({DB_PATH.name}). Für Fälle, die die API nicht abdeckt. Vorher get_db_schema()
  aufrufen, um Tabellen-/Spaltennamen zu kennen — nicht raten.

Kein Auth-Layer. Diese Werkzeuge haben vollen Lese-/Schreibzugriff auf echte
Vermieter-/Mieterdaten, wenn gegen eine produktive Instanz gerichtet — vor
schreibenden Aufrufen (POST/PUT/DELETE) beim Nutzer rückversichern, wenn nicht
explizit angefordert."""

mcp = MCPServer("nk-tool", instructions=INSTRUCTIONS)


@mcp.tool()
def get_api_reference() -> str:
    """Gibt die kompakte, automatisch generierte API-Referenz zurück (Methode,
    Pfad, Body-Typ pro Endpunkt, gruppiert nach Bereich). Vor dem ersten
    ``request``-Aufruf lesen statt Endpunkte zu erraten."""
    if not API_REFERENCE_PATH.exists():
        return (
            "API_REFERENCE.md fehlt — einmalig `python3 generate_api_reference.py` "
            "im mcp-server/-Verzeichnis ausführen."
        )
    return API_REFERENCE_PATH.read_text(encoding="utf-8")


@mcp.tool()
def request(method: str, path: str, json_body: dict[str, Any] | None = None) -> dict[str, Any]:
    """Ruft die NK-Tool-REST-API auf (dieselbe Logik wie die Web-UI, keine
    Duplikation). ``method``: GET/POST/PUT/DELETE. ``path``: z. B.
    "/liegenschaften" oder "/perioden/3/mieter/12/schluessel-abrechnung/pdf"
    (ohne Basis-URL). ``json_body``: Request-Body für POST/PUT, sonst weglassen.
    Siehe get_api_reference() für gültige Pfade/Body-Felder."""
    method = method.upper()
    if method not in {"GET", "POST", "PUT", "DELETE"}:
        return {"ok": False, "error": f"Ungültige Methode: {method}"}

    url = API_BASE.rstrip("/") + "/" + path.lstrip("/")
    try:
        resp = httpx.request(method, url, json=json_body, timeout=30.0)
    except httpx.HTTPError as exc:
        return {"ok": False, "error": f"Verbindung fehlgeschlagen: {exc}. Läuft der Server unter {API_BASE}?"}

    try:
        return resp.json()
    except ValueError:
        return {"ok": False, "error": f"Keine JSON-Antwort (HTTP {resp.status_code}): {resp.text[:500]}"}


@mcp.tool()
def get_db_schema() -> str:
    """Gibt Tabellen- und Spaltennamen der NK-Tool-Datenbank zurück (kompakt,
    ohne Constraints/Indizes). Vor query_db() aufrufen, um gültige Namen zu kennen."""
    if not DB_PATH.exists():
        return f"Datenbank nicht gefunden: {DB_PATH}"
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
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
    """Schreibgeschützte SQL-Abfrage gegen die NK-Tool-Datenbank. Nur SELECT-
    Statements erlaubt (mehrfach abgesichert: Keyword-Filter + read-only
    Connection). Für Änderungen immer request() mit der passenden API nutzen,
    nie hier — die API validiert Geschäftsregeln, eine direkte Schreib-Query
    würde das umgehen."""
    normalized = sql.strip().lower()
    if not normalized.startswith("select"):
        return {"error": "Nur SELECT-Abfragen erlaubt. Für Änderungen das request()-Tool nutzen."}
    if any(f" {kw} " in f" {normalized} " or normalized.startswith(kw) for kw in _FORBIDDEN_KEYWORDS):
        return {"error": "Verbotenes Schlüsselwort erkannt — nur reine SELECT-Abfragen erlaubt."}
    if not DB_PATH.exists():
        return {"error": f"Datenbank nicht gefunden: {DB_PATH}"}

    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        cur = con.cursor()
        cur.execute(sql)
        rows = cur.fetchmany(500)  # Deckel gegen versehentliche Riesenresultate
        return [dict(r) for r in rows]
    except sqlite3.Error as exc:
        return {"error": str(exc)}
    finally:
        con.close()


if __name__ == "__main__":
    mcp.run()

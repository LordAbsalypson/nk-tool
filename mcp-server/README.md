# NK-Tool MCP-Server

Gibt einem LLM-Client (Claude Code, Claude Desktop, Antigravity, Cursor und andere MCP-Clients)
direkten Zugriff auf die NK-Tool-API und eine schreibgeschützte Sicht auf die Datenbank — für
Datenpflege, Auswertungen oder Debugging per Sprachanweisung statt manuellem Klicken/curl.

## Werkzeuge (5 Tools)

Bewusst **fünf kompakte, generische Tools statt >100 einzelner Wrapper** (ein Wrapper pro Endpunkt
wäre bei 119 Routen kaum wartbar und würde bei jeder API-Änderung veralten):

| Tool | Zweck |
|---|---|
| `get_status()` | **Immer zuerst aufrufen.** Zeigt App-Version, aktive Datenbank (`db_location.json`-Verknüpfung der Desktop-App, Desktop-Default oder Repo-DB), aktiven API-Modus (Live-HTTP `:52741` / `:8000` oder automatischer In-Process-Fallback) sowie alle Liegenschaften & Perioden. |
| `get_api_reference()` | Kompakte, automatisch generierte Liste aller 119 Endpunkte (Methode, Pfad, Body-Typ) **inkl. aller 50 Request-Body-Schemas** mit Pflicht- und Optionalfeldern. |
| `request(method, path, json_body=None)` | Ruft die echte NK-Tool-REST-API auf (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) — dieselbe Validierung und Business-Logik wie die Web-UI. Verbindet sich automatisch mit der laufenden Desktop-App (`127.0.0.1:52741`), dem Dev-Server (`127.0.0.1:8000`) oder fällt nahtlos auf einen In-Process FastAPI-Client zurück, falls kein Server läuft. |
| `get_db_schema()` | Tabellen- und Spaltennamen der aktiven SQLite-DB (kompakt). Vor `query_db()` aufrufen. |
| `query_db(sql)` | Schreibgeschützte `SELECT`-Abfrage direkt gegen die DB, für Ad-hoc-Auswertungen. Mehrfach abgesichert (Keyword-Filter + `mode=ro` Read-Only-Connection) — Schreibversuche werden abgelehnt. |

Für Änderungen (Anlegen/Bearbeiten/Löschen) immer `request()` mit der passenden API nutzen, nie
versuchen, per `query_db()` zu schreiben — das würde die serverseitige Validierung umgehen.

## Automatische Server- & Datenbank-Erkennung

Der MCP-Server erkennt automatisch die richtige Umgebung:

1. **API-Modus**:
   - Wenn `NK_TOOL_API_BASE` gesetzt ist, wird diese URL genutzt.
   - Sonst prüft der Server automatisch `http://127.0.0.1:52741/api/v1` (laufende **Desktop-App**)
     und `http://127.0.0.1:8000/api/v1` (lokaler **Dev-Server**).
   - Läuft keiner von beiden, führt `request()` den Aufruf **automatisch in-process** über FastAPI
     gegen die aktive Datenbank aus — die App muss für MCP-Interaktionen also nicht einmal offen sein.
2. **Datenbank-Auflösung**:
   - `NK_TOOL_DB_PATH` (falls explizit als Umgebungsvariable gesetzt)
   - Verknüpfte Datenbank der Desktop-App (`~/Library/Application Support/NK-Tool/db_location.json`,
     z. B. iCloud-Ordner)
   - Standard-Datenbank der Desktop-App (`~/Library/Application Support/NK-Tool/nk_tool.db`)
   - `backend/nk_tool_test.db` bzw. `backend/nk_tool.db`

## Einrichtung

```bash
pip3 install -r mcp-server/requirements.txt

# API-Referenz bei API-Änderungen neu generieren (119 Endpunkte + 50 Schemas):
python3 mcp-server/generate_api_reference.py
```

### Registrierung (Claude Code / Cursor / Antigravity)

Im Projekt-Root liegt bereits eine vorkonfigurierte `.mcp.json`:

```json
{
  "mcpServers": {
    "nk-tool": {
      "command": "python3",
      "args": ["mcp-server/server.py"]
    }
  }
}
```

Oder mit absolutem Pfad / expliziter Test-DB in `~/.claude.json` bzw. Claude Desktop:

```json
{
  "mcpServers": {
    "nk-tool": {
      "command": "python3",
      "args": ["/pfad/zu/nk-tool/mcp-server/server.py"],
      "env": {
        "NK_TOOL_DB_PATH": "/pfad/zu/nk-tool/backend/nk_tool_test.db"
      }
    }
  }
}
```

## Sicherheitshinweise

- `request()` kann jeden Endpunkt aufrufen, inklusive schreibender (`POST`/`PUT`/`PATCH`/`DELETE`) —
  bei realen Vermieterdaten vor Änderungen rückversichern, wenn nicht explizit angefordert.
- `query_db()` öffnet die Datenbank immer im SQLite-`mode=ro` (read-only auf Verbindungsebene,
  nicht nur per Textfilter) und lässt nur `SELECT` zu.
- `API_REFERENCE.md` wird aus dem Code generiert (`generate_api_reference.py`), nicht von Hand
  gepflegt — verhindert, dass die Referenz vom tatsächlichen Verhalten abweicht.

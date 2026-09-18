# NK-Tool MCP-Server

Gibt einem LLM-Client (Claude Code, Claude Desktop, andere MCP-Clients) Zugriff auf die
laufende NK-Tool-API und eine schreibgeschützte Sicht auf die Datenbank — für Datenpflege,
Auswertungen oder Debugging per Sprachanweisung statt manuellem Klicken/curl.

## Werkzeuge

Bewusst **zwei generische Tools statt ~100 einzelne Wrapper** (ein Wrapper pro Endpunkt wäre bei
über 100 Routen kaum wartbar und würde bei jeder API-Änderung veralten):

| Tool | Zweck |
|---|---|
| `get_api_reference()` | Kompakte, automatisch generierte Liste aller Endpunkte (Methode, Pfad, Body-Typ). Immer zuerst aufrufen, statt Pfade zu raten. |
| `request(method, path, json_body=None)` | HTTP-Aufruf gegen die echte NK-Tool-API — dieselbe Validierung/Business-Logik wie die Web-UI. |
| `get_db_schema()` | Tabellen- und Spaltennamen der SQLite-DB (kompakt). Vor `query_db()` aufrufen. |
| `query_db(sql)` | Schreibgeschützte SELECT-Abfrage direkt gegen die DB, für Fälle, die die API nicht abdeckt. Mehrfach abgesichert (Keyword-Filter + read-only Connection) — Schreibversuche werden abgelehnt. |

Für Änderungen (Anlegen/Bearbeiten/Löschen) immer `request()` mit der passenden API nutzen, nie
versuchen, per `query_db()` zu schreiben — das würde die serverseitige Validierung umgehen.

## Einrichtung

```bash
pip3 install -r mcp-server/requirements.txt

# API-Referenz einmalig generieren (danach nur bei API-Änderungen neu ausführen)
cd mcp-server && python3 generate_api_reference.py
```

Backend muss laufen (Dev: `cd backend && uvicorn main:app --reload --port 8000`, oder die
Desktop-App). Der MCP-Server selbst spricht nur HTTP mit dem Backend — er startet es nicht.

### Registrierung bei Claude Code

In `.claude/settings.json` oder per `claude mcp add`:

```json
{
  "mcpServers": {
    "nk-tool": {
      "command": "python3",
      "args": ["/pfad/zu/nk-tool/mcp-server/server.py"],
      "env": {
        "NK_TOOL_API_BASE": "http://127.0.0.1:8000/api/v1",
        "NK_TOOL_DB_PATH": "/pfad/zu/nk-tool/backend/nk_tool_test.db"
      }
    }
  }
}
```

`NK_TOOL_DB_PATH` **immer explizit auf die gewünschte Datenbank setzen** — sonst greift der
Default (`backend/nk_tool.db`, die echte Datenbank). Zum Testen `nk_tool_test.db` verwenden, nie
`nk_tool.db` ohne bewusste Absicht.

## Sicherheitshinweise

- **Kein Auth-Layer** (wie das restliche Tool auch). `request()` kann jeden Endpunkt aufrufen,
  inklusive schreibender (POST/PUT/DELETE) — bei realen Vermieterdaten vor Änderungen
  rückversichern, wenn nicht explizit angefordert.
- `query_db()` öffnet die Datenbank immer im SQLite-`mode=ro` (read-only auf Verbindungsebene,
  nicht nur per Textfilter) und lässt nur `SELECT` zu — auch bei einem theoretischen Bypass des
  Keyword-Filters kann nicht geschrieben werden.
- `API_REFERENCE.md` wird aus dem Code generiert (`generate_api_reference.py`), nicht von Hand
  gepflegt — verhindert, dass die Referenz vom tatsächlichen Verhalten abweicht.

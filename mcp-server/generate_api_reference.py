"""Erzeugt mcp-server/API_REFERENCE.md aus den tatsächlich registrierten FastAPI-Routen.

Läuft NIE gegen die echte Produktions-DB (importiert nur main.py für die Routen-
Introspektion, öffnet aber keine DB-Verbindung und schreibt nichts). Bewusst
automatisch generiert statt handgepflegt — verhindert, dass die Referenz vom
tatsächlichen Code abweicht (siehe Arbeitsregel "nie APIs erfinden").

Usage:
    cd mcp-server && python3 generate_api_reference.py
"""

from __future__ import annotations

import os
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"


def main() -> None:
    # main.py legt beim Import per create_all()/ALTER TABLE Tabellen an —
    # niemals gegen die echte nk_tool.db laufen lassen, nur für die
    # Routen-Introspektion eine Wegwerf-DB in einem Temp-Verzeichnis nutzen.
    tmp_db = Path(tempfile.mkdtemp()) / "nk_tool_route_introspection.db"
    os.environ["NK_TOOL_DB_PATH"] = str(tmp_db)

    sys.path.insert(0, str(BACKEND_DIR))
    from fastapi.routing import APIRoute

    import main as backend_main  # noqa: E402

    routes = [r for r in backend_main.app.routes if isinstance(r, APIRoute)]

    by_tag: dict[str, list[APIRoute]] = defaultdict(list)
    for r in routes:
        tag = r.tags[0] if r.tags else "sonstige"
        by_tag[tag].append(r)

    lines = [
        "# NK-Tool API Reference (für LLM-/MCP-Nutzung)",
        "",
        "> Automatisch generiert aus den registrierten FastAPI-Routen"
        f" ({len(routes)} Endpunkte) — `python3 mcp-server/generate_api_reference.py`."
        " Nicht von Hand pflegen, bei API-Änderungen neu generieren.",
        "",
        "Alle Pfade sind relativ zur Basis-URL (Standard `http://127.0.0.1:8000/api/v1`,"
        " siehe `mcp-server/README.md`). Antwortformat immer"
        ' `{"ok": true, "data": ...}` oder `{"ok": false, "error": "..."}`.',
        "",
    ]

    for tag in sorted(by_tag):
        lines.append(f"## {tag}")
        lines.append("")
        for r in sorted(by_tag[tag], key=lambda x: x.path):
            methods = ",".join(sorted(m for m in r.methods if m != "HEAD"))
            body = ""
            if r.body_field is not None:
                body = f" — Body: `{r.body_field.type_.__name__}`"
            lines.append(f"- `{methods} {r.path}` — {r.endpoint.__name__}(){body}")
        lines.append("")

    out_path = Path(__file__).resolve().parent / "API_REFERENCE.md"
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Geschrieben: {out_path} ({len(routes)} Endpunkte, {len(by_tag)} Tags)")


if __name__ == "__main__":
    main()

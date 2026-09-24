# Architecture / Architektur

> Technischer Überblick für Mitwirkende (Menschen und KI-Agenten). Verifiziert gegen den
> Code-Stand vom 2026-09-18. Ersetzt für öffentliche Beiträge den technischen Teil des
> internen `CLAUDE.md` (das interne Dokument bleibt im privaten Repo, da es reale
> Betriebsdaten enthält).

## Tech-Stack

| Schicht | Version | Hinweise |
|---|---|---|
| React | 19 | TypeScript strict |
| Tailwind CSS | v3 | `darkMode: "class"` — `html.dark` wird von `useDarkMode` gesetzt |
| Vite | 8 | Dev-Proxy `/api` → `http://localhost:8000` |
| TanStack Query | v5 | `useQuery`, `useMutation`, `useQueryClient` |
| react-hook-form + zod | aktuell | alle Formulare Zod-validiert |
| FastAPI | 0.115 | Python 3.12, synchrones SQLAlchemy |
| SQLAlchemy | 2.x | sync ORM, kein Alembic — Startup-`ALTER TABLE`-Migrationen |
| Pydantic | v2 | `model_config = ConfigDict(from_attributes=True)` |

## Dateistruktur

```
nk-tool/
├── README.md / LICENSE / FEATURES_ROADMAP.md / LEGAL_NOTES.md / ARCHITECTURE.md (diese Datei)
├── AI_COMMANDS.md        ← curl-Referenz für alle API-Endpunkte
├── GOAL.md               ← technischer Refactoring-Backlog (Performance/Codequalität)
├── backend/
│   ├── main.py           ← FastAPI-App, Router-Mounts, Startup-Migrationen
│   ├── models.py         ← alle SQLAlchemy-Modelle
│   ├── schemas.py        ← alle Pydantic-Schemas
│   ├── domain.py         ← Konstanten (Zählertypen, Zeilenarten)
│   ├── engine.py         ← geteilte Berechnungsbausteine (Segmentbildung, Proration,
│   │                        Gradtagzahlen) — genutzt von schluessel_engine.py
│   ├── schluessel_engine.py ← aktiver Berechnungspfad ("Direkt-Preise-Ansatz")
│   ├── pdf_abrechnung.py ← PDF-Erzeugung Einzelabrechnung/Kombi-PDF
│   ├── pdf_vorlage_utils.py ← geteilte PDF-Basis-Konfiguration (Vorlage/Ränder/Skalierung)
│   ├── seed.py           ← seedet Standard-Kostenarten bei Liegenschaft-Anlage
│   ├── database.py       ← SQLAlchemy-Engine + get_db-Dependency
│   └── routers/
│       ├── liegenschaften.py, wohnungen.py, mieter.py, zaehler.py, perioden.py
│       ├── kostenarten.py, kostenpositionen.py (inkl. Beleg-Upload), zaehlerstaende.py
│       ├── vorauszahlungen.py (Auto-Generierung fehlender Monate)
│       ├── validierung.py, verbund.py, suche.py, checkup.py, todos.py
│       ├── schluessel_abrechnung.py  ← aktive Berechnung/Abrechnung/Ausprobieren-Modus
│       └── pdf_vorlage.py            ← globale PDF-Vorlage (Briefkopf/Fußzeile/Ränder)
└── frontend/src/
    ├── App.tsx            ← Root: Liegenschaft-Auswahl, Stage-Switch, Modals
    ├── api/client.ts      ← typisierter fetch-Wrapper: api.get/post/put/delete/upload
    ├── types/index.ts     ← alle TypeScript-Interfaces
    ├── hooks/, components/layout/, components/ui/
    └── pages/
        ├── Stage1/        ← Stammdaten (einmalig pro Liegenschaft)
        │   ├── UebersichtTab.tsx, WohnungenMieterTab.tsx (fusioniert), ZaehlerTab.tsx,
        │   │   KostenartenTab.tsx, PeriodenTab.tsx
        └── Live/          ← laufende Abrechnung, 4 Schritte in einem Flow
            ├── KostenartenTab.tsx, ZaehlerstaendeTab.tsx, VorauszahlungenTab.tsx,
            │   AbrechnungTab.tsx (inkl. PDF-Vorlage-Editor, Sammelabrechnung, Personen-Split)
```

> Hinweis für Mitwirkende: `backend/routers/berechnung.py` und die alte
> HKVO-§9-Vollberechnung (`engine.berechne_periode`) wurden entfernt — der Direkt-Preise-Ansatz
> über `schluessel_engine.py` ist der einzige aktive Berechnungspfad. Der historische Code liegt
> im Branch `legacy/stage3-engine` des privaten Repos.

## Desktop-App

`desktop/app.py` bündelt Backend + Frontend-Production-Build via
[pywebview](https://pywebview.flowrl.com/) + PyInstaller zu einer installierbaren App (macOS
über `nk-tool.spec`, Windows über `nk-tool-windows.spec` + GitHub Actions, da kein lokaler
Windows-Rechner vorhanden ist). Ein dauerhaftes Fenster über die gesamte Prozesslaufzeit —
Import/Export/Zurücksetzen/Verknüpfen der Datenbank laufen über eine js_api-Brücke
(`DesktopApi`) aus der normal laufenden React-UI heraus (Einstellungen-Dialog), nicht über ein
separates Onboarding-Fenster.

Speicherort ist entweder der App-Standardpfad oder eine frei gewählte externe Datei (z. B. ein
iCloud-Ordner) — verknüpft über einen Zeiger (`db_location.json`), nie kopiert. Fehlt eine
verknüpfte Datei beim Start (umbenannt/verschoben/Laufwerk fehlt), zeigt `DbMissingOverlay`
einen blockierenden "Datei suchen"-Dialog (wie ein Link-Finder bei Medienprogrammen), bevor
irgendein Bildschirm mit echten Daten erscheint.

Details, Build-Anleitung und Architektur-Hintergrund (inkl. eines gefundenen und behobenen
Freeze-Bugs) in [`desktop/README.md`](desktop/README.md).

## MCP-Server (LLM-Zugriff)

`mcp-server/` gibt LLM-Clients (Claude Code, Claude Desktop, andere MCP-Clients) Zugriff auf die
laufende NK-Tool-API und eine schreibgeschützte DB-Sicht — zwei generische Tools
(`request`, `query_db`) statt ~100 einzelner Wrapper, plus eine automatisch generierte, kompakte
API-Referenz (`mcp-server/API_REFERENCE.md`, ~160 Zeilen statt der vollständigen
`AI_COMMANDS.md`-curl-Referenz). Details in [`mcp-server/README.md`](mcp-server/README.md).

## Key Patterns

### API-Antwort-Envelope
Alle Antworten: `{ "ok": true, "data": ... }` oder `{ "ok": false, "error": "..." }`.
Client (`api/client.ts`) wirft `new Error(json.error ?? "HTTP {status}")` bei Fehlern.

### DB-Migrationen
Kein Alembic. Neue Spalten werden beim Start in `main.py` idempotent hinzugefügt:
```python
with engine.connect() as _conn:
    try: _conn.execute(text("ALTER TABLE ... ADD COLUMN ...")); _conn.commit()
    except Exception: pass
```

### Dark Mode
`tailwind.config.js`: `darkMode: "class"`. `useDarkMode` speichert in `localStorage`, setzt
`html.dark`. Inline-Tailwind-Utilities (z. B. `bg-white`) werden über
`html.dark .bg-white { ... }` am Ende von `index.css` überschrieben.

### Datei-Uploads (Belege)
`POST /api/v1/kostenpositionen/{id}/beleg` — multipart, Feld `file`, nur PDF/JPG/PNG.
Gespeichert unter `backend/uploads/kp_{id}.{ext}`.

### "Ausprobieren"-Modus (sichere Live-Vorschau)
`POST /perioden/{id}/schluessel-abrechnung/vorschau` (period-weit, Standard seit 2026-09-24) und
`POST /perioden/{id}/mieter/{id}/schluessel-abrechnung/vorschau` (Einzelmieter, z. B. für die
Verbrauchswert-Live-Vorschau in der Abrechnung) wenden übergebene Overrides innerhalb derselben
DB-Transaktion an, berechnen mit der echten Engine und machen alles per `db.rollback()` im
`finally`-Block rückgängig — nichts wird persistiert.

## Kein Auth-Layer

Es gibt aktuell **keine** Authentifizierung/Autorisierung im Code. Für Self-Hosting: nur lokal
oder hinter einem eigenen abgesicherten Reverse-Proxy betreiben, nie ungeschützt exponieren.

## Mitwirken

Feature-Wünsche und Bugs bitte als GitHub Issue melden. Siehe [`FEATURES_ROADMAP.md`](FEATURES_ROADMAP.md)
für bekannte Lücken und Ideen, [`LEGAL_NOTES.md`](LEGAL_NOTES.md) für rechtliche Einordnung.

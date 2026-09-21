# NK-Tool

**Lokales, selbst-gehostetes Tool für die Nebenkostenabrechnung (Betriebskostenabrechnung)
kleiner Vermieter — als Ersatz für teure externe Abrechnungsdienste (z. B. ista).**

*A local, self-hosted tool for German utility/operating-cost billing
(Nebenkostenabrechnung) for small landlords — replacing expensive external
billing services like ista.*

---

## 🇩🇪 Deutsch

### Die Idee in einem Satz
Eine lokal laufende Web-App, mit der Vermieter kleiner Mehrfamilienhäuser die
jährliche Nebenkostenabrechnung selbst erstellen — ohne SaaS-Abo, ohne Cloud,
ohne externen Abrechnungsdienstleister.

### Warum
Externe Abrechnungsdienste (z. B. ista) sind für kleine Vermieter mit ein oder
zwei Häusern unverhältnismäßig teuer. NK-Tool bildet den kompletten Ablauf —
Stammdaten, Zählerstände, Kosten, Vorauszahlungen, Verteilung, Einzelabrechnung
als PDF — lokal ab. Alle Daten bleiben auf dem eigenen Rechner.

### Funktionsumfang

**Stammdaten**
- Liegenschaften, Wohnungen, Mieter (inkl. Mieterwechsel, Leerstand), Zähler
- Zählertypen: Wärme (kWh), Heizkostenverteiler-Einheiten (HKV), Warmwasser,
  Kaltwasser, Strom — nach Heizung/Wasser/Strom gruppierte Anzeige
- Konfigurierbare Kostenarten mit Verteilungsschlüssel je Kostenart
- Abrechnungsperioden

**Kosteneingabe**
- Kostenarten direkt mit €/Einheit-Sätzen erfassen (inkl. Rechner: Gesamtkosten
  ÷ Gesamteinheiten → Satz automatisch, mit Vorschlagswert aus echten
  Stammdaten/Zählerständen)
- Gilt automatisch für mehrere Liegenschaften mit identischem Abrechnungszeitraum
- Zählerstände erfassen, inkl. Vorjahreswert-Übernahme und manueller
  Verbrauchskorrektur pro Wohnung/Mieter
- Vorauszahlungen als monatliches Raster pro Mieter, mit Autogenerierung
  fehlender Monate

**Abrechnung**
- Automatische Verteilung nach Fläche, Personen, Verbrauch, Nutzeinheit etc.,
  taggenaue Aufteilung bei Mieterwechsel
- Liegenschafts-Verbund: gemeinsame Kosten mehrerer Häuser (z. B. gemeinsamer
  Hausmeister) nach wählbarem Schlüssel aufteilen
- Einzelabrechnung pro Mieter als PDF, inkl. anpassbarer Vorlage
  (Briefkopf, Anrede, Schlusstext, Fußzeile, Seitenränder, automatische
  Schriftverkleinerung bei Platzmangel)
- Kombinierte Abrechnung bei Wohnungstausch innerhalb einer Periode
- Nebenkostenabrechnung auf mehrere Bewohner einer Wohnung aufteilen
  (Personen-Split, z. B. bei Wohngemeinschaften)
- Sammelabrechnung/Jahresübersicht einer ganzen Liegenschaft als PDF
- Validierung/Checkup: fehlende Zählerstände, offene Zahlungen, Plausibilitäts-
  warnungen auf einen Blick
- Globale Suche über alle Liegenschaften und Eingabeschritte hinweg

**Sonstiges**
- Dark Mode, Glossar der wichtigsten Nebenkosten-Fachbegriffe
- Aufgaben/To-dos je Abrechnungslauf

> Hinweis: Der Funktionsumfang wurde direkt aus dem Quellcode und der internen
> Projektdokumentation abgeleitet. Screenshots folgen (siehe unten).

### Tech-Stack

| Schicht | Technologie |
|---|---|
| Frontend | React 19 (TypeScript, strict) + Tailwind CSS v3 + Vite |
| Datenzugriff | TanStack Query v5 |
| Formulare | react-hook-form + zod |
| Backend | FastAPI 0.115 (Python 3.12) |
| ORM | SQLAlchemy 2.x (sync), Pydantic v2 |
| Datenbank | SQLite (lokale Datei, kein separater DB-Server nötig) |
| PDF-Erzeugung | serverseitig (Python) |

Keine Alembic-Migrationen — Schemaänderungen laufen über idempotente
`ALTER TABLE`-Blöcke beim Start (siehe `backend/main.py`).

### Schnellstart

```bash
# Backend (Port 8000)
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Frontend (Port 5173), in einem zweiten Terminal
cd frontend
npm run dev
```

Danach im Browser: **http://localhost:5173**

Die SQLite-Datenbank (`backend/nk_tool.db`) wird beim ersten Start automatisch
angelegt. Hochgeladene Belege liegen unter `backend/uploads/`.

Voraussetzungen: Python 3.12, Node.js (aktuelle LTS-Version), npm.

### Screenshots

*TODO — folgen vor dem öffentlichen Release.*

### Haftungsausschluss

**Idee, Konzept & Architektur: [LordAbsalypson](https://github.com/LordAbsalypson). Code geschrieben
mit KI-Unterstützung (Claude von Anthropic).** Entwickelt in Zusammenarbeit mit tatsächlich
betroffenen Vermietern — erwarte entsprechend Ecken und Kanten, keinen durchgehend handgeprüften
Code.

Dieses Tool wird ohne Gewähr bereitgestellt und ersetzt **keine** rechtliche
oder steuerliche Beratung. Es ist kein Ersatz für einen Steuerberater oder eine
professionelle Hausverwaltung, insbesondere nicht hinsichtlich der
Betriebskostenverordnung (BetrKV) oder Heizkostenverordnung (HKVO). Nutzer sind
selbst dafür verantwortlich, alle berechneten Werte vor Versand an Mieter zu
prüfen. Für Fehler in Berechnung, Darstellung oder Rechtskonformität wird keine
Haftung übernommen.

### Lizenz

**[GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)** — kostenlos für jede Nutzung,
auch gewerblich. Wer eine modifizierte Version als Netzwerkdienst (z. B. gehostetes Angebot für
Dritte) betreibt, muss den vollständigen, angepassten Quellcode dieser Version öffentlich
zugänglich machen (§13 AGPL, "Network Use"). Details siehe [`LICENSE`](LICENSE) und
[`LEGAL_NOTES.md`](LEGAL_NOTES.md).

### Mitwirken

Dieses Projekt soll über die Community wachsen. **Feature-Wünsche und Bugs bitte als GitHub Issue
melden** — das ist der Haupt-Kanal, über den sich das Tool weiterentwickelt. Pull Requests sind
ebenfalls willkommen, es gibt aktuell keinen formalen Beitragsprozess.

### Reifegrad

Dies ist ein persönliches Projekt (entstanden für die Nebenkostenabrechnung eines konkreten
Zwei-Häuser-Bestands), kein fertiges kommerzielles Produkt. Erwarte Ecken und Kanten. Aktuell kein
Auth/Login-Layer — **nicht ungeschützt im Internet exponieren**, nur lokal oder hinter einem
eigenen abgesicherten Reverse-Proxy betreiben.

---

## 🇬🇧 English

### One-sentence pitch
A locally-hosted web app that lets landlords of small multi-unit properties
prepare their own annual German utility/operating-cost statement
(Nebenkostenabrechnung) — no SaaS subscription, no cloud, no external billing
service.

### Why
External billing services (e.g. ista) are disproportionately expensive for
landlords with just one or two buildings. NK-Tool covers the full workflow —
master data, meter readings, costs, advance payments, cost allocation, and
per-tenant PDF statements — entirely locally. All data stays on your own
machine.

### Features

**Master data**
- Properties, units, tenants (including tenant turnover and vacancy), meters
- Meter types: heat (kWh), heat-cost-allocator units (HKV/Heizkostenverteiler),
  hot water, cold water, electricity — grouped by heating/water/electricity
- Configurable cost categories with a per-category allocation key
- Billing periods

**Cost entry**
- Enter cost categories directly as €-per-unit rates (with a built-in
  calculator: total cost ÷ total units → rate, pre-filled from real master
  data/meter readings)
- Automatically applied across multiple properties sharing the same billing
  period
- Meter readings, including carrying over last year's value and manual
  consumption overrides per unit/tenant
- Advance payments as a monthly grid per tenant, with auto-generation of
  missing months

**Billing / statements**
- Automatic cost allocation by floor area, occupants, consumption, per-unit
  share, etc., with day-accurate proration on tenant turnover
- Multi-property cost pooling ("Verbund"): split shared costs (e.g. a shared
  caretaker) across several buildings using a chosen key
- Per-tenant PDF statement with a customizable template (letterhead,
  salutation, closing text, footer, page margins, automatic font shrinking
  when content overflows a page)
- Combined statements for mid-period unit swaps
- Splitting a single unit's statement across multiple occupants
  (e.g. shared flats)
- A property-wide summary/annual-overview PDF
- Validation/checkup view: missing readings, open payments, and plausibility
  warnings at a glance
- Global search across all properties and workflow steps

**Other**
- Dark mode, a glossary of the relevant billing terminology
- A simple to-do list per billing run

> Note: this feature list was derived directly from the source code and
> internal project documentation. Screenshots are still pending (see below).

### Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 (TypeScript, strict) + Tailwind CSS v3 + Vite |
| Data fetching | TanStack Query v5 |
| Forms | react-hook-form + zod |
| Backend | FastAPI 0.115 (Python 3.12) |
| ORM | SQLAlchemy 2.x (sync), Pydantic v2 |
| Database | SQLite (a local file — no separate DB server needed) |
| PDF generation | server-side (Python) |

No Alembic migrations — schema changes run as idempotent `ALTER TABLE`
statements on startup (see `backend/main.py`).

### Quickstart

```bash
# Backend (port 8000)
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Frontend (port 5173), in a second terminal
cd frontend
npm run dev
```

Then open **http://localhost:5173** in your browser.

The SQLite database (`backend/nk_tool.db`) is created automatically on first
run. Uploaded receipts are stored under `backend/uploads/`.

Prerequisites: Python 3.12, a current Node.js LTS release, npm.

### Screenshots

*TODO — to be added before the public release.*

### Disclaimer

**Idea, concept & architecture: [LordAbsalypson](https://github.com/LordAbsalypson). Code written
with AI assistance (Claude by Anthropic).** Developed in cooperation with landlords who actually
use it for their own properties — expect rough edges, not uniformly hand-reviewed code.

This tool is provided with no warranty and does not constitute legal or tax
advice. It is not a substitute for a professional Steuerberater (tax advisor)
or Hausverwaltung (property management), particularly regarding compliance
with the German Betriebskostenverordnung (BetrKV) or Heizkostenverordnung
(HKVO). Users are responsible for independently verifying all calculated
figures before sending statements to tenants. No liability is accepted for
errors in calculation, presentation, or legal compliance.

### License

**[GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)** — free for any use, including
commercial. Anyone running a modified version as a network service (e.g. a hosted offering for
third parties) must make the complete, modified source code of that version publicly available
(AGPL §13, "Network Use"). See [`LICENSE`](LICENSE) and [`LEGAL_NOTES.md`](LEGAL_NOTES.md) for
details.

### Contributing

This project is meant to grow through community input. **Please report feature requests and bugs
as GitHub issues** — that's the main channel driving development. Pull requests are welcome too;
there is no formal contribution process yet.

### Maturity

This is a personal project (built for one real two-building portfolio's utility billing), not a
polished commercial product. Expect rough edges. There is currently no auth/login layer —
**do not expose it unprotected on the internet**; run it locally or behind your own secured
reverse proxy.

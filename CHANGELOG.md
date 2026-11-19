# Changelog

Alle nennenswerten Änderungen an nk-tool werden hier dokumentiert.

Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.0.0/),
Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).

## [1.4.0] - 2026-11-15

### Added

- **Eigener deutscher DatePicker (`DatePicker.tsx`)**:
  Ersetzt alle 11 nativen macOS/iOS `<input type="date">`-Felder durch einen intuitiven,
  schnellen deutschen Datums-Wähler (`TT.MM.JJJJ`). Unterstützt direktes Tippen (auch kompakt
  ohne Punkte wie `01062025` oder `1.6.25`), Pfeiltasten (`↑`/`↓` für `±1 Tag`, `Shift+↑/↓`
  für `±1 Monat`) sowie ein Kalender-Popover mit Direktwahl für Monat & Jahr und 1-Klick-Chips
  für typische Abrechnungsdaten (`Heute`, `01.06.`, `31.05.`, `1. im Monat`, `Monatsende`).
- **Inkrementelle Text- & UI-Vergrößerung (`⌘+` / `⌘−` / `⌘0` + Footer-Zoom)**:
  Neuer `useUiZoom`-Hook skaliert die gesamte Oberfläche proportional von `80%` bis `150%`
  in `10%`-Schritten (funktioniert identisch im Browser und in der `pywebview`-Desktop-App).
  Zusätzlich direkte `A−` / `100%` / `A+`-Buttons in der Fußzeile; Einstellung bleibt in
  `localStorage` (`nk-tool-zoom`) gespeichert.
- **Erweiterter MCP-Server (`mcp-server/server.py` + `.mcp.json`)**:
  Neues `get_status()`-Tool für sofortigen Überblick (App-Version, aktive Datenbank, Server-Modus,
  Liegenschaften & Perioden). Erkennt automatisch die laufende Desktop-App (`127.0.0.1:52741`),
  den lokalen Dev-Server (`127.0.0.1:8000`) oder fällt nahtlos auf einen In-Process FastAPI-Client
  zurück. Löst automatisch die in der Desktop-App verknüpfte Datenbank (`db_location.json`) auf,
  unterstützt `PATCH`-Requests und liefert in `API_REFERENCE.md` alle 119 Endpunkte inkl. aller
  50 Request-Body-Schemas.
- **Automatisiertes Privacy-Gate & Persönliches Backup (`scripts/sync-to-public.sh`, `scripts/backup-personal.sh`)**:
  `sync-to-public.sh` prüft vor jedem Sync ins öffentliche GitHub-Repo automatisiert alle
  synchronisierten Dateien gegen die echten Liegenschafts- und Mieternamen der lokalen Datenbank.
  `backup-personal.sh` erstellt ein MD5- und Zeilenzahl-geprüftes Voll-Backup aller lokalen/iCloud-DBs
  und PDF-Archive nach `backup_safe/personal_<timestamp>/`.

### Changed

- **Oma-freundlicher Kontrast & Lesbarkeit (WCAG AAA)**:
  Blasse hellgraue Beschriftungen (`text-gray-400`/`text-slate-400`) für relevante Daten
  (Mieternamen unter Wohnungen, `Anfang`/`Ende`-Ablesedaten, Einheiten wie `€/m²`/`kWh`/`m³`,
  `Soll:`-Beträge) durch gut lesbares Dunkel-/Schiefergrau (`#334155` / `#475569`, >7,5:1 Kontrast
  auf Weiß) ersetzt, ohne harten Schwarz-Weiß-Blendkontrast. Kleinstschriften (`10px`/`11px`)
  auf mindestens `0.75rem` (`12px`, mit Zoom skalierend) angehoben.

## [1.3.0] - 2026-11-15

### Added

- **PDF-Archiv & Vorschau Side-Drawer (`PdfArchivDrawer.tsx` + `/perioden/{id}/pdf-archiv`)**:
  Generierte Einzel-PDFs, Kombi-PDFs und Sammel-ZIPs müllen nicht mehr ungefragt den
  `Downloads`-Ordner zu, sondern werden mit deutschem Zeitstempel und Dateigröße im rechten
  Seitenmenü bereitgestellt — inklusive direkt umschaltbarer Inline-PDF-Vorschau, gezieltem
  Download-Button und Löschfunktion.
- **Prüfhinweise als Side-Drawer mit Abhak-Funktion (`PruefungPanel.tsx`)**:
  Statt eines großen gelben Warnblocks über der Abrechnungstabelle zeigt Schritt 5 eine dezente
  Status-Kachel (`X/Y offene Prüfhinweise`). Im rechten Seitenmenü wird jeder Hinweis verständlich
  erklärt (*„Warum dieser Hinweis?"*) und lässt sich einzeln oder gesammelt als
  *„Zur Kenntnis genommen"* abhaken (pro Periode in `localStorage` gespeichert).
- **Unterjähriger Mieter-Auszug in neuer Periode (automatische Satz-Übernahme)**:
  Beim Anlegen einer neuen Abrechnungsperiode (`POST /liegenschaften/{lid}/perioden`) übernimmt
  das Backend automatisch die letzten bekannten Einheitspreise (`€/kWh`, `€/m³`, `€/m²`) aus der
  Vorperiode. Zusätzlich gibt es in Schritt 2 (`KostenartenTab.tsx`) den 1-Klick-Button
  **„Sätze aus Vorperiode übernehmen"** (`POST /perioden/{id}/direkt-kostenarten-werte/aus-vorperiode`).
  Zeitabhängige Kosten werden von `schluessel_engine.py` automatisch taggenau (`Miettage ÷ Periodentage`)
  heruntergerechnet und mit dem exakten Zählerverbrauch des ausgezogenen Mieters kombiniert.
- **Zentrale Versionierung & Changelog-Dialog (`VERSION` + `GET /api/v1/version`)**:
  `VERSION` im Projekt-Root ist die zentrale Quelle für Backend, Frontend und Desktop-Bundle.
  Ein Klick auf `NK-Tool v1.3.0` im Footer öffnet die vollständige Versions-Historie (`CHANGELOG.md`).
  Feste KI-Regel (#7 in `CLAUDE.md`): Jedes Update inkrementiert zwingend `VERSION` und `CHANGELOG.md`.

### Changed

- **2026 Visual Redesign („Nordic Slate & Indigo")**:
  - Alle gelben/ockerfarbenen Flächen (`amber-50`/`yellow-50` in Hilfe-Boxen, TopBar, Zählerständen
    und Prüfhinweisen) durch ruhige Slate-/Indigo-Oberflächen ersetzt.
  - Moderne Typografie mit **Plus Jakarta Sans** (UI) und **JetBrains Mono** (`tabular-nums` für
    Geldbeträge, Zählerstände und Zeitstempel).
  - `TopBar.tsx` als moderne Segmented-Pill-Navigation mit nummerierten Schritt-Badges (`1`–`5`) gestaltet.

## [1.2.0] - 2026-11-15

### Added

- **Prüf-Panel in Schritt 5 (Abrechnung)**: zeigt fehlende Ablesungen, offene Vorauszahlungen,
  Datum-Lücken und Mieterwechsel aus `/validierung` direkt über den Abrechnungs-Karten —
  einklappbar (Zustand gespeichert), mit Direkt-Sprung-Button zum passenden Schritt.
- **Sammel-Export „Alle Abrechnungen als ZIP“**: erstellt in einem Klick die Einzel-PDFs aller
  berechenbaren Mieter einer Periode (inkl. PDF-Abschnitte wie gewähltem Ausstellungsdatum)
  und liefert sie gebündelt als ZIP-Archiv (Desktop: nativer „Speichern unter“-Dialog über
  `DesktopApi.save_file`). Unvollständige Mieter werden übersprungen und gemeldet.
- **Automatisches tägliches Backup beim Desktop-Start**: `desktop/app.py` sichert die aktive
  Datenbank vor dem Backend-Start rein lesend per `sqlite3.backup()` nach `<AppData>/backups/`
  (max. 1 pro Tag, letzte 14 behalten). Anzeige „Letzte automatische Sicherung“ in den
  Einstellungen.
- **Ansicht merken**: zuletzt geöffnete Liegenschaft und aktiver Schritt bleiben in `localStorage`
  gespeichert (`private_mode=False` mit festem `storage_path` in pywebview, damit Einstellungen
  wie Dark Mode, PDF-Datum und Ansicht über App-Neustarts hinweg erhalten bleiben).
- **Einklappbare Hilfe-Boxen** (`HilfeBox.tsx`) in Zählerstände und Vorauszahlungen (Zustand in
  `localStorage`).

### Changed

- **Veralteter Tab „Kostenarten“ aus Schritt 1 (Stammdaten) entfernt**: bearbeitete nur das
  von der aktiven Berechnung nicht gelesene Altmodell `kostenart`; Footer-Button heißt jetzt
  konsistent „Weiter zu Kostenarten“. Backend-Endpunkte bleiben zur API-Kompatibilität erhalten.
- **Periode löschen abgesichert**: zeigt zuvor die Anzahl betroffener Zählerstände,
  Vorauszahlungen und Kostenart-Sätze (`GET /perioden/{id}/inhalt`) und verlangt zur
  Bestätigung das Eintippen der Perioden-Bezeichnung; Button dezenter.
- **Zählerstände in einem Request**: `GET /perioden/{id}/zaehlerstaende-uebersicht` bündelt
  Wohnungen, Zähler, Mieter, Stände und Verbrauchs-Overrides für Schritt 3 (Vorfüllung des
  Query-Caches statt ~50–60 Einzelrequests beim Tab-Wechsel).
- **Datumsformat & Validierungstexte vereinheitlicht**: Perioden-Übersicht und Prüf-Hinweise
  zeigen durchgehend `TT.MM.JJJJ` und aktuelle Schritt-Namen („Schritt 1–5“); Altmodell-Prüfung
  `keine_brennstoffkosten` aus der Validierung entfernt.

### Removed / Cleaned up

- Ungenutzten Code entfernt: `Stage1/KostenartenTab.tsx`, `Stage1/ZaehlerTab.tsx`,
  Vite-Standard-Assets (`hero.png`, `react.svg`, `vite.svg`) und `App.css`.
- Veraltetes `datetime.utcnow()` in `backend/models.py` und `backend/routers/todos.py`
  durch `datetime.now(timezone.utc).replace(tzinfo=None)` ersetzt (keine Python-3.12-Warnungen).

## [1.0.1] - 2026-09-24

### Added

- **Downloads**: macOS/Windows-Apps direkt über die GitHub-Releases-Seite installierbar
  (`releases/latest/download/...`) statt nur als login-pflichtiges, 90 Tage gültiges
  Actions-Artifact. README bekommt einen "Installation"-Bereich mit direkten Links.
- Neues Logo (Kosten-Split-Kreis) statt der generischen Haus-Silhouette — Favicon, TopBar,
  Desktop-Icons.
- **"Mit angepassten Stammdaten ausprobieren"**: Sandbox-Bereich am Kopf der Abrechnung ersetzt
  den bisherigen Ausprobieren-Button pro Mieter — Kostenart-Sätze ändern und live sehen, wie
  sich die Salden **aller** Mieter der Periode ändern, optional zusätzlich einen einzelnen
  Mieter für Personen/Fläche/Endbetrag-Anpassung auswählen.
- Vorauszahlung in der Abrechnungsansicht: Stift-Icon springt direkt zum passenden Mieter im
  Vorauszahlungen-Tab (scrollt hin, hebt die Zeile kurz hervor).
- Playwright-basiertes Tutorial mit Screenshots (`docs/TUTORIAL.md`).
- Technisches Konzept für mobile QR-Zählerablesung vertieft (`FEATURES_ROADMAP.md`, noch nicht
  implementiert).

### Fixed

- **Verbund/geteilte Kosten** wirkte sich trotz "Anwenden" nicht auf die echte Abrechnung aus
  (schrieb in ein totes, von der aktiven Engine nie gelesenes Modell) — schreibt jetzt korrekt
  in die Direkt-Preise-Sätze.
- **PDF-Erzeugung in der Desktop-App** fror nach "PDF erstellen" komplett ein (nur App-Kill half
  raus) — WKWebView kam mit der eingebetteten PDF-Vorschau nicht zuverlässig zurecht. Desktop-App
  nutzt jetzt einen nativen "Speichern unter"-Dialog statt einer Inline-Vorschau. Dateiname
  erweitert um Hausnummer (z. B. `15A_Whg_1_Mustermann.pdf`).
- **Vorauszahlungen "Gesamtbetrag"** lehnte einen kleineren neuen Betrag hart ab, wenn schon
  Monate individuell fixiert waren — zeigt jetzt nur noch einen Hinweis, setzt beim Fortfahren
  die Fixierungen zurück und verteilt gleichmäßig neu.
- **Personen-Split** ("Auf Bewohner aufteilen"): "PDFs erstellen"-Button blieb ohne erkennbaren
  Grund deaktiviert, wenn eine Gruppe keinen Namen hatte — zeigt jetzt einen Hinweistext.
  "Für diese Wohnung merken" ist jetzt standardmäßig aktiv.
- **PDF-Datum** sprang beim Stage-/Liegenschaftswechsel auf "heute" zurück, obwohl manuell
  gesetzt — bleibt jetzt je Abrechnungsperiode erhalten (alle Abrechnungen einer Periode lassen
  sich so mit demselben Datum ausstellen).
- Lizenz von AGPL-3.0 zu MIT + einer Zusatzklausel geändert (frei für Eigenverwaltung beliebiger
  Größe, gesonderte Lizenz nur für Hausverwaltungen/Property-Management als Dienstleistung für
  Dritte).

## [1.0.0] - 2026-09-21

Erster öffentlicher Release. nk-tool ist seitdem intern produktiv im Einsatz und wurde
gegen echte, teilweise abgerechnete Mieterdaten verifiziert.

### Added

- **Stammdaten**: Liegenschaften, Wohnungen, Mieter (inkl. Mieterwechsel/Leerstand), Zähler
  (Wärme/HKV/Warmwasser/Kaltwasser/Strom), konfigurierbare Kostenarten, Abrechnungsperioden.
- **Kosteneingabe**: Direkt-Preise-Modus (€/Einheit-Sätze statt Rechnungserfassung) mit
  automatischem Satz-Rechner, Zählerstände inkl. Vorjahreswert-Übernahme, Vorauszahlungs-Raster
  mit Auto-Generierung fehlender Monate.
- **Abrechnung**: taggenaue Kostenverteilung bei Mieterwechsel, Liegenschafts-Verbund
  (Kostenpooling über mehrere Häuser), Personen-Split (WG-Aufteilung), kombinierte Abrechnung
  bei Wohnungstausch, Sammelabrechnung/Jahresübersicht, Validierungs-Checkup, globale Suche.
- **PDF-Erzeugung**: editierbare Vorlage (Briefkopf, Texte, Fußzeile, Ränder), automatische
  Schriftverkleinerung bei Platzmangel, Vorschau-Fenster mit Drucken/Herunterladen statt
  direktem Download.
- **Desktop-App** (macOS/Windows, pywebview + PyInstaller): wählbarer/verschiebbarer
  Datenbank-Speicherort mit „Link-Finder"-Wiederherstellung bei fehlender Datei, DB-Import,
  Passwortschutz optional pro Datenbank (PBKDF2-HMAC-SHA256).
- **MCP-Server** für LLM-gestützte Bedienung (Claude Code/Desktop) — vollständige API-Referenz
  in `AI_COMMANDS.md`.
- **Ausprobieren-Modus**: Live-Vorschau von Änderungen (Transaktion + garantiertes Rollback),
  ohne echte Daten zu gefährden.
- Dark Mode, Glossar der Nebenkosten-Fachbegriffe, Aufgaben/To-dos je Abrechnungslauf.
- Automatisierte Backend-Tests für die Berechnungs-Engine (Mieterwechsel, Schaltjahr, Leerstand,
  HKVO-Grundkosten-Split) sowie CI-Testgate.
- Lizenz: [AGPL-3.0](LICENSE).

### Known Limitations

- Kein HKV-Fallback in der aktiven Berechnungs-Engine: Wohnungen mit ausschließlich
  `hkv_einheiten`-Zähler (kein `waerme_kwh`) erhalten aktuell 0 € Heiz-Verbrauchsanteil.
  Automatisiert nachgewiesen durch einen bewusst fehlschlagenden Test
  (`backend/tests/test_schluessel_engine.py`).
- Desktop-App ist nicht codesigniert/notarisiert — macOS Gatekeeper blockiert den ersten Start
  ggf., Workaround in `desktop/README.md`.
- Kein Auto-Update-Mechanismus — neue Versionen müssen manuell heruntergeladen werden.
- Deutsch/BetrKV/HKVO fest verdrahtet, keine Internationalisierung.
- Strukturell Single-Tenant (eine SQLite-Datei pro Installation), keine Mehrbenutzerfähigkeit.

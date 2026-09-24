# Changelog

Alle nennenswerten Änderungen an nk-tool werden hier dokumentiert.

Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.0.0/),
Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

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

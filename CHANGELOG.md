# Changelog

Alle nennenswerten Änderungen an nk-tool werden hier dokumentiert.

Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.0.0/),
Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

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

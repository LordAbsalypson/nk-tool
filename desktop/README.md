# NK-Tool Desktop — Build & Architektur (macOS + Windows)

Bündelt Backend + Frontend-Production-Build zu einer installierbaren App via
[pywebview](https://pywebview.flowrl.com/) + [PyInstaller](https://pyinstaller.org/). Ein
Prozess, ein natives Fenster, kein sichtbarer localhost-Server.

> Windows wird ausschließlich über GitHub Actions gebaut (`.github/workflows/build-desktop.yml`,
> `windows-latest`-Runner) — im Projekt gibt es keinen lokalen Windows-Rechner. Jede Änderung an
> `desktop/app.py` oder den Spec-Dateien betrifft **beide** Plattformen identisch (siehe
> Architektur unten) und wird von diesem einen Workflow für beide gebaut.

## Architektur (Stand 2026-09-18)

**Ein dauerhaftes Fenster** über die gesamte Prozesslaufzeit — kein separates
Onboarding-Fenster, das erzeugt und wieder zerstört wird. Frühere Version hatte genau das, und
ein Bug in den Dateidialog-Filterstrings (Bindestrich, den pywebviews Validierungs-Regex
ablehnt) ließ den Import-Dialog scheinbar einfrieren: die Exception flog innerhalb des
js_api-Aufrufs, das JS-Promise blieb für immer hängen. Behoben (siehe Commit-Historie) und
strukturell vermieden, indem Import/Export/Zurücksetzen jetzt aus der normal laufenden
React-UI heraus laufen, nicht aus einem separaten Fenster.

```
desktop/app.py
  ├── app_data_dir()        – OS-spezifisches App-Datenverzeichnis
  ├── default_db_path()     – Standardspeicherort (<app-data>/nk_tool.db)
  ├── read/write/clear_pointer() – <app-data>/db_location.json: Zeiger auf eine
  │     verknüpfte externe .db-Datei (beliebiger Ort, z. B. iCloud-Ordner)
  ├── resolve_active_db()   – (Pfad, fehlt?) — Standard oder verknüpfte Datei
  ├── verify_db()           – prüft Kern-Tabellen einer .db-Datei vor Import/Verknüpfung
  ├── _archive_current_db() – verschiebt (nie löscht) NUR die app-eigene Standarddatei
  │     nach archive/ — eine verknüpfte externe Datei wird nie automatisch verschoben
  ├── _schedule_restart()   – os.execv-Neustart nach DB-Wechsel
  ├── DesktopApi            – js_api-Klasse, aus der React-UI aufrufbar:
  │     app_info, pick_import_file, verify_import_file, import_db (Kopie in
  │     Standardspeicherort), link_existing_file (Verknüpfung ohne Kopie),
  │     choose_new_location, use_default_location, locate_missing_file
  │     ("Datei suchen" bei fehlender Verknüpfung), create_at_missing_location,
  │     create_new_db, reset_link, pick_export_destination, export_db,
  │     set_db_label, open_external
  └── main()                – Speicherort auflösen, Backend-Thread starten
                              (Scratch-DB falls verknüpfte Datei fehlt), EIN Fenster öffnen
```

Frontend-seitig: `frontend/src/hooks/getDesktopApi.ts` (Zugriff auf `window.pywebview.api`),
`frontend/src/components/ui/DesktopSettingsModal.tsx` (Einstellungen-Dialog: DB-Info,
Name/Label, Speicherort-Verwaltung, Import/Export/Zurücksetzen, Doku-Links), eingebunden über
einen Settings-Button in `Footer.tsx`. `frontend/src/components/ui/DbMissingOverlay.tsx` —
blockierender Vollbild-Dialog, wenn die verknüpfte Datei beim Start fehlt (siehe unten).
Erststart-Hinweis (keine Liegenschaft vorhanden) direkt in `App.tsx`.

### Speicherort: Standard oder frei wählbar ("Datei verknüpfen")

Zwei Modi, wie bei Medienverwaltungs-Software mit "Link Finder" (Datei fehlt → neu verknüpfen):

1. **Standard**: keine Zeiger-Datei → `<app-data>/nk_tool.db`, von SQLAlchemy automatisch
   angelegt. Import kopiert eine gewählte Datei hierher (Quelle bleibt unangetastet).
2. **Verknüpft**: `<app-data>/db_location.json` zeigt auf eine beliebige `.db`-Datei irgendwo im
   Dateisystem (z. B. ein iCloud-Ordner) — bleibt an ihrem Ort, wird nie kopiert/verschoben, die
   App schreibt direkt hinein. Fehlt die Datei beim Start (umbenannt, iCloud noch nicht
   synchronisiert, Laufwerk nicht eingesteckt), startet die App trotzdem (Backend gegen eine
   Wegwerf-Scratch-DB) und zeigt sofort `DbMissingOverlay` — blockiert die restliche App, bis
   entweder eine gültige Datei gefunden/verknüpft, eine neue an der erwarteten Stelle angelegt,
   oder auf den Standardspeicherort zurückgefallen wird.

**"Session Resume"**: kein eigener Zustand über den Speicherort-Zeiger hinaus nötig — die
verknüpfte oder Standard-Datei bleibt zwischen Starts erhalten. "Erster Start" wird rein daran
erkannt, dass noch keine Liegenschaft existiert.

**Rückwärtskompatibilität**: Import/Verknüpfen fasst die Quelle nie schreibend an (Import
kopiert, Verknüpfen liest nur den Pfad). Die bisherige **app-eigene** Standarddatei wird bei
jedem Wechsel nach `archive/<Zeitstempel>_nk_tool.db` verschoben, nie gelöscht — eine verknüpfte
externe Datei wird beim Trennen/Wechseln nie automatisch angefasst, nur der Zeiger ändert sich.

## Build (macOS, lokal)

```bash
# 1. Frontend-Production-Build aktuell halten
cd frontend && npm run build && cd ..

# 2. Python-Abhängigkeiten (einmalig, global wie der Rest des Projekts)
pip3 install -r desktop/requirements.txt

# 3. App bauen
cd desktop
python3 -m PyInstaller --noconfirm nk-tool.spec
```

Ergebnis: `desktop/dist/NK-Tool.app` (~85 MB, unsigned — siehe unten).

## Build (Windows, nur via CI)

```bash
# in .github/workflows/build-desktop.yml, Job build-windows:
python -m PyInstaller --noconfirm nk-tool-windows.spec
```

Ergebnis: `desktop/dist/NK-Tool/` (Ordner mit `NK-Tool.exe` + Begleitdateien) als Artefakt im
jeweiligen Actions-Run. Lokal nicht gebaut/getestet — bei Verhalten, das sich zwischen macOS und
Windows unterscheiden könnte (z. B. Dateidialog-Verhalten), im CI-Log prüfen.

## Manuell testen

```bash
open desktop/dist/NK-Tool.app
# oder, um Log-Ausgaben in der Konsole zu sehen:
desktop/dist/NK-Tool.app/Contents/MacOS/NK-Tool
```

Ohne vorhandene `~/Library/Application Support/NK-Tool/nk_tool.db` (und ohne Verknüpfung) zeigt
die App direkt beim Start den Willkommens-Hinweis (neue Liegenschaft anlegen ODER bestehende
Datenbank importieren über die Einstellungen). Ist eine Verknüpfung gesetzt, deren Ziel fehlt,
erscheint stattdessen `DbMissingOverlay` (siehe oben).

## App-Icon

`desktop/icon.icns` (macOS) / `desktop/icon.ico` (Windows) — generiert (kein Design von einem
Grafiker), schlichtes Beleg-Symbol in der App-Akzentfarbe. Ersetzbar durch einfaches Überschreiben
der beiden Dateien (gleiche Maße/Namen beibehalten) vor dem nächsten Build.

## Unsigned — bekannte Warnung

Die App ist **nicht codesigniert** (bewusste Entscheidung, siehe `FEATURES_ROADMAP.md`). Beim
ersten Start blockiert macOS Gatekeeper sie ggf. mit "kann nicht geöffnet werden, da der
Entwickler nicht verifiziert werden kann". Umgehen: Rechtsklick auf `NK-Tool.app` → "Öffnen" →
im Dialog nochmal "Öffnen" bestätigen (nur beim allerersten Start nötig). Windows SmartScreen
zeigt vermutlich eine vergleichbare Warnung (nicht verifiziert, siehe oben — kein lokaler
Windows-Rechner zum Gegenprüfen vorhanden).

## App-Datenverzeichnis

| OS | Pfad |
|---|---|
| macOS | `~/Library/Application Support/NK-Tool/` |
| Windows | `%APPDATA%\NK-Tool\` |

Enthält `nk_tool.db`, `archive/` (archivierte alte DBs), `uploads/` (Belege) und
`abrechnungen_pdf/` (generierte PDFs) — vollständig getrennt vom App-Bundle, bleibt bei
App-Updates erhalten.

## Offene Schritte

Installer (`.dmg`/`.pkg` bzw. Inno Setup/MSIX), GitHub-Releases-Update-Check, richtiges
App-Icon (aktuelles ist ein generierter Platzhalter), Bug-Report-Button (aktuell nur ein Link
zu GitHub Issues in den Einstellungen), Codesigning — siehe `FEATURES_ROADMAP.md` Abschnitt
"Desktop-App".

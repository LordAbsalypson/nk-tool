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
  ├── app_data_dir()      – OS-spezifisches App-Datenverzeichnis
  ├── verify_db()         – prüft Kern-Tabellen einer .db-Datei vor Import
  ├── _archive_current_db() – verschiebt (nie löscht) die aktuelle DB nach archive/
  ├── _schedule_restart()   – os.execv-Neustart nach DB-Wechsel
  ├── DesktopApi           – js_api-Klasse, aus der React-UI aufrufbar:
  │     app_info, pick_import_file, verify_import_file, import_db,
  │     create_new_db, reset_link, pick_export_destination, export_db,
  │     open_external
  └── main()               – Backend-Thread starten, EIN Fenster öffnen
```

Frontend-seitig: `frontend/src/hooks/useDesktopApi.ts` (Zugriff auf `window.pywebview.api`),
`frontend/src/components/ui/DesktopSettingsModal.tsx` (Einstellungen-Dialog: DB-Info,
Import/Export/Zurücksetzen, Doku-Links), eingebunden über einen Settings-Button in
`Footer.tsx`. Erststart-Hinweis (keine Liegenschaft vorhanden) direkt in `App.tsx`.

**"Session Resume"**: kein eigener Zustand nötig — die DB-Datei liegt dauerhaft im
App-Datenverzeichnis, bleibt zwischen Starts erhalten. "Erster Start" wird rein daran erkannt,
dass noch keine Liegenschaft existiert.

**Rückwärtskompatibilität**: Import kopiert die Quelle (Original bleibt unangetastet), die
bisherige aktive DB wird beim Wechsel nach `archive/<Zeitstempel>_nk_tool.db` verschoben, nie
gelöscht — für "Neue Datenbank anlegen" und "Zurücksetzen" in den Einstellungen genauso.

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

Ohne vorhandene `~/Library/Application Support/NK-Tool/nk_tool.db` zeigt die App direkt beim
Start den Willkommens-Hinweis (neue Liegenschaft anlegen ODER bestehende Datenbank importieren
über die Einstellungen).

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

# NK-Tool Desktop — Build (macOS)

Schritt 2 des Desktop-App-Plans (siehe `FEATURES_ROADMAP.md`). Bündelt Backend + Frontend-
Production-Build zu einer installierbaren `.app` via [pywebview](https://pywebview.flowrl.com/)
+ [PyInstaller](https://pyinstaller.org/).

## Build

```bash
# 1. Frontend-Production-Build aktuell halten
cd frontend && npm run build && cd ..

# 2. Python-Abhängigkeiten (einmalig, global wie der Rest des Projekts)
pip3 install pywebview pyinstaller

# 3. App bauen
cd desktop
python3 -m PyInstaller --noconfirm nk-tool.spec
```

Ergebnis: `desktop/dist/NK-Tool.app` (~85 MB, unsigned — siehe unten).

## Manuell testen

```bash
open desktop/dist/NK-Tool.app
# oder, um Log-Ausgaben in der Konsole zu sehen:
desktop/dist/NK-Tool.app/Contents/MacOS/NK-Tool
```

Erster Start (kein `~/Library/Application Support/NK-Tool/nk_tool.db` vorhanden) zeigt das
Onboarding-Fenster (neue DB anlegen / bestehende importieren).

## Unsigned — bekannte Warnung

Die App ist **nicht codesigniert** (bewusste Entscheidung, siehe `FEATURES_ROADMAP.md`). Beim
ersten Start blockiert macOS Gatekeeper sie ggf. mit "kann nicht geöffnet werden, da der
Entwickler nicht verifiziert werden kann". Umgehen: Rechtsklick auf `NK-Tool.app` → "Öffnen" →
im Dialog nochmal "Öffnen" bestätigen (nur beim allerersten Start nötig).

## App-Datenverzeichnis

| OS | Pfad |
|---|---|
| macOS | `~/Library/Application Support/NK-Tool/` |
| Windows (geplant) | `%APPDATA%\NK-Tool\` |

Enthält `nk_tool.db`, `uploads/` (Belege) und `abrechnungen_pdf/` (generierte PDFs) — vollständig
getrennt vom App-Bundle, bleibt bei App-Updates erhalten.

## Offene Schritte

Windows-Build (via GitHub Actions, kein lokaler Windows-Rechner), Installer (`.dmg`/`.pkg` bzw.
Inno Setup), Settings-Deinstallation, GitHub-Releases-Update-Check, App-Icon/Branding,
Bug-Report-Button — siehe `FEATURES_ROADMAP.md` Abschnitt "Desktop-App".

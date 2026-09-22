# Contributing to nk-tool

Danke für dein Interesse an nk-tool! Kurzer Leitfaden für Beiträge.

## Setup

Vollständige Setup-Anleitung (Voraussetzungen, Backend/Frontend-Start) steht in der
[README](README.md#selbst-hosten--entwicklung).

## Bevor du einen Pull Request öffnest

Bitte lokal prüfen, dass folgende Checks grün sind — die gleichen, die auch die CI
(`.github/workflows/build-desktop.yml`) ausführt:

```bash
# Backend: Tests + Typecheck
cd backend
pip install -r requirements-dev.txt
pytest tests/ -v
mypy .

# Frontend: Lint + Typecheck + Build
cd frontend
npm install
npm run lint
npx tsc --noEmit
npm run build
```

Neue Backend-Logik (insbesondere alles, was `schluessel_engine.py` betrifft — die eigentliche
Geldberechnung) sollte mit einem Test in `backend/tests/test_schluessel_engine.py` abgedeckt
sein. Nutze dafür ausschließlich synthetische Fixtures aus `backend/tests/fixtures.py` (siehe
Docstring dort) — niemals echte Daten in Testcode einbetten.

## Branches & Pull Requests

- Ein PR pro thematisch zusammengehöriger Änderung, mit kurzer Beschreibung, was und warum
  geändert wurde.
- Commit-Nachrichten auf Deutsch oder Englisch, aussagekräftig (kein "fix stuff").
- Für größere Änderungen (neue Features, Architekturentscheidungen) gerne vorher ein Issue
  öffnen, um die Richtung kurz abzustimmen, bevor viel Arbeit reinfließt.

## Transparenz: KI-unterstützte Entwicklung

Ein Teil des Codes dieses Projekts wurde mit KI-Unterstützung (Claude) geschrieben — Details
siehe [README](README.md). Das gilt genauso für Beiträge von Mitwirkenden: KI-unterstützter Code
ist willkommen, muss aber von dir verstanden und verantwortet werden, bevor du ihn einreichst.

## Fragen / Bugs

Bitte über [GitHub Issues](https://github.com/LordAbsalypson/nk-tool/issues). Für
Sicherheitslücken siehe [SECURITY.md](SECURITY.md) — nicht als öffentliches Issue melden.

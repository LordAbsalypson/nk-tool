# NK-Tool — Features & Roadmap

> Stand: 2026-09-18. Ersetzt/ergänzt die veraltete Feature-Beschreibung in `CLAUDE.md`
> (dort ist noch von "Stage2/Stage3" die Rede — der Ablauf wurde inzwischen zu einem
> gemeinsamen "Live"-Flow mit 5 Schritten zusammengeführt).

## 1. Aktuelle Features

Der Ablauf gliedert sich in **Stammdaten** (einmalig pro Liegenschaft) und einen
**Live-Bereich** mit den vier Schritten Kostenarten → Zählerstände →
Vorauszahlungen → Abrechnung.

### Stammdaten
- Verwaltung mehrerer Liegenschaften (Adresse, Fläche, Personenzahl, CO₂-Klasse-Feld reserviert)
- Wohnungen und Mieter in einem gemeinsamen Tab erfasst (Stammdaten-Fusion) — keine
  separaten Klicks mehr zwischen zwei Listen
- Zählerverwaltung, gruppiert nach Heizung (kWh-Zähler oder HKV-Einheiten),
  Wasser (Kalt-/Warmwasser) und Strom, mit Klapp-/Collapsible-Ansicht
- Automatische Übernahme des Vorjahres-Zählerstands als Vorschlag bei neuer Ablesung
- Frei konfigurierbare Kostenarten mit Drag-and-Drop-Sortierung und Kopierfunktion
  auf andere Liegenschaften
- Abrechnungsperioden anlegen und verwalten
- **Liegenschafts-Verbund**: Gemeinschaftskosten (z. B. gemeinsame Versicherung,
  gemeinsamer Hauswart) über mehrere Häuser hinweg anteilig verteilen, ohne die
  Häuser als eine Liegenschaft führen zu müssen

### Kosteneingabe (Live-Schritte 1–3)
- Rechnungspositionen je Kostenart erfassen, inkl. Beleg-Upload (PDF/JPG/PNG)
- **Direkt-Preise-Ansatz**: Kosten werden direkt mit Preisen je Einheit erfasst statt
  über das ältere HKVO-§9/Gradtagzahlen-Modell — einfacherer, transparenterer
  5-Schritt-Ablauf für die tatsächlich genutzte Datenlage
- Zählerstände erfassen und bearbeiten (inkl. Bearbeiten-Button pro Ablesung)
- Monatliche Vorauszahlungen pro Mieter, automatisch generiert und inline editierbar
- Validierungs-/Checkup-Übersicht: zeigt fehlende oder unplausible Daten vor der
  Berechnung an
- Globale Suche über Wohnungen, Mieter, Zählerstände und Werte, inkl. direkter
  Wert-Korrektur aus der Trefferliste (`PATCH /suche/wert`)

### Abrechnung (Live-Schritt 4)
- Kostenverteilung je Mieter berechnen und Mieterwechsel-Zeitanteile korrekt
  darstellen (inkl. Verbrauchsaufteilung bei unterjährigem Wechsel)
- **Ausprobieren-Modus**: rein lesende Live-Vorschau, mit der sich Zahlen probeweise
  ändern lassen, ohne die echten Daten zu verändern — Debounced-Vorschau der
  Auswirkung auf das Ergebnis
- **Personen-Split**: Aufteilung von Kostenanteilen nach Personenzahl innerhalb
  einer Wohnung/Abrechnung
- **Sammelabrechnung**: eine gebündelte Übersicht/Export für mehrere Mieter statt
  Einzelabrechnung für Einzelabrechnung
- Einzelabrechnungen mit A4-Druck-CSS (`window.print()`)
- **PDF-Vorlagen-Editor**: global editierbarer Briefkopf, Textbausteine und
  Fußzeile für die Abrechnungs-PDFs, mit Live-Vorschau (Singleton-Konfiguration,
  über eigenes Modal editierbar)

### Durchgängig
- Dark Mode (Tailwind `class`-Strategie, persistiert in localStorage)
- Stage-Farbcodierung (Blau/Amber/Smaragd), Tooltips, Glossar mit 15 NK-Begriffen
- Icon-Set vereinheitlicht (aktuellster Commit)
- Todo-Router für interne Aufgabenverwaltung im Tool

## 2. Bekannte Lücken / offene Punkte

Geprüft gegen aktuellen Code (nicht nur gegen die CLAUDE.md-Beschreibung):

- **HKV-Fallback weiterhin nicht implementiert**: `TYP_HKV_EINHEITEN` ist in
  `backend/domain.py` definiert und `hkv_einheiten` taucht in
  `backend/schluessel_engine.py` nur als Label/Einheit auf (Zeilen ~421–429) — es
  gibt dort **keinen Berechnungspfad**, der bei fehlenden `waerme_kwh`-Zählern auf
  HKV-Einheiten für den Verbrauchsanteil zurückfällt. Der bisherige Hinweis aus
  CLAUDE.md ("aktuell harmlos, da keine echte Wohnung nur HKV-Zähler hat") bleibt
  gültig, ist aber weiterhin ein offener technischer Punkt vor dem nächsten
  HKV-Zähler-Fall.
- ~~**Zwei parallele Berechnungs-Engines**~~ — geklärt und behoben (2026-09-18):
  `backend/routers/berechnung.py` (alter Stage3-Router, `berechne_periode` und die
  darauf aufbauenden Helfer `_compute_direct_units`/`_make_row`) hatte **keine
  Frontend-Aufrufer mehr** (bestätigt per Grep gegen `frontend/src`) und wurde
  entfernt. Die dazugehörigen Regressions-Testtools (`tests/test_regression.py`,
  `tests/make_baseline.py`, `tests/snapshot.py`, `tests/query_count.py`,
  `tests/test_engine_edgecases.py` — das GOAL.md-Regressionsgatter für die alte
  Engine) wurden ebenfalls entfernt. Vollständiger Vorzustand gesichert im Branch
  `legacy/stage3-engine`. `backend/engine.py` **bleibt bestehen** — es liefert
  weiterhin geteilte, aktiv genutzte Bausteine (`Segment`, `_build_segments`,
  `_get_verbrauch_geschaetzt`, `_gradtag_sum`, `_parse`, `_days`, `_verbrauch_je_segment`)
  für den aktuellen `schluessel_engine.py`-Ansatz. Backend-Tests (20/20) und
  `tsc --noEmit` nach der Entfernung grün.
- **VorauszahlungenTab**: weiterhin pro Mieter statt pro Wohnung aggregiert (so wie
  in CLAUDE.md dokumentiert) — vom Nutzer gewünschte Aggregation wurde nicht
  umgesetzt.
- **Manuelle Korrekturen ohne Audit-Trail**: "Zahlen anpassen" in der Abrechnung mit
  Nachvollziehbarkeit (wer hat wann was warum geändert) ist weiterhin nicht gebaut.
  Der neue Ausprobieren-Modus deckt nur die *lesende* Simulation ab, keine
  dauerhafte, protokollierte Korrektur.
- **Jahresvergleich** (Year-over-Year) weiterhin nicht vorhanden.
- **CO₂-Abgabe-Split**: `co2_klasse`-Feld ist reserviert, aber keine
  Berechnungslogik dahinter.
- **Fernwärme als Heizungsart**: weiterhin nicht unterstützt.
- Die Test-/Doku-Dateien (`conftest.py`, `test_validation.py`, `make_baseline.py`)
  wurden im Rahmen der aktuellen uncommitteten Änderungen ebenfalls angepasst —
  sollte vor dem nächsten Commit auf Konsistenz mit dem neuen Direkt-Preise-Ansatz
  geprüft werden (nicht im Detail verifiziert, da dies reale Test-DB-Mechanik
  berührt, siehe Arbeitsregeln in `CLAUDE.md`).

## 3. Roadmap-Ideen (Zukunft)

- **CSV/Excel-Import für Zählerstände**: Kleinvermieter erfassen Ablesungen oft
  schon in Excel/Handy-Notizen (siehe Oma-Handschrift → Excel-Workflow in
  CLAUDE.md) — ein Import würde die doppelte manuelle Übertragung ins Tool
  entfallen lassen und Tippfehler reduzieren.
- **E-Mail-Versand der Einzelabrechnungen direkt aus dem Tool**: Aktuell nur Druck
  via `window.print()`. Für Mieter, die nicht vor Ort sind, spart ein
  Direktversand (PDF-Anhang, ggf. über bestehenden Gmail-Zugang) den Umweg über
  ein externes Mailprogramm.
- **Mehrjahresvergleich pro Wohnung/Mieter**: Kleinvermieter wollen sehen, ob
  Verbrauch/Kosten gegenüber dem Vorjahr steil gestiegen sind (z. B. um
  Plausibilität zu prüfen oder Mietern Erklärungen zu liefern) — bisher nur
  Einzelperioden-Sicht.
- **Automatisches Einlesen von Versorger-Rechnungen (EWE, OOWV) per PDF-Parsing**:
  Reduziert manuelles Abtippen von Zählerständen/Beträgen aus PDF-Rechnungen,
  die ohnehin schon als Beleg hochgeladen werden — direkte Weiterverarbeitung
  spart den größten wiederkehrenden Zeitaufwand pro Abrechnungsrunde.
- **Audit-Trail für manuelle Korrekturen** (bereits als Lücke benannt): Wichtig,
  sobald das Tool von mehr als einer Person gepflegt wird oder Mieter eine
  Abrechnung anfechten — Nachvollziehbarkeit schützt den Vermieter rechtlich.
- **Mehrbenutzer-/Mehrvermieter-Fähigkeit**: Für eine Öffnung als Open-Source-Tool
  über den ursprünglichen Eigentümer hinaus wird eine Mandantentrennung
  (mehrere Vermieter mit eigenen Liegenschaften/Logins) nötig — aktuell ist das
  Tool implizit single-tenant (eine Person, eine SQLite-DB).
- **Mobile-freundliche Zählerablesung**: Ein schlankes, für Smartphones
  optimiertes Eingabeformular (z. B. eigene Route ohne volle Stage1/Live-UI)
  würde die Ablesung direkt vor Ort am Zähler erleichtern, statt Werte erst auf
  Papier zu notieren und später zu übertragen.
- **Bessere Exportformate für rechtssichere Abrechnung**: z. B. ein
  strukturierter Anhang mit allen Rechnungskopien in einem PDF-Paket pro Mieter,
  um Rückfragen/Widersprüche mit Belegen direkt beantworten zu können.
- **Internationalisierung (i18n)**: Für eine Nutzung außerhalb Deutschlands
  müsste die HKVO-spezifische Logik (§9, Gradtagzahlen) von allgemeineren
  Verteilschlüsseln getrennt und Texte übersetzbar gemacht werden — aktuell
  Deutsch und deutsches Nebenkostenrecht fest verdrahtet.
- **Benachrichtigung bei fehlenden Daten vor Periodenende**: Ein einfacher
  Reminder (z. B. E-Mail an den Vermieter), wenn kurz vor Abrechnungsstart noch
  Zählerstände oder Kostenpositionen fehlen — verhindert Zeitdruck am
  eigentlichen Abrechnungstermin.

### Desktop-App (macOS + Windows) — geplantes größeres Vorhaben, Stand 2026-09-18

Löst die aktuelle Schwäche "kein Auth-Layer, nur Dev-Server" strukturell: aus dem
Web-App-Setup (`uvicorn --reload` + `npm run dev`) wird eine installierbare native App ohne
sichtbaren localhost-Server, ohne Netzwerk-Exposure per Default.

**Technischer Ansatz (mit JP abgestimmt):** [pywebview](https://pywebview.flowrl.com/) +
PyInstaller — kein neues Toolchain (Rust/Node) nötig, Backend bleibt Python/FastAPI im selben
Prozess, React-Frontend wird als statischer Production-Build ausgeliefert, `pywebview` öffnet ein
natives Fenster (WebKit auf macOS, WebView2 auf Windows) statt eines Browser-Tabs. Verworfen:
Electron (zu schwer, "schlank" war explizite Anforderung), Tauri (Rust-Toolchain + Python-Sidecar
nötig, mehr Komplexität als der Nutzen hier rechtfertigt).

**Anforderungen (JP, 2026-09-18):**
1. **Installierbar auf macOS und Windows** — kein Terminal, kein `npm run dev` für Endnutzer.
2. **Production-Build statt Dev-Server**, aber **rückwärtskompatibel**: bestehende
   `backend/nk_tool.db` muss beim ersten Start der App automatisch gefunden/übernommen werden,
   nie überschrieben, Backup vor jeder Migration (bestehende Projektregel aus `CLAUDE.md`).
3. **Sauberer Installer** pro Plattform (macOS: `.dmg`/`.pkg`; Windows: Inno Setup oder MSIX).
4. **Deinstallations-Möglichkeit direkt in den App-Settings** (nicht nur über
   Systemsteuerung/Finder-Papierkorb) — inkl. klarer Abfrage, ob die lokale Datenbank dabei
   erhalten oder gelöscht werden soll.
5. **Installation/Update über GitHub** (Releases-Seite des öffentlichen Repos
   [nk-tool](https://github.com/LordAbsalypson/nk-tool) als Distributionskanal) — In-App-Hinweis
   bei neuer Version, kein separater Update-Server nötig.
6. **Durchdachtes, zeitloses UI-Design** für die App-Hülle (Fenster-Chrome, Branding,
   Erststart-Erlebnis) — nicht nur die bestehende Web-UI 1:1 in ein Fenster gepackt.
7. **Bug-Reporting direkt in der App** (z. B. Button, der ein vorausgefülltes GitHub-Issue im
   öffentlichen Repo öffnet, optional mit Log-Auszug/Versionsnummer).
8. **"Wie funktioniert es unter der Haube"-Dokumentation** im öffentlichen GitHub-Repo — verweist
   auf [`ARCHITECTURE.md`](ARCHITECTURE.md), ergänzt um die App-Packaging-Architektur
   (pywebview-Fenster ↔ lokaler FastAPI-Prozess ↔ SQLite-Datei im App-Datenverzeichnis).

**Fortschritt (Stand 2026-09-18):**
1. ✅ Lokaler Prototyp (pywebview + Production-Build) — `desktop/app.py`, lokal verifiziert.
2. ✅ PyInstaller-Bundle macOS + Windows — `desktop/nk-tool.spec` / `nk-tool-windows.spec`,
   CI-Workflow (`.github/workflows/build-desktop.yml`) baut beide auf jedem Push, beide Läufe
   grün verifiziert. `backend/requirements.txt` fehlte `reportlab` (PDF-Erzeugung) — gefixt.
   `frontend/package-lock.json` war für `npm ci` inkonsistent (Bug in optionalen
   Rolldown-WASM-Plattformbindungen) — Workflow nutzt `npm install`.
3. ✅ Erststart-/Import-Logik überarbeitet und **korrigierter Bug**: ursprüngliches Design
   (separates Onboarding-Fenster, bei Klick auf "Bestehende Datenbank importieren" zerstört und
   neu erzeugt) fror beim echten Test ein. Root Cause gefunden und verifiziert: die
   Dateidialog-Filterstrings enthielten einen Bindestrich ("SQLite-Datenbank"), den pywebviews
   Validierungs-Regex `^([\w ]+)\(...)$` ablehnt — die Exception flog innerhalb des
   js_api-Aufrufs, das JS-Promise blieb für immer hängen (kein Cocoa-Threading-Problem, wie
   zunächst vermutet). Strukturell behoben: **ein** dauerhaftes Fenster über die ganze
   Prozesslaufzeit statt eines separaten Onboarding-Fensters; Import/Export/Zurücksetzen laufen
   jetzt aus der normal laufenden React-UI heraus (`DesktopSettingsModal.tsx`,
   `getDesktopApi.ts`). Fix live am gebauten macOS-Bundle nachgestellt: Dateidialog öffnet
   jetzt korrekt (Screenshot-verifiziert), kein Freeze mehr.
4. ✅ Session Resume — kein eigener Zustand nötig, DB-Datei bleibt im App-Datenverzeichnis
   erhalten; "erster Start" wird rein daran erkannt, dass noch keine Liegenschaft existiert.
5. ✅ Einstellungen-Dialog in der App (Footer-Icon): DB-Pfad/-Größe, Import (verifiziert vor
   Übernahme), Export, "Neue Datenbank anlegen"/"Zurücksetzen" (beide archivieren die bisherige
   DB nach `archive/<Zeitstempel>_nk_tool.db` statt sie zu löschen — Rückwärtskompatibilität
   garantiert, kein Datenverlust), Doku-Links (README/Roadmap/Architektur/Issues).
6. ✅ App-Icon — generierter Platzhalter (`desktop/icon.icns`/`icon.ico`, schlichtes
   Beleg-Symbol in der App-Akzentfarbe), kein Grafikdesign. In beiden Spec-Dateien eingebunden.
7. ⬜ Installer (`.dmg`/`.pkg` macOS, Inno Setup/MSIX Windows).
8. ⬜ GitHub-Releases-Update-Check (In-App-Hinweis bei neuer Version).
9. ⬜ Bug-Report-Button (aktuell nur ein Link zu GitHub Issues in den Einstellungen, kein
   vorausgefülltes Formular mit Log-Auszug/Versionsnummer).
10. ⬜ Ausführliches In-App-Tutorial/Schritt-für-Schritt-Anleitung (aktuell nur
   Willkommens-Hinweis + Doku-Links, kein geführter Ablauf).
11. ⬜ Codesigning (bewusst zurückgestellt, siehe LEGAL_NOTES.md/Kostenfrage).
12. ✅ Frei wählbarer Speicherort ("Datei verknüpfen", 2026-09-19): Datenbank muss nicht mehr
    zwingend im App-Datenverzeichnis liegen — Nutzer kann eine bestehende `.db`-Datei an
    beliebigem Ort (z. B. iCloud-Ordner) verknüpfen, ohne Kopie; die App schreibt dann direkt
    dorthin. Verknüpfung läuft über einen Zeiger (`db_location.json`), nie über die Datei selbst.
    Fehlt die verknüpfte Datei beim Start (umbenannt/verschoben/Laufwerk nicht verfügbar), zeigt
    `DbMissingOverlay` einen blockierenden "Datei suchen"-Dialog (Link-Finder-Prinzip wie bei
    Medienschnitt-Software) — mit Optionen: Datei suchen, neue DB genau dort anlegen, oder auf
    Standardspeicherort zurückfallen. Nur die app-eigene Standarddatei wird bei einem Wechsel
    automatisch archiviert (nie gelöscht); eine verknüpfte externe Datei fasst die App beim
    Trennen/Wechseln nie an. Live end-to-end getestet: echte Produktions-DB an einen
    selbst gewählten iCloud-Ordner verknüpft, App-Neustart liest korrekt von dort (Saldo-Werte
    exakt wie zuvor bestätigt). Genauer Pfad bewusst nicht dokumentiert (privater Ordnername).

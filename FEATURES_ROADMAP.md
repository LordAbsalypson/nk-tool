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
  schon handschriftlich oder in Excel/Handy-Notizen — ein Import würde die
  doppelte manuelle Übertragung ins Tool entfallen lassen und Tippfehler
  reduzieren.
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

**Technischer Ansatz (mit dem Maintainer abgestimmt):** [pywebview](https://pywebview.flowrl.com/) +
PyInstaller — kein neues Toolchain (Rust/Node) nötig, Backend bleibt Python/FastAPI im selben
Prozess, React-Frontend wird als statischer Production-Build ausgeliefert, `pywebview` öffnet ein
natives Fenster (WebKit auf macOS, WebView2 auf Windows) statt eines Browser-Tabs. Verworfen:
Electron (zu schwer, "schlank" war explizite Anforderung), Tauri (Rust-Toolchain + Python-Sidecar
nötig, mehr Komplexität als der Nutzen hier rechtfertigt).

**Anforderungen (2026-09-18):**
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
13. ✅ Passwortschutz pro Datenbank (2026-09-19): optional, Backward-kompatibel (keine
    bestehende Installation ohne Passwort betroffen). Backend-seitig implementiert
    (`backend/auth.py`, `backend/routers/auth.py`, `models.AppAuth`) — greift dadurch
    **identisch in Web-Browser und Desktop-App**, kein separater Code-Pfad (siehe
    Abschnitt "Web-App und Desktop-App: dieselbe Basis" unten). PBKDF2-HMAC-SHA256
    (600.000 Iterationen, OWASP-Empfehlung), kein neuer Abhängigkeits-/Kompilierungsaufwand
    für PyInstaller. Passwort ODER ein einmalig beim Einrichten gezeigter Recovery-Code
    (nie danach im Klartext gespeichert) loggen ein. Session-Token: HMAC-signiert,
    12 Std. gültig, pro Datenbank ein eigenes Secret (`AppAuth.token_secret`) — kein
    serverseitiger Session-Speicher nötig. Frontend: `LoginOverlay.tsx` blockiert die
    App, bis eingeloggt; `SecuritySettings.tsx` (Einrichten/Ändern/Entfernen) in den
    Einstellungen, in Web- UND Desktop-Variante gerendert.

    **Dabei gefundener und behobener echter Bug**: `create_token`/`verify_token` trennten
    Payload und rohe HMAC-Signatur mit einem Byte-Trennzeichen (`b"."`) — die Signatur ist
    aber zufällige Binärdaten und kann dieses Byte selbst enthalten (~12 % Wahrscheinlichkeit
    bei 32 Byte), wodurch der Split an der falschen Stelle landete und gültige Tokens
    fälschlich abgelehnt wurden (reproduzierbar in Testläufen, ca. 1 von 10–15). Gefixt durch
    feste Signaturlänge (Slice statt Trennzeichen-Split) statt Trennzeichen-Suche — mit 2000
    Testzyklen und 20 vollständigen Testsuiten-Durchläufen ohne Fehlschlag verifiziert.

    **Bewusst nicht umgesetzt** (siehe unten, eigene Design-Dokumente nötig):
    Datenbank-Verschlüsselung (SQLCipher), Passkey/WebAuthn, Touch ID/Windows Hello,
    E-Mail-basierter Passwort-Reset.

### Web-App und Desktop-App: dieselbe Basis

Beide sind **derselbe FastAPI-Backend-Prozess** (`backend/main.py`) mit demselben
React-Frontend-Build — die Desktop-App (`desktop/app.py`) startet diesen Prozess nur
zusätzlich lokal und öffnet ein natives pywebview-Fenster statt eines Browser-Tabs. Jedes
Feature, das direkt gegen die REST-API arbeitet (wie der neue Passwortschutz), funktioniert
dadurch automatisch in beiden Kontexten identisch, ohne Zusatzaufwand. Nur Desktop-
spezifische Dinge (Speicherort-Verknüpfung, natives Datei-öffnen-Dialog, App-Neustart) laufen
über die pywebview-`js_api`-Brücke (`DesktopApi`) und sind im Browser-Dev-Modus (`npm run dev`
+ `uvicorn --reload`) naturgemäß nicht verfügbar — an genau den Stellen zeigt die UI das auch
klar an (siehe `DesktopSettingsModal.tsx`), statt es zu verschweigen.

## 4. Geplante Features — Design-Dokumente (noch nicht umgesetzt)

Für die folgenden vier Punkte wurde noch kein Code geschrieben — dies sind Umsetzungspläne,
damit eine spätere Session direkt loslegen kann, ohne die Grundsatzfragen neu zu klären.

### 4.1 CSV/Excel-Import für Zählerstände

**Problem**: Ablesungen werden oft handschriftlich/in Excel erfasst, dann manuell ins Tool
übertragen — doppelte Arbeit, Tippfehlerquelle.

**Ansatz**:
- Neuer Endpunkt `POST /perioden/{id}/zaehlerstaende/import` (multipart, CSV oder XLSX).
- Spalten-Mapping-UI (nicht starr auf feste Spaltennamen): Nutzer lädt Datei hoch, Tool zeigt
  erkannte Spalten (per Header-Zeile) in einem Dropdown-Zuordnungs-Dialog
  ("Spalte 'Zählernr.' → `zaehler_id`", "Spalte 'Stand' → `wert`", "Spalte 'Datum' → `ablesedatum`")
  — verhindert stures Scheitern bei abweichenden Excel-Layouts, wie sie real vorkommen.
- Zähler-Zuordnung über `ewe_vertragsnummer` ODER Wohnungsbezeichnung + Zählertyp als
  Fallback-Schlüssel (Zählernummern in Excel-Exports stimmen erfahrungsgemäß nicht immer
  exakt mit den im Tool hinterlegten überein — siehe `NEBENKOSTEN_STATUS.md`-Historie zu
  Wohnungsnummern-Diskrepanzen).
- Vorschau vor dem eigentlichen Import: Tabelle mit Alt-Wert/Neu-Wert/Differenz je Zeile,
  Zeilen mit unplausiblen Werten (kleiner als Vorwert, siehe 4.3) rot markiert und **nicht**
  vorausgewählt — Nutzer bestätigt explizit pro Zeile oder per "alle plausiblen übernehmen".
- Backend: Python `csv`-Modul (Stdlib) für CSV; für XLSX `openpyxl` (neue Abhängigkeit,
  reines Python, kein Kompilierungsaufwand — unproblematisch für PyInstaller).
- Bibliothek für Fuzzy-Spaltenerkennung: nicht nötig, ein einfacher Exact-Match +
  manuelles Dropdown reicht und ist vorhersagbarer als Raten.

### 4.2 Mehrjahresvergleich pro Wohnung/Mieter

**Problem**: Nur Einzelperioden-Sicht — Vermieter kann nicht auf einen Blick sehen, ob
Verbrauch/Kosten gegenüber dem Vorjahr stark abweichen.

**Ansatz**:
- Neuer Endpunkt `GET /wohnungen/{id}/verlauf` — aggregiert über alle
  `Abrechnungsperiode`n derselben Liegenschaft: je Periode Verbrauch pro Zählertyp
  (aus `Zaehlerstand`) und Gesamtkosten/Saldo (aus der Schlüssel-Abrechnung-Berechnung,
  bereits vorhandene Funktion `berechne_schluessel_mieter` wiederverwendbar).
- Frontend: neuer Tab oder Panel in Stage1 (Wohnungsdetail) — einfaches Balken-/
  Liniendiagramm (keine neue Chart-Bibliothek nötig für 2-5 Datenpunkte typischer
  Perioden-Historie; reines SVG/Tailwind reicht, siehe bereits genutztes Muster ohne
  Chart.js/Recharts im restlichen Tool).
  - **Warnschwelle**: Abweichung > 20 % zum Vorjahr farblich hervorheben (analog zu den
    bestehenden Validierungs-Warnungen in `validierung.py`) — beantwortet direkt die vom
    Nutzer genannte Motivation ("Plausibilität prüfen").
- Kein neues Datenmodell nötig — reine Aggregation über bestehende Tabellen.

### 4.3 Mobile Zählerablesung per QR-Code

**Nutzer-Vision** (wörtlich übernommen): QR-Code am/im Haus aufhängen → Handy scannt →
Browser öffnet eine schlanke mobile Route → große Buttons: 1. Liegenschaft → 2. Wohnung →
3. Zähler → Zählerstand eingeben (Datum automatisch heute) → Speichern (nur wenn Wert
plausibel, d. h. ≥ letzter bekannter Stand) → zurück zur Wohnungsauswahl (mit Option, zur
Liegenschaftsauswahl zurückzuspringen).

**Ansatz**:
- **Kein separater Server/eigene App nötig** — derselbe FastAPI-Prozess, der schon läuft
  (Desktop-App oder `uvicorn`), bekommt eine zusätzliche, bewusst schlanke Route
  `frontend/src/pages/Mobile/` (eigenes React-Router-Segment, z. B. `/mobil`), die NICHT das
  volle App-Shell (TopBar/Sidebar/Stage-Navigation) lädt — nur die 3-Schritte-Auswahl + Eingabe,
  große Touch-Targets, kein Scrollen auf Mobile-Viewport nötig.
- **QR-Code**: zeigt auf `http://<lokale-IP-des-Rechners>:<Port>/mobil` — Problem: das Handy
  muss den Rechner im selben WLAN erreichen können (funktioniert bei den meisten
  Heim-/Firmennetzen, nicht bei isolierten Gäste-WLANs). Der QR-Code selbst wird serverseitig
  generiert (Python `qrcode`-Paket, reines Python + Pillow, das bereits als Abhängigkeit für
  die Icon-Generierung installiert ist) und in den Einstellungen/Stage1 als Bild angezeigt
  ("Mobil-Ablesung QR-Code anzeigen").
- **Auth-Implikation**: Ist ein Passwort gesetzt (siehe 3 oben), müsste die mobile Route
  entweder denselben Login durchlaufen (zusätzlicher Reibungspunkt am Zähler mit kalten
  Fingern) oder einen **separaten, schreibgeschränkten "Ablese-Token"** bekommen — ein Token,
  das NUR `POST .../zaehlerstaende` erlaubt, sonst nichts. Empfehlung: eine zweite Token-Art
  (`scope: "meter-entry"`) statt vollen Zugriffs, analog zu OAuth-Scopes, aber ohne
  OAuth-Overhead — einfach ein zusätzliches Feld im bestehenden Token-Payload.
- **Plausibilitätsprüfung**: Endpunkt lehnt Werte < letztem bekannten Stand serverseitig ab
  (nicht nur im Frontend) — sonst könnte ein Tippfehler unbemerkt einen Zählerstand
  zurücksetzen. Nutzt dieselbe Validierungslogik wie die bestehende
  Zählerstand-Eingabe in Stage 2/3.
- **Offline-Fall** (kein WLAN am Zähler): außerhalb des ursprünglichen Scopes — für jetzt
  explizit nicht geplant (würde eine PWA mit Offline-Sync brauchen, deutlich mehr Aufwand).

### 4.4 Rechtssichere/nachvollziehbare Berechnung (Antwort auf LEGAL_NOTES.md Punkt 2)

**Ziel**: Das im Rechts-Risiko-Dokument benannte Haftungsrisiko ("fehlerhafte Berechnung
→ finanzieller Schaden, im schlimmsten Fall Rechtsstreit") strukturell reduzieren, nicht nur
per Disclaimer abwälzen.

**Ansatz** (mehrere unabhängige Bausteine, keiner davon einzeln ausreichend):
1. **Audit-Trail für manuelle Korrekturen** (bereits als Lücke in Abschnitt 2 benannt) —
   Voraussetzung für Nachvollziehbarkeit überhaupt. Ohne das ist "rechtssicher" nicht
   erreichbar, unabhängig von allem anderen hier.
2. **Formel-Dokumentation direkt neben dem Ergebnis**: die Abrechnungs-PDF und die
   Web-Ansicht zeigen bereits die "Grundlage" je Kostenzeile (z. B. "1 Einheit × 97.29 € ×
   365/365 Tage", siehe `schluessel_abrechnung.py`) — das ist der wichtigste Baustein für
   Nachvollziehbarkeit gegenüber Mietern und sollte konsequent für JEDE Kostenart-Basis
   (auch `kwh_heizung`/`m3_wasser_gesamt` mit HKVO-§9-Split) gleich detailliert sein; aktuell
   nicht durchgehend geprüft.
3. **Automatisierter Vergleichstest gegen bekannte, von Menschenhand geprüfte Referenzwerte**:
   genau das Muster, das in dieser Session für die echten 2025/26-Daten genutzt wurde
   (berechnete Werte gegen die reale Jahresübersicht-PDF Cent-genau verglichen) — als
   dauerhafter Regressionstest (`backend/tests/test_gegen_referenz_pdf.py` o. ä.) statt
   Einmal-Verifikation, damit künftige Code-Änderungen an der Berechnungslogik nicht
   unbemerkt reale Zahlen verändern.
4. **Zweite, unabhängige Berechnung zur Gegenprobe** wäre ideal (z. B. eine grob vereinfachte
   Parallelrechnung, die bei größerer Abweichung warnt), ist aber eigener Aufwand — als
   niedrigste Priorität hier vermerkt, nicht Kernbestandteil des Plans.
5. **Kein Ersatz für Punkt 1–4**: der bestehende Disclaimer (README, LEGAL_NOTES.md) bleibt
   in jedem Fall nötig — Nutzer sind weiterhin selbst verantwortlich, Werte vor Versand zu
   prüfen. Diese vier Bausteine reduzieren das Risiko FALSCHER Berechnung, nicht die
   grundsätzliche Verantwortung des Vermieters.

### 4.5 Datenbank-Verschlüsselung — Entscheidung

Drei Optionen wurden gegenübergestellt (SQLCipher/volle Dateiverschlüsselung,
Feld-Verschlüsselung nur sensibler Spalten, OS-Verschlüsselung + App-Passwort). Entscheidung:
**Option C — OS-Verschlüsselung (FileVault/BitLocker) + das bereits implementierte
App-Passwort.** Begründung: deckt das realistische Bedrohungsmodell einer lokalen
Ein-Nutzer-App ("Laptop gestohlen/verloren") ohne zusätzlichen Code, ohne native
Build-Abhängigkeit (die SQLCipher für PyInstaller auf macOS UND Windows erfordert hätte,
ohne lokale Windows-Testmöglichkeit ein reales Risiko) und ohne die Suche zu brechen (wie es
Feld-Verschlüsselung getan hätte). Keine weitere Implementierung nötig — bleibt so, bis sich
das Bedrohungsmodell ändert (z. B. Weitergabe der rohen `.db`-Datei an Dritte würde SQLCipher
wieder relevant machen, ist aber aktuell kein genannter Anwendungsfall).

### 4.6 Passkey / Touch ID / Windows Hello — Design-Plan (noch nicht implementiert)

**Kernidee**: Alle drei genannten Verfahren (Passkey, Touch ID, Windows Hello) laufen über
denselben Standard — **WebAuthn**. Das ist die einzige Technologie, die plattformübergreifend
(macOS + Windows) mit EINER Implementierung funktioniert, ohne separaten nativen Code
(kein Swift/LocalAuthentication, kein C#/Windows-Hello-API nötig). Das Betriebssystem
entscheidet beim Aufruf selbst, ob es Touch ID, Windows Hello, einen Hardware-Key oder einen
synchronisierten Passkey anbietet — die App muss das nicht unterscheiden.

**Architektur**:
- Backend: `py_webauthn` (reines Python, keine kompilierte Abhängigkeit — passt gut zu den
  bisherigen Build-Erfahrungen mit PyInstaller). Neue Tabelle `WebauthnCredential`
  (id, credential_id, public_key, sign_count, erstellt_am, geraet_label) — mehrere Einträge
  möglich, da ein Credential an ein Gerät gebunden ist (Mac + Windows-PC brauchen je eigene
  Registrierung, beide entsperren dieselbe verlinkte DB).
- Neue Endpunkte: `POST /auth/webauthn/register/begin` + `/complete` (Challenge
  erzeugen/verifizieren, Public Key speichern), `POST /auth/webauthn/login/begin` + `/complete`
  (Challenge erzeugen/Signatur verifizieren, Session-Token wie bisher ausstellen).
- Frontend: `navigator.credentials.create()` bei Registrierung, `navigator.credentials.get()`
  beim Login — Standard-Browser-API, kein neues Paket nötig. Zeigt auf `LoginOverlay.tsx` einen
  zusätzlichen Button "Mit Touch ID / Windows Hello / Passkey anmelden" neben dem bestehenden
  Passwort-Feld.

**Offene technische Risiken (vor Implementierung zu klären)**:
1. **pywebview-WebView-Kompatibilität ungeprüft**: WebAuthn-Unterstützung in der eingebetteten
   WKWebView (macOS) bzw. WebView2 (Windows) ist versions-/OS-abhängig. WebView2 (Chromium-
   basiert) unterstützt WebAuthn inkl. Plattform-Authenticator grundsätzlich, WKWebView ab
   macOS 13 ebenfalls — beides aber nur durch echten Test auf beiden Plattformen verifizierbar,
   nicht durch Doku-Lektüre allein. **UNVERIFIED — vor Implementierung an einem echten Windows-
   Gerät testen, da hier kein lokaler Windows-Rechner zur Verfügung steht.**
2. **Origin/RP-ID-Problem**: WebAuthn bindet Credentials an eine Origin. Die App läuft aktuell
   vermutlich auf `http://127.0.0.1:<Port>` — WebAuthn behandelt `127.0.0.1` nicht zuverlässig
   wie `localhost` als sicheren Kontext. Empfehlung: Server auf `http://localhost:<Port>` statt
   `127.0.0.1` binden (kleine Konfigurationsänderung, kein Architektur-Umbau).
3. **Passwort/Recovery-Code bleiben Pflicht-Fallback**: WebAuthn ist eine ZUSÄTZLICHE,
   schnellere Entsperrmethode, nie die einzige — sonst kein Wiederherstellungsweg, wenn
   Biometrie/Gerät ausfällt. Entspricht Nielsen-Heuristik "Fehler verhindern/Kontrolle beim
   Nutzer" ([CLAUDE.md](CLAUDE.md) `design_and_quality`).
4. **Pro-Gerät-Registrierung**: ein Passkey/Touch-ID-Credential ist an das jeweilige Gerät
   gebunden — bei Nutzung auf Mac UND Windows-PC mit derselben verlinkten DB muss auf beiden
   Geräten einmalig separat registriert werden. Kein Sync der Credentials zwischen den Geräten
   (außer der Nutzer nutzt Apple/Google Passkey-Cloud-Sync, was aber ein größeres Konfigurations-
   Thema wäre und hier nicht vorausgesetzt wird).

**Status**: Reine Planung, "im Hinterkopf behalten" wie gewünscht — keine Implementierung
ohne expliziten Auftrag.

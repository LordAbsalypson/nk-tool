# NK-Tool API Reference (für LLM-/MCP-Nutzung)

> Automatisch generiert aus den registrierten FastAPI-Routen (119 Endpunkte) — `python3 mcp-server/generate_api_reference.py`. Nicht von Hand pflegen, bei API-Änderungen neu generieren.

Alle Pfade sind relativ zur Basis-URL (Desktop-App `http://127.0.0.1:52741/api/v1` oder Dev-Server `http://127.0.0.1:8000/api/v1`, siehe `mcp-server/README.md`). Antwortformat immer `{"ok": true, "data": ...}` oder `{"ok": false, "error": "..."}`.

## Auth

- `POST /api/v1/auth/change-password` — change_password() — Body: `ChangePasswordBody`
- `POST /api/v1/auth/disable` — disable()
- `POST /api/v1/auth/login` — login() — Body: `LoginBody`
- `POST /api/v1/auth/setup` — setup() — Body: `SetupBody`
- `GET /api/v1/auth/status` — status()

## Checkup

- `GET /api/v1/checkup` — checkup()

## Direkt-Preise

- `GET /api/v1/direkt-kostenarten` — list_direkt_kostenarten()
- `POST /api/v1/direkt-kostenarten` — create_direkt_kostenart() — Body: `DirektKostenartCreate`
- `PUT /api/v1/direkt-kostenarten/{kostenart_id}` — update_direkt_kostenart() — Body: `DirektKostenartUpdate`
- `DELETE /api/v1/direkt-kostenarten/{kostenart_id}` — delete_direkt_kostenart()
- `GET /api/v1/perioden/{periode_id}/direkt-kostenarten-werte` — list_direkt_kostenarten_werte()
- `POST /api/v1/perioden/{periode_id}/direkt-kostenarten-werte/aus-vorperiode` — uebernehme_direkt_kostenarten_werte_aus_vorperiode()
- `PUT /api/v1/perioden/{periode_id}/direkt-kostenarten-werte/{kostenart_id}` — set_direkt_kostenart_wert() — Body: `DirektKostenartWertSet`
- `POST /api/v1/perioden/{periode_id}/direkt-kostenarten-werte/{kostenart_id}/split-rechner` — split_rechner() — Body: `DirektSplitRechner`
- `GET /api/v1/perioden/{periode_id}/direkt-uebersteuerungen` — list_uebersteuerungen()
- `PUT /api/v1/perioden/{periode_id}/direkt-uebersteuerungen` — set_uebersteuerung() — Body: `DirektUebersteuerungSet`
- `GET /api/v1/perioden/{periode_id}/gesamteinheiten-vorschlag` — get_gesamteinheiten_vorschlag()
- `POST /api/v1/perioden/{periode_id}/mieter-kombiniert/pdf` — erzeuge_kombinierte_pdf() — Body: `KombinierteAbrechnungRequest`
- `GET /api/v1/perioden/{periode_id}/mieter-kombiniert/pdf/download` — lade_kombinierte_pdf()
- `POST /api/v1/perioden/{periode_id}/mieter-kombiniert/personen-split/pdf` — erzeuge_kombinierte_personen_split_pdf() — Body: `KombiniertePersonenSplitPdfRequest`
- `GET /api/v1/perioden/{periode_id}/mieter-kombiniert/personen-split/pdf/download` — lade_kombinierte_personen_split_pdf()
- `POST /api/v1/perioden/{periode_id}/mieter/{mieter_id}/personen-split/pdf` — erzeuge_personen_split_pdf() — Body: `PersonenSplitPdfRequest`
- `GET /api/v1/perioden/{periode_id}/mieter/{mieter_id}/personen-split/pdf/download` — lade_personen_split_pdf()
- `POST /api/v1/perioden/{periode_id}/mieter/{mieter_id}/schluessel-abrechnung/pdf` — erzeuge_schluessel_pdf() — Body: `PdfAbschnitteOptionen`
- `GET /api/v1/perioden/{periode_id}/mieter/{mieter_id}/schluessel-abrechnung/pdf` — lade_schluessel_pdf()
- `POST /api/v1/perioden/{periode_id}/mieter/{mieter_id}/schluessel-abrechnung/vorschau` — vorschau_schluessel_abrechnung() — Body: `VorschauRequest`
- `GET /api/v1/perioden/{periode_id}/pdf-archiv` — list_pdf_archiv()
- `DELETE /api/v1/perioden/{periode_id}/pdf-archiv` — delete_pdf_archiv_datei()
- `POST /api/v1/perioden/{periode_id}/sammelabrechnung/pdf` — erzeuge_sammelabrechnung() — Body: `SammelabrechnungRequest`
- `GET /api/v1/perioden/{periode_id}/sammelabrechnung/pdf/download` — lade_sammelabrechnung_pdf()
- `GET /api/v1/perioden/{periode_id}/schluessel-abrechnung` — get_schluessel_abrechnung()
- `POST /api/v1/perioden/{periode_id}/schluessel-abrechnung/pdf-alle` — erzeuge_alle_schluessel_pdfs_zip() — Body: `PdfAbschnitteOptionen`
- `GET /api/v1/perioden/{periode_id}/schluessel-abrechnung/pdf-alle/download` — lade_alle_schluessel_pdfs_zip()
- `POST /api/v1/perioden/{periode_id}/schluessel-abrechnung/vorschau` — vorschau_schluessel_abrechnung_periode() — Body: `VorschauRequest`
- `GET /api/v1/perioden/{periode_id}/schluesselpreise` — get_schluesselpreise()
- `PUT /api/v1/perioden/{periode_id}/schluesselpreise` — set_schluesselpreise() — Body: `SchluesselPreiseSet`
- `GET /api/v1/wohnungen/{wohnung_id}/personen-split-vorlage` — get_personen_split_vorlage()
- `PUT /api/v1/wohnungen/{wohnung_id}/personen-split-vorlage` — set_personen_split_vorlage() — Body: `PersonenSplitVorlageSet`

## Kostenpositionen

- `PUT /api/v1/kostenpositionen/{kp_id}` — update_kostenposition() — Body: `KostenpositonUpdate`
- `DELETE /api/v1/kostenpositionen/{kp_id}` — delete_kostenposition()
- `POST /api/v1/kostenpositionen/{kp_id}/beleg` — upload_beleg() — Body: `Body_upload_beleg_api_v1_kostenpositionen__kp_id__beleg_post`
- `GET /api/v1/kostenpositionen/{kp_id}/beleg` — get_beleg()
- `DELETE /api/v1/kostenpositionen/{kp_id}/beleg` — delete_beleg()
- `PUT /api/v1/kostenpositionen/{kp_id}/split` — update_split() — Body: `SplitUpdate`
- `POST /api/v1/kostenpositionen/{kp_id}/verknuepfen` — verknuepfe_split() — Body: `SplitVerknuepfen`
- `DELETE /api/v1/kostenpositionen/{kp_id}/verknuepfung` — loese_split()
- `GET /api/v1/perioden/{periode_id}/kostenpositionen` — list_kostenpositionen()
- `POST /api/v1/perioden/{periode_id}/kostenpositionen` — create_kostenposition() — Body: `KostenpositonCreate`

## PDF-Vorlage

- `GET /api/v1/pdf-vorlage` — get_pdf_vorlage()
- `PUT /api/v1/pdf-vorlage` — set_pdf_vorlage() — Body: `PdfVorlageIn`
- `GET /api/v1/pdf-vorlage/vorschau` — vorschau_gespeicherte_vorlage()
- `POST /api/v1/pdf-vorlage/vorschau` — vorschau_entwurf() — Body: `PdfVorlageIn`

## Suche

- `GET /api/v1/suche` — suche()
- `PATCH /api/v1/suche/wert` — patch_wert() — Body: `SucheWertPatch`

## Validierung

- `GET /api/v1/perioden/{periode_id}/validierung` — validate_periode()

## Verbund

- `GET /api/v1/verbund` — list_verbund()
- `POST /api/v1/verbund` — create_verbund() — Body: `VerbundCreate`
- `GET /api/v1/verbund/{vid}` — get_verbund()
- `PUT /api/v1/verbund/{vid}` — update_verbund() — Body: `VerbundUpdate`
- `DELETE /api/v1/verbund/{vid}` — delete_verbund()
- `GET /api/v1/verbund/{vid}/kosten` — list_kosten()
- `POST /api/v1/verbund/{vid}/kosten` — create_kosten() — Body: `VerbundKostenCreate`
- `PUT /api/v1/verbund/{vid}/kosten/{kid}` — update_kosten() — Body: `VerbundKostenUpdate`
- `DELETE /api/v1/verbund/{vid}/kosten/{kid}` — delete_kosten()
- `POST /api/v1/verbund/{vid}/kosten/{kid}/anwenden` — anwenden() — Body: `VerbundAnwendenBody`
- `DELETE /api/v1/verbund/{vid}/kosten/{kid}/anwenden` — anwenden_rueckgaengig()
- `POST /api/v1/verbund/{vid}/kosten/{kid}/vorschau` — vorschau()
- `POST /api/v1/verbund/{vid}/mitglieder` — add_mitglied() — Body: `VerbundMitgliedCreate`
- `DELETE /api/v1/verbund/{vid}/mitglieder/{lid}` — remove_mitglied()

## Vorauszahlungen

- `POST /api/v1/perioden/{periode_id}/mieter/{mieter_id}/vorauszahlung-gesamt` — set_vorauszahlung_gesamt() — Body: `VorauszahlungGesamtBody`
- `GET /api/v1/perioden/{periode_id}/vorauszahlungen` — get_vorauszahlungen()
- `PUT /api/v1/vorauszahlungen/{vz_id}` — update_vorauszahlung() — Body: `VorauszahlungUpdate`

## Zählerstände

- `PUT /api/v1/perioden/{periode_id}/mieter/{mieter_id}/verbrauch-override` — set_verbrauch_override() — Body: `MieterVerbrauchSet`
- `GET /api/v1/perioden/{periode_id}/wohnung-verbrauch` — list_wohnung_verbrauch()
- `GET /api/v1/perioden/{periode_id}/wohnungen/{wohnung_id}/verbrauch-override` — list_verbrauch_override()
- `PUT /api/v1/perioden/{periode_id}/wohnungen/{wohnung_id}/wohnung-verbrauch` — set_wohnung_verbrauch() — Body: `WohnungVerbrauchSet`
- `GET /api/v1/perioden/{periode_id}/zaehlerstaende-uebersicht` — get_zaehlerstaende_uebersicht()
- `GET /api/v1/zaehler/{zaehler_id}/staende` — list_zaehlerstaende()
- `POST /api/v1/zaehler/{zaehler_id}/staende` — create_zaehlerstand() — Body: `ZaehlerstandCreate`
- `PUT /api/v1/zaehlerstaende/{stand_id}` — update_zaehlerstand() — Body: `ZaehlerstandUpdate`
- `DELETE /api/v1/zaehlerstaende/{stand_id}` — delete_zaehlerstand()

## kostenarten

- `GET /api/v1/kostenarten/{kid}` — get_kostenart()
- `PUT /api/v1/kostenarten/{kid}` — update_kostenart() — Body: `KostenartUpdate`
- `DELETE /api/v1/kostenarten/{kid}` — delete_kostenart()
- `GET /api/v1/liegenschaften/{lid}/kostenarten` — list_kostenarten()
- `POST /api/v1/liegenschaften/{lid}/kostenarten` — create_kostenart() — Body: `KostenartCreate`

## liegenschaften

- `GET /api/v1/liegenschaften` — list_liegenschaften()
- `POST /api/v1/liegenschaften` — create_liegenschaft() — Body: `LiegenschaftCreate`
- `GET /api/v1/liegenschaften/{lid}` — get_liegenschaft()
- `PUT /api/v1/liegenschaften/{lid}` — update_liegenschaft() — Body: `LiegenschaftUpdate`
- `DELETE /api/v1/liegenschaften/{lid}` — delete_liegenschaft()

## mieter

- `GET /api/v1/mieter/{mid}` — get_mieter()
- `PUT /api/v1/mieter/{mid}` — update_mieter() — Body: `MieterUpdate`
- `DELETE /api/v1/mieter/{mid}` — delete_mieter()
- `PATCH /api/v1/mieter/{mid}/name` — patch_mieter_name() — Body: `MieterNamePatch`
- `GET /api/v1/wohnungen/{wid}/mieter` — list_mieter()
- `POST /api/v1/wohnungen/{wid}/mieter` — create_mieter() — Body: `MieterCreate`

## perioden

- `GET /api/v1/liegenschaften/{lid}/perioden` — list_perioden()
- `POST /api/v1/liegenschaften/{lid}/perioden` — create_periode() — Body: `AbrechnungsperiodeCreate`
- `GET /api/v1/perioden/{pid}` — get_periode()
- `PUT /api/v1/perioden/{pid}` — update_periode() — Body: `AbrechnungsperiodeUpdate`
- `DELETE /api/v1/perioden/{pid}` — delete_periode()
- `GET /api/v1/perioden/{pid}/inhalt` — periode_inhalt()

## sonstige

- `GET /api/health` — health()
- `GET /api/v1/version` — get_version_info()

## todos

- `GET /api/v1/todos` — list_todos()
- `POST /api/v1/todos` — create_todo() — Body: `TodoCreate`
- `PUT /api/v1/todos/{todo_id}` — update_todo() — Body: `TodoUpdate`
- `DELETE /api/v1/todos/{todo_id}` — delete_todo()

## wohnungen

- `GET /api/v1/liegenschaften/{lid}/wohnungen` — list_wohnungen()
- `POST /api/v1/liegenschaften/{lid}/wohnungen` — create_wohnung() — Body: `WohnungCreate`
- `GET /api/v1/wohnungen/{wid}` — get_wohnung()
- `PUT /api/v1/wohnungen/{wid}` — update_wohnung() — Body: `WohnungUpdate`
- `DELETE /api/v1/wohnungen/{wid}` — delete_wohnung()

## zaehler

- `GET /api/v1/wohnungen/{wid}/zaehler` — list_zaehler()
- `POST /api/v1/wohnungen/{wid}/zaehler` — create_zaehler() — Body: `ZaehlerCreate`
- `GET /api/v1/zaehler/{zid}` — get_zaehler()
- `PUT /api/v1/zaehler/{zid}` — update_zaehler() — Body: `ZaehlerUpdate`
- `DELETE /api/v1/zaehler/{zid}` — delete_zaehler()

## Request-Body-Schemas (Pflichtfelder mit `*`, optional mit `?`)

- **`AbrechnungsperiodeCreate`**: `bezeichnung*: str`, `von_datum*: str`, `bis_datum*: str`, `status?: str`, `heiz_preis_kwh?: Optional`, `referenz_gas_kwh?: Optional`, `referenz_wasser_m3?: Optional`
- **`AbrechnungsperiodeUpdate`**: `bezeichnung*: str`, `von_datum*: str`, `bis_datum*: str`, `status?: str`, `heiz_preis_kwh?: Optional`, `referenz_gas_kwh?: Optional`, `referenz_wasser_m3?: Optional`
- **`Body_upload_beleg_api_v1_kostenpositionen__kp_id__beleg_post`**: `file*: UploadFile`
- **`ChangePasswordBody`**: `current_password*: str`, `new_password*: str`
- **`DirektKostenartCreate`**: `name*: str`, `verteilungsbasis*: str`, `hat_grundkosten_split?: bool`, `nur_liegenschaft_id?: Optional`, `sortierung?: int`, `aktiv?: bool`
- **`DirektKostenartUpdate`**: `name*: str`, `verteilungsbasis*: str`, `hat_grundkosten_split?: bool`, `nur_liegenschaft_id?: Optional`, `sortierung?: int`, `aktiv?: bool`
- **`DirektKostenartWertSet`**: `preis_pro_einheit?: Optional`, `preis_grund_pro_m2?: Optional`, `preis_verbrauch_pro_einheit?: Optional`, `verhaeltnis_grund?: Optional`
- **`DirektSplitRechner`**: `gesamtbetrag*: float`, `gesamt_m2*: float`, `gesamt_verbrauch*: float`, `verhaeltnis_grund*: float`
- **`DirektUebersteuerungSet`**: `feld*: Literal`, `mieter_id?: Optional`, `wohnung_id?: Optional`, `kostenart_id?: Optional`, `wert?: Optional`, `begruendung?: Optional`
- **`KombinierteAbrechnungRequest`**: `mieter_ids*: list`, `anzeigename?: Optional`, `datum_anzeigen?: bool`, `datum?: Optional`, `absender_anzeigen?: bool`, `empfaenger_anzeigen?: bool`
- **`KombiniertePersonenSplitPdfRequest`**: `mieter_ids*: list`, `gruppen*: list`, `speichern?: bool`, `datum_anzeigen?: bool`, `datum?: Optional`, `absender_anzeigen?: bool`, `empfaenger_anzeigen?: bool`
- **`KostenartCreate`**: `name*: str`, `verteilungsschluessel*: str`, `kategorie*: str`, `ist_brennstoff?: bool`, `ist_heiz_zusatz?: bool`, `ist_ww_zusatz?: bool`, `sortierung?: int`, `aktiv?: bool`, `ist_voreinstellung?: bool`
- **`KostenartUpdate`**: `name*: str`, `verteilungsschluessel*: str`, `kategorie*: str`, `ist_brennstoff?: bool`, `ist_heiz_zusatz?: bool`, `ist_ww_zusatz?: bool`, `sortierung?: int`, `aktiv?: bool`, `ist_voreinstellung?: bool`
- **`KostenpositonCreate`**: `kostenart_id*: int`, `betrag_brutto*: float`, `betrag_netto?: Optional`, `mwst_prozent?: Optional`, `datum*: str`, `beschreibung*: str`, `beleg_nr?: Optional`, `split_gruppe?: Optional`
- **`KostenpositonUpdate`**: `betrag_brutto?: Optional`, `betrag_netto?: Optional`, `mwst_prozent?: Optional`, `datum?: Optional`, `beschreibung?: Optional`, `beleg_nr?: Optional`
- **`LiegenschaftCreate`**: `name*: str`, `adresse*: str`, `plz*: str`, `ort*: str`, `heizungsart?: str`, `brennstoff_einheit?: str`, `brennstoff_heizwert_kwh?: Optional`, `mittlere_ww_temperatur?: float`, `heiz_grundkosten_anteil?: float`, `ww_grundkosten_anteil?: float`, `co2_klasse?: Optional`, `gemeinschaftsflaeche_m2?: float`
- **`LiegenschaftUpdate`**: `name*: str`, `adresse*: str`, `plz*: str`, `ort*: str`, `heizungsart?: str`, `brennstoff_einheit?: str`, `brennstoff_heizwert_kwh?: Optional`, `mittlere_ww_temperatur?: float`, `heiz_grundkosten_anteil?: float`, `ww_grundkosten_anteil?: float`, `co2_klasse?: Optional`, `gemeinschaftsflaeche_m2?: float`
- **`LoginBody`**: `secret*: str`
- **`MieterCreate`**: `anzeigename*: str`, `einzug_datum*: str`, `auszug_datum?: Optional`, `anzahl_personen?: int`, `monatliche_vorauszahlung?: float`, `ist_leerstand?: bool`, `notizen?: Optional`
- **`MieterNamePatch`**: `anzeigename*: str`
- **`MieterUpdate`**: `anzeigename*: str`, `einzug_datum*: str`, `auszug_datum?: Optional`, `anzahl_personen?: int`, `monatliche_vorauszahlung?: float`, `ist_leerstand?: bool`, `notizen?: Optional`
- **`MieterVerbrauchSet`**: `zaehler_typ*: Literal`, `wert?: Optional`, `notiz?: Optional`, `als_schaetzung_anzeigen?: bool`
- **`PdfAbschnitteOptionen`**: `datum_anzeigen?: bool`, `datum?: Optional`, `absender_anzeigen?: bool`, `empfaenger_anzeigen?: bool`
- **`PdfVorlageIn`**: `absender_name?: Optional`, `absender_strasse?: Optional`, `absender_plz?: Optional`, `absender_ort?: Optional`, `absender_kontakt?: Optional`, `kopf_titel?: Optional`, `anrede_text?: Optional`, `schlusstext?: Optional`, `fusszeile_text?: Optional`, `datum_anzeigen?: bool`, `datum_ort_override?: Optional`, `rand_oben_mm?: Optional`, `rand_unten_mm?: Optional`, `rand_links_mm?: Optional`, `rand_rechts_mm?: Optional`, `auto_skalieren?: bool`
- **`PersonenSplitPdfRequest`**: `gruppen*: list`, `speichern?: bool`, `datum_anzeigen?: bool`, `datum?: Optional`, `absender_anzeigen?: bool`, `empfaenger_anzeigen?: bool`
- **`PersonenSplitVorlageSet`**: `zeilen?: list`
- **`SammelabrechnungRequest`**: `zaehlerstaende?: bool`, `vorauszahlungen?: bool`, `saldo?: bool`, `legende?: bool`
- **`SchluesselPreiseSet`**: `heizung_grundkosten_m2?: Optional`, `heizung_verbrauch_kwh?: Optional`, `warmwasser_grundkosten_m2?: Optional`, `warmwasser_verbrauch_m3?: Optional`, `wasser_abwasser_m3?: Optional`, `grundsteuer_m2?: Optional`, `versicherung_einheit?: Optional`, `reinigung_m2?: Optional`, `muell_person?: Optional`, `regenwasser_einheit?: Optional`, `strom_m2?: Optional`, `strom_person?: Optional`, `wartung_m2?: Optional`
- **`SetupBody`**: `password*: str`
- **`SplitUpdate`**: `betrag_gesamt*: float`, `prozent_hier*: float`, `beschreibung?: Optional`, `datum?: Optional`, `beleg_nr?: Optional`
- **`SplitVerknuepfen`**: `partner_id*: int`
- **`SucheWertPatch`**: `entity_typ*: str`, `entity_id*: int`, `feld*: str`, `wert*: float`
- **`TodoCreate`**: `text*: str`
- **`TodoUpdate`**: `text?: Optional`, `erledigt?: Optional`
- **`VerbundAnwendenBody`**: `perioden*: dict`
- **`VerbundCreate`**: `name*: str`
- **`VerbundKostenCreate`**: `bezeichnung*: str`, `betrag_gesamt*: float`, `schluessel_typ*: str`, `schluessel_werte_json?: Optional`, `datum?: Optional`
- **`VerbundKostenUpdate`**: `bezeichnung?: Optional`, `betrag_gesamt?: Optional`, `schluessel_typ?: Optional`, `schluessel_werte_json?: Optional`, `datum?: Optional`
- **`VerbundMitgliedCreate`**: `liegenschaft_id*: int`, `sort?: int`
- **`VerbundUpdate`**: `name*: str`
- **`VorauszahlungGesamtBody`**: `ziel*: Literal`, `betrag_gesamt*: float`
- **`VorauszahlungUpdate`**: `betrag_ist?: Optional`, `betrag_soll?: Optional`, `scope?: Optional`, `bezahlt_am?: Optional`, `notiz?: Optional`
- **`VorschauRequest`**: `uebersteuerungen?: list`, `kostenart_werte?: list`, `verbrauch_overrides?: list`
- **`WohnungCreate`**: `bezeichnung*: str`, `flaeche_m2*: float`, `anzahl_rwm?: int`, `strom_ueber_vermieter?: bool`, `strom_preis_kwh?: Optional`, `strom_bezug_ab?: Optional`, `sortierung?: int`, `aktiv?: bool`
- **`WohnungUpdate`**: `bezeichnung*: str`, `flaeche_m2*: float`, `anzahl_rwm?: int`, `strom_ueber_vermieter?: bool`, `strom_preis_kwh?: Optional`, `strom_bezug_ab?: Optional`, `sortierung?: int`, `aktiv?: bool`
- **`WohnungVerbrauchSet`**: `zaehler_typ*: Literal`, `wert?: Optional`, `notiz?: Optional`
- **`ZaehlerCreate`**: `typ*: str`, `geraete_nummer?: Optional`, `bezeichnung?: Optional`, `eingebaut_am?: Optional`, `aktiv?: bool`, `ewe_vertragsnummer?: Optional`
- **`ZaehlerUpdate`**: `typ*: str`, `geraete_nummer?: Optional`, `bezeichnung?: Optional`, `eingebaut_am?: Optional`, `aktiv?: bool`, `ewe_vertragsnummer?: Optional`
- **`ZaehlerstandCreate`**: `periode_id*: int`, `ablesedatum*: str`, `wert*: float`, `art*: Literal`, `abgelesen_von?: Optional`, `notiz?: Optional`
- **`ZaehlerstandUpdate`**: `ablesedatum?: Optional`, `wert?: Optional`, `art?: Optional`, `abgelesen_von?: Optional`, `notiz?: Optional`

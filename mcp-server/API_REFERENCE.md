# NK-Tool API Reference (für LLM-/MCP-Nutzung)

> Automatisch generiert aus den registrierten FastAPI-Routen (103 Endpunkte) — `python3 mcp-server/generate_api_reference.py`. Nicht von Hand pflegen, bei API-Änderungen neu generieren.

Alle Pfade sind relativ zur Basis-URL (Standard `http://127.0.0.1:8000/api/v1`, siehe `mcp-server/README.md`). Antwortformat immer `{"ok": true, "data": ...}` oder `{"ok": false, "error": "..."}`.

## Checkup

- `GET /api/v1/checkup` — checkup()

## Direkt-Preise

- `GET /api/v1/direkt-kostenarten` — list_direkt_kostenarten()
- `POST /api/v1/direkt-kostenarten` — create_direkt_kostenart() — Body: `DirektKostenartCreate`
- `PUT /api/v1/direkt-kostenarten/{kostenart_id}` — update_direkt_kostenart() — Body: `DirektKostenartUpdate`
- `DELETE /api/v1/direkt-kostenarten/{kostenart_id}` — delete_direkt_kostenart()
- `GET /api/v1/perioden/{periode_id}/direkt-kostenarten-werte` — list_direkt_kostenarten_werte()
- `PUT /api/v1/perioden/{periode_id}/direkt-kostenarten-werte/{kostenart_id}` — set_direkt_kostenart_wert() — Body: `DirektKostenartWertSet`
- `POST /api/v1/perioden/{periode_id}/direkt-kostenarten-werte/{kostenart_id}/split-rechner` — split_rechner() — Body: `DirektSplitRechner`
- `GET /api/v1/perioden/{periode_id}/direkt-uebersteuerungen` — list_uebersteuerungen()
- `PUT /api/v1/perioden/{periode_id}/direkt-uebersteuerungen` — set_uebersteuerung() — Body: `DirektUebersteuerungSet`
- `GET /api/v1/perioden/{periode_id}/gesamteinheiten-vorschlag` — get_gesamteinheiten_vorschlag()
- `POST /api/v1/perioden/{periode_id}/mieter-kombiniert/pdf` — erzeuge_kombinierte_pdf() — Body: `KombinierteAbrechnungRequest`
- `GET /api/v1/perioden/{periode_id}/mieter-kombiniert/pdf/download` — lade_kombinierte_pdf()
- `POST /api/v1/perioden/{periode_id}/mieter/{mieter_id}/personen-split/pdf` — erzeuge_personen_split_pdf() — Body: `PersonenSplitPdfRequest`
- `GET /api/v1/perioden/{periode_id}/mieter/{mieter_id}/personen-split/pdf/download` — lade_personen_split_pdf()
- `POST /api/v1/perioden/{periode_id}/mieter/{mieter_id}/schluessel-abrechnung/pdf` — erzeuge_schluessel_pdf() — Body: `PdfAbschnitteOptionen`
- `GET /api/v1/perioden/{periode_id}/mieter/{mieter_id}/schluessel-abrechnung/pdf` — lade_schluessel_pdf()
- `POST /api/v1/perioden/{periode_id}/mieter/{mieter_id}/schluessel-abrechnung/vorschau` — vorschau_schluessel_abrechnung() — Body: `VorschauRequest`
- `POST /api/v1/perioden/{periode_id}/sammelabrechnung/pdf` — erzeuge_sammelabrechnung() — Body: `SammelabrechnungRequest`
- `GET /api/v1/perioden/{periode_id}/sammelabrechnung/pdf/download` — lade_sammelabrechnung_pdf()
- `GET /api/v1/perioden/{periode_id}/schluessel-abrechnung` — get_schluessel_abrechnung()
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

## sonstige

- `GET /api/health` — health()

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

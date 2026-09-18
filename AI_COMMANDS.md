# NK-Tool — AI Agent Command Reference

> **Purpose:** This document enables an LLM (Claude Code CLI, Gemini CLI, etc.) to interact
> with the NK-Tool backend via HTTP API commands. Use it to create tenants, enter meter readings,
> record invoices, and run the billing calculation — all from the terminal or programmatically.

## Setup

```bash
# Start the backend (required)
cd /Users/jp/projects/nk-tool/backend
uvicorn main:app --reload --port 8000

# Base URL for all commands
BASE="http://localhost:8000/api/v1"

# All responses have the shape: {"ok": true, "data": ...} or {"ok": false, "error": "..."}
```

---

## LLM Workflow Protocol

When a user asks you to perform an action, follow these rules:

1. **Discover IDs first.** Every entity uses numeric IDs. Always `GET` the list before
   creating or updating. Match by `name`, `bezeichnung`, or `anzeigename`.

2. **Ask before acting when required fields are missing.** If the user says "add a meter
   reading for Müller" but doesn't specify the period, meter, value, and date — ask:
   - Which Abrechnungsperiode? (list them to show options)
   - Which meter in which apartment? (list Zaehler for the apartment)
   - Start reading (Anfang) or end reading (Ende)?
   - Reading value and date?

3. **Confirm destructive operations.** DELETE and overwriting data always requires explicit
   user confirmation.

4. **Report IDs in output.** When creating records, print the returned `id` so the user
   can reference it later.

5. **Idempotency note.** `GET /perioden/{id}/vorauszahlungen` auto-generates missing
   monthly rows — calling it multiple times is safe.

---

## Step 0 — Discover the Data Structure

Before entering any data, run these commands to learn IDs:

```bash
# List all Liegenschaften (properties)
curl -s "$BASE/liegenschaften" | python3 -m json.tool

# List Abrechnungsperioden for Liegenschaft ID 1
curl -s "$BASE/liegenschaften/1/perioden" | python3 -m json.tool

# List Wohnungen (apartments) for Liegenschaft ID 1
curl -s "$BASE/liegenschaften/1/wohnungen" | python3 -m json.tool

# List Mieter (tenants) for Wohnung ID 1
curl -s "$BASE/wohnungen/1/mieter" | python3 -m json.tool

# List Zaehler (meters) for Wohnung ID 1
curl -s "$BASE/wohnungen/1/zaehler" | python3 -m json.tool

# List Kostenarten (cost types) for Liegenschaft ID 1
curl -s "$BASE/liegenschaften/1/kostenarten" | python3 -m json.tool
```

---

## Phase 1 — Stammdaten (Master Data)

### Liegenschaft (Property)

```bash
# Create
curl -s -X POST "$BASE/liegenschaften" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Musterstraße 12",
    "adresse": "Musterstraße 12",
    "plz": "97070",
    "ort": "Würzburg",
    "heizungsart": "oel",
    "brennstoff_einheit": "liter_oel",
    "brennstoff_heizwert_kwh": 10.0,
    "heiz_grundkosten_anteil": 0.30,
    "ww_grundkosten_anteil": 0.30
  }' | python3 -m json.tool
# → Note the "id" in the response. Used as {lid} below.

# Read
curl -s "$BASE/liegenschaften/1" | python3 -m json.tool

# Update
curl -s -X PUT "$BASE/liegenschaften/1" \
  -H "Content-Type: application/json" \
  -d '{"name": "Musterstraße 12", "adresse": "Musterstraße 12", "plz": "97070", "ort": "Würzburg",
       "heizungsart": "oel", "brennstoff_einheit": "liter_oel", "heiz_grundkosten_anteil": 0.30,
       "ww_grundkosten_anteil": 0.30}' | python3 -m json.tool

# Delete (cascades all related data!)
curl -s -X DELETE "$BASE/liegenschaften/1" | python3 -m json.tool
```

**Field reference — Liegenschaft:**
| Field | Type | Values / Notes |
|-------|------|----------------|
| `name` | string | Display name |
| `adresse` | string | Street + number |
| `plz` | string | Postal code |
| `ort` | string | City |
| `heizungsart` | string | `"oel"` \| `"gas"` \| `"fernwaerme"` \| `"waermepumpe"` \| `"pellet"` |
| `brennstoff_einheit` | string | `"liter_oel"` \| `"m3_gas"` \| `"kwh"` \| `"kg_pellet"` |
| `brennstoff_heizwert_kwh` | float | Calorific value per unit (default: 10.0 for oil) |
| `heiz_grundkosten_anteil` | float | 0.30–0.50 (30%–50%, HeizkostenVO) |
| `ww_grundkosten_anteil` | float | 0.30–0.50 (30%–50%) |

---

### Abrechnungsperiode (Billing Period)

```bash
# Create a period for Liegenschaft 1
curl -s -X POST "$BASE/liegenschaften/1/perioden" \
  -H "Content-Type: application/json" \
  -d '{
    "bezeichnung": "Abrechnung 2024",
    "von_datum": "2024-01-01",
    "bis_datum": "2024-12-31",
    "status": "offen"
  }' | python3 -m json.tool
# → Note the "id". Used as {pid} below.

# Update status to "in_bearbeitung"
curl -s -X PUT "$BASE/perioden/1" \
  -H "Content-Type: application/json" \
  -d '{"bezeichnung": "Abrechnung 2024", "von_datum": "2024-01-01", "bis_datum": "2024-12-31",
       "status": "in_bearbeitung"}' | python3 -m json.tool

# Delete (not allowed if status = "abgeschlossen")
curl -s -X DELETE "$BASE/perioden/1" | python3 -m json.tool
```

**Status values:** `"offen"` → `"in_bearbeitung"` → `"abgeschlossen"`

---

### Wohnung (Apartment)

```bash
# Create
curl -s -X POST "$BASE/liegenschaften/1/wohnungen" \
  -H "Content-Type: application/json" \
  -d '{
    "bezeichnung": "EG links",
    "flaeche_m2": 75.5,
    "anzahl_rwm": 3,
    "strom_ueber_vermieter": false,
    "sortierung": 1,
    "aktiv": true
  }' | python3 -m json.tool
# → Note the "id". Used as {wid} below.

# Read single
curl -s "$BASE/wohnungen/1" | python3 -m json.tool

# Update
curl -s -X PUT "$BASE/wohnungen/1" \
  -H "Content-Type: application/json" \
  -d '{"bezeichnung": "EG links", "flaeche_m2": 75.5, "anzahl_rwm": 3,
       "strom_ueber_vermieter": false, "sortierung": 1, "aktiv": true}' | python3 -m json.tool

# Delete
curl -s -X DELETE "$BASE/wohnungen/1" | python3 -m json.tool
```

---

### Mieter (Tenant)

```bash
# Create
curl -s -X POST "$BASE/wohnungen/1/mieter" \
  -H "Content-Type: application/json" \
  -d '{
    "anzeigename": "Familie Müller",
    "einzug_datum": "2023-01-01",
    "auszug_datum": null,
    "anzahl_personen": 3,
    "monatliche_vorauszahlung": 120.00,
    "ist_leerstand": false,
    "notizen": "Hauptmieter"
  }' | python3 -m json.tool
# → Note the "id". Used as {mid} below.

# Read single
curl -s "$BASE/mieter/1" | python3 -m json.tool

# Update monthly prepayment
curl -s -X PUT "$BASE/mieter/1" \
  -H "Content-Type: application/json" \
  -d '{"anzeigename": "Familie Müller", "einzug_datum": "2023-01-01", "auszug_datum": null,
       "anzahl_personen": 3, "monatliche_vorauszahlung": 135.00, "ist_leerstand": false}' \
  | python3 -m json.tool

# Record tenant move-out
curl -s -X PUT "$BASE/mieter/1" \
  -H "Content-Type: application/json" \
  -d '{"anzeigename": "Familie Müller", "einzug_datum": "2023-01-01",
       "auszug_datum": "2024-06-30", "anzahl_personen": 3,
       "monatliche_vorauszahlung": 120.00, "ist_leerstand": false}' | python3 -m json.tool

# Create Leerstand placeholder (vacancy)
curl -s -X POST "$BASE/wohnungen/1/mieter" \
  -H "Content-Type: application/json" \
  -d '{"anzeigename": "Leerstand", "einzug_datum": "2024-07-01",
       "ist_leerstand": true, "monatliche_vorauszahlung": 0}' | python3 -m json.tool

# Delete
curl -s -X DELETE "$BASE/mieter/1" | python3 -m json.tool
```

**Required fields to ask about when missing:**
- `anzeigename` — tenant display name (e.g., "Familie Müller", "Max Mustermann")
- `einzug_datum` — move-in date (YYYY-MM-DD)
- `anzahl_personen` — number of persons
- `monatliche_vorauszahlung` — agreed monthly prepayment in €

---

### Zähler (Meter)

```bash
# Create a heat meter for Wohnung 1
curl -s -X POST "$BASE/wohnungen/1/zaehler" \
  -H "Content-Type: application/json" \
  -d '{
    "typ": "waerme_kwh",
    "geraete_nummer": "WRM-001-2024",
    "bezeichnung": "Wärmezähler Wohnzimmer",
    "eingebaut_am": "2020-01-01",
    "aktiv": true
  }' | python3 -m json.tool
# → Note the "id". Used as {zid} below.

# Read single
curl -s "$BASE/zaehler/1" | python3 -m json.tool

# Update
curl -s -X PUT "$BASE/zaehler/1" \
  -H "Content-Type: application/json" \
  -d '{"typ": "waerme_kwh", "geraete_nummer": "WRM-001-2024",
       "bezeichnung": "Wärmezähler Wohnzimmer", "aktiv": true}' | python3 -m json.tool

# Delete
curl -s -X DELETE "$BASE/zaehler/1" | python3 -m json.tool
```

**Zähler typ values:**
| Value | Description |
|-------|-------------|
| `"waerme_kwh"` | Heat meter (kWh) |
| `"warmwasser_m3"` | Hot water meter (m³) |
| `"kaltwasser_m3"` | Cold water meter (m³) |
| `"strom_kwh"` | Electricity meter (kWh) — only allowed if `strom_ueber_vermieter=true` |

---

### Kostenart (Cost Type)

```bash
# List existing (auto-seeded when Liegenschaft is created)
curl -s "$BASE/liegenschaften/1/kostenarten" | python3 -m json.tool

# Create custom cost type
curl -s -X POST "$BASE/liegenschaften/1/kostenarten" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kabelfernsehen",
    "verteilungsschluessel": "nutzeinheit",
    "kategorie": "hausnebenkosten",
    "ist_brennstoff": false,
    "ist_heiz_zusatz": false,
    "ist_ww_zusatz": false,
    "sortierung": 50,
    "aktiv": true
  }' | python3 -m json.tool

# Update
curl -s -X PUT "$BASE/kostenarten/1" \
  -H "Content-Type: application/json" \
  -d '{"name": "Kabelfernsehen", "verteilungsschluessel": "nutzeinheit",
       "kategorie": "hausnebenkosten", "ist_brennstoff": false,
       "ist_heiz_zusatz": false, "ist_ww_zusatz": false, "sortierung": 50, "aktiv": true}' \
  | python3 -m json.tool

# Delete (Standard Voreinstellungen can also be deleted)
curl -s -X DELETE "$BASE/kostenarten/1" | python3 -m json.tool
```

**verteilungsschluessel values:**
| Value | Description |
|-------|-------------|
| `"nutzeinheit"` | Equal share per unit |
| `"m2_wohnflaeche"` | By floor area (m²) |
| `"personen"` | By number of persons |
| `"verbrauch_kwh_heizung"` | By heat consumption (kWh) |
| `"verbrauch_m3_warmwasser"` | By hot water consumption (m³) |
| `"verbrauch_m3_kalt_plus_warm"` | By total water (cold + hot, m³) |
| `"anzahl_rwm"` | By number of smoke detectors |
| `"anzahl_kaltwasserzaehler"` | By number of cold water meters |
| `"miete_rwm"` | By smoke detector rental |
| `"direkt"` | Direct allocation (vermieter/leerstand) |
| `"strom_kwh_direkt"` | Direct electricity billing |

**kategorie values:** `"brennstoff"` \| `"heiznebenkosten"` \| `"heizung_zusatz"` \| `"warmwasser_zusatz"` \| `"hausnebenkosten"` \| `"strom_individuell"`

---

## Phase 2 — Kosteneingabe (Data Entry)

### Kostenpositionen (Invoices / Cost Records)

```bash
# List all invoices for a period
curl -s "$BASE/perioden/1/kostenpositionen" | python3 -m json.tool

# Create an invoice entry (Brennstoffkosten — oil delivery)
# First: find kostenart_id by listing kostenarten and looking for ist_brennstoff=true
curl -s "$BASE/liegenschaften/1/kostenarten" | python3 -m json.tool
# → identify the ID of the Brennstoffkosten entry (e.g., id=1)

curl -s -X POST "$BASE/perioden/1/kostenpositionen" \
  -H "Content-Type: application/json" \
  -d '{
    "kostenart_id": 1,
    "betrag_brutto": 3456.78,
    "betrag_netto": 2904.86,
    "mwst_prozent": 19,
    "datum": "2024-01-15",
    "beschreibung": "Heizöllieferung Januar",
    "beleg_nr": "RE-2024-001"
  }' | python3 -m json.tool
# → Note the "id". Used as {kp_id} below.

# Update an invoice
curl -s -X PUT "$BASE/kostenpositionen/1" \
  -H "Content-Type: application/json" \
  -d '{"betrag_brutto": 3500.00, "beschreibung": "Heizöllieferung Januar (korrigiert)"}' \
  | python3 -m json.tool

# Delete an invoice
curl -s -X DELETE "$BASE/kostenpositionen/1" | python3 -m json.tool

# Upload a receipt file (PDF or image)
curl -s -X POST "$BASE/kostenpositionen/1/beleg" \
  -F "file=@/path/to/rechnung.pdf" | python3 -m json.tool

# Download/view the receipt
curl -s "$BASE/kostenpositionen/1/beleg" --output beleg.pdf

# Delete the receipt
curl -s -X DELETE "$BASE/kostenpositionen/1/beleg" | python3 -m json.tool
```

**Required fields to ask about when missing:**
- Which `kostenart_id`? (list Kostenarten to show options with IDs)
- `betrag_brutto` — gross amount in € (required, > 0)
- `beschreibung` — invoice description
- `datum` — invoice date (YYYY-MM-DD, optional)
- `mwst_prozent` — VAT: `0`, `7`, or `19` (optional)

---

### Zählerstände (Meter Readings)

```bash
# List readings for meter 1 in period 1
curl -s "$BASE/zaehler/1/staende?periode_id=1" | python3 -m json.tool
# Response includes: staende[], verbrauch (null if start/end missing), hat_start, hat_ende

# Add start reading (Anfangsablesung)
curl -s -X POST "$BASE/zaehler/1/staende" \
  -H "Content-Type: application/json" \
  -d '{
    "periode_id": 1,
    "ablesedatum": "2024-01-01",
    "wert": 12345.0,
    "art": "periode_start",
    "abgelesen_von": "Hausverwaltung",
    "notiz": null
  }' | python3 -m json.tool

# Add end reading (Endablesung)
curl -s -X POST "$BASE/zaehler/1/staende" \
  -H "Content-Type: application/json" \
  -d '{
    "periode_id": 1,
    "ablesedatum": "2024-12-31",
    "wert": 13579.0,
    "art": "periode_ende"
  }' | python3 -m json.tool
# Consumption = 13579.0 - 12345.0 = 1234.0 kWh (computed automatically)

# Add intermediate reading (optional)
curl -s -X POST "$BASE/zaehler/1/staende" \
  -H "Content-Type: application/json" \
  -d '{
    "periode_id": 1,
    "ablesedatum": "2024-07-01",
    "wert": 12900.0,
    "art": "zwischenablesung"
  }' | python3 -m json.tool

# Update a reading
curl -s -X PUT "$BASE/zaehlerstaende/1" \
  -H "Content-Type: application/json" \
  -d '{"wert": 12350.0, "ablesedatum": "2024-01-01"}' | python3 -m json.tool

# Delete a reading
curl -s -X DELETE "$BASE/zaehlerstaende/1" | python3 -m json.tool
```

**CONSTRAINT:** Only ONE `periode_start` and ONE `periode_ende` per meter per period.
Adding a second returns HTTP 400: "Anfangsablesung bereits vorhanden."

**art values:** `"periode_start"` \| `"periode_ende"` \| `"zwischenablesung"`

**Required fields to ask about when missing:**
- Which meter? (list Wohnungen → list Zaehler per Wohnung, show geraete_nummer + typ)
- `art` — start (Anfang), end (Ende), or intermediate (Zwischenablesung)?
- `wert` — meter reading value
- `ablesedatum` — reading date (YYYY-MM-DD)

---

### Vorauszahlungen (Monthly Prepayments)

```bash
# Get the prepayment grid for period 1
# This also AUTO-GENERATES missing rows — safe to call multiple times
curl -s "$BASE/perioden/1/vorauszahlungen" | python3 -m json.tool
# Response structure:
# {
#   "monate": [{"monat": 1, "jahr": 2024, "label": "Jan 2024"}, ...],
#   "wohnungen": [{
#     "wohnung_id": 1, "bezeichnung": "EG links",
#     "mieter": [{
#       "mieter_id": 1, "anzeigename": "Familie Müller",
#       "vorauszahlungen": [{"id": 1, "monat": 1, "jahr": 2024,
#                            "betrag_soll": 120.0, "betrag_ist": 0.0}, ...],
#       "total_soll": 1440.0, "total_ist": 0.0
#     }]
#   }]
# }

# Update actual payment for a specific month (use vorauszahlung ID from above)
curl -s -X PUT "$BASE/vorauszahlungen/1" \
  -H "Content-Type: application/json" \
  -d '{"betrag_ist": 120.00}' | python3 -m json.tool

# Mark as paid with date
curl -s -X PUT "$BASE/vorauszahlungen/1" \
  -H "Content-Type: application/json" \
  -d '{"betrag_ist": 120.00, "bezahlt_am": "2024-01-05", "notiz": "Überweisung eingegangen"}' \
  | python3 -m json.tool

# Bulk update: set all months for a tenant (requires knowing all IDs)
# First call GET to get IDs, then loop:
# for id in 1 2 3 4 5 6 7 8 9 10 11 12; do
#   curl -s -X PUT "$BASE/vorauszahlungen/$id" -H "Content-Type: application/json" \
#     -d '{"betrag_ist": 120.00}' > /dev/null
# done
```

**To change the agreed monthly amount (betrag_soll):**
Update `monatliche_vorauszahlung` on the Mieter, then delete and re-generate VZ rows:
```bash
# 1. Update Mieter
curl -s -X PUT "$BASE/mieter/1" \
  -H "Content-Type: application/json" \
  -d '{"anzeigename": "Familie Müller", "einzug_datum": "2023-01-01",
       "monatliche_vorauszahlung": 135.00, "anzahl_personen": 3, "ist_leerstand": false}' \
  | python3 -m json.tool
# Note: existing VZ rows keep old betrag_soll — new rows will use updated value
```

---

## Phase 2 — Validierung (Completeness Check)

```bash
# Run validation for period 1
curl -s "$BASE/perioden/1/validierung" | python3 -m json.tool
# Response:
# {
#   "errors": [...],   # Must fix before calculation
#   "warnings": [...], # Should fix
#   "infos": [...],    # Informational
#   "kann_berechnen": true/false
# }
```

**Error codes:**
| Code | Meaning | Fix |
|------|---------|-----|
| `keine_brennstoffkosten` | No fuel invoices entered | Add a Kostenposition for ist_brennstoff=true Kostenart |
| `fehlende_anfangsablesung` | Meter missing start reading | POST to `/zaehler/{id}/staende` with art=periode_start |
| `fehlende_endablesung` | Meter missing end reading | POST to `/zaehler/{id}/staende` with art=periode_ende |

**Warning codes:**
| Code | Meaning |
|------|---------|
| `fehlende_vorauszahlungen` | Some months have betrag_ist = 0 |
| `keine_mieter` | An apartment has no tenant in this period |
| `datum_luecke` | Gap in tenant coverage for an apartment |

---

## Phase 3 — Berechnung (Calculation & Billing)

```bash
# Run calculation for period 1 (creates MieterKostenanteil rows)
curl -s -X POST "$BASE/perioden/1/berechnen" | python3 -m json.tool
# Response: BerechnungSummary with gesamt_kosten, heiz_gesamt, ww_gesamt, etc.

# Get cost distribution across all tenants
curl -s "$BASE/perioden/1/kostenverteilung" | python3 -m json.tool
# Response: {summary: {...}, tenants: [{mieter_id, anzeigename, kostenanteil_gesamt,
#            vorauszahlungen_gesamt, saldo, ...}]}

# Get detailed billing for a specific tenant
curl -s "$BASE/perioden/1/mieter/1/abrechnung" | python3 -m json.tool
# Response: full AbrechnungResult with individual cost positions, prepayments, and saldo
# saldo > 0 = tenant gets money back; saldo < 0 = tenant owes more
```

---

## Common Workflows

### Workflow A: Set up a new property from scratch

```bash
# 1. Create Liegenschaft
LID=$(curl -s -X POST "$BASE/liegenschaften" \
  -H "Content-Type: application/json" \
  -d '{"name":"Hauptstraße 5","adresse":"Hauptstraße 5","plz":"97070","ort":"Würzburg",
       "heizungsart":"gas","brennstoff_einheit":"m3_gas","brennstoff_heizwert_kwh":10.0,
       "heiz_grundkosten_anteil":0.30,"ww_grundkosten_anteil":0.30}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "Liegenschaft ID: $LID"

# 2. Create Abrechnungsperiode
PID=$(curl -s -X POST "$BASE/liegenschaften/$LID/perioden" \
  -H "Content-Type: application/json" \
  -d '{"bezeichnung":"Abrechnung 2024","von_datum":"2024-01-01","bis_datum":"2024-12-31","status":"offen"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "Periode ID: $PID"

# 3. Create Wohnungen
WID=$(curl -s -X POST "$BASE/liegenschaften/$LID/wohnungen" \
  -H "Content-Type: application/json" \
  -d '{"bezeichnung":"EG links","flaeche_m2":75.5,"anzahl_rwm":3,"strom_ueber_vermieter":false,"sortierung":1}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "Wohnung ID: $WID"

# 4. Create Mieter
MID=$(curl -s -X POST "$BASE/wohnungen/$WID/mieter" \
  -H "Content-Type: application/json" \
  -d '{"anzeigename":"Familie Müller","einzug_datum":"2023-01-01","anzahl_personen":3,
       "monatliche_vorauszahlung":120.00,"ist_leerstand":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "Mieter ID: $MID"

# 5. Create Zähler
ZID=$(curl -s -X POST "$BASE/wohnungen/$WID/zaehler" \
  -H "Content-Type: application/json" \
  -d '{"typ":"waerme_kwh","geraete_nummer":"WRM-001","bezeichnung":"Wärmezähler","aktiv":true}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "Zähler ID: $ZID"
```

### Workflow B: Enter meter readings for a period

```bash
# Assumes you know: LID=1, PID=1, WID=1, ZID=1
# List meters to confirm
curl -s "$BASE/wohnungen/1/zaehler" | python3 -m json.tool

# Add start and end readings
curl -s -X POST "$BASE/zaehler/1/staende" \
  -H "Content-Type: application/json" \
  -d '{"periode_id":1,"ablesedatum":"2024-01-01","wert":12345.0,"art":"periode_start"}' \
  | python3 -m json.tool

curl -s -X POST "$BASE/zaehler/1/staende" \
  -H "Content-Type: application/json" \
  -d '{"periode_id":1,"ablesedatum":"2024-12-31","wert":13579.0,"art":"periode_ende"}' \
  | python3 -m json.tool

# Verify: verbrauch should be 1234.0
curl -s "$BASE/zaehler/1/staende?periode_id=1" | python3 -m json.tool
```

### Workflow C: Record all invoices for a period

```bash
# Step 1: List Kostenarten to get IDs
curl -s "$BASE/liegenschaften/1/kostenarten" | python3 -c "
import sys, json
data = json.load(sys.stdin)['data']
for k in data:
    print(f\"ID {k['id']:3d}  {k['name']:<40} [{k['kategorie']}]  {'🔥 Brennstoff' if k['ist_brennstoff'] else ''}\")"

# Step 2: Enter invoices
# Brennstoffkosten (kostenart_id = ID from list with ist_brennstoff=true)
curl -s -X POST "$BASE/perioden/1/kostenpositionen" \
  -H "Content-Type: application/json" \
  -d '{"kostenart_id":1,"betrag_brutto":4200.00,"mwst_prozent":19,
       "datum":"2024-02-10","beschreibung":"Gasrechnung Q1 2024","beleg_nr":"GAS-2024-001"}' \
  | python3 -m json.tool

# Hausnebenkosten example
curl -s -X POST "$BASE/perioden/1/kostenpositionen" \
  -H "Content-Type: application/json" \
  -d '{"kostenart_id":5,"betrag_brutto":360.00,
       "datum":"2024-03-01","beschreibung":"Gebäudeversicherung 2024"}' \
  | python3 -m json.tool
```

### Workflow D: Enter prepayments for a tenant

```bash
# Step 1: Generate/load the grid (also auto-creates missing rows)
curl -s "$BASE/perioden/1/vorauszahlungen" > /tmp/vz_grid.json

# Step 2: Extract VZ IDs for a specific mieter
python3 -c "
import json
with open('/tmp/vz_grid.json') as f:
    data = json.load(f)['data']
for w in data['wohnungen']:
    for m in w['mieter']:
        if 'Müller' in m['anzeigename']:
            print(f\"Mieter: {m['anzeigename']}\")
            for vz in m['vorauszahlungen']:
                print(f\"  ID {vz['id']}: {vz['jahr']}-{vz['monat']:02d}  Soll={vz['betrag_soll']}  Ist={vz['betrag_ist']}\")"

# Step 3: Update each month
curl -s -X PUT "$BASE/vorauszahlungen/1" \
  -H "Content-Type: application/json" \
  -d '{"betrag_ist": 120.00, "bezahlt_am": "2024-01-05"}' | python3 -m json.tool
```

### Workflow E: Run billing calculation

```bash
# 1. Check validation — must have 0 errors
curl -s "$BASE/perioden/1/validierung" | python3 -c "
import sys, json
r = json.load(sys.stdin)['data']
print('Errors:', len(r['errors']))
for e in r['errors']: print(f\"  ❌ {e['message']}\")
print('Warnings:', len(r['warnings']))
for w in r['warnings']: print(f\"  ⚠️  {w['message']}\")
print('Can calculate:', r['kann_berechnen'])"

# 2. If kann_berechnen is true, run calculation
curl -s -X POST "$BASE/perioden/1/berechnen" | python3 -m json.tool

# 3. View results
curl -s "$BASE/perioden/1/kostenverteilung" | python3 -c "
import sys, json
r = json.load(sys.stdin)['data']
if r['summary']:
    s = r['summary']
    print(f\"Total costs: {s['gesamt_kosten']} €\")
    print(f\"Tenant share: {s['mieter_anteil']} €\")
print()
for t in r['tenants']:
    saldo = t['saldo']
    arrow = '↓ Erstattung' if saldo > 0 else '↑ Nachzahlung'
    print(f\"{t['anzeigename']:<30} Kosten: {t['kostenanteil_gesamt']:>8.2f} €  VZ: {t['vorauszahlungen_gesamt']:>8.2f} €  Saldo: {saldo:>8.2f} € {arrow}\")"

# 4. Get individual tenant billing
curl -s "$BASE/perioden/1/mieter/1/abrechnung" | python3 -m json.tool
```

---

## Error Handling

All API errors return: `{"ok": false, "error": "message"}`

| HTTP | Meaning |
|------|---------|
| 400 | Validation error or business rule violation |
| 404 | Resource not found — check the ID |
| 500 | Server error — check backend logs |

Common error messages:
- `"Kostenart gehört nicht zu dieser Liegenschaft"` — kostenart_id is from a different Liegenschaft
- `"Anfangsablesung bereits vorhanden"` — meter already has a periode_start reading; update it instead
- `"Abgeschlossene Periode kann nicht geändert werden"` — period is locked
- `"Stromzähler nur erlaubt wenn 'Strom über Vermieter' aktiviert ist"` — update Wohnung first

---

## Quick ID Lookup Script

Save as `lookup.sh` in the project root:

```bash
#!/bin/bash
BASE="http://localhost:8000/api/v1"

echo "=== LIEGENSCHAFTEN ==="
curl -s "$BASE/liegenschaften" | python3 -c "
import sys,json
for i in json.load(sys.stdin)['data']:
    print(f\"  ID {i['id']}: {i['name']} ({i['ort']})\")
"

echo ""
echo "Usage: Pass LIEGENSCHAFT_ID as argument to see details"
LID=${1:-1}
echo "=== PERIODEN for Liegenschaft $LID ==="
curl -s "$BASE/liegenschaften/$LID/perioden" | python3 -c "
import sys,json
for p in json.load(sys.stdin)['data']:
    print(f\"  ID {p['id']}: {p['bezeichnung']} ({p['von_datum']} – {p['bis_datum']}) [{p['status']}]\")
"

echo ""
echo "=== WOHNUNGEN + MIETER + ZAEHLER for Liegenschaft $LID ==="
curl -s "$BASE/liegenschaften/$LID/wohnungen" | python3 -c "
import sys,json,subprocess
wohnungen = json.load(sys.stdin)['data']
base = 'http://localhost:8000/api/v1'
for w in wohnungen:
    print(f\"  Wohnung ID {w['id']}: {w['bezeichnung']} ({w['flaeche_m2']} m²)\")
    mieter = json.loads(subprocess.check_output(['curl','-s',f\"{base}/wohnungen/{w['id']}/mieter\"]))['data']
    for m in mieter:
        auszug = m.get('auszug_datum') or 'aktuell'
        print(f\"    Mieter ID {m['id']}: {m['anzeigename']} ({m['einzug_datum']} – {auszug}), VZ: {m['monatliche_vorauszahlung']} €/Mo\")
    zaehler = json.loads(subprocess.check_output(['curl','-s',f\"{base}/wohnungen/{w['id']}/zaehler\"]))['data']
    for z in zaehler:
        print(f\"    Zähler ID {z['id']}: {z['typ']} Nr.{z.get('geraete_nummer','?')}\")
"
```

```bash
chmod +x lookup.sh
./lookup.sh        # Shows Liegenschaft 1
./lookup.sh 2      # Shows Liegenschaft 2
```

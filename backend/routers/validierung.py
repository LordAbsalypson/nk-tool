from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from domain import ART_PERIODE_ENDE, ART_PERIODE_START
from database import get_db
from models import (
    Abrechnungsperiode,
    Kostenart,
    Kostenposition,
    Mieter,
    Vorauszahlung,
    Wohnung,
    Zaehler,
    Zaehlerstand,
)
from schemas import ApiResponse, ValidationMessage, ValidationResult

router = APIRouter(tags=["Validierung"])

_TYP_LABEL: dict[str, str] = {
    "waerme_kwh": "Wärmemengenzähler",
    "hkv_einheiten": "Heizkostenverteiler",
    "warmwasser_m3": "Warmwasserzähler",
    "kaltwasser_m3": "Kaltwasserzähler",
    "strom_kwh": "Stromzähler",
}


@router.get("/perioden/{periode_id}/validierung")
def validate_periode(periode_id: int, db: Session = Depends(get_db)) -> ApiResponse:
    periode = db.get(Abrechnungsperiode, periode_id)
    if not periode:
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")

    errors: list[ValidationMessage] = []
    warnings: list[ValidationMessage] = []
    infos: list[ValidationMessage] = []

    von = date.fromisoformat(periode.von_datum)
    bis = date.fromisoformat(periode.bis_datum)

    # ── ERRORS ───────────────────────────────────────────────────────────────

    # 1. Keine Brennstoffkosten
    brennstoff_arten = (
        db.query(Kostenart)
        .filter(
            Kostenart.liegenschaft_id == periode.liegenschaft_id,
            Kostenart.ist_brennstoff == True,
            Kostenart.aktiv == True,
        )
        .all()
    )
    brennstoff_art_ids = {k.id for k in brennstoff_arten}
    has_brennstoff_kp = (
        db.query(Kostenposition)
        .filter(
            Kostenposition.abrechnungsperiode_id == periode_id,
            Kostenposition.kostenart_id.in_(brennstoff_art_ids),
        )
        .first()
    ) if brennstoff_art_ids else None

    if brennstoff_art_ids and not has_brennstoff_kp:
        errors.append(ValidationMessage(
            typ="error",
            code="keine_brennstoffkosten",
            message="Keine Brennstoffkosten (Öl/Gas) für diese Periode erfasst.",
            context="Bitte mindestens eine Rechnung unter Brennstoffkosten eintragen.",
        ))

    # 2. Fehlende Zählerstände
    wohnungen = (
        db.query(Wohnung)
        .filter(
            Wohnung.liegenschaft_id == periode.liegenschaft_id,
            Wohnung.aktiv == True,
        )
        .all()
    )
    for wohnung in wohnungen:
        aktive_zaehler = (
            db.query(Zaehler)
            .filter(Zaehler.wohnung_id == wohnung.id, Zaehler.aktiv == True)
            .all()
        )
        for zaehler in aktive_zaehler:
            staende = (
                db.query(Zaehlerstand)
                .filter(
                    Zaehlerstand.zaehler_id == zaehler.id,
                    Zaehlerstand.abrechnungsperiode_id == periode_id,
                )
                .all()
            )
            arten = {s.art for s in staende}
            label = zaehler.geraete_nummer or zaehler.bezeichnung or f"ID {zaehler.id}"
            typ_label = _TYP_LABEL.get(zaehler.typ, zaehler.typ)
            if ART_PERIODE_START not in arten:
                errors.append(ValidationMessage(
                    typ="error",
                    code="fehlende_anfangsablesung",
                    message=f"Anfangsablesung fehlt: {typ_label} {label} ({wohnung.bezeichnung})",
                    context="Bitte Anfangsablesung in Stage 2 → Zählerstände eintragen.",
                ))
            if ART_PERIODE_ENDE not in arten:
                errors.append(ValidationMessage(
                    typ="error",
                    code="fehlende_endablesung",
                    message=f"Endablesung fehlt: {typ_label} {label} ({wohnung.bezeichnung})",
                    context="Bitte Endablesung in Stage 2 → Zählerstände eintragen.",
                ))

    # ── WARNINGS ─────────────────────────────────────────────────────────────

    # 3. Fehlende Vorauszahlungen
    offene_vz = (
        db.query(Vorauszahlung)
        .filter(
            Vorauszahlung.abrechnungsperiode_id == periode_id,
            Vorauszahlung.betrag_ist == 0.0,
        )
        .count()
    )
    if offene_vz > 0:
        warnings.append(ValidationMessage(
            typ="warning",
            code="fehlende_vorauszahlungen",
            message=f"{offene_vz} Vorauszahlung(en) mit Betrag 0 € (noch nicht eingetragen).",
            context="Bitte unter Stage 2 → Vorauszahlungen alle Ist-Beträge eintragen.",
        ))

    # 4. Datum-Lücken in Mieter-Belegung
    for wohnung in wohnungen:
        mieter_rows = (
            db.query(Mieter)
            .filter(
                Mieter.wohnung_id == wohnung.id,
                Mieter.einzug_datum <= periode.bis_datum,
            )
            .filter(
                (Mieter.auszug_datum == None) | (Mieter.auszug_datum >= periode.von_datum)
            )
            .order_by(Mieter.einzug_datum)
            .all()
        )
        if not mieter_rows:
            warnings.append(ValidationMessage(
                typ="warning",
                code="keine_mieter",
                message=f"Wohnung {wohnung.bezeichnung} hat keinen Mieter in dieser Periode.",
                context="Bitte Mieter oder Leerstand-Eintrag in Stage 1 → Mieter anlegen.",
            ))
            continue

        # Check for gaps: sort by einzug, verify coverage from von_datum to bis_datum
        sorted_mieter = sorted(mieter_rows, key=lambda m: m.einzug_datum)
        coverage_start = von

        for m in sorted_mieter:
            einzug = date.fromisoformat(m.einzug_datum)
            auszug = date.fromisoformat(m.auszug_datum) if m.auszug_datum else date(9999, 12, 31)
            if einzug > coverage_start:
                warnings.append(ValidationMessage(
                    typ="warning",
                    code="datum_luecke",
                    message=f"Datum-Lücke in {wohnung.bezeichnung}: {coverage_start} bis {einzug - __import__('datetime').timedelta(days=1)} nicht belegt.",
                    context="Bitte Leerstand-Eintrag für den nicht belegten Zeitraum anlegen.",
                ))
            coverage_end = min(auszug, bis)
            if coverage_end > coverage_start:
                coverage_start = coverage_end + __import__("datetime").timedelta(days=1)

        if coverage_start <= bis:
            warnings.append(ValidationMessage(
                typ="warning",
                code="datum_luecke",
                message=f"Datum-Lücke in {wohnung.bezeichnung}: ab {coverage_start} bis Periodenende nicht belegt.",
                context="Bitte Leerstand-Eintrag für den nicht belegten Zeitraum anlegen.",
            ))

    # ── INFOS ─────────────────────────────────────────────────────────────────

    # 5. Mieterwechsel aktiv
    for wohnung in wohnungen:
        echte_mieter = (
            db.query(Mieter)
            .filter(
                Mieter.wohnung_id == wohnung.id,
                Mieter.ist_leerstand == False,
                Mieter.einzug_datum <= periode.bis_datum,
            )
            .filter(
                (Mieter.auszug_datum == None) | (Mieter.auszug_datum >= periode.von_datum)
            )
            .count()
        )
        if echte_mieter > 1:
            infos.append(ValidationMessage(
                typ="info",
                code="mieterwechsel",
                message=f"Mieterwechsel in {wohnung.bezeichnung}: {echte_mieter} Mieter in dieser Periode.",
                context="Kosten werden zeitanteilig aufgeteilt (Tage / Gradtagzahlen).",
            ))

    result = ValidationResult(
        errors=errors,
        warnings=warnings,
        infos=infos,
        kann_berechnen=len(errors) == 0,
    )
    return ApiResponse(ok=True, data=result)

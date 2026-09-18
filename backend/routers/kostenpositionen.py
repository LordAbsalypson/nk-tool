import os
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import uuid

from database import get_db
from models import Abrechnungsperiode, Kostenart, Kostenposition, Liegenschaft
from schemas import (
    ApiResponse,
    KostenpositonCreate,
    KostenpositonOut,
    KostenpositonUpdate,
    SplitUpdate,
    SplitVerknuepfen,
)

router = APIRouter(tags=["Kostenpositionen"])

UPLOADS_DIR = Path(os.environ.get("NK_TOOL_UPLOADS_DIR", "uploads"))
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".gif"}


def _get_periode_or_404(periode_id: int, db: Session) -> Abrechnungsperiode:
    p = db.get(Abrechnungsperiode, periode_id)
    if not p:
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")
    return p


@router.get("/perioden/{periode_id}/kostenpositionen")
def list_kostenpositionen(periode_id: int, db: Session = Depends(get_db)) -> ApiResponse:
    _get_periode_or_404(periode_id, db)
    rows = (
        db.query(Kostenposition)
        .filter(Kostenposition.abrechnungsperiode_id == periode_id)
        .order_by(Kostenposition.datum, Kostenposition.id)
        .all()
    )

    # Verknüpfte Aufteilungen anreichern: Gesamtbetrag, eigener Anteil in %, Partner-Haus
    gruppen = {r.split_gruppe for r in rows if r.split_gruppe}
    gruppen_rows: dict[str, list[Kostenposition]] = {}
    if gruppen:
        for g in (
            db.query(Kostenposition)
            .filter(Kostenposition.split_gruppe.in_(gruppen))
            .all()
        ):
            gruppen_rows.setdefault(g.split_gruppe, []).append(g)

    out = []
    for r in rows:
        o = KostenpositonOut.model_validate(r)
        if r.split_gruppe and r.split_gruppe in gruppen_rows:
            geschwister = gruppen_rows[r.split_gruppe]
            gesamt = sum(x.betrag_brutto for x in geschwister)
            if gesamt > 0 and len(geschwister) > 1:
                o.split_gesamt = round(gesamt, 2)
                o.split_prozent = round(r.betrag_brutto / gesamt * 100, 2)
                partner = next((x for x in geschwister if x.id != r.id), None)
                if partner:
                    pp = db.get(Abrechnungsperiode, partner.abrechnungsperiode_id)
                    pl = db.get(Liegenschaft, pp.liegenschaft_id) if pp else None
                    o.split_partner = pl.name if pl else None
        out.append(o)
    return ApiResponse(ok=True, data=out)


@router.post("/perioden/{periode_id}/kostenpositionen", status_code=201)
def create_kostenposition(
    periode_id: int, body: KostenpositonCreate, db: Session = Depends(get_db)
) -> ApiResponse:
    periode = _get_periode_or_404(periode_id, db)
    if periode.status == "abgeschlossen":
        raise HTTPException(status_code=400, detail="Abgeschlossene Periode kann nicht geändert werden")

    kostenart = db.get(Kostenart, body.kostenart_id)
    if not kostenart:
        raise HTTPException(status_code=404, detail="Kostenart nicht gefunden")
    if kostenart.liegenschaft_id != periode.liegenschaft_id:
        raise HTTPException(status_code=400, detail="Kostenart gehört nicht zu dieser Liegenschaft")

    kp = Kostenposition(
        kostenart_id=body.kostenart_id,
        abrechnungsperiode_id=periode_id,
        betrag_brutto=body.betrag_brutto,
        betrag_netto=body.betrag_netto,
        mwst_prozent=body.mwst_prozent,
        datum=body.datum or None,
        beschreibung=body.beschreibung,
        beleg_nr=body.beleg_nr,
        split_gruppe=body.split_gruppe,
    )
    db.add(kp)
    db.commit()
    db.refresh(kp)
    return ApiResponse(ok=True, data=KostenpositonOut.model_validate(kp))


@router.put("/kostenpositionen/{kp_id}")
def update_kostenposition(
    kp_id: int, body: KostenpositonUpdate, db: Session = Depends(get_db)
) -> ApiResponse:
    kp = db.get(Kostenposition, kp_id)
    if not kp:
        raise HTTPException(status_code=404, detail="Kostenposition nicht gefunden")

    periode = db.get(Abrechnungsperiode, kp.abrechnungsperiode_id)
    if periode and periode.status == "abgeschlossen":
        raise HTTPException(status_code=400, detail="Abgeschlossene Periode kann nicht geändert werden")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(kp, field, value)
    db.commit()
    db.refresh(kp)
    return ApiResponse(ok=True, data=KostenpositonOut.model_validate(kp))


@router.delete("/kostenpositionen/{kp_id}")
def delete_kostenposition(kp_id: int, db: Session = Depends(get_db)) -> ApiResponse:
    kp = db.get(Kostenposition, kp_id)
    if not kp:
        raise HTTPException(status_code=404, detail="Kostenposition nicht gefunden")

    periode = db.get(Abrechnungsperiode, kp.abrechnungsperiode_id)
    if periode and periode.status == "abgeschlossen":
        raise HTTPException(status_code=400, detail="Abgeschlossene Periode kann nicht geändert werden")

    # Remove associated file if present
    if kp.beleg_datei:
        try:
            Path(kp.beleg_datei).unlink(missing_ok=True)
        except Exception:
            pass

    db.delete(kp)
    db.commit()
    return ApiResponse(ok=True, data=None)


@router.post("/kostenpositionen/{kp_id}/beleg")
async def upload_beleg(
    kp_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> ApiResponse:
    kp = db.get(Kostenposition, kp_id)
    if not kp:
        raise HTTPException(status_code=404, detail="Kostenposition nicht gefunden")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Nur PDF, JPG, PNG, GIF erlaubt")

    UPLOADS_DIR.mkdir(exist_ok=True)
    dest = UPLOADS_DIR / f"kp_{kp_id}{ext}"

    content = await file.read()
    dest.write_bytes(content)

    # Remove old file if different extension
    if kp.beleg_datei and kp.beleg_datei != str(dest):
        try:
            Path(kp.beleg_datei).unlink(missing_ok=True)
        except Exception:
            pass

    kp.beleg_datei = str(dest)
    db.commit()
    db.refresh(kp)
    return ApiResponse(ok=True, data=KostenpositonOut.model_validate(kp))


@router.get("/kostenpositionen/{kp_id}/beleg")
def get_beleg(kp_id: int, db: Session = Depends(get_db)) -> FileResponse:
    kp = db.get(Kostenposition, kp_id)
    if not kp or not kp.beleg_datei:
        raise HTTPException(status_code=404, detail="Kein Beleg vorhanden")

    path = Path(kp.beleg_datei)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Datei nicht gefunden")

    media_type_map = {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
    }
    media_type = media_type_map.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media_type)


@router.delete("/kostenpositionen/{kp_id}/beleg")
def delete_beleg(kp_id: int, db: Session = Depends(get_db)) -> ApiResponse:
    kp = db.get(Kostenposition, kp_id)
    if not kp:
        raise HTTPException(status_code=404, detail="Kostenposition nicht gefunden")

    if kp.beleg_datei:
        try:
            Path(kp.beleg_datei).unlink(missing_ok=True)
        except Exception:
            pass
        kp.beleg_datei = None
        db.commit()
        db.refresh(kp)

    return ApiResponse(ok=True, data=KostenpositonOut.model_validate(kp))


# ── Verknüpfte Aufteilung (eine Rechnung, beide Häuser) ──────────────────────

def _split_geschwister(kp: Kostenposition, db: Session) -> list[Kostenposition]:
    if not kp.split_gruppe:
        raise HTTPException(status_code=400, detail="Position ist nicht verknüpft")
    rows = (
        db.query(Kostenposition)
        .filter(Kostenposition.split_gruppe == kp.split_gruppe)
        .order_by(Kostenposition.id)
        .all()
    )
    if len(rows) != 2:
        raise HTTPException(
            status_code=400,
            detail=f"Verknüpfung besteht aus {len(rows)} Positionen (erwartet: 2)",
        )
    return rows


def _pruefe_offen(kp: Kostenposition, db: Session) -> None:
    periode = db.get(Abrechnungsperiode, kp.abrechnungsperiode_id)
    if periode and periode.status == "abgeschlossen":
        raise HTTPException(
            status_code=400, detail="Abgeschlossene Periode kann nicht geändert werden"
        )


@router.put("/kostenpositionen/{kp_id}/split")
def update_split(kp_id: int, body: SplitUpdate, db: Session = Depends(get_db)) -> ApiResponse:
    """Bearbeitet beide Anteile einer verknüpften Rechnung in einem Schritt.

    ``prozent_hier`` bezieht sich auf die Position ``kp_id``; der Partner erhält
    exakt den Restbetrag, damit die Summe immer dem Gesamtbetrag entspricht.
    """
    kp = db.get(Kostenposition, kp_id)
    if not kp:
        raise HTTPException(status_code=404, detail="Kostenposition nicht gefunden")
    rows = _split_geschwister(kp, db)
    for r in rows:
        _pruefe_offen(r, db)

    hier = round(body.betrag_gesamt * body.prozent_hier / 100, 2)
    dort = round(body.betrag_gesamt - hier, 2)
    for r in rows:
        r.betrag_brutto = hier if r.id == kp.id else dort
        r.betrag_netto = None
        if body.beschreibung is not None:
            r.beschreibung = body.beschreibung
        if body.datum is not None:
            r.datum = body.datum
        if body.beleg_nr is not None:
            r.beleg_nr = body.beleg_nr
    db.commit()
    db.refresh(kp)
    return ApiResponse(ok=True, data=KostenpositonOut.model_validate(kp))


@router.post("/kostenpositionen/{kp_id}/verknuepfen")
def verknuepfe_split(
    kp_id: int, body: SplitVerknuepfen, db: Session = Depends(get_db)
) -> ApiResponse:
    """Verknüpft zwei bestehende Positionen nachträglich zu einer Aufteilung.

    Für Altbestand, der bereits vorab (z. B. in Excel) gesplittet eingetragen wurde:
    danach lassen sich Gesamtbetrag und Verhältnis direkt im Tool bearbeiten.
    Beträge werden dabei NICHT verändert — nur die Verknüpfung wird gesetzt.
    """
    kp = db.get(Kostenposition, kp_id)
    partner = db.get(Kostenposition, body.partner_id)
    if not kp or not partner:
        raise HTTPException(status_code=404, detail="Kostenposition nicht gefunden")
    if kp.id == partner.id:
        raise HTTPException(status_code=400, detail="Eine Position kann nicht mit sich selbst verknüpft werden")
    if kp.split_gruppe or partner.split_gruppe:
        raise HTTPException(status_code=400, detail="Eine der Positionen ist bereits verknüpft")
    if kp.abrechnungsperiode_id == partner.abrechnungsperiode_id:
        raise HTTPException(
            status_code=400,
            detail="Beide Positionen liegen im selben Haus — Aufteilung verbindet zwei Häuser",
        )
    _pruefe_offen(kp, db)
    _pruefe_offen(partner, db)

    gruppe = uuid.uuid4().hex
    kp.split_gruppe = gruppe
    partner.split_gruppe = gruppe
    db.commit()
    return ApiResponse(ok=True, data={"split_gruppe": gruppe})


@router.delete("/kostenpositionen/{kp_id}/verknuepfung")
def loese_split(kp_id: int, db: Session = Depends(get_db)) -> ApiResponse:
    """Löst eine Verknüpfung wieder — beide Positionen bleiben mit ihren Beträgen bestehen."""
    kp = db.get(Kostenposition, kp_id)
    if not kp:
        raise HTTPException(status_code=404, detail="Kostenposition nicht gefunden")
    if not kp.split_gruppe:
        raise HTTPException(status_code=400, detail="Position ist nicht verknüpft")
    rows = (
        db.query(Kostenposition)
        .filter(Kostenposition.split_gruppe == kp.split_gruppe)
        .all()
    )
    for r in rows:
        _pruefe_offen(r, db)
        r.split_gruppe = None
    db.commit()
    return ApiResponse(ok=True, data=None)

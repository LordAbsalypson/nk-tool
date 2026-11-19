from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import (
    Abrechnungsperiode,
    DirektKostenartWert,
    Liegenschaft,
    Vorauszahlung,
    Zaehlerstand,
)
from schemas import AbrechnungsperiodeCreate, AbrechnungsperiodeUpdate, AbrechnungsperiodeOut

router = APIRouter(tags=["perioden"])


@router.get("/liegenschaften/{lid}/perioden")
def list_perioden(lid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    if not db.get(Liegenschaft, lid):
        raise HTTPException(404, "Liegenschaft nicht gefunden")
    items = (
        db.query(Abrechnungsperiode)
        .filter(Abrechnungsperiode.liegenschaft_id == lid)
        .order_by(Abrechnungsperiode.von_datum.desc())
        .all()
    )
    return {"ok": True, "data": [AbrechnungsperiodeOut.model_validate(i) for i in items]}


def _uebernehme_kostenart_werte_aus_vorperiode(
    db: Session, neue_periode: Abrechnungsperiode
) -> int:
    """Kopiert die Kostenart-Sätze (``DirektKostenartWert``) aus der jüngsten
    Vorperiode (gleiches Haus oder global) in ``neue_periode``, falls diese noch
    keine eigenen Sätze hat.

    Damit funktioniert die unterjährige Auszugs-Abrechnung in einer neu angelegten
    Periode sofort mit den letzten bekannten Durchschnittswerten (€/kWh, €/m³,
    €/m² → taggenau heruntergerechnet durch ``schluessel_engine.py``), noch bevor
    die neue Jahres-Gesamtabrechnung für Gas/Strom vorliegt.
    """
    vorhanden = (
        db.query(DirektKostenartWert)
        .filter(DirektKostenartWert.abrechnungsperiode_id == neue_periode.id)
        .count()
    )
    if vorhanden > 0:
        return 0

    # Suche jüngste Vorperiode derselben Liegenschaft, die bereits Werte hat
    kandidaten = (
        db.query(Abrechnungsperiode)
        .filter(
            Abrechnungsperiode.id != neue_periode.id,
            Abrechnungsperiode.liegenschaft_id == neue_periode.liegenschaft_id,
            Abrechnungsperiode.von_datum <= neue_periode.von_datum,
        )
        .order_by(Abrechnungsperiode.von_datum.desc(), Abrechnungsperiode.id.desc())
        .all()
    )

    quell_werte: list[DirektKostenartWert] = []
    for kand in kandidaten:
        rows = (
            db.query(DirektKostenartWert)
            .filter(DirektKostenartWert.abrechnungsperiode_id == kand.id)
            .all()
        )
        if rows:
            quell_werte = rows
            break

    for w in quell_werte:
        db.add(
            DirektKostenartWert(
                abrechnungsperiode_id=neue_periode.id,
                kostenart_id=w.kostenart_id,
                preis_pro_einheit=w.preis_pro_einheit,
                verhaeltnis_grund=w.verhaeltnis_grund,
                preis_grund_pro_m2=w.preis_grund_pro_m2,
                preis_verbrauch_pro_einheit=w.preis_verbrauch_pro_einheit,
                saetze_manuell_angepasst=w.saetze_manuell_angepasst,
            )
        )
    return len(quell_werte)


@router.post("/liegenschaften/{lid}/perioden")
def create_periode(lid: int, body: AbrechnungsperiodeCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    if not db.get(Liegenschaft, lid):
        raise HTTPException(404, "Liegenschaft nicht gefunden")
    obj = Abrechnungsperiode(liegenschaft_id=lid, **body.model_dump())
    db.add(obj)
    db.flush()
    # Verwaiste Sätze (falls SQLite ohne PRAGMA foreign_keys=ON eine frühere
    # gelöschte Periode mit derselben ID hatte) vorab bereinigen:
    db.query(DirektKostenartWert).filter(
        DirektKostenartWert.abrechnungsperiode_id == obj.id
    ).delete()
    _uebernehme_kostenart_werte_aus_vorperiode(db, obj)
    db.commit()
    db.refresh(obj)
    return {"ok": True, "data": AbrechnungsperiodeOut.model_validate(obj)}


@router.get("/perioden/{pid}")
def get_periode(pid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Abrechnungsperiode, pid)
    if not obj:
        raise HTTPException(404, "Abrechnungsperiode nicht gefunden")
    return {"ok": True, "data": AbrechnungsperiodeOut.model_validate(obj)}


@router.get("/perioden/{pid}/inhalt")
def periode_inhalt(pid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Wie viele Datensätze an dieser Periode hängen — für die Lösch-Rückfrage,
    damit sichtbar ist, was mit der Periode verloren ginge."""
    if not db.get(Abrechnungsperiode, pid):
        raise HTTPException(404, "Abrechnungsperiode nicht gefunden")

    def _anzahl(model: Any) -> int:
        return db.query(model).filter(model.abrechnungsperiode_id == pid).count()

    return {
        "ok": True,
        "data": {
            "zaehlerstaende": _anzahl(Zaehlerstand),
            "vorauszahlungen": db.query(Vorauszahlung)
            .filter(Vorauszahlung.abrechnungsperiode_id == pid, Vorauszahlung.betrag_ist > 0)
            .count(),
            "kostenart_saetze": _anzahl(DirektKostenartWert),
        },
    }


@router.put("/perioden/{pid}")
def update_periode(pid: int, body: AbrechnungsperiodeUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Abrechnungsperiode, pid)
    if not obj:
        raise HTTPException(404, "Abrechnungsperiode nicht gefunden")
    if obj.status == "abgeschlossen":
        raise HTTPException(400, "Abgeschlossene Perioden können nicht bearbeitet werden")
    for k, v in body.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return {"ok": True, "data": AbrechnungsperiodeOut.model_validate(obj)}


@router.delete("/perioden/{pid}")
def delete_periode(pid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Abrechnungsperiode, pid)
    if not obj:
        raise HTTPException(404, "Abrechnungsperiode nicht gefunden")
    if obj.status == "abgeschlossen":
        raise HTTPException(400, "Abgeschlossene Perioden können nicht gelöscht werden")
    db.query(DirektKostenartWert).filter(
        DirektKostenartWert.abrechnungsperiode_id == pid
    ).delete()
    db.delete(obj)
    db.commit()
    return {"ok": True, "data": None}

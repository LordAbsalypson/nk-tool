from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Abrechnungsperiode, Liegenschaft
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


@router.post("/liegenschaften/{lid}/perioden")
def create_periode(lid: int, body: AbrechnungsperiodeCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    if not db.get(Liegenschaft, lid):
        raise HTTPException(404, "Liegenschaft nicht gefunden")
    obj = Abrechnungsperiode(liegenschaft_id=lid, **body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return {"ok": True, "data": AbrechnungsperiodeOut.model_validate(obj)}


@router.get("/perioden/{pid}")
def get_periode(pid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Abrechnungsperiode, pid)
    if not obj:
        raise HTTPException(404, "Abrechnungsperiode nicht gefunden")
    return {"ok": True, "data": AbrechnungsperiodeOut.model_validate(obj)}


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
    db.delete(obj)
    db.commit()
    return {"ok": True, "data": None}

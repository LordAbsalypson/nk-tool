from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Kostenart, Liegenschaft
from schemas import KostenartCreate, KostenartUpdate, KostenartOut

router = APIRouter(tags=["kostenarten"])


@router.get("/liegenschaften/{lid}/kostenarten")
def list_kostenarten(lid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    if not db.get(Liegenschaft, lid):
        raise HTTPException(404, "Liegenschaft nicht gefunden")
    items = (
        db.query(Kostenart)
        .filter(Kostenart.liegenschaft_id == lid)
        .order_by(Kostenart.sortierung, Kostenart.name)
        .all()
    )
    return {"ok": True, "data": [KostenartOut.model_validate(i) for i in items]}


@router.post("/liegenschaften/{lid}/kostenarten")
def create_kostenart(lid: int, body: KostenartCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    if not db.get(Liegenschaft, lid):
        raise HTTPException(404, "Liegenschaft nicht gefunden")
    obj = Kostenart(liegenschaft_id=lid, **body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return {"ok": True, "data": KostenartOut.model_validate(obj)}


@router.get("/kostenarten/{kid}")
def get_kostenart(kid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Kostenart, kid)
    if not obj:
        raise HTTPException(404, "Kostenart nicht gefunden")
    return {"ok": True, "data": KostenartOut.model_validate(obj)}


@router.put("/kostenarten/{kid}")
def update_kostenart(kid: int, body: KostenartUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Kostenart, kid)
    if not obj:
        raise HTTPException(404, "Kostenart nicht gefunden")
    for k, v in body.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return {"ok": True, "data": KostenartOut.model_validate(obj)}


@router.delete("/kostenarten/{kid}")
def delete_kostenart(kid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Kostenart, kid)
    if not obj:
        raise HTTPException(404, "Kostenart nicht gefunden")
    db.delete(obj)
    db.commit()
    return {"ok": True, "data": None}

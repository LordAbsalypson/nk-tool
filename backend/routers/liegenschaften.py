from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Liegenschaft
from schemas import LiegenschaftCreate, LiegenschaftUpdate, LiegenschaftOut
from seed import seed_kostenarten

router = APIRouter(prefix="/liegenschaften", tags=["liegenschaften"])


@router.get("")
def list_liegenschaften(db: Session = Depends(get_db)) -> dict[str, Any]:
    items = db.query(Liegenschaft).order_by(Liegenschaft.name).all()
    return {"ok": True, "data": [LiegenschaftOut.model_validate(i) for i in items]}


@router.post("")
def create_liegenschaft(body: LiegenschaftCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = Liegenschaft(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    seed_kostenarten(db, obj.id)
    return {"ok": True, "data": LiegenschaftOut.model_validate(obj)}


@router.get("/{lid}")
def get_liegenschaft(lid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Liegenschaft, lid)
    if not obj:
        raise HTTPException(404, "Liegenschaft nicht gefunden")
    return {"ok": True, "data": LiegenschaftOut.model_validate(obj)}


@router.put("/{lid}")
def update_liegenschaft(lid: int, body: LiegenschaftUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Liegenschaft, lid)
    if not obj:
        raise HTTPException(404, "Liegenschaft nicht gefunden")
    for k, v in body.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return {"ok": True, "data": LiegenschaftOut.model_validate(obj)}


@router.delete("/{lid}")
def delete_liegenschaft(lid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Liegenschaft, lid)
    if not obj:
        raise HTTPException(404, "Liegenschaft nicht gefunden")
    db.delete(obj)
    db.commit()
    return {"ok": True, "data": None}

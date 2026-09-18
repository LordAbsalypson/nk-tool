from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Wohnung, Liegenschaft
from schemas import WohnungCreate, WohnungUpdate, WohnungOut

router = APIRouter(tags=["wohnungen"])


@router.get("/liegenschaften/{lid}/wohnungen")
def list_wohnungen(lid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    db.get(Liegenschaft, lid) or (_ for _ in ()).throw(HTTPException(404))
    items = db.query(Wohnung).filter(Wohnung.liegenschaft_id == lid).order_by(Wohnung.sortierung, Wohnung.bezeichnung).all()
    return {"ok": True, "data": [WohnungOut.model_validate(i) for i in items]}


@router.post("/liegenschaften/{lid}/wohnungen")
def create_wohnung(lid: int, body: WohnungCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    if not db.get(Liegenschaft, lid):
        raise HTTPException(404, "Liegenschaft nicht gefunden")
    obj = Wohnung(liegenschaft_id=lid, **body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return {"ok": True, "data": WohnungOut.model_validate(obj)}


@router.get("/wohnungen/{wid}")
def get_wohnung(wid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Wohnung, wid)
    if not obj:
        raise HTTPException(404, "Wohnung nicht gefunden")
    return {"ok": True, "data": WohnungOut.model_validate(obj)}


@router.put("/wohnungen/{wid}")
def update_wohnung(wid: int, body: WohnungUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Wohnung, wid)
    if not obj:
        raise HTTPException(404, "Wohnung nicht gefunden")
    for k, v in body.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return {"ok": True, "data": WohnungOut.model_validate(obj)}


@router.delete("/wohnungen/{wid}")
def delete_wohnung(wid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Wohnung, wid)
    if not obj:
        raise HTTPException(404, "Wohnung nicht gefunden")
    db.delete(obj)
    db.commit()
    return {"ok": True, "data": None}

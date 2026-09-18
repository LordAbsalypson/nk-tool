from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Zaehler, Wohnung
from schemas import ZaehlerCreate, ZaehlerUpdate, ZaehlerOut

router = APIRouter(tags=["zaehler"])


@router.get("/wohnungen/{wid}/zaehler")
def list_zaehler(wid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    if not db.get(Wohnung, wid):
        raise HTTPException(404, "Wohnung nicht gefunden")
    items = db.query(Zaehler).filter(Zaehler.wohnung_id == wid).order_by(Zaehler.typ).all()
    return {"ok": True, "data": [ZaehlerOut.model_validate(i) for i in items]}


@router.post("/wohnungen/{wid}/zaehler")
def create_zaehler(wid: int, body: ZaehlerCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    wohnung = db.get(Wohnung, wid)
    if not wohnung:
        raise HTTPException(404, "Wohnung nicht gefunden")
    if body.typ == "strom_kwh" and not wohnung.strom_ueber_vermieter:
        raise HTTPException(400, "Stromzähler nur erlaubt wenn 'Strom über Vermieter' aktiviert ist")
    obj = Zaehler(wohnung_id=wid, **body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return {"ok": True, "data": ZaehlerOut.model_validate(obj)}


@router.get("/zaehler/{zid}")
def get_zaehler(zid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Zaehler, zid)
    if not obj:
        raise HTTPException(404, "Zähler nicht gefunden")
    return {"ok": True, "data": ZaehlerOut.model_validate(obj)}


@router.put("/zaehler/{zid}")
def update_zaehler(zid: int, body: ZaehlerUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Zaehler, zid)
    if not obj:
        raise HTTPException(404, "Zähler nicht gefunden")
    if body.typ == "strom_kwh" and not obj.wohnung.strom_ueber_vermieter:
        raise HTTPException(400, "Stromzähler nur erlaubt wenn 'Strom über Vermieter' aktiviert ist")
    for k, v in body.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return {"ok": True, "data": ZaehlerOut.model_validate(obj)}


@router.delete("/zaehler/{zid}")
def delete_zaehler(zid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Zaehler, zid)
    if not obj:
        raise HTTPException(404, "Zähler nicht gefunden")
    db.delete(obj)
    db.commit()
    return {"ok": True, "data": None}

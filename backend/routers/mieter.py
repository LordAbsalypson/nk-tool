from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Mieter, Wohnung
from schemas import MieterCreate, MieterNamePatch, MieterUpdate, MieterOut

router = APIRouter(tags=["mieter"])


@router.get("/wohnungen/{wid}/mieter")
def list_mieter(wid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    if not db.get(Wohnung, wid):
        raise HTTPException(404, "Wohnung nicht gefunden")
    items = db.query(Mieter).filter(Mieter.wohnung_id == wid).order_by(Mieter.einzug_datum).all()
    return {"ok": True, "data": [MieterOut.model_validate(i) for i in items]}


@router.post("/wohnungen/{wid}/mieter")
def create_mieter(wid: int, body: MieterCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    if not db.get(Wohnung, wid):
        raise HTTPException(404, "Wohnung nicht gefunden")
    obj = Mieter(wohnung_id=wid, **body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return {"ok": True, "data": MieterOut.model_validate(obj)}


@router.get("/mieter/{mid}")
def get_mieter(mid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Mieter, mid)
    if not obj:
        raise HTTPException(404, "Mieter nicht gefunden")
    return {"ok": True, "data": MieterOut.model_validate(obj)}


@router.put("/mieter/{mid}")
def update_mieter(mid: int, body: MieterUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Mieter, mid)
    if not obj:
        raise HTTPException(404, "Mieter nicht gefunden")
    for k, v in body.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return {"ok": True, "data": MieterOut.model_validate(obj)}


@router.patch("/mieter/{mid}/name")
def patch_mieter_name(mid: int, body: MieterNamePatch, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Schlanker Endpunkt nur für den Anzeigenamen — z. B. zum schnellen
    Korrigieren eines Tippfehlers direkt aus der Abrechnung (Stage 5), ohne
    den ganzen Mieter-Datensatz per PUT neu einzureichen."""
    obj = db.get(Mieter, mid)
    if not obj:
        raise HTTPException(404, "Mieter nicht gefunden")
    obj.anzeigename = body.anzeigename
    db.commit()
    db.refresh(obj)
    return {"ok": True, "data": MieterOut.model_validate(obj)}


@router.delete("/mieter/{mid}")
def delete_mieter(mid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    obj = db.get(Mieter, mid)
    if not obj:
        raise HTTPException(404, "Mieter nicht gefunden")
    db.delete(obj)
    db.commit()
    return {"ok": True, "data": None}

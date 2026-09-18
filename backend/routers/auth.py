"""Optionaler Passwortschutz pro Datenbank. Siehe models.AppAuth und auth.py
für Datenmodell/Hashing/Token-Details. Alle Endpunkte hier bleiben IMMER ohne
Token erreichbar (sonst könnte sich niemand einloggen) — der Schutz greift
über die ``require_auth``-Dependency auf allen ANDEREN Routern, siehe main.py."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import auth
from database import get_db
from models import AppAuth
from schemas import ApiResponse

router = APIRouter(prefix="/auth", tags=["Auth"])


def _get_or_none(db: Session) -> AppAuth | None:
    return db.query(AppAuth).first()


def is_protected(db: Session) -> bool:
    row = _get_or_none(db)
    return row is not None and row.password_hash is not None


def require_auth(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> None:
    """FastAPI-Dependency, auf alle Datenrouter angewendet (main.py). Kein
    Passwort gesetzt -> No-Op (Backward-Compatibility für bestehende
    Installationen ohne Passwortschutz)."""
    row = _get_or_none(db)
    if row is None or row.password_hash is None:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Anmeldung erforderlich")
    token = authorization.removeprefix("Bearer ")
    if not row.token_secret or not auth.verify_token(token, row.token_secret):
        raise HTTPException(status_code=401, detail="Sitzung abgelaufen oder ungültig")


class SetupBody(BaseModel):
    password: str


class LoginBody(BaseModel):
    secret: str  # Passwort ODER Recovery-Code


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


@router.get("/status")
def status(db: Session = Depends(get_db)) -> ApiResponse:
    return ApiResponse(ok=True, data={"protected": is_protected(db)})


@router.post("/setup")
def setup(body: SetupBody, db: Session = Depends(get_db)) -> ApiResponse:
    if is_protected(db):
        raise HTTPException(status_code=409, detail="Es ist bereits ein Passwort gesetzt.")
    if len(body.password) < 8:
        raise HTTPException(status_code=422, detail="Passwort muss mindestens 8 Zeichen haben.")
    row = _get_or_none(db)
    recovery_code = auth.generate_recovery_code()
    if row is None:
        row = AppAuth(
            password_hash=auth.hash_secret(body.password),
            recovery_code_hash=auth.hash_secret(recovery_code),
            token_secret=auth.generate_token_secret(),
        )
        db.add(row)
    else:
        row.password_hash = auth.hash_secret(body.password)
        row.recovery_code_hash = auth.hash_secret(recovery_code)
        row.token_secret = auth.generate_token_secret()
        row.geaendert_am = auth._now_iso()
    db.commit()
    token = auth.create_token(row.token_secret)
    # recovery_code nur JETZT zurückgegeben — danach nirgends im Klartext gespeichert.
    return ApiResponse(ok=True, data={"token": token, "recoveryCode": recovery_code})


@router.post("/login")
def login(body: LoginBody, db: Session = Depends(get_db)) -> ApiResponse:
    row = _get_or_none(db)
    if row is None or row.password_hash is None:
        raise HTTPException(status_code=409, detail="Kein Passwort gesetzt.")
    ok = auth.verify_secret(body.secret, row.password_hash)
    used_recovery = False
    if not ok and row.recovery_code_hash:
        ok = auth.verify_secret(body.secret, row.recovery_code_hash)
        used_recovery = ok
    if not ok:
        raise HTTPException(status_code=401, detail="Falsches Passwort oder Recovery-Code.")
    if not row.token_secret:
        row.token_secret = auth.generate_token_secret()
        db.commit()
    token = auth.create_token(row.token_secret)
    return ApiResponse(ok=True, data={"token": token, "usedRecoveryCode": used_recovery})


@router.post("/change-password", dependencies=[Depends(require_auth)])
def change_password(body: ChangePasswordBody, db: Session = Depends(get_db)) -> ApiResponse:
    row = _get_or_none(db)
    if row is None or row.password_hash is None:
        raise HTTPException(status_code=409, detail="Kein Passwort gesetzt.")
    if not auth.verify_secret(body.current_password, row.password_hash):
        raise HTTPException(status_code=401, detail="Aktuelles Passwort ist falsch.")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=422, detail="Neues Passwort muss mindestens 8 Zeichen haben.")
    row.password_hash = auth.hash_secret(body.new_password)
    row.geaendert_am = auth._now_iso()
    db.commit()
    return ApiResponse(ok=True, data=None)


@router.post("/disable", dependencies=[Depends(require_auth)])
def disable(db: Session = Depends(get_db)) -> ApiResponse:
    """Entfernt den Passwortschutz vollständig — erfordert bereits ein
    gültiges Token (siehe require_auth), also entweder Passwort oder
    Recovery-Code wurden gerade erfolgreich benutzt."""
    row = _get_or_none(db)
    if row is not None:
        row.password_hash = None
        row.recovery_code_hash = None
        row.token_secret = None
        row.geaendert_am = auth._now_iso()
        db.commit()
    return ApiResponse(ok=True, data=None)

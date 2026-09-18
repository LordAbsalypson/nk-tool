from typing import Any
import logging

from sqlalchemy import text

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import Base, engine
from routers import (
    auth as auth_router,
    checkup,
    kostenpositionen,
    kostenarten,
    liegenschaften,
    mieter,
    pdf_vorlage,
    perioden,
    schluessel_abrechnung,
    suche,
    todos,
    validierung,
    verbund,
    vorauszahlungen,
    wohnungen,
    zaehler,
    zaehlerstaende,
)
from routers.auth import require_auth

Base.metadata.create_all(bind=engine)

# SQLite column migrations (idempotent)
with engine.connect() as _conn:
    for _stmt in [
        "ALTER TABLE kostenposition ADD COLUMN beleg_datei TEXT",
        "ALTER TABLE kostenposition ADD COLUMN datum_nullable TEXT",  # noop placeholder
        # 2026-06-01: EWE-Referenzfeld am Zähler
        "ALTER TABLE zaehler ADD COLUMN ewe_vertragsnummer TEXT",
        # 2026-07-19: Manuell-Fixierung einzelner Vorauszahlungs-Monate
        "ALTER TABLE vorauszahlung ADD COLUMN soll_override BOOLEAN NOT NULL DEFAULT 0",
        "ALTER TABLE vorauszahlung ADD COLUMN ist_override BOOLEAN NOT NULL DEFAULT 0",
        # 2026-07-29: Verknüpfte Aufteilung einer Rechnung auf beide Häuser
        "ALTER TABLE kostenposition ADD COLUMN split_gruppe TEXT",
        # 2026-07-29: fester Gaspreis + Referenzwerte je Periode
        "ALTER TABLE abrechnungsperiode ADD COLUMN heiz_preis_kwh FLOAT",
        "ALTER TABLE abrechnungsperiode ADD COLUMN referenz_gas_kwh FLOAT",
        "ALTER TABLE abrechnungsperiode ADD COLUMN referenz_wasser_m3 FLOAT",
        # 2026-07-30: Stammdaten-Fusion / Flaechenerweiterung
        "ALTER TABLE wohnung ADD COLUMN strom_bezug_ab TEXT",
        "ALTER TABLE liegenschaft ADD COLUMN gemeinschaftsflaeche_m2 FLOAT NOT NULL DEFAULT 0.0",
        # 2026-09-16: PDF-Vorlage — editierbare Seitenränder
        "ALTER TABLE pdf_vorlage ADD COLUMN rand_oben_mm FLOAT",
        "ALTER TABLE pdf_vorlage ADD COLUMN rand_unten_mm FLOAT",
        "ALTER TABLE pdf_vorlage ADD COLUMN rand_links_mm FLOAT",
        "ALTER TABLE pdf_vorlage ADD COLUMN rand_rechts_mm FLOAT",
        # 2026-09-16: Auto-Skalierung bei PDF-Überlauf
        "ALTER TABLE pdf_vorlage ADD COLUMN auto_skalieren BOOLEAN NOT NULL DEFAULT 1",
        # 2026-09-17: "(geschätzt)"-Anzeige auf der PDF-Abrechnung opt-in statt immer an
        "ALTER TABLE mieter_verbrauch ADD COLUMN als_schaetzung_anzeigen BOOLEAN NOT NULL DEFAULT 0",
    ]:
        try:
            _conn.execute(text(_stmt))
            _conn.commit()
        except Exception as _exc:
            # "duplicate column name" is the expected idempotent re-run case;
            # anything else deserves a log line (control flow stays identical).
            if "duplicate column" not in str(_exc).lower():
                logging.getLogger("nk_tool.migrations").warning(
                    "Startup-Migration fehlgeschlagen (%s): %s", _stmt, _exc
                )

app = FastAPI(title="NK-Tool API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"ok": False, "error": exc.detail},
    )


@app.exception_handler(RequestValidationError)
async def request_validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Pydantic input errors as {"ok": false, "error": ...} instead of FastAPI's
    default {"detail": [...]}, so frontend api/client.ts shows a readable message."""
    parts = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err["loc"] if p != "body")
        msg = err["msg"].removeprefix("Value error, ")
        parts.append(f"{loc}: {msg}" if loc else msg)
    return JSONResponse(
        status_code=422,
        content={"ok": False, "error": "; ".join(parts)},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"ok": False, "error": str(exc)},
    )


PREFIX = "/api/v1"

# auth-Router selbst bleibt ungeschützt (sonst könnte sich niemand einloggen).
app.include_router(auth_router.router, prefix=PREFIX)

# Alle Datenrouter hinter require_auth — greift nur, wenn ein Passwort gesetzt
# ist (models.AppAuth), sonst No-Op (Backward-Compatibility, siehe auth.py).
_protected = [Depends(require_auth)]
app.include_router(liegenschaften.router, prefix=PREFIX, dependencies=_protected)
app.include_router(wohnungen.router, prefix=PREFIX, dependencies=_protected)
app.include_router(mieter.router, prefix=PREFIX, dependencies=_protected)
app.include_router(zaehler.router, prefix=PREFIX, dependencies=_protected)
app.include_router(kostenarten.router, prefix=PREFIX, dependencies=_protected)
app.include_router(perioden.router, prefix=PREFIX, dependencies=_protected)
app.include_router(kostenpositionen.router, prefix=PREFIX, dependencies=_protected)
app.include_router(zaehlerstaende.router, prefix=PREFIX, dependencies=_protected)
app.include_router(vorauszahlungen.router, prefix=PREFIX, dependencies=_protected)
app.include_router(todos.router, prefix=PREFIX, dependencies=_protected)
app.include_router(validierung.router, prefix=PREFIX, dependencies=_protected)
app.include_router(verbund.router, prefix=PREFIX, dependencies=_protected)
app.include_router(suche.router, prefix=PREFIX, dependencies=_protected)
app.include_router(checkup.router, prefix=PREFIX, dependencies=_protected)
app.include_router(schluessel_abrechnung.router, prefix=PREFIX, dependencies=_protected)
app.include_router(pdf_vorlage.router, prefix=PREFIX, dependencies=_protected)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "status": "running"}

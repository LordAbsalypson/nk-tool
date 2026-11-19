from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from domain import ART_PERIODE_ENDE, ART_PERIODE_START
from database import get_db
from models import (
    Abrechnungsperiode,
    Mieter,
    MieterVerbrauch,
    Wohnung,
    WohnungVerbrauch,
    Zaehler,
    Zaehlerstand,
)
from schemas import (
    ApiResponse,
    MieterOut,
    MieterVerbrauchOut,
    MieterVerbrauchSet,
    WohnungOut,
    WohnungVerbrauchOut,
    WohnungVerbrauchSet,
    ZaehlerOut,
    ZaehlerstandCreate,
    ZaehlerstandOut,
    ZaehlerstandUpdate,
    ZaehlerstaendeGruppe,
)

router = APIRouter(tags=["Zählerstände"])


def _anteiliger_verbrauch(
    start_wert: float,
    start_datum: date,
    ende_wert: float,
    ende_datum: date,
    periode_von: date,
    periode_bis: date,
) -> float:
    """Verbrauch zwischen zwei Ablesungen, anteilig auf die Periode zugeschnitten,
    wenn die Ablesedaten außerhalb von [periode_von, periode_bis] liegen. Leichtgewichtige
    Vorschau-Variante der Proration-Logik aus engine.py::_get_verbrauch_geschaetzt (dort mit
    zusätzlicher Vorperioden-Schätzung für Lücken — hier nur der aktuelle Tagesdurchschnitt,
    da diese Anzeige nur eine Vorschau ist; die maßgebliche Berechnung läuft über Stage 3)."""
    base_v = max(0.0, ende_wert - start_wert)
    avail_days = (ende_datum - start_datum).days
    if avail_days <= 0:
        return round(base_v, 4)

    daily = base_v / avail_days
    verbrauch = base_v

    gap_vor = (start_datum - periode_von).days
    if gap_vor > 0:
        verbrauch += daily * gap_vor
    ueberschuss_vor = (periode_von - start_datum).days
    if ueberschuss_vor > 0:
        verbrauch -= daily * ueberschuss_vor

    gap_nach = (periode_bis - ende_datum).days
    if gap_nach > 0:
        verbrauch += daily * gap_nach
    ueberschuss_nach = (ende_datum - periode_bis).days
    if ueberschuss_nach > 0:
        verbrauch -= daily * ueberschuss_nach

    return round(max(0.0, verbrauch), 4)


def _baue_zaehlerstaende_gruppe(
    staende: list[Zaehlerstand],
    periode: Abrechnungsperiode | None,
    vorperiode_endwert: float | None,
) -> ZaehlerstaendeGruppe:
    start_r = next((s for s in staende if s.art == ART_PERIODE_START), None)
    ende_r = next((s for s in staende if s.art == ART_PERIODE_ENDE), None)
    start_val = start_r.wert if start_r else None
    ende_val = ende_r.wert if ende_r else None

    verbrauch: float | None = None
    if start_r is not None and ende_r is not None:
        if periode is not None:
            verbrauch = _anteiliger_verbrauch(
                start_r.wert,
                date.fromisoformat(start_r.ablesedatum),
                ende_r.wert,
                date.fromisoformat(ende_r.ablesedatum),
                date.fromisoformat(periode.von_datum),
                date.fromisoformat(periode.bis_datum),
            )
        else:
            verbrauch = round(ende_r.wert - start_r.wert, 4)

    return ZaehlerstaendeGruppe(
        staende=[ZaehlerstandOut.model_validate(s) for s in staende],
        verbrauch=verbrauch,
        hat_start=start_val is not None,
        hat_ende=ende_val is not None,
        vorperiode_endwert=vorperiode_endwert,
    )


@router.get("/perioden/{periode_id}/zaehlerstaende-uebersicht")
def get_zaehlerstaende_uebersicht(periode_id: int, db: Session = Depends(get_db)) -> ApiResponse:
    """Lädt Wohnungen, Zähler, Mieter, Zählerstände (inkl. Vorperioden-Endwert) und
    manuelle Verbrauchs-Overrides für Schritt 3 in einem einzigen Request statt ~50 Einzel-Queries."""
    periode = db.get(Abrechnungsperiode, periode_id)
    if not periode:
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")

    wohnungen = (
        db.query(Wohnung)
        .filter(Wohnung.liegenschaft_id == periode.liegenschaft_id, Wohnung.aktiv == True)
        .order_by(Wohnung.sortierung, Wohnung.id)
        .all()
    )
    wohnung_ids = [w.id for w in wohnungen]

    zaehler_by_wohnung: dict[str, list[ZaehlerOut]] = {str(wid): [] for wid in wohnung_ids}
    mieter_by_wohnung: dict[str, list[MieterOut]] = {str(wid): [] for wid in wohnung_ids}
    staende_by_zaehler: dict[str, ZaehlerstaendeGruppe] = {}

    if wohnung_ids:
        alle_zaehler = (
            db.query(Zaehler)
            .filter(Zaehler.wohnung_id.in_(wohnung_ids))
            .order_by(Zaehler.id)
            .all()
        )
        for z in alle_zaehler:
            zaehler_by_wohnung[str(z.wohnung_id)].append(ZaehlerOut.model_validate(z))

        alle_mieter = (
            db.query(Mieter)
            .filter(Mieter.wohnung_id.in_(wohnung_ids))
            .order_by(Mieter.einzug_datum, Mieter.id)
            .all()
        )
        for m in alle_mieter:
            mieter_by_wohnung[str(m.wohnung_id)].append(MieterOut.model_validate(m))

        zaehler_ids = [z.id for z in alle_zaehler]
        if zaehler_ids:
            alle_staende = (
                db.query(Zaehlerstand)
                .filter(
                    Zaehlerstand.zaehler_id.in_(zaehler_ids),
                    Zaehlerstand.abrechnungsperiode_id == periode_id,
                )
                .order_by(Zaehlerstand.ablesedatum, Zaehlerstand.id)
                .all()
            )
            staende_map: dict[int, list[Zaehlerstand]] = {zid: [] for zid in zaehler_ids}
            for s in alle_staende:
                staende_map[s.zaehler_id].append(s)

            prev_end_map: dict[int, float] = {}
            prev = (
                db.query(Abrechnungsperiode)
                .filter(
                    Abrechnungsperiode.liegenschaft_id == periode.liegenschaft_id,
                    Abrechnungsperiode.bis_datum < periode.von_datum,
                )
                .order_by(Abrechnungsperiode.bis_datum.desc())
                .first()
            )
            if prev:
                prev_staende = (
                    db.query(Zaehlerstand)
                    .filter(
                        Zaehlerstand.zaehler_id.in_(zaehler_ids),
                        Zaehlerstand.abrechnungsperiode_id == prev.id,
                        Zaehlerstand.art == ART_PERIODE_ENDE,
                    )
                    .all()
                )
                for ps in prev_staende:
                    prev_end_map[ps.zaehler_id] = ps.wert

            for zid in zaehler_ids:
                staende_by_zaehler[str(zid)] = _baue_zaehlerstaende_gruppe(
                    staende_map[zid],
                    periode,
                    prev_end_map.get(zid),
                )

    overrides = (
        db.query(WohnungVerbrauch)
        .filter(WohnungVerbrauch.abrechnungsperiode_id == periode_id)
        .all()
    )

    return ApiResponse(
        ok=True,
        data={
            "wohnungen": [WohnungOut.model_validate(w) for w in wohnungen],
            "zaehler_by_wohnung": zaehler_by_wohnung,
            "mieter_by_wohnung": mieter_by_wohnung,
            "staende_by_zaehler": staende_by_zaehler,
            "wohnung_verbrauch": [WohnungVerbrauchOut.model_validate(o) for o in overrides],
        },
    )


@router.get("/zaehler/{zaehler_id}/staende")
def list_zaehlerstaende(
    zaehler_id: int, periode_id: int, db: Session = Depends(get_db)
) -> ApiResponse:
    zaehler = db.get(Zaehler, zaehler_id)
    if not zaehler:
        raise HTTPException(status_code=404, detail="Zähler nicht gefunden")

    staende = (
        db.query(Zaehlerstand)
        .filter(
            Zaehlerstand.zaehler_id == zaehler_id,
            Zaehlerstand.abrechnungsperiode_id == periode_id,
        )
        .order_by(Zaehlerstand.ablesedatum, Zaehlerstand.id)
        .all()
    )

    periode = db.get(Abrechnungsperiode, periode_id)

    # Look up previous period's end reading for this meter
    vorperiode_endwert: float | None = None
    if periode:
        prev = (
            db.query(Abrechnungsperiode)
            .filter(
                Abrechnungsperiode.liegenschaft_id == periode.liegenschaft_id,
                Abrechnungsperiode.bis_datum < periode.von_datum,
            )
            .order_by(Abrechnungsperiode.bis_datum.desc())
            .first()
        )
        if prev:
            prev_ende = (
                db.query(Zaehlerstand)
                .filter(
                    Zaehlerstand.zaehler_id == zaehler_id,
                    Zaehlerstand.abrechnungsperiode_id == prev.id,
                    Zaehlerstand.art == ART_PERIODE_ENDE,
                )
                .first()
            )
            if prev_ende:
                vorperiode_endwert = prev_ende.wert

    gruppen = _baue_zaehlerstaende_gruppe(staende, periode, vorperiode_endwert)
    return ApiResponse(ok=True, data=gruppen)


@router.post("/zaehler/{zaehler_id}/staende", status_code=201)
def create_zaehlerstand(
    zaehler_id: int, body: ZaehlerstandCreate, db: Session = Depends(get_db)
) -> ApiResponse:
    zaehler = db.get(Zaehler, zaehler_id)
    if not zaehler:
        raise HTTPException(status_code=404, detail="Zähler nicht gefunden")

    periode = db.get(Abrechnungsperiode, body.periode_id)
    if not periode:
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")
    if periode.status == "abgeschlossen":
        raise HTTPException(status_code=400, detail="Abgeschlossene Periode kann nicht geändert werden")

    if body.art in (ART_PERIODE_START, ART_PERIODE_ENDE):
        existing = (
            db.query(Zaehlerstand)
            .filter(
                Zaehlerstand.zaehler_id == zaehler_id,
                Zaehlerstand.abrechnungsperiode_id == body.periode_id,
                Zaehlerstand.art == body.art,
            )
            .first()
        )
        if existing:
            label = "Anfangsablesung" if body.art == ART_PERIODE_START else "Endablesung"
            raise HTTPException(
                status_code=400,
                detail=f"{label} für diesen Zähler in dieser Periode bereits vorhanden. Bitte bestehende Ablesung bearbeiten.",
            )

    stand = Zaehlerstand(
        zaehler_id=zaehler_id,
        abrechnungsperiode_id=body.periode_id,
        ablesedatum=body.ablesedatum,
        wert=body.wert,
        art=body.art,
        abgelesen_von=body.abgelesen_von,
        notiz=body.notiz,
    )
    db.add(stand)
    db.commit()
    db.refresh(stand)
    return ApiResponse(ok=True, data=ZaehlerstandOut.model_validate(stand))


@router.put("/zaehlerstaende/{stand_id}")
def update_zaehlerstand(
    stand_id: int, body: ZaehlerstandUpdate, db: Session = Depends(get_db)
) -> ApiResponse:
    stand = db.get(Zaehlerstand, stand_id)
    if not stand:
        raise HTTPException(status_code=404, detail="Zählerstand nicht gefunden")

    periode = db.get(Abrechnungsperiode, stand.abrechnungsperiode_id)
    if periode and periode.status == "abgeschlossen":
        raise HTTPException(status_code=400, detail="Abgeschlossene Periode kann nicht geändert werden")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(stand, field, value)
    db.commit()
    db.refresh(stand)
    return ApiResponse(ok=True, data=ZaehlerstandOut.model_validate(stand))


@router.delete("/zaehlerstaende/{stand_id}")
def delete_zaehlerstand(stand_id: int, db: Session = Depends(get_db)) -> ApiResponse:
    stand = db.get(Zaehlerstand, stand_id)
    if not stand:
        raise HTTPException(status_code=404, detail="Zählerstand nicht gefunden")

    periode = db.get(Abrechnungsperiode, stand.abrechnungsperiode_id)
    if periode and periode.status == "abgeschlossen":
        raise HTTPException(status_code=400, detail="Abgeschlossene Periode kann nicht geändert werden")

    db.delete(stand)
    db.commit()
    return ApiResponse(ok=True, data=None)


# ── Fest vorgegebener Verbrauch je Mieter (bei Mieterwechsel) ────────────────

@router.get("/perioden/{periode_id}/wohnungen/{wohnung_id}/verbrauch-override")
def list_verbrauch_override(
    periode_id: int, wohnung_id: int, db: Session = Depends(get_db)
) -> ApiResponse:
    mieter_ids = [m.id for m in db.query(Mieter).filter(Mieter.wohnung_id == wohnung_id).all()]
    if not mieter_ids:
        return ApiResponse(ok=True, data=[])
    rows = (
        db.query(MieterVerbrauch)
        .filter(
            MieterVerbrauch.abrechnungsperiode_id == periode_id,
            MieterVerbrauch.mieter_id.in_(mieter_ids),
        )
        .all()
    )
    return ApiResponse(ok=True, data=[MieterVerbrauchOut.model_validate(r) for r in rows])


@router.put("/perioden/{periode_id}/mieter/{mieter_id}/verbrauch-override")
def set_verbrauch_override(
    periode_id: int, mieter_id: int, body: MieterVerbrauchSet, db: Session = Depends(get_db)
) -> ApiResponse:
    if not db.get(Abrechnungsperiode, periode_id):
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")
    if not db.get(Mieter, mieter_id):
        raise HTTPException(status_code=404, detail="Mieter nicht gefunden")

    vorhanden = (
        db.query(MieterVerbrauch)
        .filter(
            MieterVerbrauch.abrechnungsperiode_id == periode_id,
            MieterVerbrauch.mieter_id == mieter_id,
            MieterVerbrauch.zaehler_typ == body.zaehler_typ,
        )
        .first()
    )

    # wert = null -> Vorgabe entfernen, wieder nach Tagen verteilen
    if body.wert is None:
        if vorhanden:
            db.delete(vorhanden)
            db.commit()
        return ApiResponse(ok=True, data=None)

    if body.wert < 0:
        raise HTTPException(status_code=400, detail="Verbrauch darf nicht negativ sein")

    if vorhanden:
        vorhanden.wert = body.wert
        vorhanden.notiz = body.notiz
        vorhanden.als_schaetzung_anzeigen = body.als_schaetzung_anzeigen
    else:
        db.add(
            MieterVerbrauch(
                mieter_id=mieter_id,
                abrechnungsperiode_id=periode_id,
                zaehler_typ=body.zaehler_typ,
                wert=body.wert,
                notiz=body.notiz,
                als_schaetzung_anzeigen=body.als_schaetzung_anzeigen,
            )
        )
    db.commit()
    return ApiResponse(ok=True, data={"mieter_id": mieter_id, "zaehler_typ": body.zaehler_typ,
                                      "wert": body.wert})


# ── De-facto-Verbrauch je Wohnung (überschreibt berechnete Differenz) ────────

@router.get("/perioden/{periode_id}/wohnung-verbrauch")
def list_wohnung_verbrauch(periode_id: int, db: Session = Depends(get_db)) -> ApiResponse:
    rows = (
        db.query(WohnungVerbrauch)
        .filter(WohnungVerbrauch.abrechnungsperiode_id == periode_id)
        .all()
    )
    return ApiResponse(ok=True, data=[WohnungVerbrauchOut.model_validate(r) for r in rows])


@router.put("/perioden/{periode_id}/wohnungen/{wohnung_id}/wohnung-verbrauch")
def set_wohnung_verbrauch(
    periode_id: int, wohnung_id: int, body: WohnungVerbrauchSet, db: Session = Depends(get_db)
) -> ApiResponse:
    if not db.get(Abrechnungsperiode, periode_id):
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")

    vorhanden = (
        db.query(WohnungVerbrauch)
        .filter(
            WohnungVerbrauch.abrechnungsperiode_id == periode_id,
            WohnungVerbrauch.wohnung_id == wohnung_id,
            WohnungVerbrauch.zaehler_typ == body.zaehler_typ,
        )
        .first()
    )
    if body.wert is None:
        if vorhanden:
            db.delete(vorhanden)
            db.commit()
        return ApiResponse(ok=True, data=None)
    if body.wert < 0:
        raise HTTPException(status_code=400, detail="Verbrauch darf nicht negativ sein")

    if vorhanden:
        vorhanden.wert = body.wert
        vorhanden.notiz = body.notiz
    else:
        db.add(
            WohnungVerbrauch(
                wohnung_id=wohnung_id,
                abrechnungsperiode_id=periode_id,
                zaehler_typ=body.zaehler_typ,
                wert=body.wert,
                notiz=body.notiz,
            )
        )
    db.commit()
    return ApiResponse(ok=True, data={"wohnung_id": wohnung_id, "zaehler_typ": body.zaehler_typ, "wert": body.wert})

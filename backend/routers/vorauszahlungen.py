import calendar
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Abrechnungsperiode, Mieter, Vorauszahlung, Wohnung
from schemas import (
    ApiResponse,
    VorauszahlungGesamtBody,
    VorauszahlungGrid,
    VorauszahlungGridMieter,
    VorauszahlungGridMonat,
    VorauszahlungGridWohnung,
    VorauszahlungOut,
    VorauszahlungUpdate,
)

router = APIRouter(tags=["Vorauszahlungen"])

MONAT_LABELS = {
    1: "Jan", 2: "Feb", 3: "Mär", 4: "Apr", 5: "Mai", 6: "Jun",
    7: "Jul", 8: "Aug", 9: "Sep", 10: "Okt", 11: "Nov", 12: "Dez",
}


def _get_months(von: date, bis: date) -> list[tuple[int, int]]:
    months = []
    current = date(von.year, von.month, 1)
    while current <= bis:
        months.append((current.month, current.year))
        if current.month == 12:
            current = date(current.year + 1, 1, 1)
        else:
            current = date(current.year, current.month + 1, 1)
    return months


def _mieter_active_in_month(mieter: Mieter, monat: int, jahr: int) -> bool:
    last_day = calendar.monthrange(jahr, monat)[1]
    month_start = date(jahr, monat, 1)
    month_end = date(jahr, monat, last_day)
    einzug = date.fromisoformat(mieter.einzug_datum)
    auszug = date.fromisoformat(mieter.auszug_datum) if mieter.auszug_datum else date(9999, 12, 31)
    return einzug <= month_end and auszug >= month_start


@router.get("/perioden/{periode_id}/vorauszahlungen")
def get_vorauszahlungen(periode_id: int, db: Session = Depends(get_db)) -> ApiResponse:
    periode = db.get(Abrechnungsperiode, periode_id)
    if not periode:
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")

    von = date.fromisoformat(periode.von_datum)
    bis = date.fromisoformat(periode.bis_datum)
    months = _get_months(von, bis)

    wohnungen = (
        db.query(Wohnung)
        .filter(Wohnung.liegenschaft_id == periode.liegenschaft_id, Wohnung.aktiv == True)
        .order_by(Wohnung.sortierung, Wohnung.id)
        .all()
    )

    grid_wohnungen: list[VorauszahlungGridWohnung] = []

    for wohnung in wohnungen:
        mieter_rows = (
            db.query(Mieter)
            .filter(
                Mieter.wohnung_id == wohnung.id,
                Mieter.ist_leerstand == False,
                Mieter.einzug_datum <= periode.bis_datum,
            )
            .filter(
                (Mieter.auszug_datum == None) | (Mieter.auszug_datum >= periode.von_datum)
            )
            .order_by(Mieter.einzug_datum)
            .all()
        )

        grid_mieter: list[VorauszahlungGridMieter] = []

        for mieter in mieter_rows:
            vz_list: list[VorauszahlungOut] = []
            for monat, jahr in months:
                if not _mieter_active_in_month(mieter, monat, jahr):
                    continue
                existing = (
                    db.query(Vorauszahlung)
                    .filter(
                        Vorauszahlung.mieter_id == mieter.id,
                        Vorauszahlung.abrechnungsperiode_id == periode_id,
                        Vorauszahlung.monat == monat,
                        Vorauszahlung.jahr == jahr,
                    )
                    .first()
                )
                if not existing:
                    existing = Vorauszahlung(
                        mieter_id=mieter.id,
                        abrechnungsperiode_id=periode_id,
                        monat=monat,
                        jahr=jahr,
                        betrag_soll=mieter.monatliche_vorauszahlung,
                        betrag_ist=0.0,
                    )
                    db.add(existing)
                    db.flush()
                vz_list.append(VorauszahlungOut.model_validate(existing))

            if vz_list:
                grid_mieter.append(
                    VorauszahlungGridMieter(
                        mieter_id=mieter.id,
                        anzeigename=mieter.anzeigename,
                        vorauszahlungen=vz_list,
                        total_soll=round(sum(v.betrag_soll for v in vz_list), 2),
                        total_ist=round(sum(v.betrag_ist for v in vz_list), 2),
                    )
                )

        if grid_mieter:
            grid_wohnungen.append(
                VorauszahlungGridWohnung(
                    wohnung_id=wohnung.id,
                    bezeichnung=wohnung.bezeichnung,
                    mieter=grid_mieter,
                )
            )

    db.commit()

    grid = VorauszahlungGrid(
        monate=[
            VorauszahlungGridMonat(monat=m, jahr=j, label=f"{MONAT_LABELS[m]} {j}")
            for m, j in months
        ],
        wohnungen=grid_wohnungen,
    )
    return ApiResponse(ok=True, data=grid)


@router.put("/vorauszahlungen/{vz_id}")
def update_vorauszahlung(vz_id: int, body: VorauszahlungUpdate, db: Session = Depends(get_db)) -> ApiResponse:
    vz = db.get(Vorauszahlung, vz_id)
    if not vz:
        raise HTTPException(status_code=404, detail="Vorauszahlung nicht gefunden")

    if body.betrag_soll is not None:
        if body.scope is None:
            raise HTTPException(
                status_code=400,
                detail="scope ('monat' oder 'periode') ist erforderlich, wenn betrag_soll gesetzt wird",
            )
        if body.scope == "periode":
            mieter = db.get(Mieter, vz.mieter_id)
            if not mieter:
                raise HTTPException(status_code=404, detail="Mieter nicht gefunden")
            mieter.monatliche_vorauszahlung = body.betrag_soll
            db.query(Vorauszahlung).filter(
                Vorauszahlung.mieter_id == vz.mieter_id,
                Vorauszahlung.abrechnungsperiode_id == vz.abrechnungsperiode_id,
                Vorauszahlung.soll_override == False,
            ).update({"betrag_soll": body.betrag_soll})
        else:
            vz.betrag_soll = body.betrag_soll
            vz.soll_override = True

    if body.betrag_ist is not None:
        vz.betrag_ist = body.betrag_ist
        vz.ist_override = True
    if body.bezahlt_am is not None:
        vz.bezahlt_am = body.bezahlt_am
    if body.notiz is not None:
        vz.notiz = body.notiz
    db.commit()
    db.refresh(vz)
    return ApiResponse(ok=True, data=VorauszahlungOut.model_validate(vz))


@router.post("/perioden/{periode_id}/mieter/{mieter_id}/vorauszahlung-gesamt")
def set_vorauszahlung_gesamt(
    periode_id: int,
    mieter_id: int,
    body: VorauszahlungGesamtBody,
    db: Session = Depends(get_db),
) -> ApiResponse:
    if not db.get(Abrechnungsperiode, periode_id):
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")
    if not db.get(Mieter, mieter_id):
        raise HTTPException(status_code=404, detail="Mieter nicht gefunden")

    rows = (
        db.query(Vorauszahlung)
        .filter(
            Vorauszahlung.mieter_id == mieter_id,
            Vorauszahlung.abrechnungsperiode_id == periode_id,
        )
        .order_by(Vorauszahlung.jahr, Vorauszahlung.monat)
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Keine Vorauszahlungs-Monate für diesen Mieter in dieser Periode")

    override_attr = "soll_override" if body.ziel == "soll" else "ist_override"
    betrag_attr = "betrag_soll" if body.ziel == "soll" else "betrag_ist"

    manuell_rows = [r for r in rows if getattr(r, override_attr)]
    auto_rows = [r for r in rows if not getattr(r, override_attr)]
    manuell_summe = round(sum(getattr(r, betrag_attr) for r in manuell_rows), 2)

    rest = round(body.betrag_gesamt - manuell_summe, 2)
    if rest < 0:
        # Neuer Gesamtbetrag reicht nicht für die Summe der bereits individuell fixierten
        # Monate (z. B. tatsächlich weniger gezahlt als ursprünglich fixiert). Kein Hard-Block
        # mehr (User-Entscheidung 2026-09-23) - alle Fixierungen fuer dieses Zielfeld werden
        # aufgehoben und der neue Gesamtbetrag gleichmaessig auf ALLE Monate neu verteilt. Das
        # Frontend zeigt vorher einen Hinweis, blockiert das Absenden aber nicht.
        for r in manuell_rows:
            setattr(r, override_attr, False)
        auto_rows = rows
        rest = body.betrag_gesamt

    if not auto_rows:
        raise HTTPException(
            status_code=400,
            detail="Alle Monate sind bereits individuell fixiert — nichts zu verteilen",
        )

    pro_monat = round(rest / len(auto_rows), 2)
    verteilt = 0.0
    for i, row in enumerate(auto_rows):
        if i == len(auto_rows) - 1:
            wert = round(rest - verteilt, 2)  # Rundungsrest im letzten Monat auffangen
        else:
            wert = pro_monat
            verteilt = round(verteilt + wert, 2)
        setattr(row, betrag_attr, wert)

    db.commit()

    grid_rows = (
        db.query(Vorauszahlung)
        .filter(
            Vorauszahlung.mieter_id == mieter_id,
            Vorauszahlung.abrechnungsperiode_id == periode_id,
        )
        .order_by(Vorauszahlung.jahr, Vorauszahlung.monat)
        .all()
    )
    return ApiResponse(
        ok=True,
        data=[VorauszahlungOut.model_validate(r) for r in grid_rows],
    )

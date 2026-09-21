"""
Liegenschafts-Verbund: Gemeinsame Kosten auf mehrere Liegenschaften verteilen.

Endpunkte:
  GET/POST        /verbund
  GET/PUT/DELETE  /verbund/{vid}
  POST/DELETE     /verbund/{vid}/mitglieder[/{lid}]
  GET/POST        /verbund/{vid}/kosten
  PUT/DELETE      /verbund/{vid}/kosten/{kid}
  POST            /verbund/{vid}/kosten/{kid}/vorschau
  POST/DELETE     /verbund/{vid}/kosten/{kid}/anwenden

"Anwenden" schreibt den je Liegenschaft berechneten Anteil NICHT mehr als
Kostenposition (altes, rechnungsbasiertes Modell, das die aktive
Direkt-Preise-Engine — schluessel_engine.py — nirgends liest), sondern als
Zuschlag auf DirektKostenartWert.preis_pro_einheit der gewählten
DirektKostenart für die jeweilige Periode. Damit wirkt sich der Verbund-
Anteil tatsächlich auf die Mieterabrechnung aus (siehe NEBENKOSTEN_STATUS.md
für den Fund, der zu dieser Umstellung führte).
"""

from typing import Any
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import (
    LiegenschaftVerbund, VerbundMitglied, VerbundKosten,
    Liegenschaft, Wohnung, Mieter, DirektKostenart, DirektKostenartWert, Abrechnungsperiode,
)
from schemas import (
    VerbundCreate, VerbundUpdate, VerbundOut,
    VerbundMitgliedCreate, VerbundMitgliedOut,
    VerbundKostenCreate, VerbundKostenUpdate, VerbundKostenOut,
    VerbundAnwendenBody, VerbundVorschauResult, VerbundAufteilungItem,
)
from schluessel_engine import gesamteinheiten_vorschlag

router = APIRouter(tags=["Verbund"])

VALID_SCHLUESSEL = {
    "wohnungsanzahl", "wohnflaeche_m2", "personen",
    "kwh_gas", "m3_wasser", "manuell_prozent",
}


# ── Hilfsfunktionen ──────────────────────────────────────────────────────────

def _get_verbund_or_404(vid: int, db: Session) -> LiegenschaftVerbund:
    v = db.get(LiegenschaftVerbund, vid)
    if not v:
        raise HTTPException(404, "Verbund nicht gefunden")
    return v


def _get_kosten_or_404(kid: int, vid: int, db: Session) -> VerbundKosten:
    k = db.get(VerbundKosten, kid)
    if not k or k.verbund_id != vid:
        raise HTTPException(404, "Kostenposition nicht gefunden")
    return k


def _mitglied_ids(verbund: LiegenschaftVerbund) -> list[int]:
    return [m.liegenschaft_id for m in verbund.mitglieder]


def _berechne_aufteilung(
    schluessel_typ: str,
    schluessel_werte_json: str | None,
    betrag_gesamt: float,
    liegenschaft_ids: list[int],
    db: Session,
) -> dict[str, VerbundAufteilungItem]:
    """
    Berechnet den Betrag pro Liegenschaft.
    Gibt dict {str(lid): VerbundAufteilungItem} zurück.
    """
    user_werte: dict[str, float] = {}
    if schluessel_werte_json:
        user_werte = {str(k): float(v) for k, v in json.loads(schluessel_werte_json).items()}

    basis: dict[int, float] = {}

    if schluessel_typ == "wohnungsanzahl":
        for lid in liegenschaft_ids:
            basis[lid] = float(
                db.query(func.count(Wohnung.id))
                .filter(Wohnung.liegenschaft_id == lid, Wohnung.aktiv == True)
                .scalar() or 0
            )

    elif schluessel_typ == "wohnflaeche_m2":
        for lid in liegenschaft_ids:
            basis[lid] = float(
                db.query(func.sum(Wohnung.flaeche_m2))
                .filter(Wohnung.liegenschaft_id == lid, Wohnung.aktiv == True)
                .scalar() or 0
            )

    elif schluessel_typ == "personen":
        for lid in liegenschaft_ids:
            wid_subq = (
                db.query(Wohnung.id)
                .filter(Wohnung.liegenschaft_id == lid)
                .scalar_subquery()
            )
            basis[lid] = float(
                db.query(func.sum(Mieter.anzahl_personen))
                .filter(
                    Mieter.wohnung_id.in_(wid_subq),
                    Mieter.ist_leerstand == False,
                    Mieter.auszug_datum == None,  # aktuell aktiv
                )
                .scalar() or 0
            )

    elif schluessel_typ in ("kwh_gas", "m3_wasser"):
        # User-eingetragene Verbrauchswerte pro Liegenschaft
        for lid in liegenschaft_ids:
            basis[lid] = user_werte.get(str(lid), 0.0)

    elif schluessel_typ == "manuell_prozent":
        # User gibt % pro Liegenschaft ein; muss auf 100 summieren
        for lid in liegenschaft_ids:
            basis[lid] = user_werte.get(str(lid), 0.0)
        total_pct = sum(basis.values())
        if total_pct == 0:
            raise HTTPException(400, "Prozentsätze dürfen nicht alle 0 sein")
        # Normalisierung auf 100 %
        if abs(total_pct - 100.0) > 0.5:
            raise HTTPException(
                400,
                f"Prozentsätze müssen zusammen 100 ergeben (aktuell: {total_pct:.2f})"
            )
        # Verwende die Prozent direkt als Basis (Summe = 100)
    else:
        raise HTTPException(400, f"Unbekannter Schlüssel-Typ: {schluessel_typ}")

    gesamt_basis = sum(basis.values())
    if gesamt_basis == 0:
        raise HTTPException(400, "Basis-Summe ist 0 — keine Aufteilung möglich")

    result: dict[str, VerbundAufteilungItem] = {}
    for lid in liegenschaft_ids:
        anteil = basis[lid] / gesamt_basis
        result[str(lid)] = VerbundAufteilungItem(
            betrag=round(betrag_gesamt * anteil, 2),
            anteil_prozent=round(anteil * 100, 4),
            basis_wert=basis[lid],
        )

    # Rundungsfehler auf erste Liegenschaft korrigieren
    berechnete_summe = sum(item.betrag for item in result.values())
    diff = round(betrag_gesamt - berechnete_summe, 2)
    if diff != 0 and result:
        first_key = str(liegenschaft_ids[0])
        result[first_key] = VerbundAufteilungItem(
            betrag=round(result[first_key].betrag + diff, 2),
            anteil_prozent=result[first_key].anteil_prozent,
            basis_wert=result[first_key].basis_wert,
        )

    return result


# ── Verbund CRUD ─────────────────────────────────────────────────────────────

@router.get("/verbund")
def list_verbund(db: Session = Depends(get_db)) -> dict[str, Any]:
    items = db.query(LiegenschaftVerbund).order_by(LiegenschaftVerbund.id).all()
    return {"ok": True, "data": [VerbundOut.model_validate(v) for v in items]}


@router.post("/verbund")
def create_verbund(body: VerbundCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    v = LiegenschaftVerbund(name=body.name)
    db.add(v)
    db.commit()
    db.refresh(v)
    return {"ok": True, "data": VerbundOut.model_validate(v)}


@router.get("/verbund/{vid}")
def get_verbund(vid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    v = _get_verbund_or_404(vid, db)
    data = VerbundOut.model_validate(v).model_dump()
    data["mitglieder"] = [VerbundMitgliedOut.model_validate(m).model_dump() for m in v.mitglieder]
    data["kosten"] = [VerbundKostenOut.model_validate(k).model_dump() for k in v.kosten]
    return {"ok": True, "data": data}


@router.put("/verbund/{vid}")
def update_verbund(vid: int, body: VerbundUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    v = _get_verbund_or_404(vid, db)
    v.name = body.name
    db.commit()
    db.refresh(v)
    return {"ok": True, "data": VerbundOut.model_validate(v)}


@router.delete("/verbund/{vid}")
def delete_verbund(vid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    v = _get_verbund_or_404(vid, db)
    db.delete(v)
    db.commit()
    return {"ok": True, "data": None}


# ── Mitglieder ───────────────────────────────────────────────────────────────

@router.post("/verbund/{vid}/mitglieder")
def add_mitglied(vid: int, body: VerbundMitgliedCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    v = _get_verbund_or_404(vid, db)
    if not db.get(Liegenschaft, body.liegenschaft_id):
        raise HTTPException(404, "Liegenschaft nicht gefunden")
    # Duplikat prüfen
    existing = [m for m in v.mitglieder if m.liegenschaft_id == body.liegenschaft_id]
    if existing:
        raise HTTPException(400, "Liegenschaft ist bereits Mitglied dieses Verbunds")
    m = VerbundMitglied(verbund_id=vid, liegenschaft_id=body.liegenschaft_id, sort=body.sort)
    db.add(m)
    db.commit()
    db.refresh(m)
    return {"ok": True, "data": VerbundMitgliedOut.model_validate(m)}


@router.delete("/verbund/{vid}/mitglieder/{lid}")
def remove_mitglied(vid: int, lid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    _get_verbund_or_404(vid, db)
    m = (
        db.query(VerbundMitglied)
        .filter(VerbundMitglied.verbund_id == vid, VerbundMitglied.liegenschaft_id == lid)
        .first()
    )
    if not m:
        raise HTTPException(404, "Mitglied nicht gefunden")
    db.delete(m)
    db.commit()
    return {"ok": True, "data": None}


# ── Gemeinsame Kosten ────────────────────────────────────────────────────────

@router.get("/verbund/{vid}/kosten")
def list_kosten(vid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    _get_verbund_or_404(vid, db)
    items = (
        db.query(VerbundKosten)
        .filter(VerbundKosten.verbund_id == vid)
        .order_by(VerbundKosten.id)
        .all()
    )
    return {"ok": True, "data": [VerbundKostenOut.model_validate(k) for k in items]}


@router.post("/verbund/{vid}/kosten")
def create_kosten(vid: int, body: VerbundKostenCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    v = _get_verbund_or_404(vid, db)
    if not v.mitglieder:
        raise HTTPException(400, "Verbund hat keine Mitglieder")
    if body.schluessel_typ not in VALID_SCHLUESSEL:
        raise HTTPException(400, f"Ungültiger Schlüssel-Typ: {body.schluessel_typ}")
    k = VerbundKosten(verbund_id=vid, **body.model_dump())
    db.add(k)
    db.commit()
    db.refresh(k)
    return {"ok": True, "data": VerbundKostenOut.model_validate(k)}


@router.put("/verbund/{vid}/kosten/{kid}")
def update_kosten(vid: int, kid: int, body: VerbundKostenUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    k = _get_kosten_or_404(kid, vid, db)
    if k.angewendet:
        raise HTTPException(400, "Angewendete Kostenposition kann nicht bearbeitet werden. Zuerst Anwendung rückgängig machen.")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(k, field, val)
    db.commit()
    db.refresh(k)
    return {"ok": True, "data": VerbundKostenOut.model_validate(k)}


@router.delete("/verbund/{vid}/kosten/{kid}")
def delete_kosten(vid: int, kid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    k = _get_kosten_or_404(kid, vid, db)
    # Falls angewendet: zuerst die Satz-Erhöhung zurücknehmen
    if k.angewendet and k.anwendung_json:
        _mache_anwendung_rueckgaengig(k.anwendung_json, db)
    db.delete(k)
    db.commit()
    return {"ok": True, "data": None}


def _mache_anwendung_rueckgaengig(anwendung_json: str, db: Session) -> None:
    """Nimmt für jede Liegenschaft den zuvor addierten Satz-Zuschlag wieder zurück.

    Ignoriert Einträge im alten, vor dieser Umstellung erzeugten Format (Kostenposition
    statt DirektKostenartWert) — die zugehörige Kostenposition existiert ggf. noch in der
    DB, wird aber nirgends mehr gelesen und muss hier nicht mehr aufgeräumt werden."""
    anwendung = json.loads(anwendung_json)
    for info in anwendung.values():
        wert_id = info.get("direkt_kostenart_wert_id")
        if wert_id is None:
            continue
        wert = db.get(DirektKostenartWert, wert_id)
        if wert is None:
            continue
        rate_delta = info.get("rate_delta", 0.0)
        neuer_satz = (wert.preis_pro_einheit or 0.0) - rate_delta
        if abs(neuer_satz) < 1e-9:
            # Zeile ist wieder auf 0 — nur löschen, wenn sie sonst keine
            # Split-Sätze trägt (sonst würde eine Grundkosten-Zeile mit
            # entfernt, die nichts mit dieser Verbund-Anwendung zu tun hat).
            if wert.preis_grund_pro_m2 is None and wert.preis_verbrauch_pro_einheit is None:
                db.delete(wert)
                continue
            neuer_satz = 0.0
        wert.preis_pro_einheit = neuer_satz


# ── Vorschau & Anwenden ──────────────────────────────────────────────────────

@router.post("/verbund/{vid}/kosten/{kid}/vorschau")
def vorschau(vid: int, kid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    v = _get_verbund_or_404(vid, db)
    k = _get_kosten_or_404(kid, vid, db)
    lid_list = _mitglied_ids(v)
    if not lid_list:
        raise HTTPException(400, "Verbund hat keine Mitglieder")

    aufteilung = _berechne_aufteilung(
        k.schluessel_typ, k.schluessel_werte_json,
        k.betrag_gesamt, lid_list, db,
    )
    return {
        "ok": True,
        "data": VerbundVorschauResult(
            aufteilung=aufteilung,
            gesamt=k.betrag_gesamt,
        ).model_dump(),
    }


@router.post("/verbund/{vid}/kosten/{kid}/anwenden")
def anwenden(vid: int, kid: int, body: VerbundAnwendenBody, db: Session = Depends(get_db)) -> dict[str, Any]:
    v = _get_verbund_or_404(vid, db)
    k = _get_kosten_or_404(kid, vid, db)
    if k.angewendet:
        raise HTTPException(400, "Bereits angewendet. Zuerst rückgängig machen.")

    lid_list = _mitglied_ids(v)
    # Sicherstellen dass body alle Mitglieder abdeckt
    missing = [lid for lid in lid_list if str(lid) not in body.perioden]
    if missing:
        raise HTTPException(
            400,
            f"Fehlende Perioden-Konfiguration für Liegenschaften: {missing}"
        )

    aufteilung = _berechne_aufteilung(
        k.schluessel_typ, k.schluessel_werte_json,
        k.betrag_gesamt, lid_list, db,
    )

    anwendung: dict[str, dict] = {}
    for lid in lid_list:
        lid_str = str(lid)
        cfg = body.perioden[lid_str]
        betrag = aufteilung[lid_str].betrag

        # Periode + Kostenart validieren
        periode = db.get(Abrechnungsperiode, cfg.periode_id)
        if not periode or periode.liegenschaft_id != lid:
            raise HTTPException(400, f"Periode {cfg.periode_id} gehört nicht zu Liegenschaft {lid}")
        if periode.status == "abgeschlossen":
            raise HTTPException(400, f"Periode {periode.bezeichnung} ist abgeschlossen")

        kostenart = db.get(DirektKostenart, cfg.kostenart_id)
        if not kostenart:
            raise HTTPException(400, f"Kostenart {cfg.kostenart_id} nicht gefunden")
        if kostenart.hat_grundkosten_split:
            raise HTTPException(
                400,
                f"„{kostenart.name}“ hat einen Grundkosten/Verbrauch-Split und kann nicht direkt "
                "per Verbund befüllt werden — bitte eine einfache Kostenart wählen.",
            )

        # Verbund-Betrag in einen €/Einheit-Zuschlag umrechnen, passend zur
        # Verteilungsbasis der gewählten Kostenart (m², Personen, Wohnung, ...).
        einheiten = gesamteinheiten_vorschlag(db, cfg.periode_id)
        gesamteinheiten = einheiten.get(kostenart.verteilungsbasis, 0.0)
        if not gesamteinheiten:
            raise HTTPException(
                400,
                f"Keine Basis-Einheiten ({kostenart.verteilungsbasis}) für Periode "
                f"{periode.bezeichnung} — Kostenart kann hier nicht befüllt werden.",
            )
        rate_delta = betrag / gesamteinheiten

        wert = (
            db.query(DirektKostenartWert)
            .filter(
                DirektKostenartWert.abrechnungsperiode_id == cfg.periode_id,
                DirektKostenartWert.kostenart_id == cfg.kostenart_id,
            )
            .first()
        )
        if wert is None:
            wert = DirektKostenartWert(
                abrechnungsperiode_id=cfg.periode_id,
                kostenart_id=cfg.kostenart_id,
                preis_pro_einheit=rate_delta,
            )
            db.add(wert)
        else:
            wert.preis_pro_einheit = (wert.preis_pro_einheit or 0.0) + rate_delta
        db.flush()  # ID verfügbar machen für anwendung_json

        anwendung[lid_str] = {
            "periode_id": cfg.periode_id,
            "kostenart_id": cfg.kostenart_id,
            "betrag": betrag,
            "rate_delta": rate_delta,
            "direkt_kostenart_wert_id": wert.id,
        }

    k.angewendet = True
    k.anwendung_json = json.dumps(anwendung)
    db.commit()
    db.refresh(k)
    return {"ok": True, "data": VerbundKostenOut.model_validate(k)}


@router.delete("/verbund/{vid}/kosten/{kid}/anwenden")
def anwenden_rueckgaengig(vid: int, kid: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    _get_verbund_or_404(vid, db)
    k = _get_kosten_or_404(kid, vid, db)
    if not k.angewendet:
        raise HTTPException(400, "Nicht angewendet")

    if k.anwendung_json:
        _mache_anwendung_rueckgaengig(k.anwendung_json, db)

    k.angewendet = False
    k.anwendung_json = None
    db.commit()
    db.refresh(k)
    return {"ok": True, "data": VerbundKostenOut.model_validate(k)}

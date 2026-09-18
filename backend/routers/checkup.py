"""Checkup — eine Gesamtübersicht über alle erfassten Daten.

Liefert die komplette Hierarchie in einem Aufruf:
    gemeinsame Kosten (Verbund)
      → Liegenschaft
        → Wohnung
          → Mieter (Kostenblöcke, Vorauszahlungen, Saldo)

Reine Leseansicht: rechnet nichts neu, sondern zeigt an, was in der Datenbank steht
(``MieterKostenanteil`` aus dem letzten Berechnungslauf). So sieht man auf einen Blick,
wo noch etwas fehlt, bevor die Abrechnung rausgeht.
"""

import json
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from domain import (
    ART_PERIODE_ENDE,
    ART_PERIODE_START,
    POOL_HEIZ_GRUND,
    POOL_HEIZ_VERBRAUCH,
    POOL_STROM,
    POOL_WW_GRUND,
    POOL_WW_VERBRAUCH,
)
from models import (
    Abrechnungsperiode,
    Kostenart,
    Kostenposition,
    Liegenschaft,
    LiegenschaftVerbund,
    Mieter,
    MieterKostenanteil,
    Vorauszahlung,
    Wohnung,
    Zaehler,
    Zaehlerstand,
)
from schemas import (
    ApiResponse,
    CheckupErgebnis,
    CheckupKostenart,
    CheckupLiegenschaft,
    CheckupMieter,
    CheckupVerbundKosten,
    CheckupWohnung,
)
from routers.suche import whg_nummer

router = APIRouter(tags=["Checkup"])


def _r(v: float) -> float:
    return round(v, 2)


@router.get("/checkup")
def checkup(db: Session = Depends(get_db)) -> ApiResponse:
    # ── Gemeinsame Kosten (Verbund) ──────────────────────────────────────────
    verbund_kosten: list[CheckupVerbundKosten] = []
    for verbund in db.query(LiegenschaftVerbund).order_by(LiegenschaftVerbund.id).all():
        for vk in verbund.kosten:
            aufteilung: dict[str, float] = {}
            if vk.anwendung_json:
                try:
                    roh = json.loads(vk.anwendung_json)
                    aufteilung = {str(k): float(v) for k, v in roh.items()}
                except (ValueError, TypeError):
                    aufteilung = {}
            verbund_kosten.append(
                CheckupVerbundKosten(
                    id=vk.id,
                    bezeichnung=vk.bezeichnung,
                    betrag_gesamt=_r(vk.betrag_gesamt),
                    schluessel_typ=vk.schluessel_typ,
                    angewendet=bool(vk.angewendet),
                    aufteilung=aufteilung,
                )
            )

    # ── Liegenschaften ───────────────────────────────────────────────────────
    liegenschaften_out: list[CheckupLiegenschaft] = []
    for lieg in db.query(Liegenschaft).order_by(Liegenschaft.name).all():
        periode = (
            db.query(Abrechnungsperiode)
            .filter(Abrechnungsperiode.liegenschaft_id == lieg.id)
            .order_by(Abrechnungsperiode.von_datum.desc())
            .first()
        )
        pid = periode.id if periode else None

        # Kostenarten mit erfassten Beträgen
        kostenarten_out: list[CheckupKostenart] = []
        kosten_gesamt = 0.0
        if pid is not None:
            summen: dict[int, float] = {}
            anzahl: dict[int, int] = {}
            for kp in (
                db.query(Kostenposition)
                .filter(Kostenposition.abrechnungsperiode_id == pid)
                .all()
            ):
                summen[kp.kostenart_id] = summen.get(kp.kostenart_id, 0.0) + kp.betrag_brutto
                anzahl[kp.kostenart_id] = anzahl.get(kp.kostenart_id, 0) + 1
            for ka in (
                db.query(Kostenart)
                .filter(Kostenart.liegenschaft_id == lieg.id, Kostenart.aktiv == True)  # noqa: E712
                .order_by(Kostenart.sortierung, Kostenart.name)
                .all()
            ):
                betrag = summen.get(ka.id, 0.0)
                if betrag == 0.0 and ka.id not in anzahl:
                    continue  # Kostenarten ohne Rechnung ausblenden
                kosten_gesamt += betrag
                kostenarten_out.append(
                    CheckupKostenart(
                        id=ka.id,
                        name=ka.name,
                        kategorie=ka.kategorie,
                        verteilungsschluessel=ka.verteilungsschluessel,
                        betrag=_r(betrag),
                        anzahl_rechnungen=anzahl.get(ka.id, 0),
                    )
                )

        # Kostenanteile der Periode einmal laden und nach Mieter gruppieren
        anteile_je_mieter: dict[int, list[MieterKostenanteil]] = {}
        if pid is not None:
            for row in (
                db.query(MieterKostenanteil)
                .filter(MieterKostenanteil.abrechnungsperiode_id == pid)
                .all()
            ):
                anteile_je_mieter.setdefault(row.mieter_id, []).append(row)

        wohnungen_out: list[CheckupWohnung] = []
        for w in (
            db.query(Wohnung)
            .filter(Wohnung.liegenschaft_id == lieg.id, Wohnung.aktiv == True)  # noqa: E712
            .all()
        ):
            # Verbrauch je Zählertyp (Endstand − Anfangsstand)
            verbrauch: dict[str, Optional[float]] = {
                "waerme": None, "warmwasser": None, "kaltwasser": None, "strom": None,
            }
            fehlende_ablesungen = 0
            if pid is not None:
                for z in (
                    db.query(Zaehler)
                    .filter(Zaehler.wohnung_id == w.id, Zaehler.aktiv == True)  # noqa: E712
                    .all()
                ):
                    staende = (
                        db.query(Zaehlerstand)
                        .filter(
                            Zaehlerstand.zaehler_id == z.id,
                            Zaehlerstand.abrechnungsperiode_id == pid,
                        )
                        .all()
                    )
                    start = next((s for s in staende if s.art == ART_PERIODE_START), None)
                    ende = next((s for s in staende if s.art == ART_PERIODE_ENDE), None)
                    if start is None or ende is None:
                        fehlende_ablesungen += 1
                        continue
                    diff = max(0.0, ende.wert - start.wert)
                    key = (
                        "waerme" if z.typ in ("waerme_kwh", "hkv_einheiten")
                        else "warmwasser" if z.typ == "warmwasser_m3"
                        else "kaltwasser" if z.typ == "kaltwasser_m3"
                        else "strom"
                    )
                    verbrauch[key] = round((verbrauch[key] or 0.0) + diff, 3)

            mieter_out: list[CheckupMieter] = []
            for mi in (
                db.query(Mieter)
                .filter(Mieter.wohnung_id == w.id)
                .order_by(Mieter.einzug_datum)
                .all()
            ):
                rows = anteile_je_mieter.get(mi.id, [])
                heizung = sum(r.kostenanteil for r in rows
                              if r.pool in (POOL_HEIZ_GRUND, POOL_HEIZ_VERBRAUCH))
                warmwasser = sum(r.kostenanteil for r in rows
                                 if r.pool in (POOL_WW_GRUND, POOL_WW_VERBRAUCH))
                strom = sum(r.kostenanteil for r in rows if r.pool == POOL_STROM)
                haus = sum(r.kostenanteil for r in rows if r.pool is None)
                kosten_summe = heizung + warmwasser + strom + haus

                vz_rows = []
                if pid is not None:
                    vz_rows = (
                        db.query(Vorauszahlung)
                        .filter(
                            Vorauszahlung.mieter_id == mi.id,
                            Vorauszahlung.abrechnungsperiode_id == pid,
                        )
                        .all()
                    )
                vz_soll = sum(v.betrag_soll for v in vz_rows)
                vz_ist = sum(v.betrag_ist for v in vz_rows)
                offene_monate = sum(1 for v in vz_rows if v.betrag_ist == 0)

                mieter_out.append(
                    CheckupMieter(
                        mieter_id=mi.id,
                        name=mi.anzeigename,
                        einzug=mi.einzug_datum,
                        auszug=mi.auszug_datum,
                        personen=mi.anzahl_personen,
                        ist_leerstand=bool(mi.ist_leerstand),
                        kosten_heizung=_r(heizung),
                        kosten_warmwasser=_r(warmwasser),
                        kosten_strom=_r(strom),
                        kosten_haus=_r(haus),
                        kosten_gesamt=_r(kosten_summe),
                        vorauszahlung_soll=_r(vz_soll),
                        vorauszahlung_ist=_r(vz_ist),
                        # Positiv = Mieter bekommt Geld zurück, negativ = Nachzahlung
                        saldo=_r(vz_ist - kosten_summe),
                        offene_monate=offene_monate,
                        berechnet=len(rows) > 0,
                    )
                )

            wohnungen_out.append(
                CheckupWohnung(
                    wohnung_id=w.id,
                    bezeichnung=w.bezeichnung,
                    flaeche_m2=w.flaeche_m2,
                    strom_ueber_vermieter=bool(w.strom_ueber_vermieter),
                    strom_preis_kwh=w.strom_preis_kwh,
                    verbrauch_waerme=verbrauch["waerme"],
                    verbrauch_warmwasser=verbrauch["warmwasser"],
                    verbrauch_kaltwasser=verbrauch["kaltwasser"],
                    verbrauch_strom=verbrauch["strom"],
                    fehlende_ablesungen=fehlende_ablesungen,
                    mieter=mieter_out,
                )
            )

        wohnungen_out.sort(key=lambda x: whg_nummer(x.bezeichnung))

        alle_mieter = [m for w in wohnungen_out for m in w.mieter]
        liegenschaften_out.append(
            CheckupLiegenschaft(
                liegenschaft_id=lieg.id,
                name=lieg.name,
                adresse=f"{lieg.adresse}, {lieg.plz} {lieg.ort}",
                periode_id=pid,
                periode_label=(
                    f"{periode.von_datum} – {periode.bis_datum}" if periode else "keine Periode"
                ),
                gesamtflaeche=_r(sum(w.flaeche_m2 for w in wohnungen_out)),
                kosten_erfasst=_r(kosten_gesamt),
                kostenarten=kostenarten_out,
                wohnungen=wohnungen_out,
                summe_kosten_verteilt=_r(sum(m.kosten_gesamt for m in alle_mieter)),
                summe_vorauszahlung_soll=_r(sum(m.vorauszahlung_soll for m in alle_mieter)),
                summe_vorauszahlung_ist=_r(sum(m.vorauszahlung_ist for m in alle_mieter)),
                summe_saldo=_r(sum(m.saldo for m in alle_mieter)),
            )
        )

    return ApiResponse(
        ok=True,
        data=CheckupErgebnis(
            verbund_kosten=verbund_kosten,
            verbund_summe=_r(sum(v.betrag_gesamt for v in verbund_kosten)),
            liegenschaften=liegenschaften_out,
            gesamt_kosten_erfasst=_r(sum(l.kosten_erfasst for l in liegenschaften_out)),
            gesamt_vorauszahlung_ist=_r(sum(l.summe_vorauszahlung_ist for l in liegenschaften_out)),
            gesamt_saldo=_r(sum(l.summe_saldo for l in liegenschaften_out)),
        ),
    )

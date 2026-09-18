"""Shared calculation building blocks (Segmentbildung, Proration, Gradtagzahlen,
Verbrauchsschätzung) — genutzt vom aktiven Direkt-Preise-Ansatz in
``schluessel_engine.py``. Die frühere Vollberechnung (``berechne_periode`` +
zugehöriger Router ``routers/berechnung.py``) wurde archiviert, siehe Branch
``legacy/stage3-engine``."""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional
import calendar

from sqlalchemy.orm import Session
from sqlalchemy import or_

from domain import (
    ART_PERIODE_ENDE,
    ART_PERIODE_START,
    POOL_HEIZ_GRUND,
    POOL_HEIZ_VERBRAUCH,
    POOL_STROM,
    POOL_WW_GRUND,
    POOL_WW_VERBRAUCH,
    Pool,
    TRAEGER_MIETER,
    TRAEGER_VERMIETER,
    TYP_KALTWASSER_M3,
    TYP_STROM_KWH,
    TYP_WAERME_KWH,
    TYP_WARMWASSER_M3,
    Traeger,
    VS_ANZAHL_KALTWASSERZAEHLER,
    VS_ANZAHL_RWM,
    VS_DIREKT,
    VS_M2_WOHNFLAECHE,
    VS_MIETE_RWM,
    VS_NUTZEINHEIT,
    VS_PERSONEN,
    VS_STROM_KWH_DIREKT,
    VS_VERBRAUCH_KWH_HEIZUNG,
    VS_VERBRAUCH_M3_KALT_PLUS_WARM,
    VS_VERBRAUCH_M3_WARMWASSER,
)
from models import (
    Abrechnungsperiode,
    Kostenart,
    Kostenposition,
    Liegenschaft,
    MieterKostenanteil,
    Mieter,
    MieterVerbrauch,
    WohnungVerbrauch,
    Vorauszahlung,
    Wohnung,
    Zaehler,
    Zaehlerstand,
)

_SCHAETZUNG_TYPEN = (TYP_WAERME_KWH, TYP_WARMWASSER_M3, TYP_KALTWASSER_M3, TYP_STROM_KWH)

GRADTAGZAHLEN: dict[int, int] = {
    1: 170, 2: 150, 3: 130, 4: 80, 5: 40,
    6: 13, 7: 13, 8: 14, 9: 30, 10: 80, 11: 120, 12: 160,
}


@dataclass
class Segment:
    mieter: Mieter
    wohnung: Wohnung
    von: date
    bis: date
    days: int
    time_frac: float
    gradtag_frac: float
    is_leerstand: bool


def _parse(s: str) -> date:
    return date.fromisoformat(s)


def _days(von: date, bis: date) -> int:
    return max(0, (bis - von).days + 1)


def _gradtag_sum(von: date, bis: date) -> float:
    """Weighted sum of Gradtagzahlen for [von, bis] inclusive. Handles partial months."""
    total = 0.0
    y, m = von.year, von.month
    while (y, m) <= (bis.year, bis.month):
        m_count = calendar.monthrange(y, m)[1]
        m_start = date(y, m, 1)
        m_end = date(y, m, m_count)
        ov_start = max(von, m_start)
        ov_end = min(bis, m_end)
        if ov_start <= ov_end:
            active = (ov_end - ov_start).days + 1
            total += GRADTAGZAHLEN[m] * (active / m_count)
        if m == 12:
            y, m = y + 1, 1
        else:
            m += 1
    return total


class ZaehlerDaten:
    """In-memory cache of all meter data one Segmentbildungs-Durchlauf needs.

    Replaces the former per-Wohnung × per-Typ × per-Zaehler query cascade
    (N+1 pattern) with exactly four bulk queries:
      1. all active Zaehler of the Liegenschaft's Wohnungen,
      2. all Zaehlerstand rows of the current period for those meters,
      3. the previous Abrechnungsperiode of the Liegenschaft (once, not per meter),
      4. all start/end Zaehlerstand rows of that previous period.

    Lookup results are identical to the former per-row queries: meters keep
    id (=rowid) order, readings keep (ablesedatum, id) order, and the
    first-by-rowid row wins where ``.first()`` was used before.
    """

    def __init__(
        self,
        db: Session,
        liegenschaft_id: int,
        periode: Abrechnungsperiode,
        wohnung_ids: list[int],
    ) -> None:
        self._zaehler: dict[tuple[int, str], list[Zaehler]] = {}
        alle_zaehler = (
            db.query(Zaehler)
            .filter(Zaehler.wohnung_id.in_(wohnung_ids), Zaehler.aktiv == True)
            .order_by(Zaehler.id)
            .all()
        )
        for z in alle_zaehler:
            self._zaehler.setdefault((z.wohnung_id, z.typ), []).append(z)

        zids = [z.id for z in alle_zaehler]
        self._reads: dict[int, list[Zaehlerstand]] = {zid: [] for zid in zids}
        if zids:
            for r in (
                db.query(Zaehlerstand)
                .filter(
                    Zaehlerstand.abrechnungsperiode_id == periode.id,
                    Zaehlerstand.zaehler_id.in_(zids),
                )
                .order_by(Zaehlerstand.ablesedatum, Zaehlerstand.id)
                .all()
            ):
                self._reads[r.zaehler_id].append(r)

        self._prev_reads: dict[tuple[int, str], Zaehlerstand] = {}
        prev = (
            db.query(Abrechnungsperiode)
            .filter(
                Abrechnungsperiode.liegenschaft_id == liegenschaft_id,
                Abrechnungsperiode.bis_datum < periode.von_datum,
            )
            .order_by(Abrechnungsperiode.bis_datum.desc())
            .first()
        )
        if prev is not None and zids:
            for r in (
                db.query(Zaehlerstand)
                .filter(
                    Zaehlerstand.abrechnungsperiode_id == prev.id,
                    Zaehlerstand.zaehler_id.in_(zids),
                    Zaehlerstand.art.in_((ART_PERIODE_START, ART_PERIODE_ENDE)),
                )
                .order_by(Zaehlerstand.id)
                .all()
            ):
                self._prev_reads.setdefault((r.zaehler_id, r.art), r)

    def zaehler(self, wohnung_id: int, typ: str) -> list[Zaehler]:
        return self._zaehler.get((wohnung_id, typ), [])

    def reads(self, zaehler_id: int) -> list[Zaehlerstand]:
        return self._reads.get(zaehler_id, [])

    def prev_read(self, zaehler_id: int, art: str) -> Optional[Zaehlerstand]:
        return self._prev_reads.get((zaehler_id, art))


def _get_prev_daily_rate(
    daten: ZaehlerDaten, zaehler_id: int
) -> Optional[float]:
    """Average daily consumption for this meter from the previous billing period."""
    s = daten.prev_read(zaehler_id, ART_PERIODE_START)
    e = daten.prev_read(zaehler_id, ART_PERIODE_ENDE)
    if not s or not e:
        return None
    verbrauch = max(0.0, e.wert - s.wert)
    days = (_parse(e.ablesedatum) - _parse(s.ablesedatum)).days
    return verbrauch / days if days > 0 else None


def _get_verbrauch_geschaetzt(
    daten: ZaehlerDaten,
    wohnung_id: int,
    zaehler_typ: str,
    periode_von: date,
    periode_bis: date,
) -> tuple[float, bool, Optional[str]]:
    """
    Returns (verbrauch, is_geschaetzt, hinweis).
    Fills date gaps between actual meter readings and period boundaries using
    average daily consumption (from the same period's available data or the
    previous period).  Never invents data when no reference is available.
    """
    zaehler_list = daten.zaehler(wohnung_id, zaehler_typ)

    total = 0.0
    is_geschaetzt = False
    hinweise: list[str] = []

    for z in zaehler_list:
        reads = daten.reads(z.id)
        label = z.geraete_nummer or z.bezeichnung or f"Z{z.id}"
        start_r = next((r for r in reads if r.art == ART_PERIODE_START), None)
        ende_r = next((r for r in reads if r.art == ART_PERIODE_ENDE), None)

        if start_r and ende_r:
            start_d = _parse(start_r.ablesedatum)
            ende_d = _parse(ende_r.ablesedatum)
            base_v = max(0.0, ende_r.wert - start_r.wert)
            avail_days = (ende_d - start_d).days

            if avail_days <= 0:
                total += base_v
                continue

            daily = base_v / avail_days
            verbrauch = base_v
            local_geschaetzt = False

            # Gap before start reading (Ablesung liegt NACH Periodenbeginn -> hochrechnen)
            gap_vor = (start_d - periode_von).days
            if gap_vor > 0:
                prev_rate = _get_prev_daily_rate(daten, z.id)
                rate = prev_rate if prev_rate is not None else daily
                verbrauch += rate * gap_vor
                local_geschaetzt = True
                hinweise.append(
                    f"{label}: Anfang +{gap_vor}d (Schätzung {rate:.3f}/Tag)"
                )

            # Ablesung liegt VOR Periodenbeginn -> anteilig abziehen
            ueberschuss_vor = (periode_von - start_d).days
            if ueberschuss_vor > 0:
                verbrauch -= daily * ueberschuss_vor
                local_geschaetzt = True
                hinweise.append(
                    f"{label}: Anfangsablesung {ueberschuss_vor}d vor Periodenbeginn "
                    f"(Ø {daily:.3f}/Tag) — anteilig abgezogen"
                )

            # Gap after end reading (Ablesung liegt VOR Periodenende -> hochrechnen)
            gap_nach = (periode_bis - ende_d).days
            if gap_nach > 0:
                verbrauch += daily * gap_nach
                local_geschaetzt = True
                hinweise.append(
                    f"{label}: Ende +{gap_nach}d (Ø {daily:.3f}/Tag)"
                )

            # Ablesung liegt NACH Periodenende -> anteilig abziehen
            ueberschuss_nach = (ende_d - periode_bis).days
            if ueberschuss_nach > 0:
                verbrauch -= daily * ueberschuss_nach
                local_geschaetzt = True
                hinweise.append(
                    f"{label}: Endablesung {ueberschuss_nach}d nach Periodenende "
                    f"(Ø {daily:.3f}/Tag) — anteilig abgezogen"
                )

            verbrauch = max(0.0, verbrauch)
            total += verbrauch
            if local_geschaetzt:
                is_geschaetzt = True

        elif start_r and not ende_r:
            # Use last available reading (could be a zwischenablesung) as anchor
            last_r = reads[-1] if reads else start_r
            start_d = _parse(start_r.ablesedatum)
            last_d = _parse(last_r.ablesedatum)
            partial_v = max(0.0, last_r.wert - start_r.wert)
            partial_days = (last_d - start_d).days

            verbrauch = partial_v
            local_geschaetzt = False

            gap_vor = (start_d - periode_von).days
            if gap_vor > 0:
                prev_rate = _get_prev_daily_rate(daten, z.id)
                rate = (
                    prev_rate
                    if prev_rate is not None
                    else (partial_v / partial_days if partial_days > 0 else 0.0)
                )
                verbrauch += rate * gap_vor
                local_geschaetzt = True
                hinweise.append(f"{label}: Anfang +{gap_vor}d (Schätzung)")

            remaining = (periode_bis - last_d).days
            if remaining > 0:
                if partial_days > 0:
                    daily = verbrauch / max(partial_days + gap_vor, 1)
                    verbrauch += daily * remaining
                    local_geschaetzt = True
                    hinweise.append(
                        f"{label}: Ende fehlt +{remaining}d (Ø {daily:.3f}/Tag)"
                    )
                else:
                    prev_rate = _get_prev_daily_rate(daten, z.id)
                    if prev_rate:
                        verbrauch += prev_rate * remaining
                        local_geschaetzt = True
                        hinweise.append(
                            f"{label}: Ende fehlt +{remaining}d (Vorjahr-Schätzung)"
                        )

            total += verbrauch
            if local_geschaetzt:
                is_geschaetzt = True

        elif not start_r and ende_r:
            # Use previous period's end value as estimated start
            prev_rate = _get_prev_daily_rate(daten, z.id)
            ende_d = _parse(ende_r.ablesedatum)
            if prev_rate is not None:
                inferred_days = (ende_d - periode_von).days
                verbrauch = prev_rate * inferred_days
                total += verbrauch
                is_geschaetzt = True
                hinweise.append(
                    f"{label}: Start fehlt, Schätzung {prev_rate:.3f}/Tag × {inferred_days}d"
                )
                # Gap after end
                gap_nach = (periode_bis - ende_d).days
                if gap_nach > 0:
                    total += prev_rate * gap_nach
                    hinweise.append(f"{label}: Ende +{gap_nach}d")
            else:
                hinweise.append(f"{label}: Nur Endablesung, kein Vorjahr — nicht schätzbar")

        else:
            # No readings at all — full estimation from previous period
            prev_rate = _get_prev_daily_rate(daten, z.id)
            if prev_rate is not None:
                period_days = (periode_bis - periode_von).days + 1
                estimated = prev_rate * period_days
                total += estimated
                is_geschaetzt = True
                hinweise.append(
                    f"{label}: Keine Ablesungen, Vorjahr Ø {prev_rate:.3f}/Tag × {period_days}d"
                )
            # else: truly nothing available, contribute 0

    erl = " | ".join(hinweise) if hinweise else None
    return total, is_geschaetzt, erl


def _verbrauch_je_segment(
    segments_der_wohnung: list[Segment],
    gesamt_verbrauch: float,
    overrides: dict[int, float],
) -> dict[int, tuple[float, bool]]:
    """Verteilt den Verbrauch einer Wohnung auf ihre Mieter-Segmente.

    Returns ``{mieter_id: (verbrauch, ist_fixiert)}``.

    Ohne Overrides exakt das bisherige Verhalten: jedes Segment bekommt
    ``gesamt × time_frac``. Mit Overrides bekommen die fixierten Mieter ihren
    vorgegebenen Wert; der verbleibende Verbrauch verteilt sich auf die übrigen
    Segmente im Verhältnis ihrer Zeitanteile.
    """
    if not overrides:
        return {
            seg.mieter.id: (gesamt_verbrauch * seg.time_frac, False)
            for seg in segments_der_wohnung
        }

    ergebnis: dict[int, tuple[float, bool]] = {}
    fixiert_summe = 0.0
    offene: list[Segment] = []
    for seg in segments_der_wohnung:
        if seg.mieter.id in overrides:
            wert = max(0.0, overrides[seg.mieter.id])
            ergebnis[seg.mieter.id] = (wert, True)
            fixiert_summe += wert
        else:
            offene.append(seg)

    rest = max(0.0, gesamt_verbrauch - fixiert_summe)
    offene_frac = sum(s.time_frac for s in offene)
    for seg in offene:
        anteil = (seg.time_frac / offene_frac) if offene_frac > 0 else 0.0
        ergebnis[seg.mieter.id] = (rest * anteil, False)
    return ergebnis


def _build_segments(
    db: Session, wohnungen: list[Wohnung], periode_von: date, periode_bis: date
) -> list[Segment]:
    total_days = _days(periode_von, periode_bis)
    gt_total = _gradtag_sum(periode_von, periode_bis)

    # One bulk query for all Wohnungen instead of one query per Wohnung.
    # Secondary sort key id mirrors SQLite's former rowid tie-break order.
    mieter_by_wohnung: dict[int, list[Mieter]] = {}
    alle_mieter = db.query(Mieter).filter(
        Mieter.wohnung_id.in_([w.id for w in wohnungen]),
        Mieter.einzug_datum <= periode_bis.isoformat(),
        or_(
            Mieter.auszug_datum == None,
            Mieter.auszug_datum >= periode_von.isoformat(),
        ),
    ).order_by(Mieter.einzug_datum, Mieter.id).all()
    for m in alle_mieter:
        mieter_by_wohnung.setdefault(m.wohnung_id, []).append(m)

    segs: list[Segment] = []
    for w in wohnungen:
        for m in mieter_by_wohnung.get(w.id, []):
            m_von = max(_parse(m.einzug_datum), periode_von)
            m_bis = min(
                _parse(m.auszug_datum) if m.auszug_datum else periode_bis,
                periode_bis,
            )
            if m_von > m_bis:
                continue
            d = _days(m_von, m_bis)
            gt_seg = _gradtag_sum(m_von, m_bis)
            segs.append(
                Segment(
                    mieter=m,
                    wohnung=w,
                    von=m_von,
                    bis=m_bis,
                    days=d,
                    time_frac=d / total_days if total_days > 0 else 0.0,
                    gradtag_frac=gt_seg / gt_total if gt_total > 0 else 0.0,
                    is_leerstand=bool(m.ist_leerstand),
                )
            )
    return segs


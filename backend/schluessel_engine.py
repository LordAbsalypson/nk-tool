"""Direkt-Preise-Modus: Nebenkosten aus konfigurierbaren Kostenart-Kacheln statt
aus Rechnungen berechnen.

Kostenarten (``DirektKostenart``) sind global (nicht liegenschaftsgebunden) —
die eigentlichen €-Sätze (``DirektKostenartWert``) sind pro Periode gespeichert
und werden wie zuvor automatisch auf alle Häuser mit demselben Abrechnungs-
zeitraum gespiegelt. Manuelle Korrekturen im "Ausprobieren"-Modus laufen über
``DirektUebersteuerung`` (Personen/Fläche/Endbetrag) bzw. die bereits
bestehenden ``MieterVerbrauch``/``WohnungVerbrauch``-Tabellen (Verbrauch).

Rein additiv: nutzt für Verbrauch und Miettage dieselben, bereits geprüften
Bausteine aus ``engine.py`` (Proration bei Ablesungen außerhalb der Periode,
Mieterwechsel-Tagessatz bzw. manuelle Verbrauchsvorgabe).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from domain import ART_PERIODE_ENDE, ART_PERIODE_START, TYP_KALTWASSER_M3, TYP_WAERME_KWH, TYP_WARMWASSER_M3
from engine import (
    Segment,
    ZaehlerDaten,
    _SCHAETZUNG_TYPEN,
    _build_segments,
    _get_verbrauch_geschaetzt,
    _parse,
    _verbrauch_je_segment,
)
from models import (
    Abrechnungsperiode,
    DirektKostenart,
    DirektKostenartWert,
    DirektUebersteuerung,
    Liegenschaft,
    Mieter,
    MieterVerbrauch,
    Vorauszahlung,
    Wohnung,
    WohnungVerbrauch,
    Zaehler,
    Zaehlerstand,
)

# Verbrauchsbasierte Verteilungsbasen: NICHT tagesanteilig — exakt nach Zählerstand.
_VERBRAUCH_BASEN: dict[str, str] = {
    "kwh_heizung": TYP_WAERME_KWH,
    "m3_warmwasser": TYP_WARMWASSER_M3,
    "m3_kaltwasser": TYP_KALTWASSER_M3,
    # "m3_wasser_gesamt" ist ein Sonderfall (Kalt+Warm addiert), siehe unten.
}

BASIS_LABELS: dict[str, str] = {
    "m2": "€/m²",
    "person": "€/Person",
    "einheit": "€/Wohnung",
    "kwh_heizung": "€/kWh",
    "m3_warmwasser": "€/m³",
    "m3_kaltwasser": "€/m³",
    "m3_wasser_gesamt": "€/m³",
}


@dataclass
class SchluesselZeile:
    schluessel: str  # Kostenart-Name (Grund-/Verbrauchszeilen bekommen einen Zusatz)
    kostenart: str
    grundlage: str
    betrag: float
    kostenart_id: "int | None" = None
    manuell_angepasst: bool = False
    # Nur bei einzeln editierbaren Verbrauchszeilen gesetzt (waerme_kwh/warmwasser_m3/
    # kaltwasser_m3) — nicht bei der abgeleiteten "Wasser gesamt"-Zeile (2 Zähler kombiniert).
    zaehler_typ: "str | None" = None
    einheiten: "float | None" = None


@dataclass
class SchluesselMieterErgebnis:
    mieter_id: int
    anzeigename: str
    wohnung_id: int
    wohnung_bezeichnung: str
    miet_von: str
    miet_bis: str
    miettage: int
    periode_tage: int
    zeilen: list = field(default_factory=list)
    fehlende_daten: list = field(default_factory=list)
    warnungen: list = field(default_factory=list)
    summe: float = 0.0
    vorauszahlung_ist: float = 0.0
    saldo: float = 0.0
    berechenbar: bool = True
    personen: int = 0


def _r(v: float) -> float:
    return round(v, 2)


def _hat_vollstaendige_ablesung(daten: ZaehlerDaten, wohnung_id: int, typ: str) -> bool:
    """Mind. ein Zähler dieses Typs mit sowohl Anfangs- als auch Endablesung."""
    for z in daten.zaehler(wohnung_id, typ):
        reads = daten.reads(z.id)
        hat_start = any(r.art == ART_PERIODE_START for r in reads)
        hat_ende = any(r.art == ART_PERIODE_ENDE for r in reads)
        if hat_start and hat_ende:
            return True
    return False


def _lade_kostenarten(db: Session, liegenschaft_id: int) -> list:
    alle = (
        db.query(DirektKostenart)
        .filter(DirektKostenart.aktiv == True)  # noqa: E712
        .order_by(DirektKostenart.sortierung, DirektKostenart.id)
        .all()
    )
    return [k for k in alle if k.nur_liegenschaft_id in (None, liegenschaft_id)]


def berechne_schluessel_periode(db: Session, periode_id: int) -> list:
    """Berechnet den Direkt-Preise-Modus für alle Mieter einer Periode."""
    periode = db.get(Abrechnungsperiode, periode_id)
    if not periode:
        raise ValueError(f"Periode {periode_id} nicht gefunden")
    lieg = db.get(Liegenschaft, periode.liegenschaft_id)
    if not lieg:
        raise ValueError(f"Liegenschaft {periode.liegenschaft_id} nicht gefunden")

    periode_von = _parse(periode.von_datum)
    periode_bis = _parse(periode.bis_datum)
    periode_tage = (periode_bis - periode_von).days + 1

    kostenarten = _lade_kostenarten(db, lieg.id)
    werte: dict[int, DirektKostenartWert] = {
        w.kostenart_id: w
        for w in db.query(DirektKostenartWert)
        .filter(DirektKostenartWert.abrechnungsperiode_id == periode_id)
        .all()
    }

    wohnungen: list[Wohnung] = (
        db.query(Wohnung)
        .filter(Wohnung.liegenschaft_id == lieg.id, Wohnung.aktiv == True)  # noqa: E712
        .order_by(Wohnung.sortierung, Wohnung.id)
        .all()
    )
    segments: list[Segment] = _build_segments(db, wohnungen, periode_von, periode_bis)
    daten = ZaehlerDaten(db, lieg.id, periode, [w.id for w in wohnungen])

    wohnungs_verbrauch: dict[int, dict[str, float]] = {}
    hat_ablesung: dict[int, dict[str, bool]] = {}
    for w in wohnungen:
        wv: dict[str, float] = {}
        ha: dict[str, bool] = {}
        for typ in _SCHAETZUNG_TYPEN:
            v, _is_g, _hint = _get_verbrauch_geschaetzt(daten, w.id, typ, periode_von, periode_bis)
            wv[typ] = v
            ha[typ] = _hat_vollstaendige_ablesung(daten, w.id, typ)
        wohnungs_verbrauch[w.id] = wv
        hat_ablesung[w.id] = ha

    for wov in (
        db.query(WohnungVerbrauch)
        .filter(WohnungVerbrauch.abrechnungsperiode_id == periode_id)
        .all()
    ):
        if wov.wohnung_id in wohnungs_verbrauch and wov.zaehler_typ in wohnungs_verbrauch[wov.wohnung_id]:
            wohnungs_verbrauch[wov.wohnung_id][wov.zaehler_typ] = wov.wert
            hat_ablesung[wov.wohnung_id][wov.zaehler_typ] = True

    verbrauch_overrides: dict[tuple, dict[int, float]] = {}
    # Ob "(geschätzt)" auf der PDF-Abrechnung stehen soll — separat vom Wert selbst,
    # da _verbrauch_je_segment (gemeinsam mit engine.py) nur (wert, fixiert) kennt.
    verbrauch_overrides_anzeigen: dict[tuple, dict[int, bool]] = {}
    for ov in (
        db.query(MieterVerbrauch)
        .filter(MieterVerbrauch.abrechnungsperiode_id == periode_id)
        .all()
    ):
        mi = db.get(Mieter, ov.mieter_id)
        if mi is None:
            continue
        verbrauch_overrides.setdefault((mi.wohnung_id, ov.zaehler_typ), {})[ov.mieter_id] = ov.wert
        verbrauch_overrides_anzeigen.setdefault((mi.wohnung_id, ov.zaehler_typ), {})[
            ov.mieter_id
        ] = ov.als_schaetzung_anzeigen

    verteilt_je_wohnung_typ: dict[tuple, dict[int, tuple]] = {}
    for w in wohnungen:
        w_segs = [s for s in segments if s.wohnung.id == w.id and not s.is_leerstand]
        if not w_segs:
            continue
        for typ in (TYP_WAERME_KWH, TYP_WARMWASSER_M3, TYP_KALTWASSER_M3):
            raw = wohnungs_verbrauch[w.id][typ]
            overrides_fuer_typ = verbrauch_overrides.get((w.id, typ), {})
            verteilt_je_wohnung_typ[(w.id, typ)] = _verbrauch_je_segment(w_segs, raw, overrides_fuer_typ)

    # DirektUebersteuerung — Ausprobieren-Modus-Korrekturen dieser Periode
    flaeche_override: dict[int, float] = {}
    personen_override: dict[int, float] = {}
    betrag_override: dict[tuple, tuple] = {}
    for u in (
        db.query(DirektUebersteuerung)
        .filter(DirektUebersteuerung.abrechnungsperiode_id == periode_id)
        .all()
    ):
        if u.feld == "flaeche_m2" and u.wohnung_id is not None:
            flaeche_override[u.wohnung_id] = u.wert
        elif u.feld == "personen" and u.mieter_id is not None:
            personen_override[u.mieter_id] = u.wert
        elif u.feld == "betrag" and u.mieter_id is not None and u.kostenart_id is not None:
            betrag_override[(u.mieter_id, u.kostenart_id)] = (u.wert, u.begruendung)

    heizkostenv_warnungen: list[str] = []
    for k in kostenarten:
        if k.hat_grundkosten_split:
            wrow = werte.get(k.id)
            hat_grund = wrow is not None and wrow.preis_grund_pro_m2 is not None
            hat_verbrauch = wrow is not None and wrow.preis_verbrauch_pro_einheit is not None
            if hat_verbrauch and not hat_grund:
                heizkostenv_warnungen.append(
                    f"{k.name}: nur Verbrauchspreis gesetzt, kein Grundkosten-Satz — laut "
                    f"Heizkostenverordnung sind mind. 30% Grundkosten Pflicht (0/100-Aufteilung "
                    f"unzulässig, Mieter dürfen sonst 15% der Heizkosten kürzen)."
                )

    ergebnisse: list[SchluesselMieterErgebnis] = []
    for seg in segments:
        if seg.is_leerstand:
            continue
        m, w = seg.mieter, seg.wohnung
        tf = seg.time_frac

        vz_ist = sum(
            v.betrag_ist
            for v in db.query(Vorauszahlung).filter(
                Vorauszahlung.mieter_id == m.id,
                Vorauszahlung.abrechnungsperiode_id == periode_id,
            )
        )

        erg = SchluesselMieterErgebnis(
            mieter_id=m.id,
            anzeigename=m.anzeigename,
            wohnung_id=w.id,
            wohnung_bezeichnung=w.bezeichnung,
            miet_von=seg.von.isoformat(),
            miet_bis=seg.bis.isoformat(),
            miettage=seg.days,
            periode_tage=periode_tage,
            vorauszahlung_ist=_r(vz_ist),
            warnungen=list(heizkostenv_warnungen),
            personen=m.anzahl_personen,
        )

        if not kostenarten:
            erg.fehlende_daten.append("Keine Kostenarten angelegt.")
            erg.berechenbar = False
            ergebnisse.append(erg)
            continue

        effektive_m2 = flaeche_override.get(w.id, w.flaeche_m2)
        effektive_personen = personen_override.get(m.id, m.anzahl_personen)

        def _zeile(
            basis: str,
            preis: "float | None",
            schluessel_suffix: str,
            label_suffix: str,
            kostenart_name: str,
            kostenart_id_: int,
        ) -> "SchluesselZeile | None":
            zaehler_typ_out: str | None = None
            einheiten_out: float | None = None
            if preis is None:
                return None
            if basis == "m2":
                betrag = preis * effektive_m2 * tf
                hinweis = " (Fläche angepasst)" if w.id in flaeche_override else ""
                grundlage = f"{effektive_m2:.1f} m² × {preis:.5f} €/m² × {seg.days}/{periode_tage} Tage{hinweis}"
            elif basis == "person":
                betrag = preis * effektive_personen * tf
                hinweis = " (Personen angepasst)" if m.id in personen_override else ""
                grundlage = f"{effektive_personen:.0f} Pers. × {preis:.2f} €/Person × {seg.days}/{periode_tage} Tage{hinweis}"
            elif basis == "einheit":
                betrag = preis * tf
                grundlage = f"1 Einheit × {preis:.2f} € × {seg.days}/{periode_tage} Tage"
            elif basis == "m3_wasser_gesamt":
                if not hat_ablesung[w.id].get(TYP_KALTWASSER_M3, False):
                    erg.fehlende_daten.append(f"{kostenart_name}: keine Kaltwasser-Ablesung für {w.bezeichnung}")
                    return None
                kw, _f = verteilt_je_wohnung_typ.get((w.id, TYP_KALTWASSER_M3), {}).get(m.id, (0.0, False))
                ww, _f2 = verteilt_je_wohnung_typ.get((w.id, TYP_WARMWASSER_M3), {}).get(m.id, (0.0, False))
                gesamt_m3 = kw + ww
                betrag = preis * gesamt_m3
                grundlage = f"{gesamt_m3:.3f} m³ (Kalt {kw:.3f} + Warm {ww:.3f}) × {preis:.2f} €/m³"
            elif basis in _VERBRAUCH_BASEN:
                typ = _VERBRAUCH_BASEN[basis]
                if not hat_ablesung[w.id].get(typ, False):
                    erg.fehlende_daten.append(f"{kostenart_name}: keine Zählerablesung für {w.bezeichnung}")
                    return None
                einheiten, fixiert = verteilt_je_wohnung_typ.get((w.id, typ), {}).get(m.id, (0.0, False))
                betrag = preis * einheiten
                einh = BASIS_LABELS[basis].split("/")[-1]
                anzeigen = verbrauch_overrides_anzeigen.get((w.id, typ), {}).get(m.id, False)
                if fixiert:
                    grundlage = f"{einheiten:.3f} {einh}" + (" (geschätzt)" if anzeigen else "")
                else:
                    grundlage = f"{einheiten:.3f} {einh} × {preis:.5f} {BASIS_LABELS[basis]}"
                zaehler_typ_out = typ
                einheiten_out = einheiten
            else:
                return None
            return SchluesselZeile(
                schluessel=f"{kostenart_name}{schluessel_suffix}",
                kostenart=f"{kostenart_name}{label_suffix}",
                grundlage=grundlage,
                betrag=betrag,
                kostenart_id=kostenart_id_,
                zaehler_typ=zaehler_typ_out,
                einheiten=einheiten_out,
            )

        for k in kostenarten:
            wert_row = werte.get(k.id)
            if wert_row is None:
                continue

            if k.hat_grundkosten_split:
                grund = _zeile("m2", wert_row.preis_grund_pro_m2, ":grund", " Grundkosten", k.name, k.id)
                verbrauch = _zeile(
                    k.verteilungsbasis, wert_row.preis_verbrauch_pro_einheit, ":verbrauch", " Verbrauch", k.name, k.id
                )
                if grund:
                    erg.zeilen.append(grund)
                if verbrauch:
                    erg.zeilen.append(verbrauch)
            else:
                zeile = _zeile(k.verteilungsbasis, wert_row.preis_pro_einheit, "", "", k.name, k.id)
                if zeile:
                    erg.zeilen.append(zeile)

        # Betrags-Übersteuerung (Ausprobieren-Modus): ersetzt den Endbetrag je Kostenart
        for zeile in erg.zeilen:
            if zeile.kostenart_id is None:
                continue
            override = betrag_override.get((m.id, zeile.kostenart_id))
            if override is not None:
                wert, begruendung = override
                zeile.betrag = wert
                zeile.manuell_angepasst = True
                zeile.grundlage = "manuell angepasst" + (f" ({begruendung})" if begruendung else "")

        erg.summe = _r(sum(z.betrag for z in erg.zeilen))
        erg.saldo = _r(erg.vorauszahlung_ist - erg.summe)
        if erg.fehlende_daten:
            erg.berechenbar = False
        ergebnisse.append(erg)

    return ergebnisse


def berechne_schluessel_mieter(
    db: Session, periode_id: int, mieter_id: int
) -> "SchluesselMieterErgebnis | None":
    for erg in berechne_schluessel_periode(db, periode_id):
        if erg.mieter_id == mieter_id:
            return erg
    return None


def gesamteinheiten_vorschlag(db: Session, periode_id: int) -> dict:
    """Vorschlagswerte je Verteilungsbasis (m², Personen, Verbrauch) — aus
    Stammdaten und Zählerständen abgeleitet, im Split-Rechner frei überschreibbar.
    """
    periode = db.get(Abrechnungsperiode, periode_id)
    if not periode:
        raise ValueError(f"Periode {periode_id} nicht gefunden")
    lieg = db.get(Liegenschaft, periode.liegenschaft_id)
    if not lieg:
        raise ValueError(f"Liegenschaft {periode.liegenschaft_id} nicht gefunden")

    periode_von = _parse(periode.von_datum)
    periode_bis = _parse(periode.bis_datum)

    wohnungen: list[Wohnung] = (
        db.query(Wohnung)
        .filter(Wohnung.liegenschaft_id == lieg.id, Wohnung.aktiv == True)  # noqa: E712
        .all()
    )
    segments = _build_segments(db, wohnungen, periode_von, periode_bis)
    daten = ZaehlerDaten(db, lieg.id, periode, [w.id for w in wohnungen])

    gesamt_m2 = sum(w.flaeche_m2 for w in wohnungen)
    anzahl_wohnungen = len(wohnungen)

    gesamt_personen = 0
    for w in wohnungen:
        w_segs = [s for s in segments if s.wohnung.id == w.id and not s.is_leerstand]
        if w_segs:
            dominant = max(w_segs, key=lambda s: s.time_frac)
            gesamt_personen += dominant.mieter.anzahl_personen

    gesamt_waerme = gesamt_ww = gesamt_kw = 0.0
    for w in wohnungen:
        v, _g, _h = _get_verbrauch_geschaetzt(daten, w.id, TYP_WAERME_KWH, periode_von, periode_bis)
        gesamt_waerme += v
        v, _g, _h = _get_verbrauch_geschaetzt(daten, w.id, TYP_WARMWASSER_M3, periode_von, periode_bis)
        gesamt_ww += v
        v, _g, _h = _get_verbrauch_geschaetzt(daten, w.id, TYP_KALTWASSER_M3, periode_von, periode_bis)
        gesamt_kw += v

    return {
        "m2": round(gesamt_m2, 2),
        "person": float(gesamt_personen),
        "einheit": float(anzahl_wohnungen),
        "kwh_heizung": round(gesamt_waerme, 1),
        "m3_warmwasser": round(gesamt_ww, 3),
        "m3_kaltwasser": round(gesamt_kw, 3),
        "m3_wasser_gesamt": round(gesamt_kw + gesamt_ww, 3),
    }


_ZAEHLER_TYP_LABEL: dict[str, str] = {
    "waerme_kwh": "Wärme",
    "hkv_einheiten": "Wärme (HKV)",
    "warmwasser_m3": "Warmwasser",
    "kaltwasser_m3": "Kaltwasser",
    "strom_kwh": "Strom",
}
_ZAEHLER_TYP_EINHEIT: dict[str, str] = {
    "waerme_kwh": "kWh",
    "hkv_einheiten": "Einh.",
    "warmwasser_m3": "m³",
    "kaltwasser_m3": "m³",
    "strom_kwh": "kWh",
}


def sammelabrechnung_daten(db: Session, periode_id: int) -> dict:
    """Aggregierte Jahresübersicht für eine ganze Liegenschaft — eine Zeile je
    Wohnung (nicht je Mieter) für die Sammelabrechnung/Legende-PDF. Rein
    lesend, rechnet nichts an der normalen Abrechnung."""
    periode = db.get(Abrechnungsperiode, periode_id)
    if not periode:
        raise ValueError(f"Periode {periode_id} nicht gefunden")
    lieg = db.get(Liegenschaft, periode.liegenschaft_id)
    if not lieg:
        raise ValueError(f"Liegenschaft {periode.liegenschaft_id} nicht gefunden")

    # Legende: die €-Sätze je Kostenart dieser Periode.
    kostenarten = _lade_kostenarten(db, lieg.id)
    werte = {
        w.kostenart_id: w
        for w in db.query(DirektKostenartWert)
        .filter(DirektKostenartWert.abrechnungsperiode_id == periode_id)
        .all()
    }
    legende: list[str] = []
    for k in kostenarten:
        wrow = werte.get(k.id)
        if wrow is None:
            continue
        if k.hat_grundkosten_split:
            teile = []
            if wrow.preis_grund_pro_m2 is not None:
                teile.append(f"Grund {wrow.preis_grund_pro_m2:.5f} €/m²")
            if wrow.preis_verbrauch_pro_einheit is not None:
                einh = BASIS_LABELS.get(k.verteilungsbasis, "")
                teile.append(f"Verbrauch {wrow.preis_verbrauch_pro_einheit:.5f} {einh}")
            if teile:
                legende.append(f"{k.name}: " + " · ".join(teile))
        elif wrow.preis_pro_einheit is not None:
            einh = BASIS_LABELS.get(k.verteilungsbasis, "")
            legende.append(f"{k.name}: {wrow.preis_pro_einheit:.5f} {einh}")

    # Pro Wohnung: Ergebnisse aus der normalen Berechnung gruppieren.
    ergebnisse = berechne_schluessel_periode(db, periode_id)
    je_wohnung: dict[int, list] = {}
    for e in ergebnisse:
        je_wohnung.setdefault(e.wohnung_id, []).append(e)

    wohnungen: list[Wohnung] = (
        db.query(Wohnung)
        .filter(Wohnung.liegenschaft_id == lieg.id, Wohnung.aktiv == True)  # noqa: E712
        .order_by(Wohnung.sortierung, Wohnung.id)
        .all()
    )

    zeilen = []
    for w in wohnungen:
        segs = je_wohnung.get(w.id, [])
        segs_berechenbar = [s for s in segs if s.berechenbar]
        if not segs:
            continue
        namen = list(dict.fromkeys(s.anzeigename for s in sorted(segs, key=lambda s: s.miet_von)))
        mieter_name = " → ".join(namen)
        vz_jahr = sum(s.vorauszahlung_ist for s in segs)
        mieter_ids = [s.mieter_id for s in segs]
        anzahl_monate = (
            db.query(Vorauszahlung.monat, Vorauszahlung.jahr)
            .filter(
                Vorauszahlung.abrechnungsperiode_id == periode_id,
                Vorauszahlung.mieter_id.in_(mieter_ids),
            )
            .distinct()
            .count()
        )
        vz_pro_monat = vz_jahr / anzahl_monate if anzahl_monate > 0 else 0.0
        summe = sum(s.summe for s in segs_berechenbar)
        saldo = sum(s.saldo for s in segs_berechenbar)
        vollstaendig = len(segs_berechenbar) == len(segs)

        # Bei Zählerwechsel (Ersatzzähler) können mehrere Zähler denselben Typ
        # haben — nur Ablesungen INNERHALB der Periode zulassen (ein Datensatz
        # außerhalb wäre z. B. eine spätere Korrektur/nächste Periode) und je
        # Typ die zeitlich späteste davon nehmen, nicht die erstbeste.
        zaehlerstaende: dict[str, float] = {}
        zaehlerstaende_datum: dict[str, str] = {}
        for z in db.query(Zaehler).filter(Zaehler.wohnung_id == w.id, Zaehler.aktiv == True).all():  # noqa: E712
            stand = (
                db.query(Zaehlerstand)
                .filter(
                    Zaehlerstand.zaehler_id == z.id,
                    Zaehlerstand.abrechnungsperiode_id == periode_id,
                    Zaehlerstand.art == ART_PERIODE_ENDE,
                    Zaehlerstand.ablesedatum <= periode.bis_datum,
                )
                .order_by(Zaehlerstand.ablesedatum.desc())
                .first()
            )
            if stand is not None and stand.ablesedatum > zaehlerstaende_datum.get(z.typ, ""):
                zaehlerstaende[z.typ] = stand.wert
                zaehlerstaende_datum[z.typ] = stand.ablesedatum

        zeilen.append(
            {
                "wohnung_bezeichnung": w.bezeichnung,
                "mieter_name": mieter_name,
                "flaeche_m2": w.flaeche_m2,
                "zaehlerstaende": zaehlerstaende,
                "vorauszahlung_jahr": round(vz_jahr, 2),
                "vorauszahlung_pro_monat": round(vz_pro_monat, 2),
                "summe": round(summe, 2),
                "saldo": round(saldo, 2),
                "vollstaendig": vollstaendig,
            }
        )

    return {
        "liegenschaft_name": lieg.name,
        "liegenschaft_adresse": f"{lieg.adresse}, {lieg.plz} {lieg.ort}",
        "periode_bezeichnung": periode.bezeichnung,
        "zeitraum_von": periode.von_datum,
        "zeitraum_bis": periode.bis_datum,
        "legende": legende,
        "zeilen": zeilen,
        "zaehler_typ_label": _ZAEHLER_TYP_LABEL,
        "zaehler_typ_einheit": _ZAEHLER_TYP_EINHEIT,
    }

"""Regressionstests für die aktive Berechnungs-Engine (Direkt-Preise-Modus,
``schluessel_engine.py``) — die eigentliche Geldberechnung der Mieter-Abrechnung.

Bis zu dieser Datei gab es dafür 0 automatisierte Tests (siehe Potenzialanalyse
2026-09-21, Abschnitt "IT-Architektur — Kritische Lücken"), obwohl `GOAL.md`
selbst ein striktes 0,00-€-Abweichungs-Gate fordert.

Bewusst NICHT gegen die reale ``backup_safe/``-Datensicherung getestet (siehe
``fixtures.py`` Docstring) — ausschließlich synthetische, frei erfundene
Objekte, komplett unabhängig von echten Mieterdaten und CI-fähig ohne lokales
Backup-Verzeichnis.
"""

from __future__ import annotations

from datetime import date

import pytest

from domain import ART_PERIODE_ENDE, ART_PERIODE_START, TYP_HKV_EINHEITEN, TYP_WAERME_KWH
from schluessel_engine import berechne_schluessel_periode

from fixtures import (
    in_memory_session,
    make_direkt_kostenart,
    make_direkt_kostenart_wert,
    make_liegenschaft,
    make_mieter,
    make_periode,
    make_wohnung,
    make_zaehler,
    make_zaehlerstand,
)


@pytest.fixture()
def db():
    session = in_memory_session()
    yield session
    session.close()


def test_einfache_vollperiode_ein_mieter(db):
    """Basisfall: ein Mieter die volle Periode — Betrag = Satz × Fläche, kein
    Proration-Faktor (time_frac muss exakt 1.0 sein)."""
    lieg = make_liegenschaft(db)
    w = make_wohnung(db, lieg, flaeche_m2=50.0)
    make_mieter(db, w, einzug_datum="2025-06-01", auszug_datum=None)
    periode = make_periode(db, lieg, von_datum="2025-06-01", bis_datum="2026-05-31")
    k = make_direkt_kostenart(db, name="Grundsteuer", verteilungsbasis="m2")
    make_direkt_kostenart_wert(db, periode, k, preis_pro_einheit=2.0)

    [erg] = berechne_schluessel_periode(db, periode.id)

    assert erg.berechenbar is True
    assert erg.summe == pytest.approx(100.0, abs=0.01)  # 2.0 €/m² × 50 m²


def test_unterjaehriger_mieterwechsel_proration_summiert_sich(db):
    """Zwei Mieter teilen sich eine Wohnung nahtlos über die volle Periode —
    die Summe ihrer taggenauen Anteile muss dem vollen Kostenbetrag der
    Wohnung entsprechen (bis auf Centrundung je Segment)."""
    lieg = make_liegenschaft(db)
    w = make_wohnung(db, lieg)
    make_mieter(db, w, anzeigename="Mieter A", einzug_datum="2025-06-01", auszug_datum="2025-11-30")
    make_mieter(db, w, anzeigename="Mieter B", einzug_datum="2025-12-01", auszug_datum=None)
    periode = make_periode(db, lieg, von_datum="2025-06-01", bis_datum="2026-05-31")
    k = make_direkt_kostenart(db, name="Hauswart", verteilungsbasis="einheit")
    make_direkt_kostenart_wert(db, periode, k, preis_pro_einheit=365.0)

    ergebnisse = berechne_schluessel_periode(db, periode.id)

    assert len(ergebnisse) == 2
    assert sum(e.summe for e in ergebnisse) == pytest.approx(365.0, abs=0.02)
    # Kein Mieter darf 0 Tage oder mehr als die volle Periode berechnet bekommen.
    assert all(0 < e.miettage <= 365 for e in ergebnisse)


def test_schaltjahr_taggenaue_berechnung(db):
    """2028 ist ein Schaltjahr (366 Tage) — die Tageszählung darf den 29.02.
    weder verlieren noch doppelt zählen."""
    lieg = make_liegenschaft(db)
    w = make_wohnung(db, lieg)
    make_mieter(db, w, einzug_datum="2028-01-01", auszug_datum=None)
    periode = make_periode(db, lieg, von_datum="2028-01-01", bis_datum="2028-12-31")
    k = make_direkt_kostenart(db, name="Hauswart", verteilungsbasis="einheit")
    make_direkt_kostenart_wert(db, periode, k, preis_pro_einheit=366.0)

    [erg] = berechne_schluessel_periode(db, periode.id)

    assert (date(2028, 12, 31) - date(2028, 1, 1)).days + 1 == 366
    assert erg.miettage == 366
    assert erg.summe == pytest.approx(366.0, abs=0.01)


@pytest.mark.xfail(
    strict=True,
    reason=(
        "Bekannte Lücke (siehe CLAUDE.md 'Known issues'): _VERBRAUCH_BASEN in "
        "schluessel_engine.py mappt 'kwh_heizung' ausschliesslich auf "
        "TYP_WAERME_KWH, es gibt keinen Fallback auf TYP_HKV_EINHEITEN. Eine "
        "Wohnung mit reinem HKV-Zaehler (keine waerme_kwh-Ablesung) bekommt "
        "aktuell 0 EUR Heiz-Verbrauchsanteil statt einer HKV-basierten "
        "Aufteilung. strict=True: sobald der Fallback implementiert wird, "
        "muss dieser Test aktiv angepasst werden (XPASS schlaegt dann fehl)."
    ),
)
def test_hkv_fallback_fehlt_noch(db):
    lieg = make_liegenschaft(db)
    w = make_wohnung(db, lieg)
    make_mieter(db, w, einzug_datum="2025-06-01", auszug_datum=None)
    periode = make_periode(db, lieg, von_datum="2025-06-01", bis_datum="2026-05-31")
    z = make_zaehler(db, w, TYP_HKV_EINHEITEN)
    make_zaehlerstand(db, z, periode, ablesedatum="2025-06-01", wert=1000.0, art=ART_PERIODE_START)
    make_zaehlerstand(db, z, periode, ablesedatum="2026-05-31", wert=1500.0, art=ART_PERIODE_ENDE)
    k = make_direkt_kostenart(db, name="Heizkosten", verteilungsbasis="kwh_heizung")
    make_direkt_kostenart_wert(db, periode, k, preis_pro_einheit=0.10)

    [erg] = berechne_schluessel_periode(db, periode.id)

    # Erwartetes (noch nicht implementiertes) Verhalten: 500 HKV-Einheiten
    # werden ueber den Verbrauchsschluessel verteilt und ergeben > 0 EUR.
    assert erg.berechenbar is True
    assert erg.summe > 0


def test_leerstand_kosten_gehen_nicht_verloren_oder_doppelt(db):
    """Wohnung: Mieter A → Leerstand → Mieter B, nahtlos aneinandergereiht.
    Leerstand-Segmente werden korrekt uebersprungen (Vermieter traegt die
    Leerstandskosten, nicht die Mieter) — aber die verbleibenden Mieter
    duerfen dafuer nicht MEHR als ihren eigenen Zeitanteil berechnet
    bekommen (kein 'Rest wird auf die anderen verteilt')."""
    lieg = make_liegenschaft(db)
    w = make_wohnung(db, lieg)
    make_mieter(db, w, anzeigename="Mieter A", einzug_datum="2025-06-01", auszug_datum="2025-09-30")
    make_mieter(
        db, w, anzeigename="Leerstand", einzug_datum="2025-10-01", auszug_datum="2025-11-30",
        ist_leerstand=True,
    )
    make_mieter(db, w, anzeigename="Mieter B", einzug_datum="2025-12-01", auszug_datum=None)
    periode = make_periode(db, lieg, von_datum="2025-06-01", bis_datum="2026-05-31")
    k = make_direkt_kostenart(db, name="Hauswart", verteilungsbasis="einheit")
    make_direkt_kostenart_wert(db, periode, k, preis_pro_einheit=365.0)

    ergebnisse = berechne_schluessel_periode(db, periode.id)

    # Leerstand-Segment taucht in den Mieter-Ergebnissen gar nicht auf.
    assert all(e.anzeigename != "Leerstand" for e in ergebnisse)
    assert len(ergebnisse) == 2
    tage_a, tage_b = (e.miettage for e in ergebnisse)
    gesamt_belegte_tage = tage_a + tage_b
    # Deutlich weniger als die vollen 365 Tage, da ~61 Tage Leerstand dazwischen liegen.
    assert gesamt_belegte_tage < 365
    erwartete_summe = 365.0 * gesamt_belegte_tage / 365.0
    assert sum(e.summe for e in ergebnisse) == pytest.approx(erwartete_summe, abs=0.02)


def test_grundkosten_verbrauch_split_heizung(db):
    """HKVO-Split (Grundkosten m² + Verbrauch kWh) — zwei separate Zeilen,
    deren Summe der Gesamtberechnung entsprechen muss."""
    lieg = make_liegenschaft(db)
    w = make_wohnung(db, lieg, flaeche_m2=50.0)
    make_mieter(db, w, einzug_datum="2025-06-01", auszug_datum=None)
    periode = make_periode(db, lieg, von_datum="2025-06-01", bis_datum="2026-05-31")
    z = make_zaehler(db, w, TYP_WAERME_KWH)
    make_zaehlerstand(db, z, periode, ablesedatum="2025-06-01", wert=1000.0, art=ART_PERIODE_START)
    make_zaehlerstand(db, z, periode, ablesedatum="2026-05-31", wert=3000.0, art=ART_PERIODE_ENDE)
    k = make_direkt_kostenart(
        db, name="Heizkosten", verteilungsbasis="kwh_heizung", hat_grundkosten_split=True
    )
    make_direkt_kostenart_wert(
        db, periode, k, preis_grund_pro_m2=1.5, preis_verbrauch_pro_einheit=0.10
    )

    [erg] = berechne_schluessel_periode(db, periode.id)

    assert len(erg.zeilen) == 2
    grund = next(z for z in erg.zeilen if "Grundkosten" in z.kostenart)
    verbrauch = next(z for z in erg.zeilen if "Verbrauch" in z.kostenart)
    assert grund.betrag == pytest.approx(1.5 * 50.0, abs=0.01)  # 75.0
    assert verbrauch.betrag == pytest.approx(0.10 * 2000.0, abs=0.01)  # 200.0 (2000 kWh Verbrauch)
    assert erg.summe == pytest.approx(275.0, abs=0.01)


def test_hkvo_grundkosten_pflicht_warnung(db):
    """Wird nur ein Verbrauchspreis gesetzt (0/100-Aufteilung), muss die
    Engine warnen — HKVO schreibt mindestens 30% Grundkosten vor."""
    lieg = make_liegenschaft(db)
    w = make_wohnung(db, lieg)
    make_mieter(db, w, einzug_datum="2025-06-01", auszug_datum=None)
    periode = make_periode(db, lieg, von_datum="2025-06-01", bis_datum="2026-05-31")
    z = make_zaehler(db, w, TYP_WAERME_KWH)
    make_zaehlerstand(db, z, periode, ablesedatum="2025-06-01", wert=0.0, art=ART_PERIODE_START)
    make_zaehlerstand(db, z, periode, ablesedatum="2026-05-31", wert=1000.0, art=ART_PERIODE_ENDE)
    k = make_direkt_kostenart(
        db, name="Heizkosten", verteilungsbasis="kwh_heizung", hat_grundkosten_split=True
    )
    make_direkt_kostenart_wert(db, periode, k, preis_verbrauch_pro_einheit=0.10)

    [erg] = berechne_schluessel_periode(db, periode.id)

    assert any("Grundkosten" in w for w in erg.warnungen)

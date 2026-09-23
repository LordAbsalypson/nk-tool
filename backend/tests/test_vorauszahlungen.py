"""Regressionstest für den "Gesamtbetrag"-Konfliktfall (siehe
routers/vorauszahlungen.py::set_vorauszahlung_gesamt).

Vorher: ein neuer Gesamtbetrag, der kleiner als die Summe der bereits einzeln
fixierten Monate war, wurde mit einem harten 400-Fehler abgelehnt. User-
Entscheidung (2026-09-23): kein Block mehr — alle Fixierungen des gewählten
Zielfelds werden aufgehoben und der neue Betrag gleichmäßig auf ALLE Monate
neu verteilt. Der Normalfall (Betrag reicht für die fixierten Monate) bleibt
unverändert.

Läuft komplett über die HTTP-API auf der session-weiten Pytest-Scratch-DB
(siehe conftest.py) — bewusst synthetisch, keine echten Daten.
"""

from __future__ import annotations

import pytest


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    from main import app

    return TestClient(app, raise_server_exceptions=False)


def _erstelle_liegenschaft(client) -> int:
    r = client.post("/api/v1/liegenschaften", json={
        "name": "VZ-Test-Haus", "adresse": "VZ-Test-Haus", "plz": "12345", "ort": "Musterstadt",
    })
    assert r.status_code == 200, r.text
    return r.json()["data"]["id"]


def _erstelle_wohnung(client, lid: int) -> int:
    r = client.post(f"/api/v1/liegenschaften/{lid}/wohnungen", json={
        "bezeichnung": "Whg 1", "flaeche_m2": 50.0,
    })
    assert r.status_code == 200, r.text
    return r.json()["data"]["id"]


def _erstelle_periode(client, lid: int) -> int:
    r = client.post(f"/api/v1/liegenschaften/{lid}/perioden", json={
        "bezeichnung": "VZ-Testperiode", "von_datum": "2025-06-01", "bis_datum": "2026-05-31",
    })
    assert r.status_code == 200, r.text
    return r.json()["data"]["id"]


def _erstelle_mieter(client, wid: int) -> int:
    r = client.post(f"/api/v1/wohnungen/{wid}/mieter", json={
        "anzeigename": "VZ-Test-Mieter", "einzug_datum": "2024-01-01",
        "monatliche_vorauszahlung": 100.0,
    })
    assert r.status_code == 200, r.text
    return r.json()["data"]["id"]


@pytest.fixture()
def periode_mit_mieter(client):
    lid = _erstelle_liegenschaft(client)
    wid = _erstelle_wohnung(client, lid)
    pid = _erstelle_periode(client, lid)
    mid = _erstelle_mieter(client, wid)

    # GET erzeugt die 12 Monats-Zeilen idempotent.
    r = client.get(f"/api/v1/perioden/{pid}/vorauszahlungen")
    assert r.status_code == 200, r.text

    yield {"lid": lid, "wid": wid, "pid": pid, "mid": mid}

    from database import SessionLocal
    from models import Vorauszahlung

    db = SessionLocal()
    try:
        db.query(Vorauszahlung).filter(Vorauszahlung.mieter_id == mid).delete()
        db.commit()
    finally:
        db.close()
    client.delete(f"/api/v1/liegenschaften/{lid}")


def _vz_zeilen(client, pid: int, mid: int) -> list[dict]:
    r = client.get(f"/api/v1/perioden/{pid}/vorauszahlungen")
    assert r.status_code == 200, r.text
    for wohnung in r.json()["data"]["wohnungen"]:
        for mieter in wohnung["mieter"]:
            if mieter["mieter_id"] == mid:
                return mieter["vorauszahlungen"]
    raise AssertionError("Mieter nicht im Grid gefunden")


def test_gesamtbetrag_normalfall_lasst_fixierte_monate_unangetastet(client, periode_mit_mieter):
    d = periode_mit_mieter
    zeilen = _vz_zeilen(client, d["pid"], d["mid"])
    assert len(zeilen) == 12

    # Einen Monat individuell auf 150 € fixieren.
    fixiert = zeilen[0]
    r = client.put(f"/api/v1/vorauszahlungen/{fixiert['id']}", json={"betrag_ist": 150.0})
    assert r.status_code == 200, r.text

    # Gesamtbetrag (1200) reicht locker für die fixierten 150 -> Rest 1050 auf 11 Monate.
    r = client.post(
        f"/api/v1/perioden/{d['pid']}/mieter/{d['mid']}/vorauszahlung-gesamt",
        json={"ziel": "ist", "betrag_gesamt": 1200.0},
    )
    assert r.status_code == 200, r.text

    zeilen2 = _vz_zeilen(client, d["pid"], d["mid"])
    fixierte2 = next(z for z in zeilen2 if z["id"] == fixiert["id"])
    assert fixierte2["ist_override"] is True
    assert fixierte2["betrag_ist"] == 150.0
    rest_summe = round(sum(z["betrag_ist"] for z in zeilen2 if z["id"] != fixiert["id"]), 2)
    assert rest_summe == 1050.0


def test_gesamtbetrag_konfliktfall_setzt_fixierungen_zurueck(client, periode_mit_mieter):
    d = periode_mit_mieter
    zeilen = _vz_zeilen(client, d["pid"], d["mid"])

    # Zwei Monate hoch fixieren (zusammen 800 €).
    for z in zeilen[:2]:
        r = client.put(f"/api/v1/vorauszahlungen/{z['id']}", json={"betrag_ist": 400.0})
        assert r.status_code == 200, r.text

    # Neuer Gesamtbetrag (600) ist kleiner als die fixierte Summe (800) — früher 400,
    # jetzt: alle Fixierungen aufgehoben, 600 gleichmässig auf alle 12 Monate verteilt.
    r = client.post(
        f"/api/v1/perioden/{d['pid']}/mieter/{d['mid']}/vorauszahlung-gesamt",
        json={"ziel": "ist", "betrag_gesamt": 600.0},
    )
    assert r.status_code == 200, r.text
    ergebnis = r.json()["data"]
    assert len(ergebnis) == 12
    assert all(z["ist_override"] is False for z in ergebnis)
    gesamt = round(sum(z["betrag_ist"] for z in ergebnis), 2)
    assert gesamt == 600.0
    # Gleichmässig verteilt (2 Nachkommastellen), keine grossen Ausreisser.
    betraege = sorted({round(z["betrag_ist"], 2) for z in ergebnis})
    assert len(betraege) <= 2  # höchstens Rundungsrest im letzten Monat abweichend
    assert max(betraege) - min(betraege) < 0.1


def test_gesamtbetrag_alle_monate_fixiert_bleibt_blockiert(client, periode_mit_mieter):
    d = periode_mit_mieter
    zeilen = _vz_zeilen(client, d["pid"], d["mid"])

    for z in zeilen:
        r = client.put(f"/api/v1/vorauszahlungen/{z['id']}", json={"betrag_ist": 100.0})
        assert r.status_code == 200, r.text

    # Alle 12 Monate fixiert (Summe 1200), Betrag reicht (1200) -> nichts zu verteilen,
    # unveränderter Regressionsfall (nicht der gemeldete Bug).
    r = client.post(
        f"/api/v1/perioden/{d['pid']}/mieter/{d['mid']}/vorauszahlung-gesamt",
        json={"ziel": "ist", "betrag_gesamt": 1200.0},
    )
    assert r.status_code == 400, r.text

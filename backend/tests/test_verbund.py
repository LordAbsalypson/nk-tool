"""Regressionstest für den Verbund→Anwenden-Fix (siehe routers/verbund.py Docstring).

Vorher schrieb "Anwenden" eine Kostenposition (altes rechnungsbasiertes Modell),
die die aktive Direkt-Preise-Engine (schluessel_engine.py) nirgends liest —
Verbund-Kosten hatten dadurch keinerlei Effekt auf die tatsächliche Mieter-
abrechnung. Jetzt wird stattdessen der DirektKostenartWert.preis_pro_einheit
der gewählten Kostenart erhöht, was sich direkt auf die Abrechnung auswirkt.

Läuft komplett über die HTTP-API auf der session-weiten Pytest-Scratch-DB
(siehe conftest.py) — bewusst synthetisch, keine echten Daten, jeder Test
räumt seine eigenen Liegenschaften/Verbünde per Teardown wieder weg.
"""

from __future__ import annotations

import pytest


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    from main import app

    return TestClient(app, raise_server_exceptions=False)


def _erstelle_liegenschaft(client, name: str) -> int:
    r = client.post("/api/v1/liegenschaften", json={
        "name": name, "adresse": name, "plz": "12345", "ort": "Musterstadt",
    })
    assert r.status_code == 200, r.text
    return r.json()["data"]["id"]


def _erstelle_wohnung(client, lid: int, flaeche_m2: float) -> int:
    r = client.post(f"/api/v1/liegenschaften/{lid}/wohnungen", json={
        "bezeichnung": "Whg 1", "flaeche_m2": flaeche_m2,
    })
    assert r.status_code == 200, r.text
    return r.json()["data"]["id"]


def _erstelle_periode(client, lid: int) -> int:
    r = client.post(f"/api/v1/liegenschaften/{lid}/perioden", json={
        "bezeichnung": "Testperiode", "von_datum": "2025-06-01", "bis_datum": "2026-05-31",
    })
    assert r.status_code == 200, r.text
    return r.json()["data"]["id"]


def _erstelle_direkt_kostenart(client, name: str, verteilungsbasis: str = "m2") -> int:
    r = client.post("/api/v1/direkt-kostenarten", json={
        "name": name, "verteilungsbasis": verteilungsbasis, "hat_grundkosten_split": False,
    })
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


@pytest.fixture()
def zwei_haeuser(client):
    """Zwei Liegenschaften (50 m² / 30 m²) mit je einer Wohnung und Periode,
    plus eine globale, nicht gesplittete DirektKostenart."""
    lid_a = _erstelle_liegenschaft(client, "Verbund-Test-Haus A")
    lid_b = _erstelle_liegenschaft(client, "Verbund-Test-Haus B")
    _erstelle_wohnung(client, lid_a, 50.0)
    _erstelle_wohnung(client, lid_b, 30.0)
    periode_a = _erstelle_periode(client, lid_a)
    periode_b = _erstelle_periode(client, lid_b)
    kostenart_id = _erstelle_direkt_kostenart(client, "Verbund-Test-Versicherung", "m2")

    yield {
        "lid_a": lid_a, "lid_b": lid_b,
        "periode_a": periode_a, "periode_b": periode_b,
        "kostenart_id": kostenart_id,
    }

    client.delete(f"/api/v1/liegenschaften/{lid_a}")
    client.delete(f"/api/v1/liegenschaften/{lid_b}")
    # DirektKostenartWert-Zeilen explizit mitputzen statt auf FK-ON-DELETE-CASCADE zu
    # vertrauen — SQLite erzwingt das nur mit "PRAGMA foreign_keys=ON", was diese App
    # nicht setzt. Ohne das bleiben verwaiste Werte-Zeilen stehen, die bei der nächsten
    # SQLite-Rowid-Wiederverwendung (leere Tabelle -> nächste Kostenart bekommt dieselbe
    # id) fälschlich wieder an eine neue Kostenart "anwachsen".
    from database import SessionLocal
    from models import DirektKostenartWert

    db = SessionLocal()
    try:
        db.query(DirektKostenartWert).filter(
            DirektKostenartWert.kostenart_id == kostenart_id
        ).delete()
        db.commit()
    finally:
        db.close()
    client.delete(f"/api/v1/direkt-kostenarten/{kostenart_id}")


def _lies_satz(client, periode_id: int, kostenart_id: int) -> float | None:
    r = client.get(f"/api/v1/perioden/{periode_id}/direkt-kostenarten-werte")
    assert r.status_code == 200, r.text
    for w in r.json()["data"]:
        if w["kostenart_id"] == kostenart_id:
            return w["preis_pro_einheit"]
    return None


def test_anwenden_erhoeht_direkt_kostenart_wert(client, zwei_haeuser):
    d = zwei_haeuser
    v = client.post("/api/v1/verbund", json={"name": "Verbund-Test"}).json()["data"]
    vid = v["id"]
    client.post(f"/api/v1/verbund/{vid}/mitglieder", json={"liegenschaft_id": d["lid_a"], "sort": 0})
    client.post(f"/api/v1/verbund/{vid}/mitglieder", json={"liegenschaft_id": d["lid_b"], "sort": 1})

    k = client.post(f"/api/v1/verbund/{vid}/kosten", json={
        "bezeichnung": "Gemeinsame Versicherung", "betrag_gesamt": 800.0,
        "schluessel_typ": "wohnflaeche_m2",
    }).json()["data"]
    kid = k["id"]

    # Vor "Anwenden": kein Satz gesetzt.
    assert _lies_satz(client, d["periode_a"], d["kostenart_id"]) is None

    r = client.post(f"/api/v1/verbund/{vid}/kosten/{kid}/anwenden", json={
        "perioden": {
            str(d["lid_a"]): {"periode_id": d["periode_a"], "kostenart_id": d["kostenart_id"]},
            str(d["lid_b"]): {"periode_id": d["periode_b"], "kostenart_id": d["kostenart_id"]},
        }
    })
    assert r.status_code == 200, r.text
    assert r.json()["data"]["angewendet"] is True

    # 800 € nach Wohnfläche (50 m² : 30 m² = 62.5 % : 37.5 %) -> Haus A 500 €, Haus B 300 €.
    # Rate = Betrag / eigene Gesamtfläche -> für beide Häuser exakt 10 €/m² (500/50 = 300/30).
    satz_a = _lies_satz(client, d["periode_a"], d["kostenart_id"])
    satz_b = _lies_satz(client, d["periode_b"], d["kostenart_id"])
    assert satz_a == pytest.approx(10.0, abs=0.01)
    assert satz_b == pytest.approx(10.0, abs=0.01)

    # Rückgängig machen nimmt den Zuschlag exakt zurück (Zeile wird wieder gelöscht).
    r = client.delete(f"/api/v1/verbund/{vid}/kosten/{kid}/anwenden")
    assert r.status_code == 200, r.text
    assert _lies_satz(client, d["periode_a"], d["kostenart_id"]) is None
    assert _lies_satz(client, d["periode_b"], d["kostenart_id"]) is None

    client.delete(f"/api/v1/verbund/{vid}")


def test_anwenden_addiert_zu_bestehendem_satz(client, zwei_haeuser):
    """Ein bereits manuell gesetzter Satz darf durch Verbund-Anwenden nicht
    überschrieben, sondern muss addiert werden."""
    d = zwei_haeuser
    client.put(f"/api/v1/perioden/{d['periode_a']}/direkt-kostenarten-werte/{d['kostenart_id']}", json={
        "preis_pro_einheit": 2.0,
    })

    v = client.post("/api/v1/verbund", json={"name": "Verbund-Test-2"}).json()["data"]
    vid = v["id"]
    client.post(f"/api/v1/verbund/{vid}/mitglieder", json={"liegenschaft_id": d["lid_a"], "sort": 0})
    client.post(f"/api/v1/verbund/{vid}/mitglieder", json={"liegenschaft_id": d["lid_b"], "sort": 1})
    k = client.post(f"/api/v1/verbund/{vid}/kosten", json={
        "bezeichnung": "Zusatzkosten", "betrag_gesamt": 800.0, "schluessel_typ": "wohnflaeche_m2",
    }).json()["data"]

    client.post(f"/api/v1/verbund/{vid}/kosten/{k['id']}/anwenden", json={
        "perioden": {
            str(d["lid_a"]): {"periode_id": d["periode_a"], "kostenart_id": d["kostenart_id"]},
            str(d["lid_b"]): {"periode_id": d["periode_b"], "kostenart_id": d["kostenart_id"]},
        }
    })

    # 2.0 (manuell) + 10.0 (Verbund-Zuschlag) = 12.0
    assert _lies_satz(client, d["periode_a"], d["kostenart_id"]) == pytest.approx(12.0, abs=0.01)

    client.delete(f"/api/v1/verbund/{vid}/kosten/{k['id']}/anwenden")
    # Zurück auf den ursprünglichen manuellen Satz, Zeile bleibt erhalten (nicht 0).
    assert _lies_satz(client, d["periode_a"], d["kostenart_id"]) == pytest.approx(2.0, abs=0.01)

    client.delete(f"/api/v1/verbund/{vid}")


def test_anwenden_lehnt_gesplittete_kostenart_ab(client, zwei_haeuser):
    d = zwei_haeuser
    split_id = _erstelle_direkt_kostenart(client, "Verbund-Test-Heizung-Split", "kwh_heizung")
    r = client.put(f"/api/v1/direkt-kostenarten/{split_id}", json={
        "name": "Verbund-Test-Heizung-Split", "verteilungsbasis": "kwh_heizung",
        "hat_grundkosten_split": True,
    })
    assert r.status_code == 200, r.text

    v = client.post("/api/v1/verbund", json={"name": "Verbund-Test-3"}).json()["data"]
    vid = v["id"]
    client.post(f"/api/v1/verbund/{vid}/mitglieder", json={"liegenschaft_id": d["lid_a"], "sort": 0})
    client.post(f"/api/v1/verbund/{vid}/mitglieder", json={"liegenschaft_id": d["lid_b"], "sort": 1})
    k = client.post(f"/api/v1/verbund/{vid}/kosten", json={
        "bezeichnung": "Heizkosten gemeinsam", "betrag_gesamt": 500.0, "schluessel_typ": "wohnungsanzahl",
    }).json()["data"]

    r = client.post(f"/api/v1/verbund/{vid}/kosten/{k['id']}/anwenden", json={
        "perioden": {
            str(d["lid_a"]): {"periode_id": d["periode_a"], "kostenart_id": split_id},
            str(d["lid_b"]): {"periode_id": d["periode_b"], "kostenart_id": split_id},
        }
    })
    assert r.status_code == 400
    assert "Split" in r.json()["error"] or "Split" in r.text

    client.delete(f"/api/v1/verbund/{vid}")
    client.delete(f"/api/v1/direkt-kostenarten/{split_id}")

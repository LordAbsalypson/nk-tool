"""Schema-boundary validation rules (GOAL.md section 3.2).

Covers the new guards (flaeche_m2, mittlere_ww_temperatur, Periode dates) and
protects the pre-existing correct patterns (Grundkosten-Anteil bounds) against
regression. API-level tests prove bad input is rejected with the
``{"ok": false, "error": ...}`` envelope.
"""

import pytest
from pydantic import ValidationError

from schemas import (
    AbrechnungsperiodeCreate,
    LiegenschaftCreate,
    WohnungCreate,
    WohnungUpdate,
)

_LIEG_DEFAULTS = dict(name="Test", adresse="Str. 1", plz="26419", ort="Schortens")


# ── 3.2.1 Wohnung.flaeche_m2 > 0 ─────────────────────────────────────────────

@pytest.mark.parametrize("flaeche", [0.0, -1.0, -52.5])
def test_flaeche_m2_nicht_positiv_abgelehnt(flaeche):
    with pytest.raises(ValidationError, match="Wohnfläche"):
        WohnungCreate(bezeichnung="Whg 1", flaeche_m2=flaeche)


def test_flaeche_m2_positiv_ok():
    w = WohnungCreate(bezeichnung="Whg 1", flaeche_m2=52.5)
    assert w.flaeche_m2 == 52.5


def test_flaeche_m2_update_ebenfalls_geschuetzt():
    with pytest.raises(ValidationError, match="Wohnfläche"):
        WohnungUpdate(bezeichnung="Whg 1", flaeche_m2=0.0)


# ── 3.2.2 Liegenschaft.mittlere_ww_temperatur > 10.0 (HKVO §9) ───────────────

@pytest.mark.parametrize("temp", [10.0, 9.9, 0.0, -5.0])
def test_ww_temperatur_zu_niedrig_abgelehnt(temp):
    with pytest.raises(ValidationError, match="HKVO"):
        LiegenschaftCreate(mittlere_ww_temperatur=temp, **_LIEG_DEFAULTS)


def test_ww_temperatur_default_ok():
    lieg = LiegenschaftCreate(**_LIEG_DEFAULTS)
    assert lieg.mittlere_ww_temperatur == 60.0


# ── 3.2.3 Abrechnungsperiode von_datum < bis_datum ───────────────────────────

@pytest.mark.parametrize(
    "von,bis",
    [
        ("2025-06-01", "2025-06-01"),  # gleich
        ("2026-05-31", "2025-06-01"),  # vertauscht
    ],
)
def test_periode_zeitraum_ungueltig_abgelehnt(von, bis):
    with pytest.raises(ValidationError, match="Enddatum"):
        AbrechnungsperiodeCreate(bezeichnung="NK", von_datum=von, bis_datum=bis)


def test_periode_datum_kein_iso_abgelehnt():
    with pytest.raises(ValidationError, match="gültiges Datum"):
        AbrechnungsperiodeCreate(
            bezeichnung="NK", von_datum="01.06.2025", bis_datum="2026-05-31"
        )


def test_periode_zeitraum_gueltig_ok():
    p = AbrechnungsperiodeCreate(
        bezeichnung="NK 2025/26", von_datum="2025-06-01", bis_datum="2026-05-31"
    )
    assert p.von_datum < p.bis_datum


# ── 3.2.4 Grundkosten-Anteile: bestehende Bounds bleiben erhalten ────────────

@pytest.mark.parametrize("anteil", [0.29, 0.51, -0.1, 1.1])
def test_grundkosten_anteil_bounds_erhalten(anteil):
    with pytest.raises(ValidationError, match="Grundkostenanteil"):
        LiegenschaftCreate(heiz_grundkosten_anteil=anteil, **_LIEG_DEFAULTS)


# ── API-Ebene: Envelope {"ok": false, "error": ...} bei 422 ──────────────────

@pytest.fixture(scope="module")
def client(request):
    # Importing main runs create_all + idempotent migrations — against the
    # scratch DB only (NK_TOOL_DB_PATH is set in conftest before any import).
    import database

    assert "nk_tool_pytest_scratch.db" in database.SQLALCHEMY_DATABASE_URL
    from fastapi.testclient import TestClient
    from main import app

    return TestClient(app, raise_server_exceptions=False)


def test_api_envelope_bei_validierungsfehler(client):
    r = client.post(
        "/api/v1/liegenschaften/2/wohnungen",
        json={"bezeichnung": "Whg X", "flaeche_m2": 0},
    )
    assert r.status_code == 422
    body = r.json()
    assert body["ok"] is False
    assert "Wohnfläche" in body["error"]
    assert "detail" not in body


def test_api_envelope_bei_periode_fehler(client):
    r = client.post(
        "/api/v1/liegenschaften/2/perioden",
        json={
            "bezeichnung": "kaputt",
            "von_datum": "2026-05-31",
            "bis_datum": "2025-06-01",
        },
    )
    assert r.status_code == 422
    body = r.json()
    assert body["ok"] is False
    assert "Enddatum" in body["error"]

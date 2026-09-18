"""Auth-Flow: Setup, Login (Passwort + Recovery-Code), Schutz der Datenrouter,
Backward-Compatibility (kein Passwort = kein Schutz). Läuft auf derselben
session-weiten Scratch-DB wie die übrigen Tests (siehe conftest.py) — jeder
Test räumt das gesetzte Passwort über den ``_clean_auth``-Fixture-Teardown
wieder weg, garantiert auch bei einem fehlschlagenden Assert, sonst würden
nachfolgende Tests (z. B. test_validation.py) plötzlich 401 bekommen."""

from __future__ import annotations

import pytest


@pytest.fixture(scope="module")
def client():
    import database

    assert "nk_tool_pytest_scratch.db" in database.SQLALCHEMY_DATABASE_URL
    from fastapi.testclient import TestClient
    from main import app

    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture()
def _clean_auth(client):
    """Garantiert: nach jedem Test ist kein Passwort mehr gesetzt, egal ob
    der Test erfolgreich war oder mittendrin fehlgeschlagen ist."""
    yield
    from database import SessionLocal
    from models import AppAuth

    db = SessionLocal()
    try:
        row = db.query(AppAuth).first()
        if row is not None:
            db.delete(row)
            db.commit()
    finally:
        db.close()


def test_status_ohne_passwort(client, _clean_auth):
    r = client.get("/api/v1/auth/status")
    assert r.status_code == 200
    assert r.json()["data"]["protected"] is False


def test_datenrouter_frei_ohne_passwort(client, _clean_auth):
    r = client.get("/api/v1/liegenschaften")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_setup_login_und_geschuetzter_zugriff(client, _clean_auth):
    r = client.post("/api/v1/auth/setup", json={"password": "sehr-geheim-123"})
    assert r.status_code == 200
    body = r.json()["data"]
    assert body["token"]
    recovery_code = body["recoveryCode"]
    assert len(recovery_code) == 14  # "XXXX-XXXX-XXXX"

    # status jetzt protected
    r = client.get("/api/v1/auth/status")
    assert r.json()["data"]["protected"] is True

    # ohne Token -> 401
    r = client.get("/api/v1/liegenschaften")
    assert r.status_code == 401
    assert r.json()["ok"] is False

    # mit gültigem Token -> 200
    r = client.get("/api/v1/liegenschaften", headers={"Authorization": f"Bearer {body['token']}"})
    assert r.status_code == 200
    assert r.json()["ok"] is True

    # zweiter Setup-Aufruf, während schon geschützt -> 409
    r = client.post("/api/v1/auth/setup", json={"password": "irgendwas12"})
    assert r.status_code == 409


def test_login_falsches_passwort_abgelehnt(client, _clean_auth):
    client.post("/api/v1/auth/setup", json={"password": "korrekt-passwort"})
    r = client.post("/api/v1/auth/login", json={"secret": "falsches-passwort"})
    assert r.status_code == 401
    assert r.json()["ok"] is False


def test_login_mit_recovery_code(client, _clean_auth):
    setup = client.post("/api/v1/auth/setup", json={"password": "mein-passwort-123"}).json()["data"]
    r = client.post("/api/v1/auth/login", json={"secret": setup["recoveryCode"]})
    assert r.status_code == 200
    body = r.json()["data"]
    assert body["usedRecoveryCode"] is True
    assert body["token"]

    # Recovery-Code funktioniert auch als geschützter Zugriff (via Login-Token)
    r = client.get("/api/v1/liegenschaften", headers={"Authorization": f"Bearer {body['token']}"})
    assert r.status_code == 200


def test_change_password(client, _clean_auth):
    setup = client.post("/api/v1/auth/setup", json={"password": "altes-passwort1"}).json()["data"]
    token = setup["token"]
    r = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "altes-passwort1", "new_password": "neues-passwort2"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200

    # altes Passwort geht nicht mehr
    r = client.post("/api/v1/auth/login", json={"secret": "altes-passwort1"})
    assert r.status_code == 401

    # neues Passwort funktioniert
    r = client.post("/api/v1/auth/login", json={"secret": "neues-passwort2"})
    assert r.status_code == 200


def test_disable_entfernt_schutz(client, _clean_auth):
    setup = client.post("/api/v1/auth/setup", json={"password": "wird-entfernt-123"}).json()["data"]
    r = client.post(
        "/api/v1/auth/disable", headers={"Authorization": f"Bearer {setup['token']}"}
    )
    assert r.status_code == 200

    r = client.get("/api/v1/auth/status")
    assert r.json()["data"]["protected"] is False

    # jetzt wieder frei zugänglich ohne Token
    r = client.get("/api/v1/liegenschaften")
    assert r.status_code == 200


def test_ungueltiges_token_wird_abgelehnt(client, _clean_auth):
    client.post("/api/v1/auth/setup", json={"password": "irgendein-passwort"})
    r = client.get("/api/v1/liegenschaften", headers={"Authorization": "Bearer offensichtlich-falsch"})
    assert r.status_code == 401

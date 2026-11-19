"""Tests für die Optimierungsrunde (PM-/HCD-Audit):

- Perioden-Inhalts-Abfrage (`GET /perioden/{id}/inhalt`)
- Zählerstände-Übersicht in einem Request (`GET /perioden/{id}/zaehlerstaende-uebersicht`)
- Sammel-Export aller Einzel-Abrechnungen als ZIP (`POST /perioden/{id}/schluessel-abrechnung/pdf-alle`)
- Bereinigte Validierungstexte ohne Altmodell (`GET /perioden/{id}/validierung`)
- Automatisches SQLite-Backup in `desktop/app.py` (Unit-Test mit Temp-DB)
"""

from __future__ import annotations

import io
import sqlite3
import sys
import zipfile
from pathlib import Path

import pytest


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    from main import app

    return TestClient(app, raise_server_exceptions=False)


def _setup_testperiode(client):
    r = client.post(
        "/api/v1/liegenschaften",
        json={
            "name": "Opt-Test-Haus",
            "adresse": "Musterweg 10",
            "plz": "12345",
            "ort": "Musterstadt",
        },
    )
    assert r.status_code == 200, r.text
    lid = r.json()["data"]["id"]

    r = client.post(
        f"/api/v1/liegenschaften/{lid}/wohnungen",
        json={"bezeichnung": "Whg 1", "flaeche_m2": 60.0},
    )
    assert r.status_code == 200, r.text
    wid1 = r.json()["data"]["id"]

    r = client.post(
        f"/api/v1/liegenschaften/{lid}/wohnungen",
        json={"bezeichnung": "Whg 2", "flaeche_m2": 40.0},
    )
    assert r.status_code == 200, r.text
    wid2 = r.json()["data"]["id"]

    r = client.post(
        f"/api/v1/liegenschaften/{lid}/perioden",
        json={
            "bezeichnung": "Opt-2025/26",
            "von_datum": "2025-06-01",
            "bis_datum": "2026-05-31",
        },
    )
    assert r.status_code == 200, r.text
    pid = r.json()["data"]["id"]

    # Mieter 1 (vollständig mit Zählerständen)
    r = client.post(
        f"/api/v1/wohnungen/{wid1}/mieter",
        json={
            "anzeigename": "Mieter Eins",
            "einzug_datum": "2024-01-01",
            "monatliche_vorauszahlung": 120.0,
        },
    )
    assert r.status_code == 200, r.text
    mid1 = r.json()["data"]["id"]
    r = client.post(
        f"/api/v1/wohnungen/{wid2}/mieter",
        json={
            "anzeigename": "Mieter Zwei",
            "einzug_datum": "2025-06-01",
            "auszug_datum": "2026-03-31",
            "monatliche_vorauszahlung": 80.0,
        },
    )
    assert r.status_code == 200, r.text

    # Wärmezähler für Whg 1 (mit Ständen) und Whg 2 (ohne Stände -> unvollständig)
    r = client.post(
        f"/api/v1/wohnungen/{wid1}/zaehler",
        json={"typ": "waerme_kwh", "geraete_nummer": "WMZ-101"},
    )
    assert r.status_code == 200, r.text
    zid1 = r.json()["data"]["id"]

    r = client.post(
        f"/api/v1/zaehler/{zid1}/staende",
        json={
            "periode_id": pid,
            "ablesedatum": "2025-06-01",
            "wert": 1000.0,
            "art": "periode_start",
        },
    )
    assert r.status_code == 201, r.text
    r = client.post(
        f"/api/v1/zaehler/{zid1}/staende",
        json={
            "periode_id": pid,
            "ablesedatum": "2026-05-31",
            "wert": 2500.0,
            "art": "periode_ende",
        },
    )
    assert r.status_code == 201, r.text

    r = client.post(
        f"/api/v1/wohnungen/{wid2}/zaehler",
        json={"typ": "waerme_kwh", "geraete_nummer": "WMZ-102"},
    )
    assert r.status_code == 200, r.text
    zid2 = r.json()["data"]["id"]

    # DirektKostenart + Satz auf diese Periode setzen, damit Whg 1 berechenbar ist
    # und Whg 2 wegen fehlender Zählerstände übersprungen wird
    r = client.post(
        "/api/v1/direkt-kostenarten",
        json={"name": "Opt-Test-Heizung", "verteilungsbasis": "kwh_heizung"},
    )
    assert r.status_code == 201, r.text
    ka_id = r.json()["data"]["id"]

    r = client.put(
        f"/api/v1/perioden/{pid}/direkt-kostenarten-werte/{ka_id}",
        json={"preis_pro_einheit": 0.10},
    )
    assert r.status_code == 200, r.text

    # Vorauszahlungen generieren
    r = client.get(f"/api/v1/perioden/{pid}/vorauszahlungen")
    assert r.status_code == 200, r.text

    return {
        "lid": lid,
        "wid1": wid1,
        "wid2": wid2,
        "mid1": mid1,
        "pid": pid,
        "zid1": zid1,
        "zid2": zid2,
        "ka_id": ka_id,
    }


@pytest.fixture()
def opt_daten(client):
    d = _setup_testperiode(client)
    yield d
    # Erst DirektKostenartWert + ggf. WohnungVerbrauch explizit löschen, damit bei
    # SQLite ohne PRAGMA foreign_keys=ON keine verwaiste Zeile liegen bleibt.
    import shutil
    from database import SessionLocal
    from models import DirektKostenartWert, WohnungVerbrauch
    from routers.schluessel_abrechnung import PDF_DIR

    db = SessionLocal()
    try:
        db.query(DirektKostenartWert).filter(
            DirektKostenartWert.abrechnungsperiode_id == d["pid"]
        ).delete()
        db.query(DirektKostenartWert).filter(
            DirektKostenartWert.kostenart_id == d["ka_id"]
        ).delete()
        db.query(WohnungVerbrauch).filter(
            WohnungVerbrauch.abrechnungsperiode_id == d["pid"]
        ).delete()
        db.commit()
    finally:
        db.close()
    shutil.rmtree(PDF_DIR / "Opt-2025-26", ignore_errors=True)
    client.delete(f"/api/v1/direkt-kostenarten/{d['ka_id']}")
    client.delete(f"/api/v1/liegenschaften/{d['lid']}")


def test_periode_inhalt_zaehlt_datensaetze(client, opt_daten):
    r = client.get(f"/api/v1/perioden/{opt_daten['pid']}/inhalt")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["zaehlerstaende"] == 2
    assert data["vorauszahlungen"] == 0  # betrag_ist noch 0
    assert data["kostenart_saetze"] == 1


def test_zaehlerstaende_uebersicht_buendelt_alle_daten(client, opt_daten):
    r = client.get(f"/api/v1/perioden/{opt_daten['pid']}/zaehlerstaende-uebersicht")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert len(data["wohnungen"]) == 2
    assert str(opt_daten["wid1"]) in data["zaehler_by_wohnung"]
    assert str(opt_daten["wid1"]) in data["mieter_by_wohnung"]
    gruppe1 = data["staende_by_zaehler"][str(opt_daten["zid1"])]
    assert gruppe1["hat_start"] is True
    assert gruppe1["hat_ende"] is True
    assert gruppe1["verbrauch"] == pytest.approx(1500.0)
    gruppe2 = data["staende_by_zaehler"][str(opt_daten["zid2"])]
    assert gruppe2["hat_start"] is False
    assert gruppe2["hat_ende"] is False


def test_validierung_nutzt_aktuelle_schrittnamen_und_deutsches_datum(client, opt_daten):
    r = client.get(f"/api/v1/perioden/{opt_daten['pid']}/validierung")
    assert r.status_code == 200, r.text
    data = r.json()["data"]

    codes = {m["code"] for m in data["errors"] + data["warnings"] + data["infos"]}
    assert "keine_brennstoffkosten" not in codes
    assert "fehlende_anfangsablesung" in codes
    assert "fehlende_endablesung" in codes
    assert "fehlende_vorauszahlungen" in codes
    assert "datum_luecke" in codes

    all_texts = " ".join(
        f"{m['message']} {m['context'] or ''}"
        for m in data["errors"] + data["warnings"] + data["infos"]
    )
    assert "Stage " not in all_texts
    assert "Schritt 3 · Zählerstände" in all_texts
    assert "Schritt 4 · Vorauszahlungen" in all_texts
    assert "Schritt 1 · Stammdaten" in all_texts
    assert "01.04.2026" in all_texts

    # Wenn für Whg 2 ein manueller WohnungVerbrauch-Override gesetzt wird,
    # darf keine fehlende_anfangsablesung/fehlende_endablesung mehr gemeldet werden.
    r_ov = client.put(
        f"/api/v1/perioden/{opt_daten['pid']}/wohnungen/{opt_daten['wid2']}/wohnung-verbrauch",
        json={"zaehler_typ": "waerme_kwh", "wert": 900.0},
    )
    assert r_ov.status_code == 200, r_ov.text
    r2 = client.get(f"/api/v1/perioden/{opt_daten['pid']}/validierung")
    assert r2.status_code == 200, r2.text
    error_codes_after = {m["code"] for m in r2.json()["data"]["errors"]}
    assert "fehlende_anfangsablesung" not in error_codes_after
    assert "fehlende_endablesung" not in error_codes_after


def test_zip_sammel_export_erstellt_archiv_und_meldet_uebersprungene(client, opt_daten):
    r = client.post(
        f"/api/v1/perioden/{opt_daten['pid']}/schluessel-abrechnung/pdf-alle",
        json={
            "datum_anzeigen": True,
            "datum": "2026-10-01",
            "absender_anzeigen": True,
            "empfaenger_anzeigen": True,
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["anzahl"] == 1
    assert len(data["uebersprungen"]) == 1
    assert data["uebersprungen"][0]["anzeigename"] == "Mieter Zwei"
    assert data["dateiname"].endswith(".zip")

    dl = client.get(data["download_url"])
    assert dl.status_code == 200, dl.text
    assert dl.headers["content-type"].startswith("application/zip")

    with zipfile.ZipFile(io.BytesIO(dl.content), "r") as zf:
        names = zf.namelist()
        assert len(names) == 1
        assert names[0].endswith(".pdf")
        assert zf.read(names[0]).startswith(b"%PDF")

    # Path-Traversal-Versuch beim Download wird mit 404 abgewiesen
    bad = client.get(
        f"/api/v1/perioden/{opt_daten['pid']}/schluessel-abrechnung/pdf-alle/download",
        params={"ordner": "..", "datei": "geheim.zip"},
    )
    assert bad.status_code == 404


def test_auto_backup_db_erstellt_und_rotiert(tmp_path: Path):
    repo_root = Path(__file__).resolve().parent.parent.parent
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))
    from desktop.app import auto_backup_db, latest_backup_label

    db_file = tmp_path / "sample.db"
    con = sqlite3.connect(str(db_file))
    con.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)")
    con.execute("INSERT INTO t (val) VALUES ('ok')")
    con.commit()
    con.close()

    bdir = tmp_path / "backups"
    bdir.mkdir()
    # 15 alte Sicherungen anlegen, um Rotation auf keep=14 zu testen
    for tag in range(1, 16):
        (bdir / f"backup_2026-01-{tag:02d}_100000.db").write_bytes(b"old")

    created = auto_backup_db(db_file, target_dir=bdir, keep=14)
    assert created is not None and created.exists()

    # Zweiter Aufruf am selben Tag legt kein weiteres Backup an
    second = auto_backup_db(db_file, target_dir=bdir, keep=14)
    assert second == created

    alle = sorted(bdir.glob("backup_*.db"))
    assert len(alle) == 14
    assert created in alle

    # Backup ist eine gültige SQLite-Kopie mit Daten
    check_con = sqlite3.connect(str(created))
    row = check_con.execute("SELECT val FROM t").fetchone()
    check_con.close()
    assert row == ("ok",)

    label = latest_backup_label(target_dir=bdir)
    assert label is not None and len(label) >= 10


def test_version_endpunkt_liefert_semver_und_changelog(client):
    r = client.get("/api/v1/version")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["version"] == "1.4.0"
    assert "[1.4.0]" in data["changelog"]


def test_pdf_archiv_listet_und_loescht_generierte_dateien(client, opt_daten):
    pid = opt_daten["pid"]
    # 1. ZIP + Einzel-PDF erzeugen
    r_zip = client.post(
        f"/api/v1/perioden/{pid}/schluessel-abrechnung/pdf-alle",
        json={"datum_anzeigen": True, "datum": "2026-10-01", "absender_anzeigen": True, "empfaenger_anzeigen": True},
    )
    assert r_zip.status_code == 200, r_zip.text
    zip_name = r_zip.json()["data"]["dateiname"]

    # 2. PDF-Archiv abfragen: enthält sowohl das Einzel-PDF als auch das ZIP
    r_list = client.get(f"/api/v1/perioden/{pid}/pdf-archiv")
    assert r_list.status_code == 200, r_list.text
    items = r_list.json()["data"]
    typen = {it["typ"] for it in items}
    assert "pdf" in typen
    assert "zip" in typen
    for it in items:
        assert "erstellt_am_de" in it and "Uhr" in it["erstellt_am_de"]
        assert it["groesse_bytes"] > 0
        dl = client.get(it["download_url"])
        assert dl.status_code == 200

    # 3. ZIP aus dem Archiv löschen
    r_del = client.delete(f"/api/v1/perioden/{pid}/pdf-archiv", params={"dateiname": zip_name})
    assert r_del.status_code == 200, r_del.text
    r_list2 = client.get(f"/api/v1/perioden/{pid}/pdf-archiv")
    namen2 = {it["dateiname"] for it in r_list2.json()["data"]}
    assert zip_name not in namen2


def test_unterjaehriger_auszug_neue_periode_uebernimmt_saetze_und_rechnet_taggenau(client, opt_daten):
    """Wenn eine neue Abrechnungsperiode angelegt wird (bevor die neue Gas-/Strom-
    Jahresabrechnung vorliegt), übernimmt das Backend automatisch die Einheitspreise
    aus der Vorperiode. Zieht ein Mieter unterjährig aus (z. B. nach 61 von 365 Tagen),
    werden Grund-/Flächenkosten taggenau (61/365) heruntergerechnet und der Verbrauch
    aus den Zählerständen exakt mit dem übernommenen €/kWh-Satz multipliziert."""
    lid = opt_daten["lid"]
    wid1 = opt_daten["wid1"]
    zid1 = opt_daten["zid1"]
    ka_id = opt_daten["ka_id"]

    # Heizungs-Kostenart mit Split (Grundkosten €/m² + Verbrauch €/kWh) in der Vorperiode anlegen
    r_ka_heiz = client.post(
        "/api/v1/direkt-kostenarten",
        json={
            "name": "OptTest Heizung Split",
            "verteilungsbasis": "kwh_heizung",
            "hat_grundkosten_split": True,
            "nur_liegenschaft_id": lid,
            "sortierung": 999,
            "aktiv": True,
        },
    )
    assert r_ka_heiz.status_code in (200, 201), r_ka_heiz.text
    ka_heiz_id = r_ka_heiz.json()["data"]["id"]
    new_pid: int | None = None

    try:
        r_set = client.put(
            f"/api/v1/perioden/{opt_daten['pid']}/direkt-kostenarten-werte/{ka_heiz_id}",
            json={"preis_grund_pro_m2": 3.65, "preis_verbrauch_pro_einheit": 0.12},
        )
        assert r_set.status_code == 200, r_set.text

        # Neue Periode 2026/27 anlegen (365 Tage: 2026-06-01 bis 2027-05-31)
        r_new_p = client.post(
            f"/api/v1/liegenschaften/{lid}/perioden",
            json={
                "bezeichnung": "Opt-2026-27",
                "von_datum": "2026-06-01",
                "bis_datum": "2027-05-31",
            },
        )
        assert r_new_p.status_code in (200, 201), r_new_p.text
        new_pid = r_new_p.json()["data"]["id"]

        # Prüfen: Sätze wurden automatisch aus Vorperiode übernommen
        r_werte = client.get(f"/api/v1/perioden/{new_pid}/direkt-kostenarten-werte")
        assert r_werte.status_code == 200, r_werte.text
        werte_by_ka = {w["kostenart_id"]: w for w in r_werte.json()["data"]}
        assert ka_id in werte_by_ka
        assert werte_by_ka[ka_id]["preis_pro_einheit"] == pytest.approx(0.10)
        assert ka_heiz_id in werte_by_ka
        assert werte_by_ka[ka_heiz_id]["preis_grund_pro_m2"] == pytest.approx(3.65)
        assert werte_by_ka[ka_heiz_id]["preis_verbrauch_pro_einheit"] == pytest.approx(0.12)

        # Auch der explizite Button-Endpunkt /aus-vorperiode funktioniert idempotent
        r_copy = client.post(f"/api/v1/perioden/{new_pid}/direkt-kostenarten-werte/aus-vorperiode")
        assert r_copy.status_code == 200, r_copy.text
        assert r_copy.json()["data"]["uebernommen"] >= 2

        # Mieter 1 zieht unterjährig am 31.07.2026 aus (01.06.2026 – 31.07.2026 = 61 Tage von 365)
        r_m1 = client.put(
            f"/api/v1/mieter/{opt_daten['mid1']}",
            json={
                "anzeigename": "Mieter Eins",
                "einzug_datum": "2024-01-01",
                "auszug_datum": "2026-07-31",
                "monatliche_vorauszahlung": 120.0,
            },
        )
        assert r_m1.status_code == 200, r_m1.text

        # Zählerstände für die neue Periode (Anfang 2500, Auszug/Ende 2800 -> 300 kWh Verbrauch)
        for art, datum, wert in [
            ("periode_start", "2026-06-01", 2500.0),
            ("periode_ende", "2026-07-31", 2800.0),
        ]:
            rz = client.post(
                f"/api/v1/zaehler/{zid1}/staende",
                json={
                    "periode_id": new_pid,
                    "wert": wert,
                    "ablesedatum": datum,
                    "art": art,
                },
            )
            assert rz.status_code in (200, 201), rz.text

        # Exakten Auszugs-Verbrauch (300 kWh) für den ausgezogenen Mieter fixieren
        r_mv = client.put(
            f"/api/v1/perioden/{new_pid}/mieter/{opt_daten['mid1']}/verbrauch-override",
            json={
                "zaehler_typ": "waerme_kwh",
                "wert": 300.0,
                "als_schaetzung_anzeigen": False,
            },
        )
        assert r_mv.status_code == 200, r_mv.text

        # Abrechnung in der neuen Periode berechnen
        r_abr = client.get(f"/api/v1/perioden/{new_pid}/schluessel-abrechnung")
        assert r_abr.status_code == 200, r_abr.text
        m1_abr = next(m for m in r_abr.json()["data"] if m["mieter_id"] == opt_daten["mid1"])
        assert m1_abr["miettage"] == 61
        assert m1_abr["periode_tage"] == 365

        zeilen_by_key = {z["schluessel"]: z for z in m1_abr["zeilen"]}
        # 1) Heizung Grundkosten (3,65 €/m² * 60 m² * 61/365 Tage = 36,60 €)
        z_hg = zeilen_by_key["OptTest Heizung Split:grund"]
        assert z_hg["betrag"] == pytest.approx(round(3.65 * 60.0 * (61 / 365), 2))
        # 2) Heizung Verbrauch (exakt 300 kWh * 0,12 €/kWh = 36,00 €)
        z_hv = zeilen_by_key["OptTest Heizung Split:verbrauch"]
        assert z_hv["einheiten"] == pytest.approx(300.0)
        assert z_hv["betrag"] == pytest.approx(36.0)
    finally:
        from database import SessionLocal
        from models import DirektKostenartWert

        db = SessionLocal()
        try:
            if new_pid is not None:
                db.query(DirektKostenartWert).filter(
                    DirektKostenartWert.abrechnungsperiode_id == new_pid
                ).delete()
            db.query(DirektKostenartWert).filter(
                DirektKostenartWert.kostenart_id == ka_heiz_id
            ).delete()
            db.commit()
        finally:
            db.close()
        client.delete(f"/api/v1/direkt-kostenarten/{ka_heiz_id}")


def test_mcp_server_tools_und_inprocess_fallback(monkeypatch, opt_daten):
    """Prüft, dass der MCP-Server (mcp-server/server.py) get_status, get_api_reference,
    request (inkl. In-Process-Fallback und PATCH) sowie get_db_schema/query_db sauber bedient."""
    import importlib.util

    repo_root = Path(__file__).resolve().parent.parent.parent
    mcp_path = repo_root / "mcp-server" / "server.py"
    spec = importlib.util.spec_from_file_location("nk_mcp_server", mcp_path)
    assert spec and spec.loader
    mcp_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mcp_mod)

    # Erzwinge In-Process-Fallback (ungültiger Port)
    monkeypatch.setenv("NK_TOOL_API_BASE", "http://127.0.0.1:59999/api/v1")

    status = mcp_mod.get_status()
    assert status["ok"] is True
    assert status["version"] == "1.4.0"
    assert status["api_mode"] == "in_process_fallback"
    assert isinstance(status["liegenschaften"], list)

    ref = mcp_mod.get_api_reference()
    assert "zaehlerstaende-uebersicht" in ref
    assert "pdf-archiv" in ref
    assert "Request-Body-Schemas" in ref

    res = mcp_mod.request("GET", "/version")
    assert res["ok"] is True
    assert res["data"]["version"] == "1.4.0"

    schema = mcp_mod.get_db_schema()
    assert "liegenschaft:" in schema
    assert "mieter:" in schema

    rows = mcp_mod.query_db("SELECT id, name FROM liegenschaft")
    assert isinstance(rows, list) and len(rows) >= 1

    blocked = mcp_mod.query_db("DELETE FROM liegenschaft")
    assert isinstance(blocked, dict) and "error" in blocked



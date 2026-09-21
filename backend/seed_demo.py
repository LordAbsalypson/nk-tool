"""Erzeugt einen komplett synthetischen Demo-Datensatz — für README-Screenshots
und zum risikolosen Ausprobieren des Tools, ohne eigene Daten einzugeben.

Alle Namen/Adressen/Beträge sind frei erfunden. Schreibt IMMER in die per
``NK_TOOL_DB_PATH`` gewählte Datei — niemals in ``nk_tool.db`` oder
``nk_tool_test.db``. Das Skript bricht sicherheitshalber ab, falls
``NK_TOOL_DB_PATH`` versehentlich auf eine dieser beiden Dateien zeigt oder
gar nicht gesetzt ist.

Verwendung:
    cd backend
    NK_TOOL_DB_PATH=nk_tool_demo.db python3 seed_demo.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

_DB_PATH_ENV = os.environ.get("NK_TOOL_DB_PATH")
if not _DB_PATH_ENV:
    sys.exit("Abbruch: NK_TOOL_DB_PATH ist nicht gesetzt (siehe Docstring dieser Datei).")
_resolved = Path(_DB_PATH_ENV).resolve()
_verboten = {(Path(__file__).parent / n).resolve() for n in ("nk_tool.db", "nk_tool_test.db")}
if _resolved in _verboten:
    sys.exit(
        f"Abbruch: NK_TOOL_DB_PATH zeigt auf {_resolved.name} — das ist eine echte "
        "Arbeitsdatenbank. Dieses Skript darf ausschließlich gegen eine separate "
        "Demo-Datei laufen, z. B. nk_tool_demo.db."
    )

import database  # noqa: E402  (Pfad wird oben validiert, bevor die Engine erstellt wird)
import models  # noqa: E402

models.Base.metadata.create_all(bind=database.engine)
db = database.SessionLocal()

try:
    lieg = models.Liegenschaft(
        name="Musterstraße 12",
        adresse="Musterstraße 12",
        plz="97070",
        ort="Würzburg",
        heizungsart="gas",
        brennstoff_einheit="m3_gas",
    )
    db.add(lieg)
    db.flush()

    periode = models.Abrechnungsperiode(
        liegenschaft_id=lieg.id,
        bezeichnung="01.06.2025 – 31.05.2026",
        von_datum="2025-06-01",
        bis_datum="2026-05-31",
    )
    db.add(periode)
    db.flush()

    WOHNUNGEN = [
        dict(bezeichnung="Whg 1", flaeche_m2=52.0),
        dict(bezeichnung="Whg 2", flaeche_m2=45.0),
        dict(bezeichnung="Whg 3", flaeche_m2=68.0),
    ]
    MIETER_NAMEN = ["Familie Beispiel", "Max Mustermann", "Erika Musterfrau"]
    VZ = [140.0, 115.0, 175.0]
    WAERME_VERBRAUCH = [4200.0, 3100.0, 5400.0]
    KALTWASSER_VERBRAUCH = [62.0, 41.0, 88.0]

    for i, wdata in enumerate(WOHNUNGEN):
        w = models.Wohnung(liegenschaft_id=lieg.id, **wdata)
        db.add(w)
        db.flush()

        mieter = models.Mieter(
            wohnung_id=w.id,
            anzeigename=MIETER_NAMEN[i],
            einzug_datum="2024-01-01",
            anzahl_personen=2,
            monatliche_vorauszahlung=VZ[i],
        )
        db.add(mieter)
        db.flush()

        for monat, jahr in [
            (6, 2025), (7, 2025), (8, 2025), (9, 2025), (10, 2025), (11, 2025),
            (12, 2025), (1, 2026), (2, 2026), (3, 2026), (4, 2026), (5, 2026),
        ]:
            db.add(
                models.Vorauszahlung(
                    mieter_id=mieter.id,
                    abrechnungsperiode_id=periode.id,
                    monat=monat,
                    jahr=jahr,
                    betrag_soll=VZ[i],
                    betrag_ist=VZ[i],
                )
            )

        z_waerme = models.Zaehler(wohnung_id=w.id, typ="waerme_kwh", geraete_nummer=f"WRM-{i + 1:03d}")
        z_kalt = models.Zaehler(wohnung_id=w.id, typ="kaltwasser_m3", geraete_nummer=f"KW-{i + 1:03d}")
        db.add_all([z_waerme, z_kalt])
        db.flush()

        db.add_all(
            [
                models.Zaehlerstand(
                    zaehler_id=z_waerme.id,
                    abrechnungsperiode_id=periode.id,
                    ablesedatum="2025-06-01",
                    wert=10000.0,
                    art="periode_start",
                ),
                models.Zaehlerstand(
                    zaehler_id=z_waerme.id,
                    abrechnungsperiode_id=periode.id,
                    ablesedatum="2026-05-31",
                    wert=10000.0 + WAERME_VERBRAUCH[i],
                    art="periode_ende",
                ),
                models.Zaehlerstand(
                    zaehler_id=z_kalt.id,
                    abrechnungsperiode_id=periode.id,
                    ablesedatum="2025-06-01",
                    wert=500.0,
                    art="periode_start",
                ),
                models.Zaehlerstand(
                    zaehler_id=z_kalt.id,
                    abrechnungsperiode_id=periode.id,
                    ablesedatum="2026-05-31",
                    wert=500.0 + KALTWASSER_VERBRAUCH[i],
                    art="periode_ende",
                ),
            ]
        )

    k_grundsteuer = models.DirektKostenart(name="Grundsteuer", verteilungsbasis="m2")
    k_hauswart = models.DirektKostenart(name="Hauswart", verteilungsbasis="einheit")
    k_heizung = models.DirektKostenart(
        name="Heizkosten", verteilungsbasis="kwh_heizung", hat_grundkosten_split=True
    )
    db.add_all([k_grundsteuer, k_hauswart, k_heizung])
    db.flush()

    db.add_all(
        [
            models.DirektKostenartWert(
                abrechnungsperiode_id=periode.id, kostenart_id=k_grundsteuer.id, preis_pro_einheit=2.10
            ),
            models.DirektKostenartWert(
                abrechnungsperiode_id=periode.id, kostenart_id=k_hauswart.id, preis_pro_einheit=180.0
            ),
            models.DirektKostenartWert(
                abrechnungsperiode_id=periode.id,
                kostenart_id=k_heizung.id,
                preis_grund_pro_m2=3.20,
                preis_verbrauch_pro_einheit=0.12,
            ),
        ]
    )

    db.commit()
    print(f"Demo-Datensatz erstellt in: {_resolved}")
    print(f"Liegenschaft-ID: {lieg.id} — {lieg.name}")
    print(f"Periode-ID: {periode.id} — {periode.bezeichnung}")
finally:
    db.close()

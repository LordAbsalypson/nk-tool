"""Synthetic object builders for engine regression tests.

Every value here is invented (fictional street/tenant names, round test
numbers) — deliberately NOT derived from ``backup_safe/`` or any other real
data snapshot. See ``test_schluessel_engine.py`` module docstring for why:
these tests must run in CI (where no real-data backup exists) and must never
embed real financial figures in code that syncs to the public repo.

Each test gets its own fully isolated in-memory SQLite database via
``in_memory_session()`` — nothing here ever touches a file on disk, so there
is no way for these tests to affect ``nk_tool.db``/``nk_tool_test.db``.
"""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

import models


def in_memory_session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    return factory()


def make_liegenschaft(db: Session, **kwargs) -> models.Liegenschaft:
    defaults = dict(name="Teststraße 1", adresse="Teststraße 1", plz="12345", ort="Musterstadt")
    defaults.update(kwargs)
    lieg = models.Liegenschaft(**defaults)
    db.add(lieg)
    db.flush()
    return lieg


def make_wohnung(db: Session, liegenschaft: models.Liegenschaft, **kwargs) -> models.Wohnung:
    defaults = dict(bezeichnung="Whg 1", flaeche_m2=50.0)
    defaults.update(kwargs)
    w = models.Wohnung(liegenschaft_id=liegenschaft.id, **defaults)
    db.add(w)
    db.flush()
    return w


def make_mieter(db: Session, wohnung: models.Wohnung, **kwargs) -> models.Mieter:
    defaults = dict(anzeigename="Testmieter A", einzug_datum="2025-06-01", anzahl_personen=1)
    defaults.update(kwargs)
    m = models.Mieter(wohnung_id=wohnung.id, **defaults)
    db.add(m)
    db.flush()
    return m


def make_periode(db: Session, liegenschaft: models.Liegenschaft, **kwargs) -> models.Abrechnungsperiode:
    defaults = dict(bezeichnung="Testperiode", von_datum="2025-06-01", bis_datum="2026-05-31")
    defaults.update(kwargs)
    p = models.Abrechnungsperiode(liegenschaft_id=liegenschaft.id, **defaults)
    db.add(p)
    db.flush()
    return p


def make_zaehler(db: Session, wohnung: models.Wohnung, typ: str, **kwargs) -> models.Zaehler:
    z = models.Zaehler(wohnung_id=wohnung.id, typ=typ, **kwargs)
    db.add(z)
    db.flush()
    return z


def make_zaehlerstand(
    db: Session, zaehler: models.Zaehler, periode: models.Abrechnungsperiode, **kwargs
) -> models.Zaehlerstand:
    zs = models.Zaehlerstand(zaehler_id=zaehler.id, abrechnungsperiode_id=periode.id, **kwargs)
    db.add(zs)
    db.flush()
    return zs


def make_direkt_kostenart(db: Session, **kwargs) -> models.DirektKostenart:
    defaults = dict(name="Testkostenart", verteilungsbasis="m2", hat_grundkosten_split=False)
    defaults.update(kwargs)
    k = models.DirektKostenart(**defaults)
    db.add(k)
    db.flush()
    return k


def make_direkt_kostenart_wert(
    db: Session, periode: models.Abrechnungsperiode, kostenart: models.DirektKostenart, **kwargs
) -> models.DirektKostenartWert:
    w = models.DirektKostenartWert(
        abrechnungsperiode_id=periode.id, kostenart_id=kostenart.id, **kwargs
    )
    db.add(w)
    db.flush()
    return w

"""Einmalige Migration: SchluesselPreis (13 feste Keys) -> DirektKostenart +
DirektKostenartWert (konfigurierbare Kacheln).

Verlustfrei, keine Neuableitung: die migrierten Sätze sind exakt die zuvor
eingetragenen Werte, nicht aus einem Verhältnis neu berechnet. SchluesselPreis
bleibt als Tabelle bestehen (kein Drop) — nur nicht mehr aktiv genutzt.

Aufruf: python3 migrate_direkt_kostenarten.py
"""

from database import SessionLocal
from models import DirektKostenart, DirektKostenartWert, SchluesselPreis

# (Name, Verteilungsbasis, hat_split, [alte Schlüssel für preis_pro_einheit ODER (grund_key, verbrauch_key)])
KOSTENARTEN_PLAN: list[tuple[str, str, bool, str | tuple[str, str]]] = [
    ("Heizung", "kwh_heizung", True, ("heizung_grundkosten_m2", "heizung_verbrauch_kwh")),
    ("Warmwasser", "m3_warmwasser", True, ("warmwasser_grundkosten_m2", "warmwasser_verbrauch_m3")),
    ("Ab- und Kaltwasser", "m3_wasser_gesamt", False, "wasser_abwasser_m3"),
    ("Grundsteuer", "m2", False, "grundsteuer_m2"),
    ("Versicherung", "einheit", False, "versicherung_einheit"),
    ("Reinigung & Hauswart", "m2", False, "reinigung_m2"),
    ("Müll", "person", False, "muell_person"),
    ("Bodenversiegelung/Regenwasser", "einheit", False, "regenwasser_einheit"),
    ("Allg. Strom (nach m²)", "m2", False, "strom_m2"),
    ("Allg. Strom (nach Personen)", "person", False, "strom_person"),
    ("Wartung", "m2", False, "wartung_m2"),
]


def main() -> None:
    db = SessionLocal()
    try:
        if db.query(DirektKostenart).count() > 0:
            print("DirektKostenart bereits befüllt — Migration übersprungen (idempotent).")
            return

        alle_preise = db.query(SchluesselPreis).all()
        preise_je_periode: dict[int, dict[str, float]] = {}
        for p in alle_preise:
            preise_je_periode.setdefault(p.abrechnungsperiode_id, {})[p.schluessel] = p.preis

        kostenart_by_name: dict[str, DirektKostenart] = {}
        for sort, (name, basis, split, keys) in enumerate(KOSTENARTEN_PLAN):
            ka = DirektKostenart(
                name=name,
                verteilungsbasis=basis,
                hat_grundkosten_split=split,
                nur_liegenschaft_id=None,
                sortierung=(sort + 1) * 10,
                aktiv=True,
            )
            db.add(ka)
            db.flush()  # id verfügbar machen
            kostenart_by_name[name] = ka
            print(f"DirektKostenart angelegt: {name} (id={ka.id}, basis={basis}, split={split})")

        anzahl_werte = 0
        for periode_id, preise in preise_je_periode.items():
            for name, basis, split, keys in KOSTENARTEN_PLAN:
                ka = kostenart_by_name[name]
                if split:
                    assert isinstance(keys, tuple)
                    grund_key, verbrauch_key = keys
                    grund = preise.get(grund_key)
                    verbrauch = preise.get(verbrauch_key)
                    if grund is None and verbrauch is None:
                        continue
                    db.add(
                        DirektKostenartWert(
                            abrechnungsperiode_id=periode_id,
                            kostenart_id=ka.id,
                            preis_grund_pro_m2=grund,
                            preis_verbrauch_pro_einheit=verbrauch,
                            verhaeltnis_grund=0.30,  # nur Anzeige-Default, keine Rückrechnung
                            saetze_manuell_angepasst=True,  # waren unabhängige Sätze, nicht Split-abgeleitet
                        )
                    )
                    anzahl_werte += 1
                else:
                    assert isinstance(keys, str)
                    wert = preise.get(keys)
                    if wert is None:
                        continue
                    db.add(
                        DirektKostenartWert(
                            abrechnungsperiode_id=periode_id,
                            kostenart_id=ka.id,
                            preis_pro_einheit=wert,
                        )
                    )
                    anzahl_werte += 1

        db.commit()
        print(f"\n{len(kostenart_by_name)} Kostenarten, {anzahl_werte} Werte migriert.")
    finally:
        db.close()


if __name__ == "__main__":
    main()

"""EINMALIGES Migrationsskript für die reale 2025/26-Periode: alte
Kostenart/Kostenposition-Rechnungsdaten (Modell vor "Direkt-Preise-Ansatz")
-> DirektKostenart/DirektKostenartWert (aktuelles Modell, das die Live-UI
liest).

WICHTIG: Läuft standardmäßig als DRY RUN (nur Ausgabe, keine Schreibaktion).
Erst mit --write UND nach expliziter Bestätigung durch den Nutzer ausführen.

Migriert NUR die 6 Kostenarten, deren €/Wohnung-Rate (Verteilungsbasis
"einheit", aktuelle Wohnungsanzahl 10:7) beide echten Rechnungsbeträge exakt
(< 2 Cent Abweichung) reproduziert — verifiziert gegen die tatsächlichen
Kostenposition-Beträge in der importierten DB:
  Allgemeinstrom, Emissionsmessung (Schornsteinfeger), Grundsteuer,
  Reinigung/Hauswart, Versicherungen, Wartungskosten Heizung.

BEWUSST NICHT automatisch migriert (Ratio aus aktuellen Mieter-Personenzahlen
stimmt nicht mit dem tatsächlich verwendeten Verteilverhältnis der echten
Rechnung überein — vermutlich unterjähriger Mieterwechsel, den die
vereinfachten aktuellen Mieter-Datensätze nicht abbilden):
  Müllabfuhr, Regenwasser (Personen-Basis)
Ebenfalls NICHT migriert (Verbrauchsdaten/Zählerstände in der DB noch
unvollständig, siehe NEBENKOSTEN_STATUS.md):
  Brennstoffkosten (Gas), Kalt- u. Abwasser

Für diese 4 wird trotzdem eine DirektKostenart-Kachel angelegt (damit sie in
der Kostenarten-Tab sichtbar ist), aber OHNE Preis — erscheint in der UI als
"noch nicht eingetragen", statt einen falschen Wert stillschweigend zu zeigen.

Usage:
    python3 migrate_kostenart_2025_26_dry.py            # Dry Run (Standard)
    python3 migrate_kostenart_2025_26_dry.py --write     # tatsächlich schreiben
"""

from __future__ import annotations

import sys

from database import SessionLocal
from models import (
    DirektKostenart,
    DirektKostenartWert,
    Kostenart,
    Kostenposition,
    Wohnung,
)

# (Name im alten Modell -> Name im neuen Modell, sortierung)
SICHERE_KOSTENARTEN = [
    ("Allgemeinstrom", "Allgemeinstrom", 10),
    ("Emissionsmessung", "Schornsteinfeger", 20),
    ("Grundsteuer", "Grundsteuer", 30),
    ("Reinigung / Hauswart", "Reinigung & Hauswart", 40),
    ("Versicherungen", "Versicherungen", 50),
    ("Wartungskosten Heizung", "Heizungswartung", 60),
]

# Kostenarten, die als leere Kachel angelegt werden (Preis fehlt bewusst)
LEERE_KOSTENARTEN = [
    ("Brennstoffkosten", "Gas", "kwh_heizung", 70),
    ("Kalt- u. Abwasser", "Wasser (Kalt+Abwasser)", "m3_wasser_gesamt", 80),
    ("Müllabfuhr", "Müllabfuhr", "person", 90),
    ("Regenwasser", "Bodenversiegelung/Regenwasser", "person", 100),
]

TOLERANZ = 0.02  # 2 Cent


def main(write: bool) -> None:
    db = SessionLocal()
    try:
        if db.query(DirektKostenart).count() > 0:
            print("DirektKostenart bereits befüllt — Migration übersprungen (idempotent-Schutz).")
            return

        # Periode(n) ermitteln (eine je Liegenschaft, gleicher Zeitraum)
        alle_perioden = db.execute(
            __import__("sqlalchemy").text("SELECT id, liegenschaft_id FROM abrechnungsperiode")
        ).fetchall()
        periode_by_liegenschaft = {row.liegenschaft_id: row.id for row in alle_perioden}
        print(f"Perioden gefunden: {dict(periode_by_liegenschaft)}")

        wohnungsanzahl: dict[int, int] = {}
        for lid in periode_by_liegenschaft:
            n = db.query(Wohnung).filter(Wohnung.liegenschaft_id == lid, Wohnung.aktiv.is_(True)).count()
            wohnungsanzahl[lid] = n
        print(f"Wohnungsanzahl je Liegenschaft: {wohnungsanzahl}")
        print()

        def summe(kostenart_name: str, liegenschaft_id: int) -> float:
            rows = (
                db.query(Kostenposition)
                .join(Kostenart, Kostenart.id == Kostenposition.kostenart_id)
                .filter(Kostenart.name == kostenart_name, Kostenart.liegenschaft_id == liegenschaft_id)
                .all()
            )
            return sum(r.betrag_brutto for r in rows)

        liegenschaft_ids = sorted(periode_by_liegenschaft.keys())
        if len(liegenschaft_ids) != 2:
            print(f"ABBRUCH: erwarte genau 2 Liegenschaften, gefunden: {liegenschaft_ids}")
            return
        lid_a, lid_b = liegenschaft_ids
        n_a, n_b = wohnungsanzahl[lid_a], wohnungsanzahl[lid_b]

        print("=== Sichere Kostenarten (werden migriert) ===")
        plan: list[tuple[str, float, dict[int, float]]] = []
        for alt_name, neu_name, sort in SICHERE_KOSTENARTEN:
            betrag_a = summe(alt_name, lid_a)
            betrag_b = summe(alt_name, lid_b)
            gesamt = betrag_a + betrag_b
            if gesamt == 0:
                print(f"  {alt_name}: keine Kostenposition gefunden — übersprungen.")
                continue
            rate = gesamt / (n_a + n_b)
            soll_a = rate * n_a
            soll_b = rate * n_b
            ok = abs(soll_a - betrag_a) < TOLERANZ and abs(soll_b - betrag_b) < TOLERANZ
            status = "OK" if ok else "MISMATCH -- WIRD NICHT GESCHRIEBEN"
            print(
                f"  {alt_name:28} -> {neu_name:28} rate={rate:9.4f} €/Whg  "
                f"L{lid_a}: soll={soll_a:8.2f} ist={betrag_a:8.2f}  "
                f"L{lid_b}: soll={soll_b:8.2f} ist={betrag_b:8.2f}  [{status}]"
            )
            if ok:
                plan.append((neu_name, sort, rate))

        print()
        print("=== Leere Kacheln (Preis fehlt bewusst, s. Docstring) ===")
        for alt_name, neu_name, basis, sort in LEERE_KOSTENARTEN:
            betrag_a = summe(alt_name, lid_a)
            betrag_b = summe(alt_name, lid_b)
            print(f"  {alt_name:28} -> {neu_name:28} (real: L{lid_a}={betrag_a:.2f} L{lid_b}={betrag_b:.2f}, Basis={basis})")

        print()
        if not write:
            print(">>> DRY RUN — nichts geschrieben. Mit --write erneut aufrufen, um zu übernehmen.")
            return

        print(">>> SCHREIBE jetzt in die Datenbank ...")
        for neu_name, sort, rate in plan:
            ka = DirektKostenart(
                name=neu_name, verteilungsbasis="einheit", hat_grundkosten_split=False,
                nur_liegenschaft_id=None, sortierung=sort, aktiv=True,
            )
            db.add(ka)
            db.flush()
            for pid in periode_by_liegenschaft.values():
                db.add(DirektKostenartWert(abrechnungsperiode_id=pid, kostenart_id=ka.id, preis_pro_einheit=round(rate, 4)))
            print(f"  geschrieben: {neu_name} ({rate:.4f} €/Whg)")

        for alt_name, neu_name, basis, sort in LEERE_KOSTENARTEN:
            ka = DirektKostenart(
                name=neu_name, verteilungsbasis=basis, hat_grundkosten_split=False,
                nur_liegenschaft_id=None, sortierung=sort, aktiv=True,
            )
            db.add(ka)
            print(f"  Kachel ohne Preis angelegt: {neu_name} (Basis {basis})")

        db.commit()
        print("Fertig.")
    finally:
        db.close()


if __name__ == "__main__":
    main(write="--write" in sys.argv)

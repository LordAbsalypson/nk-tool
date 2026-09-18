from sqlalchemy.orm import Session
from models import Kostenart

DEFAULT_KOSTENARTEN = [
    # (name, verteilungsschluessel, kategorie, ist_brennstoff, ist_heiz_zusatz, ist_ww_zusatz, sortierung)
    ("Brennstoffkosten",           "verbrauch_kwh_heizung",         "brennstoff",        True,  False, False, 10),
    ("Wartungskosten Heizung",     "nutzeinheit",                   "heiznebenkosten",   True,  False, False, 20),
    ("Reinigungskosten Heizung",   "nutzeinheit",                   "heiznebenkosten",   True,  False, False, 30),
    ("Emissionsmessung",           "nutzeinheit",                   "heiznebenkosten",   True,  False, False, 40),
    ("Geb.Verbrauchserfassung",    "nutzeinheit",                   "heiznebenkosten",   True,  False, False, 50),
    ("Kosten Geräte Heizung",      "nutzeinheit",                   "heizung_zusatz",    False, True,  False, 60),
    ("Kosten Geräte Warmwasser",   "nutzeinheit",                   "warmwasser_zusatz", False, False, True,  70),
    ("Versicherungen",             "nutzeinheit",                   "hausnebenkosten",   False, False, False, 80),
    ("Grundsteuer",                "m2_wohnflaeche",                "hausnebenkosten",   False, False, False, 90),
    ("Kalt- u. Abwasser",          "verbrauch_m3_kalt_plus_warm",   "hausnebenkosten",   False, False, False, 100),
    ("Reinigung / Hauswart",       "m2_wohnflaeche",                "hausnebenkosten",   False, False, False, 110),
    ("Müllabfuhr",                 "personen",                      "hausnebenkosten",   False, False, False, 120),
    ("Wasser-/Bodenverband",       "nutzeinheit",                   "hausnebenkosten",   False, False, False, 130),
    ("Regenwasser",                "nutzeinheit",                   "hausnebenkosten",   False, False, False, 140),
    ("Allgemeinstrom",             "m2_wohnflaeche",                "hausnebenkosten",   False, False, False, 150),
    ("Fkts-Analyse Service (RWM)", "anzahl_rwm",                    "hausnebenkosten",   False, False, False, 160),
    ("Funktionsprüfung RWM",       "anzahl_rwm",                    "hausnebenkosten",   False, False, False, 170),
    ("Miete RWM",                  "miete_rwm",                     "hausnebenkosten",   False, False, False, 180),
    ("Kosten Geräte Kaltwasser",   "anzahl_kaltwasserzaehler",      "hausnebenkosten",   False, False, False, 190),
]


def seed_kostenarten(db: Session, liegenschaft_id: int) -> None:
    for name, schluessel, kategorie, brennstoff, heiz_zusatz, ww_zusatz, sortierung in DEFAULT_KOSTENARTEN:
        db.add(Kostenart(
            liegenschaft_id=liegenschaft_id,
            name=name,
            verteilungsschluessel=schluessel,
            kategorie=kategorie,
            ist_brennstoff=brennstoff,
            ist_heiz_zusatz=heiz_zusatz,
            ist_ww_zusatz=ww_zusatz,
            sortierung=sortierung,
            ist_voreinstellung=True,
        ))
    db.commit()

"""Domain string vocabulary — typed constants for values persisted in the DB.

IMPORTANT: the string values are part of the persisted data contract.
Existing ``mieter_kostenanteil`` rows contain them literally and the Stage 3
frontend matches on them verbatim — never change a value, only add new ones.
Using ``Literal`` aliases (not ``Enum``) guarantees the serialized form stays
byte-identical while still giving mypy/pyright compile-time checking.
"""

from typing import Final, Literal

# ── MieterKostenanteil.pool ──────────────────────────────────────────────────

Pool = Literal["heiz_grund", "heiz_verbrauch", "ww_grund", "ww_verbrauch", "strom"]

POOL_HEIZ_GRUND: Final[Pool] = "heiz_grund"
POOL_HEIZ_VERBRAUCH: Final[Pool] = "heiz_verbrauch"
POOL_WW_GRUND: Final[Pool] = "ww_grund"
POOL_WW_VERBRAUCH: Final[Pool] = "ww_verbrauch"
POOL_STROM: Final[Pool] = "strom"

# ── MieterKostenanteil.traeger ───────────────────────────────────────────────

Traeger = Literal["mieter", "vermieter"]

TRAEGER_MIETER: Final[Traeger] = "mieter"
TRAEGER_VERMIETER: Final[Traeger] = "vermieter"

# ── Zaehler.typ ──────────────────────────────────────────────────────────────

ZaehlerTyp = Literal[
    "waerme_kwh", "hkv_einheiten", "warmwasser_m3", "kaltwasser_m3", "strom_kwh"
]

TYP_WAERME_KWH: Final[ZaehlerTyp] = "waerme_kwh"
TYP_HKV_EINHEITEN: Final[ZaehlerTyp] = "hkv_einheiten"
TYP_WARMWASSER_M3: Final[ZaehlerTyp] = "warmwasser_m3"
TYP_KALTWASSER_M3: Final[ZaehlerTyp] = "kaltwasser_m3"
TYP_STROM_KWH: Final[ZaehlerTyp] = "strom_kwh"

# ── Zaehlerstand.art ─────────────────────────────────────────────────────────

ZaehlerstandArt = Literal[
    "periode_start", "periode_ende", "zwischenablesung", "ewe_ablesung"
]

ART_PERIODE_START: Final[ZaehlerstandArt] = "periode_start"
ART_PERIODE_ENDE: Final[ZaehlerstandArt] = "periode_ende"
ART_ZWISCHENABLESUNG: Final[ZaehlerstandArt] = "zwischenablesung"
ART_EWE_ABLESUNG: Final[ZaehlerstandArt] = "ewe_ablesung"

# ── Kostenart.verteilungsschluessel ──────────────────────────────────────────

Verteilungsschluessel = Literal[
    "nutzeinheit",
    "m2_wohnflaeche",
    "personen",
    "verbrauch_kwh_heizung",
    "verbrauch_m3_warmwasser",
    "verbrauch_m3_kalt_plus_warm",
    "anzahl_rwm",
    "anzahl_kaltwasserzaehler",
    "miete_rwm",
    "strom_kwh_direkt",
    "direkt",
]

VS_NUTZEINHEIT: Final[Verteilungsschluessel] = "nutzeinheit"
VS_M2_WOHNFLAECHE: Final[Verteilungsschluessel] = "m2_wohnflaeche"
VS_PERSONEN: Final[Verteilungsschluessel] = "personen"
VS_VERBRAUCH_KWH_HEIZUNG: Final[Verteilungsschluessel] = "verbrauch_kwh_heizung"
VS_VERBRAUCH_M3_WARMWASSER: Final[Verteilungsschluessel] = "verbrauch_m3_warmwasser"
VS_VERBRAUCH_M3_KALT_PLUS_WARM: Final[Verteilungsschluessel] = "verbrauch_m3_kalt_plus_warm"
VS_ANZAHL_RWM: Final[Verteilungsschluessel] = "anzahl_rwm"
VS_ANZAHL_KALTWASSERZAEHLER: Final[Verteilungsschluessel] = "anzahl_kaltwasserzaehler"
VS_MIETE_RWM: Final[Verteilungsschluessel] = "miete_rwm"
VS_STROM_KWH_DIREKT: Final[Verteilungsschluessel] = "strom_kwh_direkt"
VS_DIREKT: Final[Verteilungsschluessel] = "direkt"

from datetime import date
from typing import Any, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ── Liegenschaft ────────────────────────────────────────────────────────────

class LiegenschaftCreate(BaseModel):
    name: str
    adresse: str
    plz: str
    ort: str
    heizungsart: str = "oel"
    brennstoff_einheit: str = "liter_oel"
    brennstoff_heizwert_kwh: Optional[float] = 10.0
    mittlere_ww_temperatur: float = 60.0
    heiz_grundkosten_anteil: float = 0.30
    ww_grundkosten_anteil: float = 0.30
    co2_klasse: Optional[str] = None
    gemeinschaftsflaeche_m2: float = 0.0

    @field_validator("heiz_grundkosten_anteil", "ww_grundkosten_anteil")
    @classmethod
    def validate_anteil(cls, v: float) -> float:
        if not (0.30 <= v <= 0.50):
            raise ValueError("Grundkostenanteil muss zwischen 30% und 50% liegen")
        return v

    @field_validator("mittlere_ww_temperatur")
    @classmethod
    def validate_ww_temperatur(cls, v: float) -> float:
        if v <= 10.0:
            raise ValueError(
                "Mittlere Warmwassertemperatur muss über 10 °C liegen — die "
                "HKVO §9-Formel rechnet mit (t_w − 10 °C); Werte ≤ 10 °C würden "
                "die Warmwasser/Heizung-Aufteilung unbemerkt verfälschen"
            )
        return v


class LiegenschaftUpdate(LiegenschaftCreate):
    pass


class LiegenschaftOut(LiegenschaftCreate):
    id: int
    erstellt_am: str

    model_config = {"from_attributes": True}


# ── Abrechnungsperiode ───────────────────────────────────────────────────────

class AbrechnungsperiodeCreate(BaseModel):
    bezeichnung: str
    von_datum: str
    bis_datum: str
    status: str = "offen"
    # Fester Gaspreis €/kWh (ersetzt HKVO-Umlage im Verbrauchsanteil, solange gesetzt)
    heiz_preis_kwh: Optional[float] = None
    # Referenz: Hausbezug laut Versorger (nur Plausibilitäts-Anzeige)
    referenz_gas_kwh: Optional[float] = None
    referenz_wasser_m3: Optional[float] = None

    @field_validator("von_datum", "bis_datum")
    @classmethod
    def validate_iso_datum(cls, v: str) -> str:
        try:
            date.fromisoformat(v)
        except ValueError:
            raise ValueError(f"Kein gültiges Datum (erwartet JJJJ-MM-TT): {v!r}")
        return v

    @model_validator(mode="after")
    def validate_zeitraum(self) -> "AbrechnungsperiodeCreate":
        if self.bis_datum <= self.von_datum:
            raise ValueError(
                "Enddatum muss nach dem Startdatum liegen — sonst hätte die "
                "Periode 0 Tage und alle Mieteranteile würden stillschweigend "
                "auf 0 € berechnet"
            )
        return self


class AbrechnungsperiodeUpdate(AbrechnungsperiodeCreate):
    pass


class AbrechnungsperiodeOut(AbrechnungsperiodeCreate):
    id: int
    liegenschaft_id: int
    erstellt_am: str

    model_config = {"from_attributes": True}


# ── Wohnung ──────────────────────────────────────────────────────────────────

class WohnungCreate(BaseModel):
    bezeichnung: str
    flaeche_m2: float
    anzahl_rwm: int = 0

    @field_validator("flaeche_m2")
    @classmethod
    def validate_flaeche(cls, v: float) -> float:
        if v <= 0:
            raise ValueError(
                "Wohnfläche muss größer als 0 m² sein — bei 0 m² würde der "
                "Mieteranteil in allen flächenbasierten Kosten stillschweigend "
                "auf 0 € gesetzt"
            )
        return v

    strom_ueber_vermieter: bool = False
    strom_preis_kwh: Optional[float] = None
    strom_bezug_ab: Optional[str] = None
    sortierung: int = 0
    aktiv: bool = True


class WohnungUpdate(WohnungCreate):
    pass


class WohnungOut(WohnungCreate):
    id: int
    liegenschaft_id: int

    model_config = {"from_attributes": True}


# ── Mieter ───────────────────────────────────────────────────────────────────

class MieterCreate(BaseModel):
    anzeigename: str
    einzug_datum: str
    auszug_datum: Optional[str] = None
    anzahl_personen: int = 1
    monatliche_vorauszahlung: float = 0.0
    ist_leerstand: bool = False
    notizen: Optional[str] = None


class MieterUpdate(MieterCreate):
    pass


class MieterNamePatch(BaseModel):
    anzeigename: str = Field(min_length=1)


class MieterOut(MieterCreate):
    id: int
    wohnung_id: int

    model_config = {"from_attributes": True}


# ── Zähler ───────────────────────────────────────────────────────────────────

class ZaehlerCreate(BaseModel):
    typ: str
    geraete_nummer: Optional[str] = None
    bezeichnung: Optional[str] = None
    eingebaut_am: Optional[str] = None
    aktiv: bool = True
    # EWE-Referenz: Vertragsnummer des EWE-Hauptzählers (z. B. "1003384777")
    ewe_vertragsnummer: Optional[str] = None


class ZaehlerUpdate(ZaehlerCreate):
    pass


class ZaehlerOut(ZaehlerCreate):
    id: int
    wohnung_id: int

    model_config = {"from_attributes": True}


# ── Kostenart ────────────────────────────────────────────────────────────────

class KostenartCreate(BaseModel):
    name: str
    verteilungsschluessel: str
    kategorie: str
    ist_brennstoff: bool = False
    ist_heiz_zusatz: bool = False
    ist_ww_zusatz: bool = False
    sortierung: int = 0
    aktiv: bool = True
    ist_voreinstellung: bool = False


class KostenartUpdate(KostenartCreate):
    pass


class KostenartOut(KostenartCreate):
    id: int
    liegenschaft_id: int

    model_config = {"from_attributes": True}


# ── Kostenposition ───────────────────────────────────────────────────────────

class KostenpositonCreate(BaseModel):
    kostenart_id: int
    betrag_brutto: float = Field(gt=0)
    betrag_netto: Optional[float] = None
    mwst_prozent: Optional[float] = None
    datum: str
    beschreibung: str
    beleg_nr: Optional[str] = None
    split_gruppe: Optional[str] = None

    @field_validator("datum")
    @classmethod
    def validate_datum(cls, v: str) -> str:
        # DB-Spalte ist NOT NULL — ohne Guard gäbe es hier einen 500er IntegrityError
        if not v:
            raise ValueError("Datum ist erforderlich (Rechnungs-/Belegdatum)")
        try:
            date.fromisoformat(v)
        except ValueError:
            raise ValueError(f"Kein gültiges Datum (erwartet JJJJ-MM-TT): {v!r}")
        return v


class KostenpositonUpdate(BaseModel):
    betrag_brutto: Optional[float] = None
    betrag_netto: Optional[float] = None
    mwst_prozent: Optional[float] = None
    datum: Optional[str] = None
    beschreibung: Optional[str] = None
    beleg_nr: Optional[str] = None

    @field_validator("datum")
    @classmethod
    def validate_datum(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not v:
            raise ValueError("Datum darf nicht leer sein (DB verlangt ein Datum)")
        try:
            date.fromisoformat(v)
        except ValueError:
            raise ValueError(f"Kein gültiges Datum (erwartet JJJJ-MM-TT): {v!r}")
        return v


class KostenpositonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kostenart_id: int
    abrechnungsperiode_id: int
    betrag_brutto: float
    betrag_netto: Optional[float]
    beleg_datei: Optional[str] = None
    mwst_prozent: Optional[float]
    datum: Optional[str]
    beschreibung: str
    beleg_nr: Optional[str]
    split_gruppe: Optional[str] = None
    erstellt_am: str
    # Angereichert (nur im List-Endpunkt): Infos zur verknüpften Aufteilung
    split_gesamt: Optional[float] = None
    split_prozent: Optional[float] = None
    split_partner: Optional[str] = None


class SplitUpdate(BaseModel):
    """Bearbeitet eine verknüpfte Aufteilung als Ganzes: Gesamtbetrag + Verhältnis."""

    betrag_gesamt: float = Field(gt=0)
    # Anteil der Position, über die der Aufruf läuft (in %)
    prozent_hier: float = Field(ge=0, le=100)
    beschreibung: Optional[str] = None
    datum: Optional[str] = None
    beleg_nr: Optional[str] = None


class SplitVerknuepfen(BaseModel):
    partner_id: int


# ── Zaehlerstand ─────────────────────────────────────────────────────────────

class ZaehlerstandCreate(BaseModel):
    periode_id: int
    ablesedatum: str
    wert: float = Field(ge=0)
    art: Literal["periode_start", "periode_ende", "zwischenablesung", "ewe_ablesung"]
    abgelesen_von: Optional[str] = None
    notiz: Optional[str] = None


class ZaehlerstandUpdate(BaseModel):
    ablesedatum: Optional[str] = None
    wert: Optional[float] = None
    art: Optional[str] = None
    abgelesen_von: Optional[str] = None
    notiz: Optional[str] = None


class ZaehlerstandOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    zaehler_id: int
    abrechnungsperiode_id: int
    ablesedatum: str
    wert: float
    art: str
    abgelesen_von: Optional[str]
    notiz: Optional[str]


class ZaehlerstaendeGruppe(BaseModel):
    staende: list[ZaehlerstandOut]
    verbrauch: Optional[float]
    hat_start: bool
    hat_ende: bool
    vorperiode_endwert: Optional[float] = None


# ── Vorauszahlung ─────────────────────────────────────────────────────────────

class VorauszahlungUpdate(BaseModel):
    betrag_ist: Optional[float] = Field(default=None, ge=0)
    betrag_soll: Optional[float] = Field(default=None, ge=0)
    # Nur relevant wenn betrag_soll gesetzt ist: "monat" fixiert nur diese Zeile,
    # "periode" setzt den neuen Mieter-Standard und überschreibt alle nicht
    # individuell fixierten Monate der laufenden Periode.
    scope: Optional[Literal["monat", "periode"]] = None
    bezahlt_am: Optional[str] = None
    notiz: Optional[str] = None


class VorauszahlungGesamtBody(BaseModel):
    ziel: Literal["soll", "ist"]
    betrag_gesamt: float = Field(ge=0)


class VorauszahlungOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    mieter_id: int
    abrechnungsperiode_id: int
    monat: int
    jahr: int
    betrag_soll: float
    betrag_ist: float
    bezahlt_am: Optional[str]
    notiz: Optional[str]
    soll_override: bool
    ist_override: bool


class VorauszahlungGridMonat(BaseModel):
    monat: int
    jahr: int
    label: str


class VorauszahlungGridMieter(BaseModel):
    mieter_id: int
    anzeigename: str
    vorauszahlungen: list[VorauszahlungOut]
    total_soll: float
    total_ist: float


class VorauszahlungGridWohnung(BaseModel):
    wohnung_id: int
    bezeichnung: str
    mieter: list[VorauszahlungGridMieter]


class VorauszahlungGrid(BaseModel):
    monate: list[VorauszahlungGridMonat]
    wohnungen: list[VorauszahlungGridWohnung]


# ── Validation ───────────────────────────────────────────────────────────────

class ValidationMessage(BaseModel):
    typ: Literal["error", "warning", "info"]
    code: str
    message: str
    context: Optional[str] = None


class ValidationResult(BaseModel):
    errors: list[ValidationMessage]
    warnings: list[ValidationMessage]
    infos: list[ValidationMessage]
    kann_berechnen: bool


# ── Phase 3: Berechnung ──────────────────────────────────────────────────────

class MieterKostenanteilOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    mieter_id: int
    abrechnungsperiode_id: int
    kostenart_id: Optional[int]
    bezeichnung: str
    pool: Optional[str]
    betrag_pro_einheit: float
    einheiten: float
    kostenanteil: float
    erlaeuterung: Optional[str]
    traeger: str
    ist_override: bool
    override_wert: Optional[float]
    override_begruendung: Optional[str]
    berechnet_am: str


class BerechnungSummary(BaseModel):
    gesamt_kosten: float
    heiz_gesamt: float
    ww_gesamt: float
    ww_anteil_prozent: Optional[float]
    haus_kosten: float
    positionen_count: int
    mieter_anteil: float
    vermieter_anteil: float
    rows_created: int
    # ista-Stil-Kennzahlen + Referenzvergleich (None solange nicht berechnet/erfasst)
    preis_heiz_kwh: Optional[float] = None
    preis_ww_m3: Optional[float] = None
    summe_heiz_kwh: Optional[float] = None
    summe_wasser_m3: Optional[float] = None
    heiz_preis_fest: Optional[float] = None
    referenz_gas_kwh: Optional[float] = None
    referenz_wasser_m3: Optional[float] = None


class TenantVerteilungRow(BaseModel):
    mieter_id: int
    anzeigename: str
    wohnung_id: int
    wohnung_bezeichnung: str
    kostenanteil_gesamt: float
    vorauszahlungen_gesamt: float
    saldo: float
    ist_leerstand: bool
    traeger: str
    miet_von: Optional[str] = None
    miet_bis: Optional[str] = None


class KostenverteilungResult(BaseModel):
    summary: Optional[BerechnungSummary]
    tenants: list[TenantVerteilungRow]


class AbrechnungPosition(BaseModel):
    bezeichnung: str
    pool: Optional[str] = None
    betrag_pro_einheit: float
    einheiten: float
    kostenanteil: float
    erlaeuterung: Optional[str]
    ist_override: bool
    override_wert: Optional[float]


class AbrechnungResult(BaseModel):
    mieter_id: int
    anzeigename: str
    wohnung_bezeichnung: str
    wohnung_id: int
    periode_bezeichnung: str
    liegenschaft_name: str
    liegenschaft_adresse: str
    positionen: list[AbrechnungPosition]
    gesamt_kostenanteil: float
    vorauszahlungen: list[VorauszahlungOut]
    vorauszahlungen_gesamt: float
    saldo: float
    miet_von: Optional[str] = None
    miet_bis: Optional[str] = None
    miet_tage: Optional[int] = None
    periode_tage_gesamt: Optional[int] = None
    hat_mieterwechsel: bool = False


# ── Todo ─────────────────────────────────────────────────────────────────────

class TodoCreate(BaseModel):
    text: str


class TodoUpdate(BaseModel):
    text: Optional[str] = None
    erledigt: Optional[bool] = None


class TodoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    text: str
    erledigt: bool
    erstellt_am: str
    erledigt_am: Optional[str]


# ── Verbund ──────────────────────────────────────────────────────────────────

class VerbundCreate(BaseModel):
    name: str = Field(min_length=1)


class VerbundUpdate(BaseModel):
    name: str = Field(min_length=1)


class VerbundOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    erstellt_am: str


class VerbundMitgliedCreate(BaseModel):
    liegenschaft_id: int
    sort: int = 0


class VerbundMitgliedOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    verbund_id: int
    liegenschaft_id: int
    sort: int


class VerbundKostenCreate(BaseModel):
    bezeichnung: str = Field(min_length=1)
    betrag_gesamt: float = Field(gt=0)
    schluessel_typ: str  # wohnungsanzahl|wohnflaeche_m2|personen|kwh_gas|m3_wasser|manuell_prozent
    schluessel_werte_json: Optional[str] = None
    datum: Optional[str] = None


class VerbundKostenUpdate(BaseModel):
    bezeichnung: Optional[str] = None
    betrag_gesamt: Optional[float] = Field(default=None, gt=0)
    schluessel_typ: Optional[str] = None
    schluessel_werte_json: Optional[str] = None
    datum: Optional[str] = None


class VerbundKostenOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    verbund_id: int
    bezeichnung: str
    betrag_gesamt: float
    schluessel_typ: str
    schluessel_werte_json: Optional[str]
    datum: Optional[str]
    erstellt_am: str
    angewendet: bool
    anwendung_json: Optional[str]


class VerbundAnwendenLiegenschaftConfig(BaseModel):
    periode_id: int
    kostenart_id: int


class VerbundAnwendenBody(BaseModel):
    # Keys are liegenschaft_id as string (JSON constraint)
    perioden: dict[str, VerbundAnwendenLiegenschaftConfig]


class VerbundAufteilungItem(BaseModel):
    betrag: float
    anteil_prozent: float
    basis_wert: float


class VerbundVorschauResult(BaseModel):
    aufteilung: dict[str, VerbundAufteilungItem]  # key = str(liegenschaft_id)
    gesamt: float


# ── Globale Suche ────────────────────────────────────────────────────────────

class SucheTreffer(BaseModel):
    """Ein Suchergebnis: zeigt den aktuellen Wert und weiß, wohin es gehört."""
    id: str
    kategorie: str
    titel: str
    kontext: str
    wert_text: str
    wert_zahl: Optional[float] = None
    einheit: Optional[str] = None
    # Inline-Änderung (nur gesetzt, wenn das Feld direkt änderbar ist)
    entity_typ: Optional[str] = None
    entity_id: Optional[int] = None
    feld: Optional[str] = None
    # Sprungziel
    liegenschaft_id: int
    stage: int
    tab: str
    periode_id: Optional[int] = None
    score: float = 0.0


class SucheWertPatch(BaseModel):
    entity_typ: str
    entity_id: int
    feld: str
    wert: float


# ── Verbrauchs-Vorgabe bei Mieterwechsel ─────────────────────────────────────

class MieterVerbrauchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    mieter_id: int
    abrechnungsperiode_id: int
    zaehler_typ: str
    wert: float
    notiz: Optional[str]
    als_schaetzung_anzeigen: bool = False


class MieterVerbrauchSet(BaseModel):
    zaehler_typ: Literal[
        "waerme_kwh", "hkv_einheiten", "warmwasser_m3", "kaltwasser_m3", "strom_kwh"
    ]
    # null entfernt die Vorgabe wieder (dann greift die Verteilung nach Tagen)
    wert: Optional[float] = None
    notiz: Optional[str] = None
    als_schaetzung_anzeigen: bool = False


class WohnungVerbrauchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    wohnung_id: int
    abrechnungsperiode_id: int
    zaehler_typ: str
    wert: float
    notiz: Optional[str]


class WohnungVerbrauchSet(BaseModel):
    zaehler_typ: Literal[
        "waerme_kwh", "hkv_einheiten", "warmwasser_m3", "kaltwasser_m3", "strom_kwh"
    ]
    # null entfernt die Vorgabe — dann gilt wieder die berechnete Differenz
    wert: Optional[float] = None
    notiz: Optional[str] = None


# ── Direkt-Preise-Modus (Schlüssel-Sätze statt Rechnungen) ───────────────────

SCHLUESSEL_KEYS_LIST = [
    "heizung_grundkosten_m2",
    "heizung_verbrauch_kwh",
    "warmwasser_grundkosten_m2",
    "warmwasser_verbrauch_m3",
    "wasser_abwasser_m3",
    "grundsteuer_m2",
    "versicherung_einheit",
    "reinigung_m2",
    "muell_person",
    "regenwasser_einheit",
    "strom_m2",
    "strom_person",
    "wartung_m2",
]


DIREKT_VERTEILUNGSBASIS_LIST = [
    "m2", "person", "einheit", "kwh_heizung", "m3_warmwasser", "m3_kaltwasser", "m3_wasser_gesamt",
]


class DirektKostenartCreate(BaseModel):
    name: str
    verteilungsbasis: str
    hat_grundkosten_split: bool = False
    nur_liegenschaft_id: Optional[int] = None
    sortierung: int = 0
    aktiv: bool = True

    @field_validator("verteilungsbasis")
    @classmethod
    def validate_basis(cls, v: str) -> str:
        if v not in DIREKT_VERTEILUNGSBASIS_LIST:
            raise ValueError(f"Unbekannte Verteilungsbasis: {v!r}")
        return v


class DirektKostenartUpdate(DirektKostenartCreate):
    pass


class DirektKostenartOut(DirektKostenartCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class DirektKostenartWertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kostenart_id: int
    preis_pro_einheit: Optional[float]
    verhaeltnis_grund: Optional[float]
    preis_grund_pro_m2: Optional[float]
    preis_verbrauch_pro_einheit: Optional[float]
    saetze_manuell_angepasst: bool


class DirektKostenartWertSet(BaseModel):
    """Setzt den/die Satz/Sätze einer Kostenart für eine Periode.

    Fall A (kein Split): nur ``preis_pro_einheit``.
    Fall B (Split, direkte Satz-Eingabe): ``preis_grund_pro_m2`` +
      ``preis_verbrauch_pro_einheit`` — setzt ``saetze_manuell_angepasst=True``.
    Alle Felder None löscht den Wert wieder (Kostenart fällt aus der Berechnung).
    """

    preis_pro_einheit: Optional[float] = None
    preis_grund_pro_m2: Optional[float] = None
    preis_verbrauch_pro_einheit: Optional[float] = None
    verhaeltnis_grund: Optional[float] = None

    @field_validator("verhaeltnis_grund")
    @classmethod
    def validate_verhaeltnis(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not (0.30 <= v <= 0.50):
            raise ValueError("Verhältnis Grundkosten muss zwischen 30% und 50% liegen (HeizkostenV §7)")
        return v


class DirektSplitRechner(BaseModel):
    """Split-Rechner: Gesamtbetrag + Gesamteinheiten je Basis + Verhältnis →
    zwei abgeleitete Sätze. Setzt saetze_manuell_angepasst=False (automatisch
    abgeleitet, nicht von Hand)."""

    gesamtbetrag: float = Field(gt=0)
    gesamt_m2: float = Field(gt=0)
    gesamt_verbrauch: float = Field(gt=0)
    verhaeltnis_grund: float = Field(ge=0.30, le=0.50)


class DirektUebersteuerungOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    mieter_id: Optional[int]
    wohnung_id: Optional[int]
    kostenart_id: Optional[int]
    feld: str
    wert: float
    begruendung: Optional[str]


class DirektUebersteuerungSet(BaseModel):
    feld: Literal["personen", "flaeche_m2", "betrag"]
    mieter_id: Optional[int] = None
    wohnung_id: Optional[int] = None
    kostenart_id: Optional[int] = None
    wert: Optional[float] = None  # None löscht die Übersteuerung wieder
    begruendung: Optional[str] = None

    @model_validator(mode="after")
    def validate_scope(self) -> "DirektUebersteuerungSet":
        if self.feld == "flaeche_m2" and self.wohnung_id is None:
            raise ValueError("flaeche_m2-Übersteuerung braucht wohnung_id")
        if self.feld in ("personen", "betrag") and self.mieter_id is None:
            raise ValueError(f"{self.feld}-Übersteuerung braucht mieter_id")
        if self.feld == "betrag" and self.kostenart_id is None:
            raise ValueError("betrag-Übersteuerung braucht kostenart_id")
        return self


class VorschauKostenartWert(DirektKostenartWertSet):
    """Wie DirektKostenartWertSet, nur mit kostenart_id, da im Ausprobieren-
    Modus mehrere Kostenarten gleichzeitig probeweise geändert werden."""

    kostenart_id: int


class VorschauVerbrauchOverride(BaseModel):
    """Verbrauchswert probeweise überschreiben — genau eines von wohnung_id/
    mieter_id setzen (Wohnung: kein Mieterwechsel in der Periode; Mieter: bei
    Mieterwechsel nur dieses Segment)."""

    wohnung_id: Optional[int] = None
    mieter_id: Optional[int] = None
    zaehler_typ: Literal["waerme_kwh", "hkv_einheiten", "warmwasser_m3", "kaltwasser_m3", "strom_kwh"]
    wert: float


class VorschauRequest(BaseModel):
    """Rein lesende Live-Vorschau (Ausprobieren-Modus): Overrides werden nur
    innerhalb der Berechnung angewendet, nie persistiert."""

    uebersteuerungen: list[DirektUebersteuerungSet] = []
    kostenart_werte: list[VorschauKostenartWert] = []
    verbrauch_overrides: list[VorschauVerbrauchOverride] = []


class SchluesselPreisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    schluessel: str
    preis: float


class SchluesselPreiseSet(BaseModel):
    """Alle 12 Sätze in einem Aufruf setzen. Fehlende Keys werden nicht
    angetastet — ein leeres/None-Feld entfernt den Satz wieder (Kostenart
    fällt aus der Berechnung, statt mit 0 gerechnet zu werden)."""

    heizung_grundkosten_m2: Optional[float] = None
    heizung_verbrauch_kwh: Optional[float] = None
    warmwasser_grundkosten_m2: Optional[float] = None
    warmwasser_verbrauch_m3: Optional[float] = None
    wasser_abwasser_m3: Optional[float] = None
    grundsteuer_m2: Optional[float] = None
    versicherung_einheit: Optional[float] = None
    reinigung_m2: Optional[float] = None
    muell_person: Optional[float] = None
    regenwasser_einheit: Optional[float] = None
    strom_m2: Optional[float] = None
    strom_person: Optional[float] = None
    wartung_m2: Optional[float] = None


class SchluesselZeileOut(BaseModel):
    schluessel: str
    kostenart: str
    grundlage: str
    betrag: float
    kostenart_id: Optional[int] = None
    manuell_angepasst: bool = False
    zaehler_typ: Optional[str] = None
    einheiten: Optional[float] = None


class PersonenSplitVorlageZeile(BaseModel):
    name: str = Field(min_length=1)
    anteil_prozent: float = Field(gt=0, le=100)


class PersonenSplitVorlageSet(BaseModel):
    zeilen: list[PersonenSplitVorlageZeile] = []


class PersonenSplitVorlageOut(PersonenSplitVorlageZeile):
    model_config = ConfigDict(from_attributes=True)
    id: int
    wohnung_id: int
    sortierung: int


class PersonenSplitPdfRequest(BaseModel):
    """Eine Nebenkostenabrechnung auf mehrere Bewohner-Gruppen aufteilen —
    pro Gruppe eine eigene PDF, mit vollen Kostenzeilen (100%) und einem
    zusätzlichen Anteils-Block im Summenbereich."""

    gruppen: list[PersonenSplitVorlageZeile] = Field(min_length=2)
    speichern: bool = False

    @field_validator("gruppen")
    @classmethod
    def validate_summe_100(cls, v: list[PersonenSplitVorlageZeile]) -> list[PersonenSplitVorlageZeile]:
        summe = sum(g.anteil_prozent for g in v)
        if abs(summe - 100.0) > 0.5:
            raise ValueError(f"Anteile ergeben {summe:.1f}% statt 100% — bitte korrigieren")
        return v


class SammelabrechnungRequest(BaseModel):
    """Jahresübersicht für eine ganze Liegenschaft — welche Blöcke rein
    sollen, per Checkbox im Frontend, Default: alles an."""

    zaehlerstaende: bool = True
    vorauszahlungen: bool = True
    saldo: bool = True
    legende: bool = True


class PdfAbschnitteOptionen(BaseModel):
    """Welche Kopf-Abschnitte im erzeugten PDF erscheinen — pro Erzeugung
    per Checkbox wählbar im Frontend, Default: alles an."""

    datum_anzeigen: bool = True
    datum: Optional[str] = None  # ISO "YYYY-MM-DD" — leer = heute
    absender_anzeigen: bool = True
    empfaenger_anzeigen: bool = True


class KombinierteAbrechnungRequest(BaseModel):
    """PDF über mehrere Mieter-Segmente einer Periode zusammenführen — z. B.
    bei einem Wohnungstausch innerhalb derselben Liegenschaft/Periode, wo
    dieselbe Person zwei Mieter-Datensätze (je Wohnung einer) hat."""

    mieter_ids: list[int] = Field(min_length=2)
    anzeigename: Optional[str] = None
    datum_anzeigen: bool = True
    datum: Optional[str] = None  # ISO "YYYY-MM-DD" — leer = heute
    absender_anzeigen: bool = True
    empfaenger_anzeigen: bool = True

    @field_validator("mieter_ids")
    @classmethod
    def validate_eindeutig(cls, v: list[int]) -> list[int]:
        if len(set(v)) != len(v):
            raise ValueError("mieter_ids enthält doppelte IDs — jedes Segment nur einmal auswählen")
        return v


class KombiniertePersonenSplitPdfRequest(BaseModel):
    """Personen-Split für einen kombinierten (Wohnungstausch-)Zeitraum —
    dieselben Mieter-Segmente wie bei KombinierteAbrechnungRequest, aber pro
    Bewohner-Gruppe eine eigene PDF mit vollen Kostenzeilen und Anteils-Block."""

    mieter_ids: list[int] = Field(min_length=2)
    gruppen: list[PersonenSplitVorlageZeile] = Field(min_length=2)
    speichern: bool = False

    @field_validator("mieter_ids")
    @classmethod
    def validate_eindeutig(cls, v: list[int]) -> list[int]:
        if len(set(v)) != len(v):
            raise ValueError("mieter_ids enthält doppelte IDs — jedes Segment nur einmal auswählen")
        return v

    @field_validator("gruppen")
    @classmethod
    def validate_summe_100(cls, v: list[PersonenSplitVorlageZeile]) -> list[PersonenSplitVorlageZeile]:
        summe = sum(g.anteil_prozent for g in v)
        if abs(summe - 100.0) > 0.5:
            raise ValueError(f"Anteile ergeben {summe:.1f}% statt 100% — bitte korrigieren")
        return v


class SchluesselMieterOut(BaseModel):
    mieter_id: int
    anzeigename: str
    wohnung_id: int
    wohnung_bezeichnung: str
    miet_von: str
    miet_bis: str
    miettage: int
    periode_tage: int
    zeilen: list[SchluesselZeileOut]
    fehlende_daten: list[str]
    warnungen: list[str]
    summe: float
    vorauszahlung_ist: float
    saldo: float
    berechenbar: bool
    personen: int = 0


# ── Checkup (Gesamtübersicht) ────────────────────────────────────────────────

class CheckupVerbundKosten(BaseModel):
    id: int
    bezeichnung: str
    betrag_gesamt: float
    schluessel_typ: str
    angewendet: bool
    aufteilung: dict[str, float] = {}


class CheckupKostenart(BaseModel):
    id: int
    name: str
    kategorie: str
    verteilungsschluessel: str
    betrag: float
    anzahl_rechnungen: int


class CheckupMieter(BaseModel):
    mieter_id: int
    name: str
    einzug: str
    auszug: Optional[str]
    personen: int
    ist_leerstand: bool
    kosten_heizung: float
    kosten_warmwasser: float
    kosten_strom: float
    kosten_haus: float
    kosten_gesamt: float
    vorauszahlung_soll: float
    vorauszahlung_ist: float
    saldo: float
    offene_monate: int
    berechnet: bool


class CheckupWohnung(BaseModel):
    wohnung_id: int
    bezeichnung: str
    flaeche_m2: float
    strom_ueber_vermieter: bool
    strom_preis_kwh: Optional[float]
    verbrauch_waerme: Optional[float]
    verbrauch_warmwasser: Optional[float]
    verbrauch_kaltwasser: Optional[float]
    verbrauch_strom: Optional[float]
    fehlende_ablesungen: int
    mieter: list[CheckupMieter]


class CheckupLiegenschaft(BaseModel):
    liegenschaft_id: int
    name: str
    adresse: str
    periode_id: Optional[int]
    periode_label: str
    gesamtflaeche: float
    kosten_erfasst: float
    kostenarten: list[CheckupKostenart]
    wohnungen: list[CheckupWohnung]
    summe_kosten_verteilt: float
    summe_vorauszahlung_soll: float
    summe_vorauszahlung_ist: float
    summe_saldo: float


class CheckupErgebnis(BaseModel):
    verbund_kosten: list[CheckupVerbundKosten]
    verbund_summe: float
    liegenschaften: list[CheckupLiegenschaft]
    gesamt_kosten_erfasst: float
    gesamt_vorauszahlung_ist: float
    gesamt_saldo: float


# ── PDF-Vorlage (Briefkopf/Texte, global) ────────────────────────────────────

class PdfVorlageIn(BaseModel):
    absender_name: Optional[str] = None
    absender_strasse: Optional[str] = None
    absender_plz: Optional[str] = None
    absender_ort: Optional[str] = None
    absender_kontakt: Optional[str] = None
    kopf_titel: Optional[str] = None
    anrede_text: Optional[str] = None
    schlusstext: Optional[str] = None
    fusszeile_text: Optional[str] = None
    datum_anzeigen: bool = True
    datum_ort_override: Optional[str] = None
    rand_oben_mm: Optional[float] = None
    rand_unten_mm: Optional[float] = None
    rand_links_mm: Optional[float] = None
    rand_rechts_mm: Optional[float] = None
    auto_skalieren: bool = True

    @field_validator("rand_oben_mm", "rand_unten_mm", "rand_links_mm", "rand_rechts_mm")
    @classmethod
    def validate_rand(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not (5.0 <= v <= 40.0):
            raise ValueError("Seitenrand muss zwischen 5 und 40 mm liegen")
        return v


class PdfVorlageOut(PdfVorlageIn):
    id: int
    aktualisiert_am: str

    model_config = {"from_attributes": True}


# ── API envelope ─────────────────────────────────────────────────────────────

class ApiResponse(BaseModel):
    ok: bool
    data: Any = None
    error: Optional[str] = None

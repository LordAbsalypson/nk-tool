from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from domain import TRAEGER_MIETER


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


class Liegenschaft(Base):
    __tablename__ = "liegenschaft"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    adresse: Mapped[str] = mapped_column(String, nullable=False)
    plz: Mapped[str] = mapped_column(String, nullable=False)
    ort: Mapped[str] = mapped_column(String, nullable=False)
    heizungsart: Mapped[str] = mapped_column(String, nullable=False, default="oel")
    brennstoff_einheit: Mapped[str] = mapped_column(String, nullable=False, default="liter_oel")
    brennstoff_heizwert_kwh: Mapped[Optional[float]] = mapped_column(Float, default=10.0)
    mittlere_ww_temperatur: Mapped[float] = mapped_column(Float, nullable=False, default=60.0)
    heiz_grundkosten_anteil: Mapped[float] = mapped_column(Float, nullable=False, default=0.30)
    ww_grundkosten_anteil: Mapped[float] = mapped_column(Float, nullable=False, default=0.30)
    co2_klasse: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # Flure, Keller, Waschküche etc. — zusammen mit der Summe der Wohnflächen
    # ergibt sich die Gesamtfläche des Hauses (z. B. für Kostenarten mit m²-Basis,
    # die sich auf das ganze Gebäude statt nur die vermieteten Flächen beziehen)
    gemeinschaftsflaeche_m2: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    erstellt_am: Mapped[str] = mapped_column(String, nullable=False, default=_now_iso)

    wohnungen: Mapped[list["Wohnung"]] = relationship(
        "Wohnung", back_populates="liegenschaft", cascade="all, delete-orphan"
    )
    kostenarten: Mapped[list["Kostenart"]] = relationship(
        "Kostenart", back_populates="liegenschaft", cascade="all, delete-orphan"
    )
    perioden: Mapped[list["Abrechnungsperiode"]] = relationship(
        "Abrechnungsperiode", back_populates="liegenschaft", cascade="all, delete-orphan"
    )


class Abrechnungsperiode(Base):
    __tablename__ = "abrechnungsperiode"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    liegenschaft_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("liegenschaft.id"), nullable=False
    )
    bezeichnung: Mapped[str] = mapped_column(String, nullable=False)
    von_datum: Mapped[str] = mapped_column(String, nullable=False)
    bis_datum: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="offen")
    erstellt_am: Mapped[str] = mapped_column(String, nullable=False, default=_now_iso)

    liegenschaft: Mapped["Liegenschaft"] = relationship(
        "Liegenschaft", back_populates="perioden"
    )
    # Fester Gaspreis €/kWh (optional): ersetzt die HKVO-Umlage im Heiz-Verbrauchsanteil,
    # wenn noch keine Endabrechnung des Versorgers vorliegt. null = Standardverteilung.
    heiz_preis_kwh: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Referenzwerte zum Plausibilisieren (Hausbezug laut Versorger) — reine Anzeige
    referenz_gas_kwh: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    referenz_wasser_m3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

class Wohnung(Base):
    __tablename__ = "wohnung"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    liegenschaft_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("liegenschaft.id"), nullable=False
    )
    bezeichnung: Mapped[str] = mapped_column(String, nullable=False)
    flaeche_m2: Mapped[float] = mapped_column(Float, nullable=False)
    anzahl_rwm: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    strom_ueber_vermieter: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    strom_preis_kwh: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Datum, ab dem der Vermieter den Strom für diese Wohnung bezieht/abrechnet
    strom_bezug_ab: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sortierung: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    aktiv: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    liegenschaft: Mapped["Liegenschaft"] = relationship(
        "Liegenschaft", back_populates="wohnungen"
    )
    mieter: Mapped[list["Mieter"]] = relationship(
        "Mieter", back_populates="wohnung", cascade="all, delete-orphan"
    )
    zaehler: Mapped[list["Zaehler"]] = relationship(
        "Zaehler", back_populates="wohnung", cascade="all, delete-orphan"
    )


class Mieter(Base):
    __tablename__ = "mieter"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    wohnung_id: Mapped[int] = mapped_column(Integer, ForeignKey("wohnung.id"), nullable=False)
    anzeigename: Mapped[str] = mapped_column(String, nullable=False)
    einzug_datum: Mapped[str] = mapped_column(String, nullable=False)
    auszug_datum: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    anzahl_personen: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    monatliche_vorauszahlung: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ist_leerstand: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notizen: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    wohnung: Mapped["Wohnung"] = relationship("Wohnung", back_populates="mieter")


class Zaehler(Base):
    __tablename__ = "zaehler"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    wohnung_id: Mapped[int] = mapped_column(Integer, ForeignKey("wohnung.id"), nullable=False)
    typ: Mapped[str] = mapped_column(String, nullable=False)
    geraete_nummer: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    bezeichnung: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    eingebaut_am: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    aktiv: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # EWE-Referenz: Vertragsnummer des EWE-Hauptzählers, an dem dieser Zähler hängt
    ewe_vertragsnummer: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    wohnung: Mapped["Wohnung"] = relationship("Wohnung", back_populates="zaehler")
    staende: Mapped[list["Zaehlerstand"]] = relationship(
        "Zaehlerstand", back_populates="zaehler", cascade="all, delete-orphan"
    )


class Kostenart(Base):
    __tablename__ = "kostenart"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    liegenschaft_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("liegenschaft.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    verteilungsschluessel: Mapped[str] = mapped_column(String, nullable=False)
    kategorie: Mapped[str] = mapped_column(String, nullable=False)
    ist_brennstoff: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ist_heiz_zusatz: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ist_ww_zusatz: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sortierung: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    aktiv: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ist_voreinstellung: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    liegenschaft: Mapped["Liegenschaft"] = relationship(
        "Liegenschaft", back_populates="kostenarten"
    )


class Kostenposition(Base):
    __tablename__ = "kostenposition"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    kostenart_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("kostenart.id", ondelete="CASCADE"), nullable=False
    )
    abrechnungsperiode_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("abrechnungsperiode.id", ondelete="CASCADE"), nullable=False
    )
    betrag_brutto: Mapped[float] = mapped_column(Float, nullable=False)
    betrag_netto: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    mwst_prozent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    datum: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    beschreibung: Mapped[str] = mapped_column(String, nullable=False)
    beleg_nr: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    beleg_datei: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # Gemeinsames Token für Positionen, die EINE Rechnung auf mehrere Häuser aufteilen.
    # Alle Zeilen mit derselben split_gruppe gehören zusammen; Summe = Originalbetrag.
    split_gruppe: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    erstellt_am: Mapped[str] = mapped_column(String, nullable=False, default=_now_iso)


class Zaehlerstand(Base):
    __tablename__ = "zaehlerstand"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    zaehler_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("zaehler.id", ondelete="CASCADE"), nullable=False
    )
    abrechnungsperiode_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("abrechnungsperiode.id", ondelete="CASCADE"), nullable=False
    )
    ablesedatum: Mapped[str] = mapped_column(String, nullable=False)
    wert: Mapped[float] = mapped_column(Float, nullable=False)
    # 'periode_start' | 'periode_ende' | 'zwischenablesung' | 'ewe_ablesung'
    art: Mapped[str] = mapped_column(String, nullable=False)
    abgelesen_von: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    notiz: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    zaehler: Mapped["Zaehler"] = relationship("Zaehler", back_populates="staende")


SCHLUESSEL_KEYS = (
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
)


class SchluesselPreis(Base):
    """Direkt eingegebener Preis pro Einheit für den 'Direkt-Preise'-Modus.

    Alternative zum rechnungsbasierten Modus (Kostenposition + Kostenart):
    hier gibt der Nutzer den €-Satz je Schlüssel direkt vor (z. B. 2,47 €/m²
    Grundsteuer), statt Rechnungen zu erfassen und den Satz aus Gesamtbetrag ÷
    Gesamteinheiten ableiten zu lassen. Rein additiv — betrifft keine
    bestehende Kostenposition/Kostenart-Daten.
    """

    __tablename__ = "schluessel_preis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    abrechnungsperiode_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("abrechnungsperiode.id", ondelete="CASCADE"), nullable=False
    )
    schluessel: Mapped[str] = mapped_column(String, nullable=False)  # einer der SCHLUESSEL_KEYS
    preis: Mapped[float] = mapped_column(Float, nullable=False)


# Verteilungsbasis einer DirektKostenart. Bei Split-Kostenarten (Heizung,
# Warmwasser) ist dies die VERBRAUCHS-Basis — die Grundkosten sind per
# HeizkostenV-Konvention immer m²-basiert und brauchen deshalb kein eigenes Feld.
DIREKT_VERTEILUNGSBASIS = (
    "m2",
    "person",
    "einheit",
    "kwh_heizung",
    "m3_warmwasser",
    "m3_kaltwasser",
    "m3_wasser_gesamt",
)


class DirektKostenart(Base):
    """Eine konfigurierbare Kostenart-Kachel im Direkt-Preise-Modus.

    Bewusst OHNE liegenschaft_id: Kostenarten gelten global für alle Häuser
    (die €/Einheit-Sätze in DirektKostenartWert werden — wie bisher bei
    SchluesselPreis — automatisch auf alle Liegenschaften mit identischem
    Abrechnungszeitraum gespiegelt). Nur Fläche/Personen/Verbrauch je Haus
    unterscheiden die tatsächlichen Beträge. ``nur_liegenschaft_id`` erlaubt
    trotzdem eine haus-spezifische Sonderkostenart, falls nötig.
    """

    __tablename__ = "direkt_kostenart"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    verteilungsbasis: Mapped[str] = mapped_column(String, nullable=False)
    # Nur sinnvoll bei kwh_heizung/m3_*-Basis; Grundkosten dann immer m²-Fläche.
    hat_grundkosten_split: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    nur_liegenschaft_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("liegenschaft.id", ondelete="CASCADE"), nullable=True
    )
    sortierung: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    aktiv: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class DirektKostenartWert(Base):
    """Die tatsächlichen €-Sätze einer DirektKostenart für eine Periode.

    Fall A (hat_grundkosten_split=False): nur ``preis_pro_einheit`` gesetzt.
    Fall B (True): ``verhaeltnis_grund`` + die zwei abgeleiteten Sätze — das
    Verhältnis ist bewusst NICHT auf Liegenschaft-Ebene fest, sondern hier pro
    Periode gespeichert, weil es sich jährlich ändern kann.
    """

    __tablename__ = "direkt_kostenart_wert"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    abrechnungsperiode_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("abrechnungsperiode.id", ondelete="CASCADE"), nullable=False
    )
    kostenart_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("direkt_kostenart.id", ondelete="CASCADE"), nullable=False
    )
    preis_pro_einheit: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    verhaeltnis_grund: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    preis_grund_pro_m2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    preis_verbrauch_pro_einheit: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Schützt eine Handkorrektur der Sätze davor, vom Split-Rechner (Gesamt-
    # kosten ÷ Gesamteinheiten × Verhältnis) beim nächsten Lauf still überschrieben
    # zu werden.
    saetze_manuell_angepasst: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class DirektUebersteuerung(Base):
    """Manuelle Korrektur im "Ausprobieren"-Modus der Abrechnung — mit Begründung.

    feld="personen": mieter_id gesetzt, überschreibt die Personenzahl nur für
      diese Berechnung (nicht die echten Stammdaten).
    feld="flaeche_m2": wohnung_id gesetzt (Fläche ist eine Wohnungs-, keine
      Mieter-Eigenschaft — bei Mieterwechsel gilt sie für beide Segmente gleich).
    feld="betrag": mieter_id UND kostenart_id gesetzt, überschreibt den
      berechneten Endbetrag dieser einen Zeile für diesen Mieter (z. B. für
      Rundungsausgleich).
    Verbrauchs-Overrides laufen weiterhin über die bestehenden Tabellen
    MieterVerbrauch/WohnungVerbrauch — keine Dopplung hier.
    """

    __tablename__ = "direkt_uebersteuerung"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    abrechnungsperiode_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("abrechnungsperiode.id", ondelete="CASCADE"), nullable=False
    )
    mieter_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("mieter.id", ondelete="CASCADE"), nullable=True
    )
    wohnung_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("wohnung.id", ondelete="CASCADE"), nullable=True
    )
    kostenart_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("direkt_kostenart.id", ondelete="CASCADE"), nullable=True
    )
    feld: Mapped[str] = mapped_column(String, nullable=False)  # "personen" | "flaeche_m2" | "betrag"
    wert: Mapped[float] = mapped_column(Float, nullable=False)
    begruendung: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class MieterVerbrauch(Base):
    """Fest vorgegebener Verbrauch eines Mieters bei Mieterwechsel.

    Standardmäßig teilt die Engine den Wohnungs-Verbrauch nach Miettagen auf.
    Wenn bekannt ist, dass ein Mieter tatsächlich mehr oder weniger verbraucht hat
    (z. B. Nachmieter im Winter), kann hier ein konkreter Wert hinterlegt werden.
    Die übrigen Mieter derselben Wohnung teilen sich dann den Restverbrauch.
    """

    __tablename__ = "mieter_verbrauch"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    mieter_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("mieter.id", ondelete="CASCADE"), nullable=False
    )
    abrechnungsperiode_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("abrechnungsperiode.id", ondelete="CASCADE"), nullable=False
    )
    # waerme_kwh | hkv_einheiten | warmwasser_m3 | kaltwasser_m3 | strom_kwh
    zaehler_typ: Mapped[str] = mapped_column(String, nullable=False)
    wert: Mapped[float] = mapped_column(Float, nullable=False)
    notiz: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # Zeigt "(geschätzt)" auf der PDF-Abrechnung neben dem Wert — default aus,
    # damit nichts ungefragt auf dem an Mieter verschickten Dokument steht.
    als_schaetzung_anzeigen: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class WohnungVerbrauch(Base):
    """Manuell festgelegter De-facto-Verbrauch einer Wohnung für eine Periode.

    Überschreibt die aus den Zählerständen berechnete Differenz (z. B. bei
    Schätzungen, Rundungen oder defekten Zählern). Gilt für Anzeige UND
    Berechnung — die UI zeigt solche Werte gelb ("eingetragen statt berechnet").
    """

    __tablename__ = "wohnung_verbrauch"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    wohnung_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("wohnung.id", ondelete="CASCADE"), nullable=False
    )
    abrechnungsperiode_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("abrechnungsperiode.id", ondelete="CASCADE"), nullable=False
    )
    zaehler_typ: Mapped[str] = mapped_column(String, nullable=False)
    wert: Mapped[float] = mapped_column(Float, nullable=False)
    notiz: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class Vorauszahlung(Base):
    __tablename__ = "vorauszahlung"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    mieter_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("mieter.id", ondelete="CASCADE"), nullable=False
    )
    abrechnungsperiode_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("abrechnungsperiode.id", ondelete="CASCADE"), nullable=False
    )
    monat: Mapped[int] = mapped_column(Integer, nullable=False)
    jahr: Mapped[int] = mapped_column(Integer, nullable=False)
    betrag_soll: Mapped[float] = mapped_column(Float, nullable=False)
    betrag_ist: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    bezahlt_am: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    notiz: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    soll_override: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ist_override: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Todo(Base):
    __tablename__ = "todo"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    erledigt: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    erstellt_am: Mapped[str] = mapped_column(String, nullable=False, default=_now_iso)
    erledigt_am: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class LiegenschaftVerbund(Base):
    __tablename__ = "liegenschaft_verbund"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    erstellt_am: Mapped[str] = mapped_column(String, nullable=False, default=_now_iso)

    mitglieder: Mapped[list["VerbundMitglied"]] = relationship(
        "VerbundMitglied", back_populates="verbund", cascade="all, delete-orphan"
    )
    kosten: Mapped[list["VerbundKosten"]] = relationship(
        "VerbundKosten", back_populates="verbund", cascade="all, delete-orphan"
    )


class VerbundMitglied(Base):
    __tablename__ = "verbund_mitglied"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    verbund_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("liegenschaft_verbund.id", ondelete="CASCADE"), nullable=False
    )
    liegenschaft_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("liegenschaft.id", ondelete="CASCADE"), nullable=False
    )
    sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    verbund: Mapped["LiegenschaftVerbund"] = relationship(
        "LiegenschaftVerbund", back_populates="mitglieder"
    )


class VerbundKosten(Base):
    """Eine gemeinsame Kostenposition, die auf mehrere Liegenschaften verteilt wird."""

    __tablename__ = "verbund_kosten"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    verbund_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("liegenschaft_verbund.id", ondelete="CASCADE"), nullable=False
    )
    bezeichnung: Mapped[str] = mapped_column(String, nullable=False)
    betrag_gesamt: Mapped[float] = mapped_column(Float, nullable=False)
    # wohnungsanzahl | wohnflaeche_m2 | personen | kwh_gas | m3_wasser | manuell_prozent
    schluessel_typ: Mapped[str] = mapped_column(String, nullable=False)
    # JSON {"<lid>": <wert>} — bei kwh_gas/m3_wasser/manuell: user-entered; bei auto-keys: null
    schluessel_werte_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    datum: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    erstellt_am: Mapped[str] = mapped_column(String, nullable=False, default=_now_iso)
    angewendet: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # JSON {"<lid>": {"periode_id": X, "kostenart_id": Y, "betrag": Z, "kostenposition_id": W}}
    anwendung_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    verbund: Mapped["LiegenschaftVerbund"] = relationship(
        "LiegenschaftVerbund", back_populates="kosten"
    )


class PdfVorlage(Base):
    """Global editierbares Template für die Abrechnungs-PDF (Briefkopf, Texte,
    Fußzeile). Singleton — es existiert immer höchstens eine Zeile; leere
    Felder fallen beim PDF-Bau auf die Liegenschaft-Stammdaten zurück, damit
    der Export auch vor der ersten Konfiguration funktioniert."""

    __tablename__ = "pdf_vorlage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    absender_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    absender_strasse: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    absender_plz: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    absender_ort: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    absender_kontakt: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    kopf_titel: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    anrede_text: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    schlusstext: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fusszeile_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    datum_anzeigen: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    datum_ort_override: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # Seitenränder in mm — leer = schmaler Standard (siehe pdf_abrechnung.py Defaults).
    rand_oben_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rand_unten_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rand_links_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rand_rechts_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Bei Überlauf (v. a. kombinierte Abrechnungen) automatisch verkleinern,
    # statt auf Seite 2 umzubrechen — bleibt dabei lesbar (siehe pdf_abrechnung.py).
    auto_skalieren: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    aktualisiert_am: Mapped[str] = mapped_column(String, nullable=False, default=_now_iso)


class WohnungPersonenSplitVorlage(Base):
    """Gemerkte Gruppen-Namen/Prozente für den Personen-Split einer Wohnung
    (z. B. "Mutter & Kind" 50% / "Freund" 50%) — reine Wiedervorlage für den
    Dialog beim nächsten Mal, wird NIE automatisch auf eine Abrechnung
    angewendet. Nur befüllt, wenn der Nutzer explizit "merken" anhakt."""

    __tablename__ = "wohnung_personen_split_vorlage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    wohnung_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("wohnung.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    anteil_prozent: Mapped[float] = mapped_column(Float, nullable=False)
    sortierung: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class MieterKostenanteil(Base):
    __tablename__ = "mieter_kostenanteil"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    mieter_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("mieter.id", ondelete="CASCADE"), nullable=False
    )
    abrechnungsperiode_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("abrechnungsperiode.id", ondelete="CASCADE"), nullable=False
    )
    kostenart_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("kostenart.id", ondelete="SET NULL"), nullable=True
    )
    bezeichnung: Mapped[str] = mapped_column(String, nullable=False)
    pool: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    betrag_pro_einheit: Mapped[float] = mapped_column(Float, nullable=False)
    einheiten: Mapped[float] = mapped_column(Float, nullable=False)
    kostenanteil: Mapped[float] = mapped_column(Float, nullable=False)
    erlaeuterung: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    traeger: Mapped[str] = mapped_column(String, nullable=False, default=TRAEGER_MIETER)
    ist_override: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    override_wert: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    override_begruendung: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    berechnet_am: Mapped[str] = mapped_column(String, nullable=False, default=_now_iso)


class AppAuth(Base):
    """Optionaler Passwortschutz für diese Datenbank — Singleton, höchstens
    eine Zeile. Existiert keine Zeile (oder ``password_hash`` ist NULL), ist
    kein Passwort gesetzt und alle Endpunkte sind wie bisher frei zugänglich
    (Backward-Compatibility: bestehende Installationen ohne Passwort bleiben
    unverändert). Gilt pro Datenbank-Datei, nicht global — wer eine andere
    .db verknüpft, bekommt deren eigenen (oder keinen) Schutz.

    ``password_hash``/``recovery_code_hash`` sind PBKDF2-HMAC-SHA256 mit
    zufälligem Salt (siehe ``auth.py``), nie Klartext. Der Recovery-Code
    selbst wird nur einmal beim Setup zurückgegeben, danach nirgends im
    Klartext gespeichert — Verlust bedeutet: nur noch das Passwort öffnet
    die Datenbank."""

    __tablename__ = "app_auth"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    recovery_code_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    token_secret: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    erstellt_am: Mapped[str] = mapped_column(String, nullable=False, default=_now_iso)
    geaendert_am: Mapped[Optional[str]] = mapped_column(String, nullable=True)

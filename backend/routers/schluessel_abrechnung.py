"""Direkt-Preise-Modus: Preise pro Einheit setzen, Mieter-Abrechnungen
berechnen und als PDF exportieren. Siehe ``schluessel_engine.py``."""

import os
from datetime import date
from pathlib import Path

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
from models import (
    Abrechnungsperiode,
    DirektKostenart,
    DirektKostenartWert,
    DirektUebersteuerung,
    Liegenschaft,
    Mieter,
    MieterVerbrauch,
    PdfVorlage,
    SchluesselPreis,
    Wohnung,
    WohnungPersonenSplitVorlage,
    WohnungVerbrauch,
)
from pdf_abrechnung import (
    RAND_LINKS_MM,
    RAND_OBEN_MM,
    RAND_RECHTS_MM,
    RAND_UNTEN_MM,
    AbrechnungPdfDaten,
    AbrechnungZeile,
    SammelabrechnungOptionen,
    erzeuge_abrechnung_pdf,
    erzeuge_sammelabrechnung_pdf,
)
from pdf_vorlage_utils import basis_pdf_kwargs, fmt_datum_de
from schemas import (
    ApiResponse,
    DirektKostenartCreate,
    DirektKostenartOut,
    DirektKostenartUpdate,
    DirektKostenartWertOut,
    DirektKostenartWertSet,
    DirektSplitRechner,
    DirektUebersteuerungOut,
    DirektUebersteuerungSet,
    KombinierteAbrechnungRequest,
    KombiniertePersonenSplitPdfRequest,
    PdfAbschnitteOptionen,
    PersonenSplitPdfRequest,
    PersonenSplitVorlageOut,
    PersonenSplitVorlageSet,
    SammelabrechnungRequest,
    SCHLUESSEL_KEYS_LIST,
    SchluesselMieterOut,
    SchluesselPreiseSet,
    SchluesselPreisOut,
    SchluesselZeileOut,
    VorschauRequest,
    VorschauVerbrauchOverride,
)
from schluessel_engine import (
    SchluesselMieterErgebnis,
    berechne_schluessel_mieter,
    berechne_schluessel_periode,
    gesamteinheiten_vorschlag,
    sammelabrechnung_daten,
)

router = APIRouter(tags=["Direkt-Preise"])

# Private, nicht versionierter Ordner (siehe .gitignore) — enthält echte
# Mieterdaten und darf nicht ins Git-Repo gelangen. In der Desktop-App zeigt
# NK_TOOL_PDF_DIR auf das App-Datenverzeichnis statt in den (im Bundle
# nicht beschreibbaren) Quellcode-Baum.
PDF_DIR = Path(
    os.environ.get(
        "NK_TOOL_PDF_DIR",
        str(Path(__file__).resolve().parent.parent.parent / "abrechnungen_pdf"),
    )
)


@router.get("/perioden/{periode_id}/schluesselpreise")
def get_schluesselpreise(periode_id: int, db: Session = Depends(get_db)) -> ApiResponse:
    rows = (
        db.query(SchluesselPreis)
        .filter(SchluesselPreis.abrechnungsperiode_id == periode_id)
        .all()
    )
    return ApiResponse(ok=True, data=[SchluesselPreisOut.model_validate(r) for r in rows])


def _speichere_preise(db: Session, periode_id: int, werte: dict) -> None:
    for key in SCHLUESSEL_KEYS_LIST:
        wert = werte.get(key)
        vorhanden = (
            db.query(SchluesselPreis)
            .filter(
                SchluesselPreis.abrechnungsperiode_id == periode_id,
                SchluesselPreis.schluessel == key,
            )
            .first()
        )
        if wert is None:
            if vorhanden:
                db.delete(vorhanden)
            continue
        if wert < 0:
            raise HTTPException(status_code=400, detail=f"{key}: darf nicht negativ sein")
        if vorhanden:
            vorhanden.preis = wert
        else:
            db.add(SchluesselPreis(abrechnungsperiode_id=periode_id, schluessel=key, preis=wert))


def _andere_haeuser_perioden(db: Session, periode: Abrechnungsperiode) -> list[Abrechnungsperiode]:
    """Perioden anderer Liegenschaften mit demselben Zeitraum — die Preise pro
    Einheit (€/m², €/Person, ...) gelten hausübergreifend gleich, nur die
    Basiswerte (Fläche, Personen, Verbrauch) unterscheiden sich je Haus."""
    return (
        db.query(Abrechnungsperiode)
        .filter(
            Abrechnungsperiode.liegenschaft_id != periode.liegenschaft_id,
            Abrechnungsperiode.von_datum == periode.von_datum,
            Abrechnungsperiode.bis_datum == periode.bis_datum,
        )
        .all()
    )


@router.put("/perioden/{periode_id}/schluesselpreise")
def set_schluesselpreise(
    periode_id: int, body: SchluesselPreiseSet, db: Session = Depends(get_db)
) -> ApiResponse:
    periode = db.get(Abrechnungsperiode, periode_id)
    if not periode:
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")

    werte = body.model_dump()
    _speichere_preise(db, periode_id, werte)

    # Gleiche Sätze automatisch für die anderen Häuser derselben Abrechnungsperiode
    # übernehmen (z. B. Nr.15 → Nr.15A) — die €/Einheit-Preise sind hausübergreifend
    # identisch, nur Fläche/Personen/Verbrauch je Haus unterscheiden die Beträge.
    andere = _andere_haeuser_perioden(db, periode)
    for p in andere:
        _speichere_preise(db, p.id, werte)

    db.commit()

    rows = (
        db.query(SchluesselPreis)
        .filter(SchluesselPreis.abrechnungsperiode_id == periode_id)
        .all()
    )
    andere_namen = [
        lieg.name for p in andere if (lieg := db.get(Liegenschaft, p.liegenschaft_id)) is not None
    ]
    return ApiResponse(
        ok=True,
        data={
            "preise": [SchluesselPreisOut.model_validate(r).model_dump() for r in rows],
            "auch_uebernommen_fuer": andere_namen,
        },
    )


@router.get("/perioden/{periode_id}/gesamteinheiten-vorschlag")
def get_gesamteinheiten_vorschlag(periode_id: int, db: Session = Depends(get_db)) -> ApiResponse:
    """Vorschlagswerte für 'Gesamteinheiten' (m², Personen, Verbrauch) — aus
    Stammdaten/Zählerständen abgeleitet, im Formular frei überschreibbar."""
    try:
        return ApiResponse(ok=True, data=gesamteinheiten_vorschlag(db, periode_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/perioden/{periode_id}/schluessel-abrechnung")
def get_schluessel_abrechnung(periode_id: int, db: Session = Depends(get_db)) -> ApiResponse:
    if not db.get(Abrechnungsperiode, periode_id):
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")
    try:
        ergebnisse = berechne_schluessel_periode(db, periode_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ApiResponse(ok=True, data=[_schluessel_mieter_out(e) for e in ergebnisse])


def _dateiname(name: str) -> str:
    sicher = "".join(c if c.isalnum() or c in " -_" else "" for c in name).strip()
    return sicher.replace(" ", "_") or "Mieter"


def _hausnummer(adresse: str) -> str:
    """Letztes Token der Adresse, in der Praxis die Hausnummer (z. B. "15" oder
    "15A" bei "Jeversche Str. 15A") — für Dateinamen, die Wohnungen mehrerer
    Häuser derselben Straße unterscheidbar machen sollen."""
    teile = adresse.strip().split()
    return teile[-1] if teile else ""


@router.post("/perioden/{periode_id}/mieter/{mieter_id}/schluessel-abrechnung/pdf")
def erzeuge_schluessel_pdf(
    periode_id: int,
    mieter_id: int,
    optionen: PdfAbschnitteOptionen = PdfAbschnitteOptionen(),
    db: Session = Depends(get_db),
) -> ApiResponse:
    periode = db.get(Abrechnungsperiode, periode_id)
    if not periode:
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")
    lieg = db.get(Liegenschaft, periode.liegenschaft_id)
    if not lieg:
        raise HTTPException(status_code=404, detail="Liegenschaft nicht gefunden")

    erg = berechne_schluessel_mieter(db, periode_id, mieter_id)
    if erg is None:
        raise HTTPException(status_code=404, detail="Mieter nicht in dieser Periode gefunden")
    if not erg.berechenbar:
        raise HTTPException(
            status_code=400,
            detail="Abrechnung unvollständig: " + "; ".join(erg.fehlende_daten),
        )

    vorlage = db.query(PdfVorlage).first()

    daten = AbrechnungPdfDaten(
        **basis_pdf_kwargs(vorlage, lieg, optionen),
        empfaenger_name=erg.anzeigename,
        empfaenger_strasse=f"{lieg.adresse}, {erg.wohnung_bezeichnung}",
        empfaenger_ort=f"{lieg.plz} {lieg.ort}",
        zeitraum_von=fmt_datum_de(periode.von_datum),
        zeitraum_bis=fmt_datum_de(periode.bis_datum),
        wohnung=erg.wohnung_bezeichnung,
        zeilen=[
            AbrechnungZeile(z.kostenart, z.grundlage, z.betrag) for z in erg.zeilen
        ],
        vorauszahlung=erg.vorauszahlung_ist,
        hinweis=(
            f"Mietzeitraum in dieser Abrechnung: {fmt_datum_de(erg.miet_von)} – "
            f"{fmt_datum_de(erg.miet_bis)} ({erg.miettage} von {erg.periode_tage} Tagen)."
            if erg.miettage != erg.periode_tage
            else None
        ),
    )

    ordner_name = periode.bezeichnung.replace("/", "-")
    dateiname = (
        f"{_dateiname(_hausnummer(lieg.adresse))}_{_dateiname(erg.wohnung_bezeichnung)}"
        f"_{_dateiname(erg.anzeigename)}.pdf"
    )
    erzeuge_abrechnung_pdf(daten, PDF_DIR / ordner_name / dateiname)

    return ApiResponse(
        ok=True,
        data={
            "dateiname": dateiname,
            "download_url": f"/api/v1/perioden/{periode_id}/mieter/{mieter_id}/schluessel-abrechnung/pdf"
            f"?ordner={quote(ordner_name)}&datei={quote(dateiname)}",
        },
    )


@router.post("/perioden/{periode_id}/mieter-kombiniert/pdf")
def erzeuge_kombinierte_pdf(
    periode_id: int, body: KombinierteAbrechnungRequest, db: Session = Depends(get_db)
) -> ApiResponse:
    """Eine Abrechnung über mehrere Mieter-Segmente derselben Periode hinweg,
    chronologisch untereinander aufgeführt und aufsummiert — für einen
    Wohnungstausch innerhalb der Liegenschaft, bei dem dieselbe Person zwei
    Mieter-Datensätze hat (je Wohnung einer)."""
    periode = db.get(Abrechnungsperiode, periode_id)
    if not periode:
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")
    lieg = db.get(Liegenschaft, periode.liegenschaft_id)
    if not lieg:
        raise HTTPException(status_code=404, detail="Liegenschaft nicht gefunden")

    # Einmal für die ganze Periode berechnen statt pro mieter_id neu (jeder
    # Aufruf von berechne_schluessel_mieter würde sonst den kompletten
    # Perioden-Durchlauf wiederholen) — dann nur die gewünschten IDs picken.
    try:
        alle_ergebnisse = {e.mieter_id: e for e in berechne_schluessel_periode(db, periode_id)}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    segmente = []
    for mid in body.mieter_ids:
        erg = alle_ergebnisse.get(mid)
        if erg is None:
            raise HTTPException(status_code=404, detail=f"Mieter {mid} nicht in dieser Periode gefunden")
        if not erg.berechenbar:
            raise HTTPException(
                status_code=400,
                detail=f"{erg.anzeigename} ({erg.wohnung_bezeichnung}) unvollständig: "
                + "; ".join(erg.fehlende_daten),
            )
        segmente.append(erg)
    segmente.sort(key=lambda e: e.miet_von)

    vorlage = db.query(PdfVorlage).first()
    anzeigename = body.anzeigename or segmente[0].anzeigename
    letzte_wohnung = segmente[-1].wohnung_bezeichnung
    wohnung_kette = " → ".join(dict.fromkeys(s.wohnung_bezeichnung for s in segmente))

    zeilen: list[AbrechnungZeile] = []
    for s in segmente:
        zeilen.append(
            AbrechnungZeile(
                kostenart=f"{s.wohnung_bezeichnung} · {fmt_datum_de(s.miet_von)} – {fmt_datum_de(s.miet_bis)}",
                grundlage="",
                betrag=0.0,
                ist_abschnitt=True,
            )
        )
        zeilen.extend(AbrechnungZeile(z.kostenart, z.grundlage, z.betrag) for z in s.zeilen)

    optionen = PdfAbschnitteOptionen(
        datum_anzeigen=body.datum_anzeigen,
        datum=body.datum,
        absender_anzeigen=body.absender_anzeigen,
        empfaenger_anzeigen=body.empfaenger_anzeigen,
    )
    daten = AbrechnungPdfDaten(
        **basis_pdf_kwargs(vorlage, lieg, optionen),
        empfaenger_name=anzeigename,
        empfaenger_strasse=f"{lieg.adresse}, {letzte_wohnung}",
        empfaenger_ort=f"{lieg.plz} {lieg.ort}",
        zeitraum_von=fmt_datum_de(segmente[0].miet_von),
        zeitraum_bis=fmt_datum_de(segmente[-1].miet_bis),
        wohnung=wohnung_kette,
        zeilen=zeilen,
        vorauszahlung=sum(s.vorauszahlung_ist for s in segmente),
        hinweis=(
            "Kombinierte Abrechnung über mehrere Wohnungen/Zeiträume innerhalb "
            "dieser Liegenschaft (siehe Abschnitte in der Tabelle)."
        ),
    )

    ordner_name = periode.bezeichnung.replace("/", "-")
    wohnungs_teil = "-".join(_dateiname(s.wohnung_bezeichnung) for s in segmente)
    dateiname = (
        f"{_dateiname(_hausnummer(lieg.adresse))}_{wohnungs_teil}"
        f"_{_dateiname(anzeigename)}_kombiniert.pdf"
    )
    erzeuge_abrechnung_pdf(daten, PDF_DIR / ordner_name / dateiname)

    return ApiResponse(
        ok=True,
        data={
            "dateiname": dateiname,
            "download_url": f"/api/v1/perioden/{periode_id}/mieter-kombiniert/pdf/download"
            f"?ordner={quote(ordner_name)}&datei={quote(dateiname)}",
        },
    )


@router.get("/perioden/{periode_id}/mieter-kombiniert/pdf/download")
def lade_kombinierte_pdf(periode_id: int, ordner: str, datei: str) -> FileResponse:
    """Eigene Download-Route statt der mieter_id-tragenden Einzel-Route —
    eine kombinierte PDF gehört zu mehreren Mieter-IDs, keiner einzelnen."""
    return _serve_pdf(ordner, datei)


@router.post("/perioden/{periode_id}/mieter-kombiniert/personen-split/pdf")
def erzeuge_kombinierte_personen_split_pdf(
    periode_id: int, body: KombiniertePersonenSplitPdfRequest, db: Session = Depends(get_db)
) -> ApiResponse:
    """Personen-Split für einen kombinierten (Wohnungstausch-)Zeitraum — z. B.
    ein Ehepaar, das während der Periode die Wohnung gewechselt hat und dessen
    Nebenkosten trotzdem auf mehrere Bewohner-Gruppen aufgeteilt werden sollen.
    Baut dieselben Segment-Zeilen wie erzeuge_kombinierte_pdf(), erzeugt aber
    pro Gruppe eine eigene PDF mit vollen Kostenzeilen plus Anteils-Block
    (identisches Prinzip wie erzeuge_personen_split_pdf(), nur für mehrere
    Mieter-Segmente statt einem)."""
    periode = db.get(Abrechnungsperiode, periode_id)
    if not periode:
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")
    lieg = db.get(Liegenschaft, periode.liegenschaft_id)
    if not lieg:
        raise HTTPException(status_code=404, detail="Liegenschaft nicht gefunden")

    try:
        alle_ergebnisse = {e.mieter_id: e for e in berechne_schluessel_periode(db, periode_id)}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    segmente = []
    for mid in body.mieter_ids:
        erg = alle_ergebnisse.get(mid)
        if erg is None:
            raise HTTPException(status_code=404, detail=f"Mieter {mid} nicht in dieser Periode gefunden")
        if not erg.berechenbar:
            raise HTTPException(
                status_code=400,
                detail=f"{erg.anzeigename} ({erg.wohnung_bezeichnung}) unvollständig: "
                + "; ".join(erg.fehlende_daten),
            )
        segmente.append(erg)
    segmente.sort(key=lambda e: e.miet_von)

    letzte_wohnung = segmente[-1].wohnung_bezeichnung
    wohnung_kette = " → ".join(dict.fromkeys(s.wohnung_bezeichnung for s in segmente))
    gesamt_vorauszahlung = sum(s.vorauszahlung_ist for s in segmente)

    zeilen: list[AbrechnungZeile] = []
    for s in segmente:
        zeilen.append(
            AbrechnungZeile(
                kostenart=f"{s.wohnung_bezeichnung} · {fmt_datum_de(s.miet_von)} – {fmt_datum_de(s.miet_bis)}",
                grundlage="",
                betrag=0.0,
                ist_abschnitt=True,
            )
        )
        zeilen.extend(AbrechnungZeile(z.kostenart, z.grundlage, z.betrag) for z in s.zeilen)

    vorlage = db.query(PdfVorlage).first()
    ordner_name = periode.bezeichnung.replace("/", "-")
    wohnungs_teil = "-".join(_dateiname(s.wohnung_bezeichnung) for s in segmente)
    ergebnisse = []
    for gr in body.gruppen:
        daten = AbrechnungPdfDaten(
            **basis_pdf_kwargs(vorlage, lieg),
            empfaenger_name=gr.name,
            empfaenger_strasse=f"{lieg.adresse}, {letzte_wohnung}",
            empfaenger_ort=f"{lieg.plz} {lieg.ort}",
            zeitraum_von=fmt_datum_de(segmente[0].miet_von),
            zeitraum_bis=fmt_datum_de(segmente[-1].miet_bis),
            wohnung=wohnung_kette,
            zeilen=zeilen,
            vorauszahlung=gesamt_vorauszahlung * gr.anteil_prozent / 100,
            anteil_prozent=gr.anteil_prozent,
            hinweis=(
                f"Anteilige Abrechnung für {gr.name} ({gr.anteil_prozent:.0f}%) über den "
                f"kombinierten Zeitraum {wohnung_kette} — die Kostenzeilen zeigen die vollen "
                f"Kosten, Ihr Anteil wird im Summenblock unten ausgewiesen."
            ),
        )
        dateiname = (
            f"{_dateiname(_hausnummer(lieg.adresse))}_{wohnungs_teil}"
            f"_{_dateiname(gr.name)}_kombiniert_anteil.pdf"
        )
        erzeuge_abrechnung_pdf(daten, PDF_DIR / ordner_name / dateiname)
        ergebnisse.append(
            {
                "name": gr.name,
                "anteil_prozent": gr.anteil_prozent,
                "dateiname": dateiname,
                "download_url": f"/api/v1/perioden/{periode_id}/mieter-kombiniert/personen-split/pdf/download"
                f"?ordner={quote(ordner_name)}&datei={quote(dateiname)}",
            }
        )

    if body.speichern:
        # "Merken" bezieht sich auf die aktuelle (letzte) Wohnung des kombinierten
        # Zeitraums — dieselbe Vorlage, die auch bei künftigen Perioden für diese
        # Wohnung vorgeschlagen wird (siehe get_personen_split_vorlage()).
        ziel_wohnung_id = segmente[-1].wohnung_id
        db.query(WohnungPersonenSplitVorlage).filter(
            WohnungPersonenSplitVorlage.wohnung_id == ziel_wohnung_id
        ).delete()
        for i, gr in enumerate(body.gruppen):
            db.add(
                WohnungPersonenSplitVorlage(
                    wohnung_id=ziel_wohnung_id,
                    name=gr.name,
                    anteil_prozent=gr.anteil_prozent,
                    sortierung=i,
                )
            )
        db.commit()

    return ApiResponse(ok=True, data=ergebnisse)


@router.get("/perioden/{periode_id}/mieter-kombiniert/personen-split/pdf/download")
def lade_kombinierte_personen_split_pdf(periode_id: int, ordner: str, datei: str) -> FileResponse:
    return _serve_pdf(ordner, datei)


@router.get("/perioden/{periode_id}/mieter/{mieter_id}/schluessel-abrechnung/pdf")
def lade_schluessel_pdf(
    periode_id: int, mieter_id: int, ordner: str, datei: str
) -> FileResponse:
    return _serve_pdf(ordner, datei)


def _serve_pdf(ordner: str, datei: str) -> FileResponse:
    pfad = (PDF_DIR / ordner / datei).resolve()
    if PDF_DIR.resolve() not in pfad.parents or not pfad.exists():
        raise HTTPException(status_code=404, detail="PDF nicht gefunden — bitte erst erstellen")
    return FileResponse(pfad, media_type="application/pdf", filename=datei)


# ── Personen-Split: Abrechnung auf mehrere Bewohner-Gruppen aufteilen ────────

@router.get("/wohnungen/{wohnung_id}/personen-split-vorlage")
def get_personen_split_vorlage(wohnung_id: int, db: Session = Depends(get_db)) -> ApiResponse:
    rows = (
        db.query(WohnungPersonenSplitVorlage)
        .filter(WohnungPersonenSplitVorlage.wohnung_id == wohnung_id)
        .order_by(WohnungPersonenSplitVorlage.sortierung)
        .all()
    )
    return ApiResponse(ok=True, data=[PersonenSplitVorlageOut.model_validate(r) for r in rows])


@router.put("/wohnungen/{wohnung_id}/personen-split-vorlage")
def set_personen_split_vorlage(
    wohnung_id: int, body: PersonenSplitVorlageSet, db: Session = Depends(get_db)
) -> ApiResponse:
    if not db.get(Wohnung, wohnung_id):
        raise HTTPException(status_code=404, detail="Wohnung nicht gefunden")
    db.query(WohnungPersonenSplitVorlage).filter(
        WohnungPersonenSplitVorlage.wohnung_id == wohnung_id
    ).delete()
    for i, z in enumerate(body.zeilen):
        db.add(
            WohnungPersonenSplitVorlage(
                wohnung_id=wohnung_id, name=z.name, anteil_prozent=z.anteil_prozent, sortierung=i
            )
        )
    db.commit()
    rows = (
        db.query(WohnungPersonenSplitVorlage)
        .filter(WohnungPersonenSplitVorlage.wohnung_id == wohnung_id)
        .order_by(WohnungPersonenSplitVorlage.sortierung)
        .all()
    )
    return ApiResponse(ok=True, data=[PersonenSplitVorlageOut.model_validate(r) for r in rows])


@router.post("/perioden/{periode_id}/mieter/{mieter_id}/personen-split/pdf")
def erzeuge_personen_split_pdf(
    periode_id: int, mieter_id: int, body: PersonenSplitPdfRequest, db: Session = Depends(get_db)
) -> ApiResponse:
    """Eine Abrechnung auf mehrere Bewohner-Gruppen aufteilen — pro Gruppe
    eine eigene PDF mit vollen (100%) Kostenzeilen plus Anteils-Block im
    Summenbereich. Ändert nichts an der normalen Wohnungs-Abrechnung."""
    periode = db.get(Abrechnungsperiode, periode_id)
    if not periode:
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")
    lieg = db.get(Liegenschaft, periode.liegenschaft_id)
    if not lieg:
        raise HTTPException(status_code=404, detail="Liegenschaft nicht gefunden")

    erg = berechne_schluessel_mieter(db, periode_id, mieter_id)
    if erg is None:
        raise HTTPException(status_code=404, detail="Mieter nicht in dieser Periode gefunden")
    if not erg.berechenbar:
        raise HTTPException(
            status_code=400,
            detail="Abrechnung unvollständig: " + "; ".join(erg.fehlende_daten),
        )

    vorlage = db.query(PdfVorlage).first()
    ordner_name = periode.bezeichnung.replace("/", "-")
    ergebnisse = []
    for gr in body.gruppen:
        daten = AbrechnungPdfDaten(
            **basis_pdf_kwargs(vorlage, lieg),
            empfaenger_name=gr.name,
            empfaenger_strasse=f"{lieg.adresse}, {erg.wohnung_bezeichnung}",
            empfaenger_ort=f"{lieg.plz} {lieg.ort}",
            zeitraum_von=fmt_datum_de(periode.von_datum),
            zeitraum_bis=fmt_datum_de(periode.bis_datum),
            wohnung=erg.wohnung_bezeichnung,
            zeilen=[AbrechnungZeile(z.kostenart, z.grundlage, z.betrag) for z in erg.zeilen],
            vorauszahlung=erg.vorauszahlung_ist * gr.anteil_prozent / 100,
            anteil_prozent=gr.anteil_prozent,
            hinweis=(
                f"Anteilige Abrechnung für {gr.name} ({gr.anteil_prozent:.0f}% der Wohnung "
                f"{erg.wohnung_bezeichnung}) — die Kostenzeilen zeigen die vollen Wohnungskosten, "
                f"Ihr Anteil wird im Summenblock unten ausgewiesen."
            ),
        )
        dateiname = (
            f"{_dateiname(_hausnummer(lieg.adresse))}_{_dateiname(erg.wohnung_bezeichnung)}"
            f"_{_dateiname(gr.name)}_anteil.pdf"
        )
        erzeuge_abrechnung_pdf(daten, PDF_DIR / ordner_name / dateiname)
        ergebnisse.append(
            {
                "name": gr.name,
                "anteil_prozent": gr.anteil_prozent,
                "dateiname": dateiname,
                "download_url": f"/api/v1/perioden/{periode_id}/mieter/{mieter_id}/personen-split/pdf/download"
                f"?ordner={quote(ordner_name)}&datei={quote(dateiname)}",
            }
        )

    if body.speichern:
        db.query(WohnungPersonenSplitVorlage).filter(
            WohnungPersonenSplitVorlage.wohnung_id == erg.wohnung_id
        ).delete()
        for i, gr in enumerate(body.gruppen):
            db.add(
                WohnungPersonenSplitVorlage(
                    wohnung_id=erg.wohnung_id,
                    name=gr.name,
                    anteil_prozent=gr.anteil_prozent,
                    sortierung=i,
                )
            )
        db.commit()

    return ApiResponse(ok=True, data=ergebnisse)


@router.get("/perioden/{periode_id}/mieter/{mieter_id}/personen-split/pdf/download")
def lade_personen_split_pdf(
    periode_id: int, mieter_id: int, ordner: str, datei: str
) -> FileResponse:
    return _serve_pdf(ordner, datei)


# ── Sammelabrechnung: Jahresübersicht pro Liegenschaft ───────────────────────

@router.post("/perioden/{periode_id}/sammelabrechnung/pdf")
def erzeuge_sammelabrechnung(
    periode_id: int, body: SammelabrechnungRequest, db: Session = Depends(get_db)
) -> ApiResponse:
    try:
        daten = sammelabrechnung_daten(db, periode_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    vorlage = db.query(PdfVorlage).first()
    optionen = SammelabrechnungOptionen(
        zaehlerstaende=body.zaehlerstaende,
        vorauszahlungen=body.vorauszahlungen,
        saldo=body.saldo,
        legende=body.legende,
    )
    ordner_name = daten["periode_bezeichnung"].replace("/", "-")
    dateiname = f"Jahresuebersicht_{_dateiname(daten['liegenschaft_name'])}.pdf"
    erzeuge_sammelabrechnung_pdf(
        daten,
        optionen,
        PDF_DIR / ordner_name / dateiname,
        erstellt_am=date.today().strftime("%d.%m.%Y"),
        fusszeile_text=vorlage.fusszeile_text if vorlage else None,
        rand_oben_mm=(vorlage.rand_oben_mm if vorlage and vorlage.rand_oben_mm else RAND_OBEN_MM),
        rand_unten_mm=(vorlage.rand_unten_mm if vorlage and vorlage.rand_unten_mm else RAND_UNTEN_MM),
        rand_links_mm=(vorlage.rand_links_mm if vorlage and vorlage.rand_links_mm else RAND_LINKS_MM),
        rand_rechts_mm=(vorlage.rand_rechts_mm if vorlage and vorlage.rand_rechts_mm else RAND_RECHTS_MM),
    )
    return ApiResponse(
        ok=True,
        data={
            "dateiname": dateiname,
            "download_url": f"/api/v1/perioden/{periode_id}/sammelabrechnung/pdf/download"
            f"?ordner={quote(ordner_name)}&datei={quote(dateiname)}",
        },
    )


@router.get("/perioden/{periode_id}/sammelabrechnung/pdf/download")
def lade_sammelabrechnung_pdf(periode_id: int, ordner: str, datei: str) -> FileResponse:
    return _serve_pdf(ordner, datei)


# ── DirektKostenart: konfigurierbare Kostenart-Kacheln (global, alle Häuser) ──

@router.get("/direkt-kostenarten")
def list_direkt_kostenarten(db: Session = Depends(get_db)) -> ApiResponse:
    rows = (
        db.query(DirektKostenart)
        .order_by(DirektKostenart.sortierung, DirektKostenart.id)
        .all()
    )
    return ApiResponse(ok=True, data=[DirektKostenartOut.model_validate(r) for r in rows])


@router.post("/direkt-kostenarten", status_code=201)
def create_direkt_kostenart(body: DirektKostenartCreate, db: Session = Depends(get_db)) -> ApiResponse:
    obj = DirektKostenart(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return ApiResponse(ok=True, data=DirektKostenartOut.model_validate(obj))


@router.put("/direkt-kostenarten/{kostenart_id}")
def update_direkt_kostenart(
    kostenart_id: int, body: DirektKostenartUpdate, db: Session = Depends(get_db)
) -> ApiResponse:
    obj = db.get(DirektKostenart, kostenart_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Kostenart nicht gefunden")
    for k, v in body.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return ApiResponse(ok=True, data=DirektKostenartOut.model_validate(obj))


@router.delete("/direkt-kostenarten/{kostenart_id}")
def delete_direkt_kostenart(kostenart_id: int, db: Session = Depends(get_db)) -> ApiResponse:
    obj = db.get(DirektKostenart, kostenart_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Kostenart nicht gefunden")
    db.delete(obj)  # CASCADE löscht zugehörige DirektKostenartWert/DirektUebersteuerung mit
    db.commit()
    return ApiResponse(ok=True, data=None)


# ── DirektKostenartWert: die €-Sätze je Periode ──────────────────────────────

@router.get("/perioden/{periode_id}/direkt-kostenarten-werte")
def list_direkt_kostenarten_werte(periode_id: int, db: Session = Depends(get_db)) -> ApiResponse:
    rows = (
        db.query(DirektKostenartWert)
        .filter(DirektKostenartWert.abrechnungsperiode_id == periode_id)
        .all()
    )
    return ApiResponse(ok=True, data=[DirektKostenartWertOut.model_validate(r) for r in rows])


def _speichere_kostenart_wert(db: Session, periode_id: int, kostenart_id: int, body: DirektKostenartWertSet) -> None:
    vorhanden = (
        db.query(DirektKostenartWert)
        .filter(
            DirektKostenartWert.abrechnungsperiode_id == periode_id,
            DirektKostenartWert.kostenart_id == kostenart_id,
        )
        .first()
    )
    alle_leer = (
        body.preis_pro_einheit is None
        and body.preis_grund_pro_m2 is None
        and body.preis_verbrauch_pro_einheit is None
    )
    if alle_leer:
        if vorhanden:
            db.delete(vorhanden)
        return
    manuell = body.preis_grund_pro_m2 is not None or body.preis_verbrauch_pro_einheit is not None
    if vorhanden:
        vorhanden.preis_pro_einheit = body.preis_pro_einheit
        vorhanden.preis_grund_pro_m2 = body.preis_grund_pro_m2
        vorhanden.preis_verbrauch_pro_einheit = body.preis_verbrauch_pro_einheit
        vorhanden.verhaeltnis_grund = body.verhaeltnis_grund
        if manuell:
            vorhanden.saetze_manuell_angepasst = True
    else:
        db.add(
            DirektKostenartWert(
                abrechnungsperiode_id=periode_id,
                kostenart_id=kostenart_id,
                preis_pro_einheit=body.preis_pro_einheit,
                preis_grund_pro_m2=body.preis_grund_pro_m2,
                preis_verbrauch_pro_einheit=body.preis_verbrauch_pro_einheit,
                verhaeltnis_grund=body.verhaeltnis_grund,
                saetze_manuell_angepasst=manuell,
            )
        )


@router.put("/perioden/{periode_id}/direkt-kostenarten-werte/{kostenart_id}")
def set_direkt_kostenart_wert(
    periode_id: int, kostenart_id: int, body: DirektKostenartWertSet, db: Session = Depends(get_db)
) -> ApiResponse:
    periode = db.get(Abrechnungsperiode, periode_id)
    if not periode:
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")
    if not db.get(DirektKostenart, kostenart_id):
        raise HTTPException(status_code=404, detail="Kostenart nicht gefunden")

    _speichere_kostenart_wert(db, periode_id, kostenart_id, body)

    # Gleiche Sätze automatisch für andere Häuser mit identischem Zeitraum
    # übernehmen — dieselbe Logik wie zuvor bei SchluesselPreis, jetzt über
    # die (global geltende) kostenart_id statt eines String-Schlüssels.
    andere = _andere_haeuser_perioden(db, periode)
    for p in andere:
        _speichere_kostenart_wert(db, p.id, kostenart_id, body)
    db.commit()

    wert = (
        db.query(DirektKostenartWert)
        .filter(
            DirektKostenartWert.abrechnungsperiode_id == periode_id,
            DirektKostenartWert.kostenart_id == kostenart_id,
        )
        .first()
    )
    andere_namen = [
        lieg.name for p in andere if (lieg := db.get(Liegenschaft, p.liegenschaft_id)) is not None
    ]
    return ApiResponse(
        ok=True,
        data={
            "wert": DirektKostenartWertOut.model_validate(wert).model_dump() if wert else None,
            "auch_uebernommen_fuer": andere_namen,
        },
    )


@router.post("/perioden/{periode_id}/direkt-kostenarten-werte/{kostenart_id}/split-rechner")
def split_rechner(
    periode_id: int, kostenart_id: int, body: DirektSplitRechner, db: Session = Depends(get_db)
) -> ApiResponse:
    """Gesamtbetrag + Gesamteinheiten + Verhältnis → zwei abgeleitete Sätze.
    Setzt saetze_manuell_angepasst=False (automatisch abgeleitet)."""
    periode = db.get(Abrechnungsperiode, periode_id)
    if not periode:
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")
    kostenart = db.get(DirektKostenart, kostenart_id)
    if not kostenart:
        raise HTTPException(status_code=404, detail="Kostenart nicht gefunden")
    if not kostenart.hat_grundkosten_split:
        raise HTTPException(status_code=400, detail="Diese Kostenart hat keinen Grundkosten-Split")

    grund_betrag = body.gesamtbetrag * body.verhaeltnis_grund
    verbrauch_betrag = body.gesamtbetrag - grund_betrag
    preis_grund = round(grund_betrag / body.gesamt_m2, 5)
    preis_verbrauch = round(verbrauch_betrag / body.gesamt_verbrauch, 5)

    vorhanden = (
        db.query(DirektKostenartWert)
        .filter(
            DirektKostenartWert.abrechnungsperiode_id == periode_id,
            DirektKostenartWert.kostenart_id == kostenart_id,
        )
        .first()
    )
    if vorhanden:
        vorhanden.preis_grund_pro_m2 = preis_grund
        vorhanden.preis_verbrauch_pro_einheit = preis_verbrauch
        vorhanden.verhaeltnis_grund = body.verhaeltnis_grund
        vorhanden.saetze_manuell_angepasst = False
    else:
        db.add(
            DirektKostenartWert(
                abrechnungsperiode_id=periode_id,
                kostenart_id=kostenart_id,
                preis_grund_pro_m2=preis_grund,
                preis_verbrauch_pro_einheit=preis_verbrauch,
                verhaeltnis_grund=body.verhaeltnis_grund,
                saetze_manuell_angepasst=False,
            )
        )

    andere = _andere_haeuser_perioden(db, periode)
    ersatz_body = DirektKostenartWertSet(
        preis_grund_pro_m2=preis_grund,
        preis_verbrauch_pro_einheit=preis_verbrauch,
        verhaeltnis_grund=body.verhaeltnis_grund,
    )
    for p in andere:
        # Andere Häuser übernehmen dieselben €/Einheit-SÄTZE (nicht die Beträge —
        # deren eigene m²/Verbrauch bestimmen den tatsächlichen Betrag dort).
        vorhanden_p = (
            db.query(DirektKostenartWert)
            .filter(
                DirektKostenartWert.abrechnungsperiode_id == p.id,
                DirektKostenartWert.kostenart_id == kostenart_id,
            )
            .first()
        )
        if vorhanden_p:
            vorhanden_p.preis_grund_pro_m2 = preis_grund
            vorhanden_p.preis_verbrauch_pro_einheit = preis_verbrauch
            vorhanden_p.verhaeltnis_grund = body.verhaeltnis_grund
            vorhanden_p.saetze_manuell_angepasst = False
        else:
            db.add(
                DirektKostenartWert(
                    abrechnungsperiode_id=p.id,
                    kostenart_id=kostenart_id,
                    preis_grund_pro_m2=preis_grund,
                    preis_verbrauch_pro_einheit=preis_verbrauch,
                    verhaeltnis_grund=body.verhaeltnis_grund,
                    saetze_manuell_angepasst=False,
                )
            )
    db.commit()

    return ApiResponse(
        ok=True,
        data={
            "preis_grund_pro_m2": preis_grund,
            "preis_verbrauch_pro_einheit": preis_verbrauch,
            "auch_uebernommen_fuer": [
                lieg.name
                for p in andere
                if (lieg := db.get(Liegenschaft, p.liegenschaft_id)) is not None
            ],
        },
    )


# ── DirektUebersteuerung: manuelle Korrekturen im Ausprobieren-Modus ──────────

@router.get("/perioden/{periode_id}/direkt-uebersteuerungen")
def list_uebersteuerungen(periode_id: int, db: Session = Depends(get_db)) -> ApiResponse:
    rows = (
        db.query(DirektUebersteuerung)
        .filter(DirektUebersteuerung.abrechnungsperiode_id == periode_id)
        .all()
    )
    return ApiResponse(ok=True, data=[DirektUebersteuerungOut.model_validate(r) for r in rows])


def _speichere_uebersteuerung(db: Session, periode_id: int, body: DirektUebersteuerungSet) -> None:
    filt = [
        DirektUebersteuerung.abrechnungsperiode_id == periode_id,
        DirektUebersteuerung.feld == body.feld,
    ]
    if body.mieter_id is not None:
        filt.append(DirektUebersteuerung.mieter_id == body.mieter_id)
    if body.wohnung_id is not None:
        filt.append(DirektUebersteuerung.wohnung_id == body.wohnung_id)
    if body.kostenart_id is not None:
        filt.append(DirektUebersteuerung.kostenart_id == body.kostenart_id)
    vorhanden = db.query(DirektUebersteuerung).filter(*filt).first()

    if body.wert is None:
        if vorhanden:
            db.delete(vorhanden)
        return

    if vorhanden:
        vorhanden.wert = body.wert
        vorhanden.begruendung = body.begruendung
    else:
        db.add(
            DirektUebersteuerung(
                abrechnungsperiode_id=periode_id,
                mieter_id=body.mieter_id,
                wohnung_id=body.wohnung_id,
                kostenart_id=body.kostenart_id,
                feld=body.feld,
                wert=body.wert,
                begruendung=body.begruendung,
            )
        )


@router.put("/perioden/{periode_id}/direkt-uebersteuerungen")
def set_uebersteuerung(
    periode_id: int, body: DirektUebersteuerungSet, db: Session = Depends(get_db)
) -> ApiResponse:
    if not db.get(Abrechnungsperiode, periode_id):
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")
    _speichere_uebersteuerung(db, periode_id, body)
    db.commit()
    return ApiResponse(ok=True, data={"feld": body.feld, "wert": body.wert})


def _schluessel_mieter_out(e: SchluesselMieterErgebnis) -> SchluesselMieterOut:
    return SchluesselMieterOut(
        mieter_id=e.mieter_id,
        anzeigename=e.anzeigename,
        wohnung_id=e.wohnung_id,
        wohnung_bezeichnung=e.wohnung_bezeichnung,
        miet_von=e.miet_von,
        miet_bis=e.miet_bis,
        miettage=e.miettage,
        periode_tage=e.periode_tage,
        zeilen=[
            SchluesselZeileOut(
                schluessel=z.schluessel,
                kostenart=z.kostenart,
                grundlage=z.grundlage,
                betrag=round(z.betrag, 2),
                kostenart_id=z.kostenart_id,
                manuell_angepasst=z.manuell_angepasst,
                zaehler_typ=z.zaehler_typ,
                einheiten=z.einheiten,
            )
            for z in e.zeilen
        ],
        fehlende_daten=e.fehlende_daten,
        warnungen=e.warnungen,
        summe=e.summe,
        vorauszahlung_ist=e.vorauszahlung_ist,
        saldo=e.saldo,
        berechenbar=e.berechenbar,
        personen=e.personen,
    )


def _speichere_verbrauch_override_transient(
    db: Session, periode_id: int, ov: VorschauVerbrauchOverride
) -> None:
    """Wie PUT .../wohnung-verbrauch bzw. .../verbrauch-override, nur ohne
    eigenen Commit — für die Vorschau, die am Ende immer rollt back."""
    if ov.wohnung_id is not None:
        vorhanden = (
            db.query(WohnungVerbrauch)
            .filter(
                WohnungVerbrauch.abrechnungsperiode_id == periode_id,
                WohnungVerbrauch.wohnung_id == ov.wohnung_id,
                WohnungVerbrauch.zaehler_typ == ov.zaehler_typ,
            )
            .first()
        )
        if vorhanden:
            vorhanden.wert = ov.wert
        else:
            db.add(
                WohnungVerbrauch(
                    wohnung_id=ov.wohnung_id,
                    abrechnungsperiode_id=periode_id,
                    zaehler_typ=ov.zaehler_typ,
                    wert=ov.wert,
                )
            )
    elif ov.mieter_id is not None:
        vorhanden_mieter = (
            db.query(MieterVerbrauch)
            .filter(
                MieterVerbrauch.abrechnungsperiode_id == periode_id,
                MieterVerbrauch.mieter_id == ov.mieter_id,
                MieterVerbrauch.zaehler_typ == ov.zaehler_typ,
            )
            .first()
        )
        if vorhanden_mieter:
            vorhanden_mieter.wert = ov.wert
        else:
            db.add(
                MieterVerbrauch(
                    mieter_id=ov.mieter_id,
                    abrechnungsperiode_id=periode_id,
                    zaehler_typ=ov.zaehler_typ,
                    wert=ov.wert,
                )
            )


@router.post("/perioden/{periode_id}/mieter/{mieter_id}/schluessel-abrechnung/vorschau")
def vorschau_schluessel_abrechnung(
    periode_id: int, mieter_id: int, body: VorschauRequest, db: Session = Depends(get_db)
) -> ApiResponse:
    """Ausprobieren-Modus: rein lesende Live-Vorschau. Wendet die übergebenen
    Overrides nur innerhalb dieser Transaktion an (dieselbe Engine wie die
    echte Berechnung — keine Nachbildung der Formeln in JS) und macht sie
    per Rollback rückgängig, egal was passiert. Es wird nichts persistiert."""
    periode = db.get(Abrechnungsperiode, periode_id)
    if not periode:
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")
    try:
        for ov in body.uebersteuerungen:
            _speichere_uebersteuerung(db, periode_id, ov)
        for vov in body.verbrauch_overrides:
            _speichere_verbrauch_override_transient(db, periode_id, vov)
        for w in body.kostenart_werte:
            _speichere_kostenart_wert(
                db,
                periode_id,
                w.kostenart_id,
                DirektKostenartWertSet(
                    preis_pro_einheit=w.preis_pro_einheit,
                    preis_grund_pro_m2=w.preis_grund_pro_m2,
                    preis_verbrauch_pro_einheit=w.preis_verbrauch_pro_einheit,
                    verhaeltnis_grund=w.verhaeltnis_grund,
                ),
            )
        db.flush()
        erg = berechne_schluessel_mieter(db, periode_id, mieter_id)
        if erg is None:
            raise HTTPException(status_code=404, detail="Mieter nicht in dieser Periode gefunden")
        result = _schluessel_mieter_out(erg)
    finally:
        db.rollback()
    return ApiResponse(ok=True, data=result)


@router.post("/perioden/{periode_id}/schluessel-abrechnung/vorschau")
def vorschau_schluessel_abrechnung_periode(
    periode_id: int, body: VorschauRequest, db: Session = Depends(get_db)
) -> ApiResponse:
    """Period-weite Variante von vorschau_schluessel_abrechnung() — für den
    "Mit angepassten Stammdaten ausprobieren"-Bereich am Kopf der Abrechnung,
    der Kostenart-Satz-Änderungen live über ALLE Mieter der Periode zeigt statt
    nur für einen einzelnen. Gleiches Rollback-Prinzip, nichts wird persistiert."""
    periode = db.get(Abrechnungsperiode, periode_id)
    if not periode:
        raise HTTPException(status_code=404, detail="Periode nicht gefunden")
    try:
        for ov in body.uebersteuerungen:
            _speichere_uebersteuerung(db, periode_id, ov)
        for vov in body.verbrauch_overrides:
            _speichere_verbrauch_override_transient(db, periode_id, vov)
        for w in body.kostenart_werte:
            _speichere_kostenart_wert(
                db,
                periode_id,
                w.kostenart_id,
                DirektKostenartWertSet(
                    preis_pro_einheit=w.preis_pro_einheit,
                    preis_grund_pro_m2=w.preis_grund_pro_m2,
                    preis_verbrauch_pro_einheit=w.preis_verbrauch_pro_einheit,
                    verhaeltnis_grund=w.verhaeltnis_grund,
                ),
            )
        db.flush()
        ergebnisse = berechne_schluessel_periode(db, periode_id)
        result = [_schluessel_mieter_out(e) for e in ergebnisse]
    finally:
        db.rollback()
    return ApiResponse(ok=True, data=result)

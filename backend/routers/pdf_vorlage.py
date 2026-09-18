"""Global editierbare PDF-Vorlage (Briefkopf, Texte, Fußzeile) für die
Abrechnungs-PDFs. Singleton: es gibt genau eine Zeile, wird bei erstem
Zugriff mit Default-Werten angelegt."""

import tempfile
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from database import get_db
from models import PdfVorlage
from pdf_abrechnung import AbrechnungPdfDaten, AbrechnungZeile, erzeuge_abrechnung_pdf
from pdf_vorlage_utils import basis_pdf_kwargs
from schemas import ApiResponse, PdfVorlageIn, PdfVorlageOut

router = APIRouter(tags=["PDF-Vorlage"])

# Platzhalter-„Liegenschaft" für die Vorschau — basis_pdf_kwargs() braucht
# irgendeinen Fallback-Absender, wenn die Vorlage-Felder leer sind.
_DUMMY_LIEG = SimpleNamespace(
    name="Vermieter Mustermann", adresse="Musterstraße 1", plz="12345", ort="Musterstadt"
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_or_create(db: Session) -> PdfVorlage:
    obj = db.query(PdfVorlage).first()
    if not obj:
        obj = PdfVorlage()
        db.add(obj)
        db.commit()
        db.refresh(obj)
    return obj


@router.get("/pdf-vorlage")
def get_pdf_vorlage(db: Session = Depends(get_db)) -> ApiResponse:
    obj = _get_or_create(db)
    return ApiResponse(ok=True, data=PdfVorlageOut.model_validate(obj))


@router.put("/pdf-vorlage")
def set_pdf_vorlage(body: PdfVorlageIn, db: Session = Depends(get_db)) -> ApiResponse:
    obj = _get_or_create(db)
    for k, v in body.model_dump().items():
        setattr(obj, k, v)
    obj.aktualisiert_am = _now_iso()
    db.commit()
    db.refresh(obj)
    return ApiResponse(ok=True, data=PdfVorlageOut.model_validate(obj))


def _vorschau_pdf_bytes(vorlage) -> bytes:
    """Baut das Beispiel-PDF aus einem vorlage-artigen Objekt (PdfVorlage ODER
    PdfVorlageIn — beide haben dieselben Feldnamen, basis_pdf_kwargs greift
    nur per getattr zu). Schreibt in ein eigenes Tempdir pro Aufruf, damit
    parallele Vorschau-Anfragen sich nie gegenseitig eine Datei überschreiben."""
    daten = AbrechnungPdfDaten(
        **basis_pdf_kwargs(vorlage, _DUMMY_LIEG),
        empfaenger_name="Max Mustermieter",
        empfaenger_strasse=f"{vorlage.absender_strasse or 'Musterstraße 1'}, Whg 3",
        empfaenger_ort=f"{vorlage.absender_plz or '12345'} {vorlage.absender_ort or 'Musterstadt'}",
        zeitraum_von="01.06.2025",
        zeitraum_bis="31.05.2026",
        wohnung="Whg 3",
        zeilen=[
            AbrechnungZeile("Heizung Grundkosten", "52,00 m²", 145.60),
            AbrechnungZeile("Heizung Verbrauch", "1.850,00 kWh", 129.50),
            AbrechnungZeile("Wasser/Abwasser", "42,30 m³", 187.42),
            AbrechnungZeile("Grundsteuer", "52,00 m²", 78.20),
            AbrechnungZeile("Müllabfuhr", "2 Personen", 96.00),
        ],
        vorauszahlung=650.00,
    )
    with tempfile.TemporaryDirectory() as tmpdir:
        pfad = Path(tmpdir) / "vorschau.pdf"
        erzeuge_abrechnung_pdf(daten, pfad)
        return pfad.read_bytes()


@router.get("/pdf-vorlage/vorschau")
def vorschau_gespeicherte_vorlage(db: Session = Depends(get_db)) -> Response:
    """PDF aus der gespeicherten Vorlage — für einen Link/Tab-Aufruf ohne
    vorherige Formular-Änderungen."""
    pdf_bytes = _vorschau_pdf_bytes(_get_or_create(db))
    return Response(content=pdf_bytes, media_type="application/pdf")


@router.post("/pdf-vorlage/vorschau")
def vorschau_entwurf(body: PdfVorlageIn) -> Response:
    """Live-Vorschau für den Editor: rendert die ÜBERGEBENEN, noch nicht
    gespeicherten Formularwerte direkt als PDF-Bytes (kein Download-Header,
    keine Datei auf Disk) — fürs Embedding in ein <iframe> im Editor-Panel."""
    pdf_bytes = _vorschau_pdf_bytes(body)
    return Response(content=pdf_bytes, media_type="application/pdf")

"""Gemeinsame Bausteine für alle drei PDF-Erzeugungs-Stellen (Einzel-, Kombi-
und Vorlage-Vorschau-PDF) — vermeidet, dass die PdfVorlage-Fallback-Logik und
das Datumsformat an mehreren Stellen unabhängig gepflegt werden müssen."""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from models import Liegenschaft, PdfVorlage
from pdf_abrechnung import RAND_LINKS_MM, RAND_OBEN_MM, RAND_RECHTS_MM, RAND_UNTEN_MM

if TYPE_CHECKING:
    from schemas import PdfAbschnitteOptionen, PdfVorlageIn


def fmt_datum_de(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}.{m}.{y}"


def basis_pdf_kwargs(
    vorlage: "PdfVorlage | PdfVorlageIn | None",
    lieg: Liegenschaft,
    optionen: "PdfAbschnitteOptionen | None" = None,
) -> dict:
    """Alle AbrechnungPdfDaten-Felder, die unabhängig vom konkreten Mieter/
    Zeitraum sind — Absender, Vorlage-Texte, Ränder. Rückgabe wird per `**`
    in AbrechnungPdfDaten(...) gespreadet, Aufrufer ergänzt Empfänger/
    Zeitraum/Zeilen/Vorauszahlung/Hinweis.

    ``optionen`` sind die Pro-Erzeugung-Checkboxen (Datum/Absender/Empfänger
    an-/ausblenden) — ohne sie (z. B. reine Vorschau) gilt der Vorlage-Default
    bzw. „alles an"."""

    def _v(feld: str) -> str | None:
        wert = getattr(vorlage, feld, None) if vorlage else None
        return wert if wert else None

    def _vf(feld: str) -> float | None:
        wert = getattr(vorlage, feld, None) if vorlage else None
        return float(wert) if wert is not None else None

    return dict(
        absender_name=_v("absender_name")
        or (lieg.name.split(",")[0] if "," in lieg.name else "Vermieter"),
        absender_strasse=_v("absender_strasse") or lieg.adresse,
        absender_ort=f"{_v('absender_plz') or lieg.plz} {_v('absender_ort') or lieg.ort}",
        absender_kontakt=_v("absender_kontakt"),
        kopf_titel=_v("kopf_titel") or "Mietnebenkostenabrechnung",
        anrede_text=_v("anrede_text"),
        datum_anzeigen=(
            optionen.datum_anzeigen if optionen else (vorlage.datum_anzeigen if vorlage else True)
        ),
        datum=fmt_datum_de((optionen.datum if optionen and optionen.datum else date.today().isoformat())),
        datum_ort=_v("datum_ort_override"),
        absender_anzeigen=optionen.absender_anzeigen if optionen else True,
        empfaenger_anzeigen=optionen.empfaenger_anzeigen if optionen else True,
        schlusstext=_v("schlusstext"),
        fusszeile_text=_v("fusszeile_text"),
        rand_oben_mm=_vf("rand_oben_mm") or RAND_OBEN_MM,
        rand_unten_mm=_vf("rand_unten_mm") or RAND_UNTEN_MM,
        rand_links_mm=_vf("rand_links_mm") or RAND_LINKS_MM,
        rand_rechts_mm=_vf("rand_rechts_mm") or RAND_RECHTS_MM,
        auto_skalieren=vorlage.auto_skalieren if vorlage else True,
    )

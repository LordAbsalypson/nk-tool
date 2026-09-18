"""PDF-Erzeugung für Nebenkostenabrechnungen im Direkt-Preise-Modus.

Layout: klassischer Geschäftsbrief, eine Seite, ausschließlich Schwarz/Weiß
(Graustufen für Nebentexte, keine Farbakzente) — Absender/Empfänger oben,
Titel + Zeitraum, dreispaltige Kostentabelle, Summenblock, optional Anrede/
Schlusstext, optional fixe Fußzeile (Bankverbindung o. ä.) am Seitenende.
Alle Textbausteine kommen aus ``PdfVorlage`` (siehe ``routers/pdf_vorlage.py``)
und sind vom Nutzer im Tool editierbar; Felder sind optional und werden nur
gerendert, wenn gesetzt. Absender-, Empfänger- und Datumszeile lassen sich
zusätzlich pro Erzeugung ein-/ausblenden (siehe ``*_anzeigen``-Felder).

Bei zu vielen Kostenzeilen (v. a. kombinierte Abrechnungen über mehrere
Wohnungen/Zeiträume) würde der Inhalt sonst auf Seite 2 umbrechen — mit
``auto_skalieren=True`` (Default) wird stattdessen mehrfach mit kleiner
werdender Schrift/Abständen gebaut, bis alles auf eine Seite passt oder eine
lesbare Mindestgröße erreicht ist (dann bleibt es zweiseitig, statt weiter
zu schrumpfen).
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from functools import partial
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet

GREY = colors.HexColor("#595959")
BLACK = colors.black

# Schmale Standardränder — im PDF-Vorlage-Editor überschreibbar (5–40 mm).
RAND_OBEN_MM = 14.0
RAND_UNTEN_MM = 14.0
RAND_LINKS_MM = 16.0
RAND_RECHTS_MM = 16.0

FOOTER_LINE_HEIGHT_MM = 3.6
FOOTER_GAP_ABOVE_MM = 4.0  # Abstand zwischen Inhaltsende und Trennlinie
FOOTER_BOTTOM_PAD_MM = 2.0  # kleiner Puffer unter der letzten Zeile

# Skalierungsstufen bei Überlauf, größte zuerst — 1.0 ist der Normalfall
# (nahezu immer bei einer Stufe fertig). Untere Grenze bewusst nicht kleiner,
# damit die Schrift lesbar bleibt (Vorgabe: "lesbar ist wichtig").
SKALIERUNGSSTUFEN = (1.0, 0.88, 0.78, 0.70)


@dataclass
class AbrechnungZeile:
    kostenart: str
    grundlage: str
    betrag: float
    # Abschnitts-Überschrift statt Kostenzeile — für kombinierte Abrechnungen
    # über mehrere Wohnungen/Zeiträume hinweg (z. B. Wohnungstausch).
    ist_abschnitt: bool = False


@dataclass
class AbrechnungPdfDaten:
    absender_name: str
    absender_strasse: str
    absender_ort: str  # "PLZ Ort"
    empfaenger_name: str
    empfaenger_strasse: str
    empfaenger_ort: str
    zeitraum_von: str  # "01.06.2025"
    zeitraum_bis: str  # "31.05.2026"
    wohnung: str
    zeilen: list[AbrechnungZeile]
    vorauszahlung: float
    absender_kontakt: str | None = None
    kopf_titel: str = "Mietnebenkostenabrechnung"
    anrede_text: str | None = None
    datum_anzeigen: bool = True
    datum: str = ""  # "22.06.2025" — nur relevant wenn datum_anzeigen
    datum_ort: str | None = None  # Override für den Ortsnamen im Datumszeile
    absender_anzeigen: bool = True
    empfaenger_anzeigen: bool = True
    hinweis: str | None = None  # z. B. Mieterwechsel-Erläuterung
    schlusstext: str | None = None
    fusszeile_text: str | None = None  # mehrzeilig, per "\n" getrennt
    rand_oben_mm: float = RAND_OBEN_MM
    rand_unten_mm: float = RAND_UNTEN_MM
    rand_links_mm: float = RAND_LINKS_MM
    rand_rechts_mm: float = RAND_RECHTS_MM
    auto_skalieren: bool = True
    # Personen-Split (siehe /personen-split/pdf): wenn gesetzt, zeigt der
    # Summenblock "Gesamtkosten Wohnung" -> "Ihr Anteil (X%)" statt der
    # normalen "Summe der Nebenkosten" — die Kostenzeilen selbst bleiben immer
    # zu 100% (unskaliert), wie gefordert ("alle Werte angezeigt").
    anteil_prozent: float | None = None


def _eur(n: float) -> str:
    s = f"{n:,.2f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".") + " €"


def _footer_zeilen(fusszeile_text: str | None) -> list[str]:
    return [z for z in (fusszeile_text or "").split("\n") if z.strip()]


def _footer_reserve_mm(fusszeile_text: str | None) -> float:
    """Zusätzlicher Platz unterhalb von rand_unten_mm, den die Fußzeile braucht —
    hängt von der Zeilenzahl ab, damit sie nie mit dem Inhalt kollidiert."""
    zeilen = _footer_zeilen(fusszeile_text)
    if not zeilen:
        return 0.0
    return FOOTER_GAP_ABOVE_MM + len(zeilen) * FOOTER_LINE_HEIGHT_MM + FOOTER_BOTTOM_PAD_MM


def _draw_fusszeile(
    canvas: Canvas,
    _doc,
    text: str,
    rand_unten_mm: float,
    rand_links_mm: float,
    rand_rechts_mm: float,
    schriftgroesse: float,
    breite_pt: float = A4[0],
) -> None:
    zeilen = _footer_zeilen(text)
    if not zeilen:
        return
    canvas.saveState()
    breite = breite_pt
    linie_y = (rand_unten_mm + len(zeilen) * FOOTER_LINE_HEIGHT_MM + FOOTER_BOTTOM_PAD_MM) * mm
    canvas.setStrokeColor(GREY)
    canvas.setLineWidth(0.4)
    canvas.line(rand_links_mm * mm, linie_y, breite - rand_rechts_mm * mm, linie_y)
    canvas.setFont("Helvetica", schriftgroesse)
    canvas.setFillColor(GREY)
    y = linie_y - 5 * mm
    for zeile in zeilen:
        canvas.drawCentredString(breite / 2, y, zeile)
        y -= FOOTER_LINE_HEIGHT_MM * mm
    canvas.restoreState()


def _groessen(skala: float) -> dict:
    """Alle Schrift-/Abstandsgrößen für eine Skalierungsstufe. Überschrift
    schrumpft bewusst langsamer als der Rest (bleibt optisch prominent),
    alles hat eine lesbare Untergrenze statt gegen 0 zu laufen."""
    return dict(
        normal_fs=max(10 * skala, 7.5),
        normal_leading=max(13 * skala, 9.5),
        small_fs=max(8 * skala, 6.5),
        small_leading=max(11 * skala, 8.5),
        heading_fs=max(14 * skala, 11.5),
        abschnitt_fs=max(9.5 * skala, 7.5),
        tabelle_fs=max(9.5 * skala, 7.5),
        tabelle_pad=max(4 * skala, 1.8),
        abschnitt_pad_top=max(8 * skala, 3),
        fuss_fs=max(10 * skala, 7.5),
        fuss_fs_last=max(12 * skala, 9),
        fuss_pad_last=max(8 * skala, 3),
        footer_fs=max(7.5 * skala, 6.5),
        sp_kopf=6 * skala,
        sp_datum=8 * skala,
        sp_periode=5 * skala,
        sp_hinweis=3 * skala,
        sp_anrede=3 * skala,
        sp_tabelle=4 * skala,
        sp_schluss=6 * skala,
    )


def _baue_story(daten: AbrechnungPdfDaten, g: dict) -> list:
    styles = getSampleStyleSheet()
    normal = ParagraphStyle(
        "normal", parent=styles["Normal"], fontName="Helvetica",
        fontSize=g["normal_fs"], leading=g["normal_leading"],
    )
    small = ParagraphStyle(
        "small", parent=normal, fontSize=g["small_fs"], leading=g["small_leading"], textColor=GREY
    )
    heading = ParagraphStyle(
        "heading", parent=normal, fontName="Helvetica-Bold", fontSize=g["heading_fs"], spaceAfter=2
    )
    abschnitt_bold = ParagraphStyle(
        "abschnitt", parent=normal, fontName="Helvetica-Bold", fontSize=g["abschnitt_fs"]
    )

    story: list = []

    # Absender/Empfänger-Kopf, zwei Spalten (DIN-5008-Anmutung) — jede Spalte
    # einzeln ein-/ausblendbar, ganzer Block entfällt nur wenn beide aus sind.
    if daten.absender_anzeigen or daten.empfaenger_anzeigen:
        absender_zeilen = [daten.absender_name, daten.absender_strasse, daten.absender_ort]
        if daten.absender_kontakt:
            absender_zeilen.append(daten.absender_kontakt)
        links = Paragraph("<br/>".join(absender_zeilen), normal) if daten.absender_anzeigen else ""
        rechts = (
            Paragraph(
                f"{daten.empfaenger_name}<br/>{daten.empfaenger_strasse}<br/>{daten.empfaenger_ort}",
                normal,
            )
            if daten.empfaenger_anzeigen
            else ""
        )
        kopf = Table([[links, rechts]], colWidths=[80 * mm, 80 * mm])
        kopf.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
        story.append(kopf)
        story.append(Spacer(1, g["sp_kopf"] * mm))

    if daten.datum_anzeigen:
        ort = daten.datum_ort or (
            daten.absender_ort.split(" ", 1)[-1]
            if " " in daten.absender_ort
            else daten.absender_ort
        )
        story.append(Paragraph(f"{ort}, den {daten.datum}", normal))
        story.append(Spacer(1, g["sp_datum"] * mm))

    story.append(Paragraph(daten.kopf_titel, heading))
    story.append(
        Paragraph(
            f"vom {daten.zeitraum_von} bis {daten.zeitraum_bis} — Wohnung: {daten.wohnung}",
            normal,
        )
    )
    story.append(Spacer(1, g["sp_periode"] * mm))

    if daten.hinweis:
        story.append(Paragraph(daten.hinweis, small))
        story.append(Spacer(1, g["sp_hinweis"] * mm))

    if daten.anrede_text:
        story.append(Paragraph(daten.anrede_text, normal))
        story.append(Spacer(1, g["sp_anrede"] * mm))

    rows: list[list] = [["Kostenart", "Berechnungsgrundlage", "Betrag in €"]]
    abschnitt_zeilen_idx: list[int] = []
    for z in daten.zeilen:
        if z.ist_abschnitt:
            abschnitt_zeilen_idx.append(len(rows))
            rows.append([Paragraph(z.kostenart, abschnitt_bold), "", ""])
        else:
            rows.append([z.kostenart, z.grundlage, _eur(z.betrag)])

    summe = sum(z.betrag for z in daten.zeilen if not z.ist_abschnitt)
    if daten.anteil_prozent is not None:
        person_summe = summe * daten.anteil_prozent / 100
        saldo = daten.vorauszahlung - person_summe
    else:
        saldo = daten.vorauszahlung - summe
    ist_guthaben = saldo >= 0

    tabelle_style = [
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), g["tabelle_fs"]),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, BLACK),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, colors.HexColor("#dddddd")),
        ("TOPPADDING", (0, 0), (-1, -1), g["tabelle_pad"]),
        ("BOTTOMPADDING", (0, 0), (-1, -1), g["tabelle_pad"]),
    ]
    for idx in abschnitt_zeilen_idx:
        tabelle_style.append(("SPAN", (0, idx), (-1, idx)))
        tabelle_style.append(
            ("TOPPADDING", (0, idx), (-1, idx), g["abschnitt_pad_top"] if idx > 1 else g["tabelle_pad"])
        )
        tabelle_style.append(
            ("LINEBELOW", (0, idx), (-1, idx), 0.4, colors.HexColor("#dddddd"))
        )

    tabelle = Table(rows, colWidths=[62 * mm, 68 * mm, 30 * mm])
    tabelle.setStyle(TableStyle(tabelle_style))
    story.append(tabelle)
    story.append(Spacer(1, g["sp_tabelle"] * mm))

    saldo_label = "Guthaben" if ist_guthaben else "Nachzahlung"
    if daten.anteil_prozent is not None:
        fuss_rows = [
            ["Gesamtkosten Wohnung", _eur(summe)],
            [f"Ihr Anteil ({daten.anteil_prozent:.0f}%)", _eur(person_summe)],
            ["Bereits gezahlte Vorauszahlungen", _eur(daten.vorauszahlung)],
            [saldo_label, _eur(abs(saldo))],
        ]
    else:
        fuss_rows = [
            ["Summe der Nebenkosten", _eur(summe)],
            ["Bereits gezahlte Vorauszahlungen", _eur(daten.vorauszahlung)],
            [saldo_label, _eur(abs(saldo))],
        ]
    letzte_zeile = len(fuss_rows) - 1

    fuss = Table(fuss_rows, colWidths=[130 * mm, 30 * mm])
    fuss.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), g["fuss_fs"]),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("FONTNAME", (0, letzte_zeile), (-1, letzte_zeile), "Helvetica-Bold"),
                ("FONTSIZE", (0, letzte_zeile), (-1, letzte_zeile), g["fuss_fs_last"]),
                ("LINEABOVE", (0, letzte_zeile), (-1, letzte_zeile), 0.75, BLACK),
                ("TOPPADDING", (0, letzte_zeile), (-1, letzte_zeile), g["fuss_pad_last"]),
            ]
        )
    )
    story.append(fuss)

    if daten.schlusstext:
        story.append(Spacer(1, g["sp_schluss"] * mm))
        story.append(Paragraph(daten.schlusstext, normal))

    return story


def erzeuge_abrechnung_pdf(daten: AbrechnungPdfDaten, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    footer_reserve_mm = _footer_reserve_mm(daten.fusszeile_text)
    stufen = SKALIERUNGSSTUFEN if daten.auto_skalieren else (1.0,)

    letztes_ergebnis: bytes | None = None
    for i, skala in enumerate(stufen):
        g = _groessen(skala)
        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=A4,
            leftMargin=daten.rand_links_mm * mm,
            rightMargin=daten.rand_rechts_mm * mm,
            topMargin=daten.rand_oben_mm * mm,
            bottomMargin=(daten.rand_unten_mm + footer_reserve_mm) * mm,
        )
        on_page = (
            partial(
                _draw_fusszeile,
                text=daten.fusszeile_text,
                rand_unten_mm=daten.rand_unten_mm,
                rand_links_mm=daten.rand_links_mm,
                rand_rechts_mm=daten.rand_rechts_mm,
                schriftgroesse=g["footer_fs"],
            )
            if daten.fusszeile_text
            else (lambda *_a, **_kw: None)
        )
        story = _baue_story(daten, g)
        doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
        letztes_ergebnis = buf.getvalue()
        if doc.page <= 1 or i == len(stufen) - 1:
            break

    output_path.write_bytes(letztes_ergebnis)
    return output_path


@dataclass
class SammelabrechnungOptionen:
    zaehlerstaende: bool = True
    vorauszahlungen: bool = True
    saldo: bool = True
    legende: bool = True


def erzeuge_sammelabrechnung_pdf(
    daten: dict,
    optionen: SammelabrechnungOptionen,
    output_path: Path,
    erstellt_am: str,
    fusszeile_text: str | None = None,
    rand_oben_mm: float = RAND_OBEN_MM,
    rand_unten_mm: float = RAND_UNTEN_MM,
    rand_links_mm: float = RAND_LINKS_MM,
    rand_rechts_mm: float = RAND_RECHTS_MM,
) -> Path:
    """Jahresübersicht über eine ganze Liegenschaft — eine Zeile je Wohnung,
    Legende mit den €-Sätzen oben statt Wiederholung in jeder Zeile. Anderer
    Dokumenttyp als die Mieter-Abrechnung (kein Brief): kein Absender-/
    Empfänger-/Anrede-Block, A4 Querformat für die vielen Spalten."""
    styles = getSampleStyleSheet()
    normal = ParagraphStyle("sa_normal", parent=styles["Normal"], fontName="Helvetica", fontSize=9, leading=12)
    small = ParagraphStyle("sa_small", parent=normal, fontSize=7.5, leading=10, textColor=GREY)
    heading = ParagraphStyle("sa_heading", parent=normal, fontName="Helvetica-Bold", fontSize=16, spaceAfter=2)
    zelle = ParagraphStyle("sa_zelle", parent=normal, fontSize=8.5, leading=11)

    page = landscape(A4)
    content_width_mm = page[0] / mm - rand_links_mm - rand_rechts_mm
    footer_reserve_mm = _footer_reserve_mm(fusszeile_text)
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=page,
        leftMargin=rand_links_mm * mm,
        rightMargin=rand_rechts_mm * mm,
        topMargin=rand_oben_mm * mm,
        bottomMargin=(rand_unten_mm + footer_reserve_mm) * mm,
    )
    story: list = []

    kopf = Table(
        [
            [
                Paragraph(
                    f"{daten['liegenschaft_name']}<br/>{daten['liegenschaft_adresse']}", normal
                ),
                Paragraph(f"Erstellt am {erstellt_am}", small),
            ]
        ],
        colWidths=[content_width_mm * 0.7 * mm, content_width_mm * 0.3 * mm],
    )
    kopf.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT")]))
    story.append(kopf)
    story.append(Spacer(1, 5 * mm))
    story.append(Paragraph(f"Jahresübersicht {daten['periode_bezeichnung']}", heading))
    story.append(
        Paragraph(f"Zeitraum {daten['zeitraum_von']} – {daten['zeitraum_bis']}", normal)
    )
    story.append(Spacer(1, 6 * mm))

    if optionen.legende and daten["legende"]:
        story.append(Paragraph("<b>Sätze dieser Periode</b>", normal))
        story.append(Paragraph("  ·  ".join(daten["legende"]), small))
        story.append(Spacer(1, 6 * mm))

    kopf_zeile = ["Wohnung", "Mieter"]
    gewichte: list[float] = []
    if optionen.zaehlerstaende:
        kopf_zeile.append("Zählerstände (Periodenende)")
        gewichte.append(1.7)
    if optionen.vorauszahlungen:
        kopf_zeile.append("Vorauszahlung Jahr (€/Monat)")
        gewichte.append(1.0)
    if optionen.saldo:
        kopf_zeile.append("Guthaben / Nachzahlung")
        gewichte.append(1.0)

    basis_wohnung_mm = 26.0
    basis_mieter_mm = 50.0
    rest_mm = max(0.0, content_width_mm - basis_wohnung_mm - basis_mieter_mm)
    gewicht_summe = sum(gewichte) or 1.0
    col_widths = [basis_wohnung_mm * mm, basis_mieter_mm * mm] + [
        rest_mm * (g / gewicht_summe) * mm for g in gewichte
    ]

    gesamt_vz = 0.0
    gesamt_saldo = 0.0
    unvollstaendig_vorhanden = False
    rows = [kopf_zeile]
    for z in daten["zeilen"]:
        row = [Paragraph(z["wohnung_bezeichnung"], zelle), Paragraph(z["mieter_name"], zelle)]
        if optionen.zaehlerstaende:
            teile = [
                f"{daten['zaehler_typ_label'].get(typ, typ)}: {wert:,.1f} {daten['zaehler_typ_einheit'].get(typ, '')}".replace(
                    ",", "X"
                ).replace(".", ",").replace("X", ".")
                for typ, wert in z["zaehlerstaende"].items()
            ]
            row.append(Paragraph("<br/>".join(teile) if teile else "–", zelle))
        if optionen.vorauszahlungen:
            gesamt_vz += z["vorauszahlung_jahr"]
            row.append(
                Paragraph(
                    f"{_eur(z['vorauszahlung_jahr'])} ({_eur(z['vorauszahlung_pro_monat'])}/Monat)",
                    zelle,
                )
            )
        if optionen.saldo:
            gesamt_saldo += z["saldo"]
            stern = "" if z["vollstaendig"] else " *"
            label = "Guthaben" if z["saldo"] >= 0 else "Nachzahlung"
            if not z["vollstaendig"]:
                unvollstaendig_vorhanden = True
            row.append(Paragraph(f"{label} {_eur(abs(z['saldo']))}{stern}", zelle))
        rows.append(row)

    letzte_zeile_idx = len(rows)
    if optionen.vorauszahlungen or optionen.saldo:
        gesamt_row = ["Gesamt", ""]
        if optionen.zaehlerstaende:
            gesamt_row.append("")
        if optionen.vorauszahlungen:
            gesamt_row.append(_eur(gesamt_vz))
        if optionen.saldo:
            label = "Guthaben" if gesamt_saldo >= 0 else "Nachzahlung"
            gesamt_row.append(f"{label} {_eur(abs(gesamt_saldo))}")
        rows.append(gesamt_row)

    tabelle = Table(rows, colWidths=col_widths, repeatRows=1)
    tabelle_style = [
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, BLACK),
        ("LINEBELOW", (0, 1), (-1, -2), 0.4, colors.HexColor("#dddddd")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if optionen.vorauszahlungen or optionen.saldo:
        tabelle_style.append(("FONTNAME", (0, letzte_zeile_idx), (-1, letzte_zeile_idx), "Helvetica-Bold"))
        tabelle_style.append(("LINEABOVE", (0, letzte_zeile_idx), (-1, letzte_zeile_idx), 0.75, BLACK))
    tabelle.setStyle(TableStyle(tabelle_style))
    story.append(tabelle)

    if unvollstaendig_vorhanden:
        story.append(Spacer(1, 3 * mm))
        story.append(Paragraph("* nicht alle Mietzeiträume dieser Wohnung waren berechenbar", small))

    on_page = (
        partial(
            _draw_fusszeile,
            text=fusszeile_text,
            rand_unten_mm=rand_unten_mm,
            rand_links_mm=rand_links_mm,
            rand_rechts_mm=rand_rechts_mm,
            schriftgroesse=7.5,
            breite_pt=page[0],
        )
        if fusszeile_text
        else (lambda *_a, **_kw: None)
    )
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return output_path

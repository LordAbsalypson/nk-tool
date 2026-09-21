"""Globale Suche über alle Stages und Liegenschaften.

Zwei Endpunkte:
  GET   /suche?q=...&periode_id=...   — findet Werte, liefert Anzeige + Sprungziel
  PATCH /suche/wert                   — ändert genau EIN Feld (Whitelist-gesichert)

Der PATCH-Endpunkt existiert bewusst zusätzlich zu den vorhandenen PUT-Routen: die
ersetzen jeweils den ganzen Datensatz (``for k, v in body.model_dump().items()``), ein
Teil-Update darüber würde alle nicht mitgesendeten Felder auf Default zurücksetzen.
"""

import difflib
import re
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from domain import ART_PERIODE_ENDE, ART_PERIODE_START
from models import (
    Abrechnungsperiode,
    Kostenart,
    Kostenposition,
    Liegenschaft,
    Mieter,
    Vorauszahlung,
    Wohnung,
    Zaehler,
    Zaehlerstand,
)
from schemas import ApiResponse, SucheTreffer, SucheWertPatch

router = APIRouter(tags=["Suche"])


# ── Query-Interpretation ─────────────────────────────────────────────────────

# Erkennt "whg 1", "wg1", "wng 2", "Wohnung 10", "whg. 3", "w4"
_WOHNUNG_RE = re.compile(
    r"\b(?:w|wg|whg|wng|wohn|wohng|wohnung|wohneinheit|apartment|appartement)\.?\s*(\d+)\b",
    re.IGNORECASE,
)

# Feld-Synonyme: welches Stichwort meint welchen Wert? Großzügig gefüllt —
# gematcht wird zusätzlich unscharf (Tippfehler) und über Wortanfänge.
FELD_SYNONYME: dict[str, set[str]] = {
    "strompreis": {
        "strom", "strompreis", "stromkosten", "stromtarif", "energie", "energiepreis",
        "energiekosten", "kwh", "kwhpreis", "kilowattstunde", "kilowattstunden", "kilowatt",
        "preis", "tarif", "arbeitspreis",
    },
    "flaeche": {
        "flaeche", "fläche", "wohnflaeche", "wohnfläche", "qm", "quadratmeter", "m2", "m²",
        "groesse", "größe", "gross", "groß",
    },
    "rwm": {"rwm", "rauchmelder", "rauchwarnmelder", "brandmelder", "melder"},
    "vorauszahlung": {
        "vorauszahlung", "vorauszahlungen", "vz", "abschlag", "abschlaege", "abschläge",
        "nk", "nebenkosten", "nebenkostenzahlung", "zahlung", "zahlungen", "gezahlt",
        "bezahlt", "soll", "ist", "monatsbetrag", "monatlich", "vorschuss", "guthaben",
    },
    "personen": {"person", "personen", "bewohner", "einwohner", "kopf", "koepfe", "köpfe", "haushalt"},
    "zaehlerstand": {
        "zaehlerstand", "zählerstand", "zaehlerstaende", "zählerstände", "stand", "staende",
        "stände", "ablesung", "ablesungen", "ablesen", "abgelesen", "zaehler", "zähler",
        "zaehlernummer", "zählernummer", "verbrauch", "waerme", "wärme", "heizung", "warmwasser",
        "kaltwasser", "wasser", "hkv", "heizkostenverteiler",
    },
    "kosten": {
        "kosten", "kostenposition", "kostenart", "rechnung", "rechnungen", "betrag", "beträge",
        "betraege", "ausgabe", "ausgaben", "hausnebenkosten", "hauskosten",
    },
    "mietdauer": {
        "einzug", "auszug", "mietdauer", "eingezogen", "ausgezogen", "mietzeit", "zeitraum",
        "seit", "bis", "wohnt",
    },
}

# Flache Nachschlagetabelle für unscharfes Matching
_ALLE_SYNONYME: dict[str, str] = {}


def whg_nummer(bezeichnung: Optional[str]) -> int:
    """Zahl aus einer Wohnungsbezeichnung, für die Sortierung ("Whg 10" → 10)."""
    m = re.search(r"(\d+)", bezeichnung or "")
    return int(m.group(1)) if m else 999


def _normalisiere(text: str) -> str:
    return (
        text.lower().strip()
        .replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
        .replace("²", "2").replace("³", "3")
    )


for _feld, _syn in FELD_SYNONYME.items():
    for _s in _syn:
        _ALLE_SYNONYME[_normalisiere(_s)] = _feld


def _feld_fuer_token(token: str) -> Optional[str]:
    """Ordnet ein Wort einer Feld-Kategorie zu — exakt, über Wortanfang oder unscharf.

    "strom" trifft "strompreis" (Präfix), "vorrauszahlung" trifft "vorauszahlung"
    (Tippfehler), "kilowattstunde" trifft den Strompreis (Synonym).
    """
    t = _normalisiere(token)
    if len(t) < 2:
        return None
    if t in _ALLE_SYNONYME:
        return _ALLE_SYNONYME[t]
    # Wortanfang in beide Richtungen: "strom" ↔ "strompreis"
    if len(t) >= 4:
        for syn, feld in _ALLE_SYNONYME.items():
            if syn.startswith(t) or t.startswith(syn):
                return feld
    # Tippfehler-Toleranz
    naeheste = difflib.get_close_matches(t, list(_ALLE_SYNONYME.keys()), n=1, cutoff=0.82)
    return _ALLE_SYNONYME[naeheste[0]] if naeheste else None


def _felder_aus_query(tokens: list[str]) -> set[str]:
    """Welche Feld-Kategorien sind in der Anfrage gemeint?"""
    treffer: set[str] = set()
    for t in tokens:
        feld = _feld_fuer_token(t)
        if feld:
            treffer.add(feld)
    return treffer


def _text_treffer(tokens: list[str], *kandidaten: Optional[str]) -> bool:
    """Kommt eines der Tokens in einem der Texte vor — auch mit kleinen Tippfehlern?"""
    haystack = _normalisiere(" ".join(k for k in kandidaten if k))
    if not haystack:
        return False
    worte = [w for w in re.split(r"[^a-z0-9]+", haystack) if w]
    for t in tokens:
        tn = _normalisiere(t)
        if len(tn) < 2:
            continue
        if tn in haystack:
            return True
        # Namen mit Tippfehler: "janssen" ↔ "janßen", "repnack" ↔ "repnak"
        if len(tn) >= 4 and difflib.get_close_matches(tn, worte, n=1, cutoff=0.82):
            return True
    return False


def _eur(v: float) -> str:
    return f"{v:,.2f} €".replace(",", "~").replace(".", ",").replace("~", ".")


def _zahl(v: float, nachkomma: int = 3) -> str:
    s = f"{v:,.{nachkomma}f}".replace(",", "~").replace(".", ",").replace("~", ".")
    return s.rstrip("0").rstrip(",") if "," in s else s


# ── Suche ────────────────────────────────────────────────────────────────────

@router.get("/suche")
def suche(
    q: str = Query(..., min_length=1),
    periode_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> ApiResponse:
    roh = q.strip()
    if not roh:
        return ApiResponse(ok=True, data=[])

    # "whg 1 : energie preis" -> wohnung_nr=1, tokens=["energie","preis"]
    wohnung_nr: Optional[int] = None
    m = _WOHNUNG_RE.search(roh)
    rest = roh
    if m:
        wohnung_nr = int(m.group(1))
        rest = roh[: m.start()] + " " + roh[m.end():]

    tokens = [t for t in re.split(r"[\s:,;/]+", rest) if t]
    felder = _felder_aus_query(tokens)
    # Nur eine Wohnungsnummer ohne weitere Stichworte -> alles zu dieser Wohnung zeigen
    alles_zur_wohnung = wohnung_nr is not None and not tokens

    treffer: list[SucheTreffer] = []

    liegenschaften = {l.id: l for l in db.query(Liegenschaft).all()}
    wohnungen = db.query(Wohnung).order_by(Wohnung.sortierung, Wohnung.id).all()

    # Periode je Liegenschaft (für Stage-2-Werte)
    perioden_je_lieg: dict[int, Abrechnungsperiode] = {}
    for p in db.query(Abrechnungsperiode).order_by(Abrechnungsperiode.von_datum.desc()).all():
        perioden_je_lieg.setdefault(p.liegenschaft_id, p)

    def passt_wohnung(w: Wohnung) -> bool:
        if wohnung_nr is None:
            return True
        nr = re.search(r"(\d+)", w.bezeichnung or "")
        return nr is not None and int(nr.group(1)) == wohnung_nr

    def lieg_name(lid: int) -> str:
        l = liegenschaften.get(lid)
        return l.name if l else f"Liegenschaft {lid}"

    for w in wohnungen:
        if not passt_wohnung(w):
            continue
        lname = lieg_name(w.liegenschaft_id)
        periode = perioden_je_lieg.get(w.liegenschaft_id)
        pid = periode.id if periode else None
        # Wenn eine konkrete Periode mitgegeben wurde und sie zu dieser Liegenschaft
        # gehört, hat sie Vorrang
        if periode_id is not None and periode is not None:
            gewaehlt = db.get(Abrechnungsperiode, periode_id)
            if gewaehlt and gewaehlt.liegenschaft_id == w.liegenschaft_id:
                pid = gewaehlt.id

        namens_treffer = _text_treffer(tokens, w.bezeichnung, lname)
        zeige_alles = alles_zur_wohnung or (wohnung_nr is not None and not felder)

        # ── Wohnungs-Felder ──
        if zeige_alles or "flaeche" in felder or namens_treffer:
            treffer.append(SucheTreffer(
                id=f"wohnung-{w.id}-flaeche_m2",
                kategorie="Wohnung",
                titel=f"{w.bezeichnung} — Wohnfläche",
                kontext=lname,
                wert_text=f"{_zahl(w.flaeche_m2, 1)} m²",
                wert_zahl=w.flaeche_m2,
                einheit="m²",
                entity_typ="wohnung", entity_id=w.id, feld="flaeche_m2",
                liegenschaft_id=w.liegenschaft_id, stage=1, tab="wohnungen",
                periode_id=None,
                score=90 if "flaeche" in felder else 40,
            ))

        if zeige_alles or "strompreis" in felder:
            wert = w.strom_preis_kwh
            treffer.append(SucheTreffer(
                id=f"wohnung-{w.id}-strom_preis_kwh",
                kategorie="Wohnung",
                titel=f"{w.bezeichnung} — Strompreis",
                kontext=f"{lname} · {'Strom über Vermieter' if w.strom_ueber_vermieter else 'Strom läuft nicht über Vermieter'}",
                wert_text=f"{_zahl(wert, 4)} €/kWh" if wert is not None else "nicht gesetzt",
                wert_zahl=wert,
                einheit="€/kWh",
                entity_typ="wohnung", entity_id=w.id, feld="strom_preis_kwh",
                liegenschaft_id=w.liegenschaft_id, stage=1, tab="wohnungen",
                periode_id=None,
                score=95 if "strompreis" in felder else 30,
            ))

        if "rwm" in felder:
            treffer.append(SucheTreffer(
                id=f"wohnung-{w.id}-anzahl_rwm",
                kategorie="Wohnung",
                titel=f"{w.bezeichnung} — Rauchwarnmelder",
                kontext=lname,
                wert_text=f"{w.anzahl_rwm} Stück",
                wert_zahl=float(w.anzahl_rwm),
                einheit="Stück",
                entity_typ="wohnung", entity_id=w.id, feld="anzahl_rwm",
                liegenschaft_id=w.liegenschaft_id, stage=1, tab="wohnungen",
                periode_id=None, score=90,
            ))

        # ── Mieter ──
        mieter_liste = db.query(Mieter).filter(Mieter.wohnung_id == w.id).order_by(Mieter.einzug_datum).all()
        for mi in mieter_liste:
            mieter_namens_treffer = _text_treffer(tokens, mi.anzeigename)

            if zeige_alles or "vorauszahlung" in felder or mieter_namens_treffer:
                treffer.append(SucheTreffer(
                    id=f"mieter-{mi.id}-monatliche_vorauszahlung",
                    kategorie="Mieter",
                    titel=f"{mi.anzeigename} — monatliche Vorauszahlung",
                    kontext=f"{lname} · {w.bezeichnung}",
                    wert_text=_eur(mi.monatliche_vorauszahlung),
                    wert_zahl=mi.monatliche_vorauszahlung,
                    einheit="€",
                    entity_typ="mieter", entity_id=mi.id, feld="monatliche_vorauszahlung",
                    liegenschaft_id=w.liegenschaft_id, stage=1, tab="wohnungen",
                    periode_id=None,
                    # Namens-Treffer addiert sich auf den Feld-Treffer, damit
                    # "vorauszahlung müller" Müller nach oben zieht statt ihn
                    # zwischen allen Mietern mit gleichem Feld-Score zu begraben.
                    score=(95 if "vorauszahlung" in felder else 30) + (60 if mieter_namens_treffer else 0),
                ))

            if zeige_alles or "personen" in felder or mieter_namens_treffer:
                treffer.append(SucheTreffer(
                    id=f"mieter-{mi.id}-anzahl_personen",
                    kategorie="Mieter",
                    titel=f"{mi.anzeigename} — Personen im Haushalt",
                    kontext=f"{lname} · {w.bezeichnung}",
                    wert_text=f"{mi.anzahl_personen} {'Person' if mi.anzahl_personen == 1 else 'Personen'}",
                    wert_zahl=float(mi.anzahl_personen),
                    einheit="Personen",
                    entity_typ="mieter", entity_id=mi.id, feld="anzahl_personen",
                    liegenschaft_id=w.liegenschaft_id, stage=1, tab="wohnungen",
                    periode_id=None,
                    score=(90 if "personen" in felder else 25) + (55 if mieter_namens_treffer else 0),
                ))

            if "mietdauer" in felder or mieter_namens_treffer:
                bis = mi.auszug_datum or "heute"
                treffer.append(SucheTreffer(
                    id=f"mieter-{mi.id}-mietdauer",
                    kategorie="Mieter",
                    titel=f"{mi.anzeigename} — Mietzeitraum",
                    kontext=f"{lname} · {w.bezeichnung}",
                    wert_text=f"{mi.einzug_datum} – {bis}",
                    wert_zahl=None, einheit=None,
                    entity_typ=None, entity_id=mi.id, feld=None,
                    liegenschaft_id=w.liegenschaft_id, stage=1, tab="wohnungen",
                    periode_id=None,
                    score=85 if "mietdauer" in felder else 55,
                ))

            # ── Vorauszahlungen der Periode ──
            if pid is not None and "vorauszahlung" in felder:
                vz_rows = (
                    db.query(Vorauszahlung)
                    .filter(Vorauszahlung.mieter_id == mi.id, Vorauszahlung.abrechnungsperiode_id == pid)
                    .order_by(Vorauszahlung.jahr, Vorauszahlung.monat)
                    .all()
                )
                summe_ist = sum(v.betrag_ist for v in vz_rows)
                summe_soll = sum(v.betrag_soll for v in vz_rows)
                if vz_rows:
                    treffer.append(SucheTreffer(
                        id=f"vzsumme-{mi.id}-{pid}",
                        kategorie="Vorauszahlungen",
                        titel=f"{mi.anzeigename} — Zahlungen gesamt ({len(vz_rows)} Monate)",
                        kontext=f"{lname} · {w.bezeichnung} · zum Bearbeiten öffnen",
                        wert_text=f"{_eur(summe_ist)} von {_eur(summe_soll)}",
                        wert_zahl=None, einheit=None,
                        entity_typ=None, entity_id=mi.id, feld=None,
                        liegenschaft_id=w.liegenschaft_id, stage=4, tab="vorauszahlungen",
                        periode_id=pid, score=93 + (60 if mieter_namens_treffer else 0),
                    ))

        # ── Zähler + Zählerstände ──
        zaehler_liste = db.query(Zaehler).filter(Zaehler.wohnung_id == w.id).order_by(Zaehler.typ, Zaehler.id).all()
        for z in zaehler_liste:
            geraet_treffer = _text_treffer(tokens, z.geraete_nummer, z.bezeichnung)
            if not (zeige_alles or "zaehlerstand" in felder or geraet_treffer):
                continue
            if pid is None:
                continue

            staende = (
                db.query(Zaehlerstand)
                .filter(Zaehlerstand.zaehler_id == z.id, Zaehlerstand.abrechnungsperiode_id == pid)
                .all()
            )
            start = next((s for s in staende if s.art == ART_PERIODE_START), None)
            ende = next((s for s in staende if s.art == ART_PERIODE_ENDE), None)
            einheit = TYP_EINHEIT.get(z.typ, "")
            typ_label = TYP_LABEL.get(z.typ, z.typ)
            geraet = f" {z.geraete_nummer}" if z.geraete_nummer else ""

            for art, stand, art_label in (
                (ART_PERIODE_START, start, "Anfangsstand"),
                (ART_PERIODE_ENDE, ende, "Endstand"),
            ):
                treffer.append(SucheTreffer(
                    id=f"zaehlerstand-{z.id}-{art}",
                    kategorie="Zählerstand",
                    titel=f"{w.bezeichnung} — {typ_label} {art_label}",
                    kontext=f"{lname}{geraet}" + (f" · abgelesen {stand.ablesedatum}" if stand else " · noch nicht eingetragen"),
                    wert_text=f"{_zahl(stand.wert)} {einheit}" if stand else "fehlt",
                    wert_zahl=stand.wert if stand else None,
                    einheit=einheit,
                    entity_typ="zaehlerstand" if stand else None,
                    entity_id=stand.id if stand else z.id,
                    feld="wert" if stand else None,
                    liegenschaft_id=w.liegenschaft_id, stage=3, tab="zaehlerstaende",
                    periode_id=pid,
                    score=(92 if "zaehlerstand" in felder else 35) + (70 if geraet_treffer else 0),
                ))

    # ── Kostenarten / Kostenpositionen (nicht wohnungsbezogen) ──
    if wohnung_nr is None and tokens:
        for ka in db.query(Kostenart).filter(Kostenart.aktiv == True).all():  # noqa: E712
            if not (_text_treffer(tokens, ka.name) or "kosten" in felder):
                continue
            lname = lieg_name(ka.liegenschaft_id)
            periode = perioden_je_lieg.get(ka.liegenschaft_id)
            pid = periode.id if periode else None
            positionen = (
                db.query(Kostenposition)
                .filter(Kostenposition.kostenart_id == ka.id,
                        Kostenposition.abrechnungsperiode_id == pid)
                .all()
            ) if pid else []
            summe = sum(kp.betrag_brutto for kp in positionen)
            treffer.append(SucheTreffer(
                id=f"kostenart-{ka.id}",
                kategorie="Kosten",
                titel=f"{ka.name}",
                kontext=f"{lname} · {len(positionen)} Rechnung(en) erfasst",
                wert_text=_eur(summe) if positionen else "noch keine Rechnung",
                wert_zahl=None, einheit="€",
                entity_typ=None, entity_id=ka.id, feld=None,
                liegenschaft_id=ka.liegenschaft_id, stage=2, tab="kostenarten",
                periode_id=pid, score=80,
            ))

            for kp in positionen:
                if not _text_treffer(tokens, kp.beschreibung, ka.name) and "kosten" not in felder:
                    continue
                treffer.append(SucheTreffer(
                    id=f"kostenposition-{kp.id}",
                    kategorie="Kosten",
                    titel=f"{ka.name} — {kp.beschreibung}",
                    kontext=f"{lname}" + (f" · {kp.datum}" if kp.datum else ""),
                    wert_text=_eur(kp.betrag_brutto),
                    wert_zahl=kp.betrag_brutto, einheit="€",
                    entity_typ="kostenposition", entity_id=kp.id, feld="betrag_brutto",
                    liegenschaft_id=ka.liegenschaft_id, stage=2, tab="kostenarten",
                    periode_id=pid, score=85,
                ))

    treffer.sort(key=lambda t: (-t.score, t.kategorie, t.titel))
    return ApiResponse(ok=True, data=treffer[:40])


TYP_LABEL: dict[str, str] = {
    "waerme_kwh": "Wärme",
    "hkv_einheiten": "Wärme (HKV)",
    "warmwasser_m3": "Warmwasser",
    "kaltwasser_m3": "Kaltwasser",
    "strom_kwh": "Strom",
}

TYP_EINHEIT: dict[str, str] = {
    "waerme_kwh": "kWh",
    "hkv_einheiten": "Einh.",
    "warmwasser_m3": "m³",
    "kaltwasser_m3": "m³",
    "strom_kwh": "kWh",
}


# ── Inline-Änderung ──────────────────────────────────────────────────────────

# Nur diese Felder dürfen über die Suche geändert werden. Alles andere geht
# weiterhin ausschließlich über die regulären Formulare.
ERLAUBTE_FELDER: dict[str, set[str]] = {
    "wohnung": {"strom_preis_kwh", "flaeche_m2", "anzahl_rwm"},
    "mieter": {"monatliche_vorauszahlung", "anzahl_personen"},
    "zaehlerstand": {"wert"},
    "vorauszahlung": {"betrag_ist", "betrag_soll"},
    "kostenposition": {"betrag_brutto"},
}

_MODELLE: dict[str, Any] = {
    "wohnung": Wohnung,
    "mieter": Mieter,
    "zaehlerstand": Zaehlerstand,
    "vorauszahlung": Vorauszahlung,
    "kostenposition": Kostenposition,
}


@router.patch("/suche/wert")
def patch_wert(body: SucheWertPatch, db: Session = Depends(get_db)) -> ApiResponse:
    erlaubt = ERLAUBTE_FELDER.get(body.entity_typ)
    if erlaubt is None:
        raise HTTPException(400, f"Unbekannter Datentyp '{body.entity_typ}'")
    if body.feld not in erlaubt:
        raise HTTPException(
            400,
            f"Feld '{body.feld}' kann über die Suche nicht geändert werden. "
            f"Erlaubt: {', '.join(sorted(erlaubt))}",
        )

    obj = db.get(_MODELLE[body.entity_typ], body.entity_id)
    if not obj:
        raise HTTPException(404, "Datensatz nicht gefunden")

    wert = body.wert

    # Gleiche Regeln wie in den regulären Formularen — die Suche darf kein
    # Schlupfloch an den Validierungen aus schemas.py vorbei sein.
    if body.feld == "flaeche_m2" and wert <= 0:
        raise HTTPException(400, "Wohnfläche muss größer als 0 m² sein")
    if body.feld in {"monatliche_vorauszahlung", "betrag_ist", "betrag_soll", "betrag_brutto", "wert"} and wert < 0:
        raise HTTPException(400, "Betrag darf nicht negativ sein")
    if body.feld == "anzahl_personen" and wert < 1:
        raise HTTPException(400, "Es muss mindestens 1 Person angegeben sein")
    if body.feld == "anzahl_rwm" and wert < 0:
        raise HTTPException(400, "Anzahl darf nicht negativ sein")
    if body.feld == "strom_preis_kwh" and wert < 0:
        raise HTTPException(400, "Strompreis darf nicht negativ sein")

    if body.feld in {"anzahl_personen", "anzahl_rwm"}:
        setattr(obj, body.feld, int(wert))
    else:
        setattr(obj, body.feld, float(wert))

    # Direkt geänderte Vorauszahlungen gelten als manuell fixiert (gleiche Regel
    # wie beim Bearbeiten im Vorauszahlungs-Raster).
    if body.entity_typ == "vorauszahlung":
        if body.feld == "betrag_ist":
            obj.ist_override = True
        elif body.feld == "betrag_soll":
            obj.soll_override = True

    db.commit()
    return ApiResponse(ok=True, data={"entity_typ": body.entity_typ, "entity_id": body.entity_id,
                                      "feld": body.feld, "wert": wert})

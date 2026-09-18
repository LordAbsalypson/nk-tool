export type Heizungsart = "oel" | "gas_heizwert" | "gas_brennwert" | "waermepumpe";
export type BrennstoffEinheit = "kwh" | "liter_oel" | "m3_gas";
export type PeriodeStatus = "offen" | "in_bearbeitung" | "abgeschlossen";
export type ZaehlerTyp = "waerme_kwh" | "hkv_einheiten" | "warmwasser_m3" | "kaltwasser_m3" | "strom_kwh";

export type Verteilungsschluessel =
  | "nutzeinheit"
  | "m2_wohnflaeche"
  | "personen"
  | "verbrauch_kwh_heizung"
  | "verbrauch_m3_warmwasser"
  | "verbrauch_m3_kalt_plus_warm"
  | "anzahl_rwm"
  | "anzahl_kaltwasserzaehler"
  | "miete_rwm"
  | "direkt"
  | "strom_kwh_direkt";

export type KostenartKategorie =
  | "brennstoff"
  | "heiznebenkosten"
  | "heizung_zusatz"
  | "warmwasser_zusatz"
  | "hausnebenkosten"
  | "strom_individuell";

export interface Liegenschaft {
  id: number;
  name: string;
  adresse: string;
  plz: string;
  ort: string;
  heizungsart: Heizungsart;
  brennstoff_einheit: BrennstoffEinheit;
  brennstoff_heizwert_kwh: number | null;
  mittlere_ww_temperatur: number;
  heiz_grundkosten_anteil: number;
  ww_grundkosten_anteil: number;
  co2_klasse: string | null;
  gemeinschaftsflaeche_m2: number;
  erstellt_am: string;
}

export interface Abrechnungsperiode {
  id: number;
  liegenschaft_id: number;
  bezeichnung: string;
  von_datum: string;
  bis_datum: string;
  status: PeriodeStatus;
  erstellt_am: string;
  /** Fester Gaspreis €/kWh — ersetzt die HKVO-Umlage im Verbrauchsanteil, solange gesetzt */
  heiz_preis_kwh: number | null;
  /** Referenz: Hausbezug laut Versorger (nur Plausibilitäts-Anzeige) */
  referenz_gas_kwh: number | null;
  referenz_wasser_m3: number | null;
}

export interface Wohnung {
  id: number;
  liegenschaft_id: number;
  bezeichnung: string;
  flaeche_m2: number;
  anzahl_rwm: number;
  strom_ueber_vermieter: boolean;
  strom_preis_kwh: number | null;
  strom_bezug_ab: string | null;
  sortierung: number;
  aktiv: boolean;
}

export interface Mieter {
  id: number;
  wohnung_id: number;
  anzeigename: string;
  einzug_datum: string;
  auszug_datum: string | null;
  anzahl_personen: number;
  monatliche_vorauszahlung: number;
  ist_leerstand: boolean;
  notizen: string | null;
}

export interface Zaehler {
  id: number;
  wohnung_id: number;
  typ: ZaehlerTyp;
  geraete_nummer: string | null;
  bezeichnung: string | null;
  eingebaut_am: string | null;
  aktiv: boolean;
  /** EWE-Vertragsnummer des Hauptzählers, an dem dieser Zähler hängt (optional) */
  ewe_vertragsnummer: string | null;
}

export interface Kostenart {
  id: number;
  liegenschaft_id: number;
  name: string;
  verteilungsschluessel: Verteilungsschluessel;
  kategorie: KostenartKategorie;
  ist_brennstoff: boolean;
  ist_heiz_zusatz: boolean;
  ist_ww_zusatz: boolean;
  sortierung: number;
  aktiv: boolean;
  ist_voreinstellung: boolean;
}

export interface Todo {
  id: number;
  text: string;
  erledigt: boolean;
  erstellt_am: string;
  erledigt_am: string | null;
}

export interface PdfVorlage {
  id: number;
  absender_name: string | null;
  absender_strasse: string | null;
  absender_plz: string | null;
  absender_ort: string | null;
  absender_kontakt: string | null;
  kopf_titel: string | null;
  anrede_text: string | null;
  schlusstext: string | null;
  fusszeile_text: string | null;
  datum_anzeigen: boolean;
  datum_ort_override: string | null;
  rand_oben_mm: number | null;
  rand_unten_mm: number | null;
  rand_links_mm: number | null;
  rand_rechts_mm: number | null;
  auto_skalieren: boolean;
  aktualisiert_am: string;
}

export interface LiegenschaftVerbund {
  id: number;
  name: string;
  erstellt_am: string;
}

export interface VerbundMitglied {
  id: number;
  verbund_id: number;
  liegenschaft_id: number;
  sort: number;
}

export interface VerbundKosten {
  id: number;
  verbund_id: number;
  bezeichnung: string;
  betrag_gesamt: number;
  schluessel_typ: string;
  schluessel_werte_json: string | null;
  datum: string | null;
  erstellt_am: string;
  angewendet: boolean;
  anwendung_json: string | null;
}

export interface VerbundDetail extends LiegenschaftVerbund {
  mitglieder: VerbundMitglied[];
  kosten: VerbundKosten[];
}

export interface VerbundAufteilungItem {
  betrag: number;
  anteil_prozent: number;
  basis_wert: number;
}

export interface VerbundVorschau {
  aufteilung: Record<string, VerbundAufteilungItem>;
  gesamt: number;
}

export interface ApiResponse<T> {
  ok: boolean;
  data: T;
  error?: string;
}

/** Ein Treffer der globalen Suche: zeigt den aktuellen Wert und weiß, wohin er gehört. */
export interface SucheTreffer {
  id: string;
  kategorie: string;
  titel: string;
  kontext: string;
  wert_text: string;
  wert_zahl: number | null;
  einheit: string | null;
  /** Inline-Änderung nur möglich, wenn entity_typ + feld gesetzt sind */
  entity_typ: string | null;
  entity_id: number | null;
  feld: string | null;
  liegenschaft_id: number;
  stage: number;
  tab: string;
  periode_id: number | null;
  score: number;
}

// ── Phase 2 Types ─────────────────────────────────────────────────────────────

export interface Kostenposition {
  id: number;
  kostenart_id: number;
  abrechnungsperiode_id: number;
  betrag_brutto: number;
  betrag_netto: number | null;
  mwst_prozent: number | null;
  datum: string | null;
  beschreibung: string;
  beleg_nr: string | null;
  beleg_datei: string | null;
  erstellt_am: string;
  /** Verknüpfte Aufteilung auf beide Häuser (null = normale Einzelrechnung) */
  split_gruppe: string | null;
  split_gesamt: number | null;
  split_prozent: number | null;
  split_partner: string | null;
}

export type ZaehlerstandArt = "periode_start" | "periode_ende" | "zwischenablesung" | "ewe_ablesung";

export interface Zaehlerstand {
  id: number;
  zaehler_id: number;
  abrechnungsperiode_id: number;
  ablesedatum: string;
  wert: number;
  art: ZaehlerstandArt;
  abgelesen_von: string | null;
  notiz: string | null;
}

export interface ZaehlerstaendeGruppe {
  staende: Zaehlerstand[];
  verbrauch: number | null;
  hat_start: boolean;
  hat_ende: boolean;
  vorperiode_endwert: number | null;
}

export interface Vorauszahlung {
  id: number;
  mieter_id: number;
  abrechnungsperiode_id: number;
  monat: number;
  jahr: number;
  betrag_soll: number;
  betrag_ist: number;
  bezahlt_am: string | null;
  notiz: string | null;
  soll_override: boolean;
  ist_override: boolean;
}

export interface VorauszahlungGridMonat {
  monat: number;
  jahr: number;
  label: string;
}

export interface VorauszahlungGridMieter {
  mieter_id: number;
  anzeigename: string;
  vorauszahlungen: Vorauszahlung[];
  total_soll: number;
  total_ist: number;
}

export interface VorauszahlungGridWohnung {
  wohnung_id: number;
  bezeichnung: string;
  mieter: VorauszahlungGridMieter[];
}

export interface VorauszahlungGrid {
  monate: VorauszahlungGridMonat[];
  wohnungen: VorauszahlungGridWohnung[];
}

export interface ValidationMessage {
  typ: "error" | "warning" | "info";
  code: string;
  message: string;
  context: string | null;
}

export interface ValidationResult {
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  infos: ValidationMessage[];
  kann_berechnen: boolean;
}

// ── Phase 3 Types ─────────────────────────────────────────────────────────────

export interface MieterKostenanteil {
  id: number;
  mieter_id: number;
  abrechnungsperiode_id: number;
  kostenart_id: number | null;
  bezeichnung: string;
  pool: string | null;
  betrag_pro_einheit: number;
  einheiten: number;
  kostenanteil: number;
  erlaeuterung: string | null;
  traeger: "mieter" | "vermieter";
  ist_override: boolean;
  override_wert: number | null;
  override_begruendung: string | null;
  berechnet_am: string;
}

export interface BerechnungSummary {
  gesamt_kosten: number;
  heiz_gesamt: number;
  ww_gesamt: number;
  ww_anteil_prozent: number | null;
  haus_kosten: number;
  positionen_count: number;
  mieter_anteil: number;
  vermieter_anteil: number;
  rows_created: number;
  preis_heiz_kwh: number | null;
  preis_ww_m3: number | null;
  summe_heiz_kwh: number | null;
  summe_wasser_m3: number | null;
  heiz_preis_fest: number | null;
  referenz_gas_kwh: number | null;
  referenz_wasser_m3: number | null;
}

export interface TenantVerteilungRow {
  mieter_id: number;
  anzeigename: string;
  wohnung_id: number;
  wohnung_bezeichnung: string;
  kostenanteil_gesamt: number;
  vorauszahlungen_gesamt: number;
  saldo: number;
  ist_leerstand: boolean;
  traeger: "mieter" | "vermieter";
  miet_von: string | null;
  miet_bis: string | null;
}

export interface KostenverteilungResult {
  summary: BerechnungSummary | null;
  tenants: TenantVerteilungRow[];
}

export interface AbrechnungPosition {
  /** heiz_grund | heiz_verbrauch | ww_grund | ww_verbrauch | strom | null (Hauskosten) */
  pool: string | null;
  bezeichnung: string;
  betrag_pro_einheit: number;
  einheiten: number;
  kostenanteil: number;
  erlaeuterung: string | null;
  ist_override: boolean;
  override_wert: number | null;
}

export interface AbrechnungResult {
  mieter_id: number;
  anzeigename: string;
  wohnung_bezeichnung: string;
  wohnung_id: number;
  periode_bezeichnung: string;
  liegenschaft_name: string;
  liegenschaft_adresse: string;
  positionen: AbrechnungPosition[];
  gesamt_kostenanteil: number;
  vorauszahlungen: Vorauszahlung[];
  vorauszahlungen_gesamt: number;
  saldo: number;
  miet_von: string | null;
  miet_bis: string | null;
  miet_tage: number | null;
  periode_tage_gesamt: number | null;
  hat_mieterwechsel: boolean;
}

// ── Checkup (Gesamtübersicht) ────────────────────────────────────────────────

export interface CheckupVerbundKosten {
  id: number;
  bezeichnung: string;
  betrag_gesamt: number;
  schluessel_typ: string;
  angewendet: boolean;
  aufteilung: Record<string, number>;
}

export interface CheckupKostenart {
  id: number;
  name: string;
  kategorie: string;
  verteilungsschluessel: string;
  betrag: number;
  anzahl_rechnungen: number;
}

export interface CheckupMieter {
  mieter_id: number;
  name: string;
  einzug: string;
  auszug: string | null;
  personen: number;
  ist_leerstand: boolean;
  kosten_heizung: number;
  kosten_warmwasser: number;
  kosten_strom: number;
  kosten_haus: number;
  kosten_gesamt: number;
  vorauszahlung_soll: number;
  vorauszahlung_ist: number;
  saldo: number;
  offene_monate: number;
  berechnet: boolean;
}

export interface CheckupWohnung {
  wohnung_id: number;
  bezeichnung: string;
  flaeche_m2: number;
  strom_ueber_vermieter: boolean;
  strom_preis_kwh: number | null;
  verbrauch_waerme: number | null;
  verbrauch_warmwasser: number | null;
  verbrauch_kaltwasser: number | null;
  verbrauch_strom: number | null;
  fehlende_ablesungen: number;
  mieter: CheckupMieter[];
}

export interface CheckupLiegenschaft {
  liegenschaft_id: number;
  name: string;
  adresse: string;
  periode_id: number | null;
  periode_label: string;
  gesamtflaeche: number;
  kosten_erfasst: number;
  kostenarten: CheckupKostenart[];
  wohnungen: CheckupWohnung[];
  summe_kosten_verteilt: number;
  summe_vorauszahlung_soll: number;
  summe_vorauszahlung_ist: number;
  summe_saldo: number;
}

export interface CheckupErgebnis {
  verbund_kosten: CheckupVerbundKosten[];
  verbund_summe: number;
  liegenschaften: CheckupLiegenschaft[];
  gesamt_kosten_erfasst: number;
  gesamt_vorauszahlung_ist: number;
  gesamt_saldo: number;
}

/** Fest vorgegebener Verbrauch eines Mieters bei Mieterwechsel */
export interface MieterVerbrauch {
  id: number;
  mieter_id: number;
  abrechnungsperiode_id: number;
  zaehler_typ: ZaehlerTyp;
  wert: number;
  notiz: string | null;
  als_schaetzung_anzeigen: boolean;
}

// Split-Felder der Kostenposition (verknüpfte Aufteilung auf beide Häuser)
// werden vom List-Endpunkt angereichert.

// ── Direkt-Preise-Modus: konfigurierbare Kostenarten ─────────────────────────

export const DIREKT_VERTEILUNGSBASIS = [
  "m2",
  "person",
  "einheit",
  "kwh_heizung",
  "m3_warmwasser",
  "m3_kaltwasser",
  "m3_wasser_gesamt",
] as const;
export type DirektVerteilungsbasis = (typeof DIREKT_VERTEILUNGSBASIS)[number];

export const BASIS_LABELS: Record<DirektVerteilungsbasis, string> = {
  m2: "€/m²",
  person: "€/Person",
  einheit: "€/Wohnung",
  kwh_heizung: "€/kWh",
  m3_warmwasser: "€/m³ Warmwasser",
  m3_kaltwasser: "€/m³ Kaltwasser",
  m3_wasser_gesamt: "€/m³ (Kalt+Warm)",
};

export const BASIS_KURZ: Record<DirektVerteilungsbasis, string> = {
  m2: "nach m²",
  person: "nach Personen",
  einheit: "pro Wohnung",
  kwh_heizung: "nach kWh Wärme",
  m3_warmwasser: "nach m³ Warmwasser",
  m3_kaltwasser: "nach m³ Kaltwasser",
  m3_wasser_gesamt: "nach m³ Wasser gesamt",
};

/** Basen, für die ein Grundkosten/Verbrauchskosten-Split sinnvoll ist
 *  (nur gemessene Verbrauchsarten — Grundkosten sind dann immer m²-basiert). */
export const SPLITFAEHIGE_BASEN: DirektVerteilungsbasis[] = [
  "kwh_heizung",
  "m3_warmwasser",
  "m3_kaltwasser",
  "m3_wasser_gesamt",
];

export interface DirektKostenart {
  id: number;
  name: string;
  verteilungsbasis: DirektVerteilungsbasis;
  hat_grundkosten_split: boolean;
  nur_liegenschaft_id: number | null;
  sortierung: number;
  aktiv: boolean;
}

export interface DirektKostenartWert {
  id: number;
  kostenart_id: number;
  preis_pro_einheit: number | null;
  verhaeltnis_grund: number | null;
  preis_grund_pro_m2: number | null;
  preis_verbrauch_pro_einheit: number | null;
  saetze_manuell_angepasst: boolean;
}

export interface DirektUebersteuerung {
  id: number;
  mieter_id: number | null;
  wohnung_id: number | null;
  kostenart_id: number | null;
  feld: "personen" | "flaeche_m2" | "betrag";
  wert: number;
  begruendung: string | null;
}

export type GesamteinheitenVorschlag = Record<DirektVerteilungsbasis, number>;

export interface SchluesselZeile {
  schluessel: string;
  kostenart: string;
  grundlage: string;
  betrag: number;
  kostenart_id: number | null;
  manuell_angepasst: boolean;
  zaehler_typ: ZaehlerTyp | null;
  einheiten: number | null;
}

export interface SchluesselMieter {
  mieter_id: number;
  anzeigename: string;
  wohnung_id: number;
  wohnung_bezeichnung: string;
  miet_von: string;
  miet_bis: string;
  miettage: number;
  periode_tage: number;
  zeilen: SchluesselZeile[];
  fehlende_daten: string[];
  warnungen: string[];
  summe: number;
  vorauszahlung_ist: number;
  saldo: number;
  berechenbar: boolean;
  personen: number;
}

export interface PersonenSplitVorlageZeile {
  name: string;
  anteil_prozent: number;
}

export interface PersonenSplitVorlageOut extends PersonenSplitVorlageZeile {
  id: number;
  wohnung_id: number;
  sortierung: number;
}

export interface PersonenSplitPdfErgebnis {
  name: string;
  anteil_prozent: number;
  dateiname: string;
  download_url: string;
}

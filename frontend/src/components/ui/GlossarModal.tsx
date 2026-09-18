import { Modal } from "./Modal";

interface GlossarModalProps {
  open: boolean;
  onClose: () => void;
}

const TERMS = [
  {
    term: "HeizkostenVO §7",
    def: "Die Heizkostenverordnung (HeizkostenVO) §7 schreibt vor, dass 50–70 % der Heizkosten nach Verbrauch (gemessene kWh) verteilt werden müssen. Der Rest (30–50 %) sind Grundkosten nach m² Wohnfläche. Standard: 30 % Grund, 70 % Verbrauch.",
  },
  {
    term: "HeizkostenVO §9 – Warmwasser",
    def: "§9 Abs. 2 regelt den Warmwasser-Anteil an den Heizkosten: Q_WW = 2,5 × V_WW × (T_WW − 10) × 1,163. Dabei ist V_WW der Warmwasserverbrauch in m³, T_WW die Warmwassertemperatur (Standard 60 °C). Dieser Betrag wird vom Gesamtbrennstoffkostenblock abgezogen und dem Warmwasser-Pool zugeordnet.",
  },
  {
    term: "Grundkostenanteil",
    def: "Der prozentuale Anteil der Heiz- bzw. WW-Kosten, der nach Wohnfläche (m²) verteilt wird — unabhängig vom individuellen Verbrauch. Sinn: verbrauchsunabhängige Fixkosten (Bereitstellung, Rohrnetz) gerecht verteilen. Zulässig: 30–50 %. Üblich: 30 %.",
  },
  {
    term: "Verbrauchsanteil",
    def: "100 % minus Grundkostenanteil. Dieser Teil wird nach gemessenem Verbrauch verteilt. Beispiel: 70 % Verbrauchsanteil → 70 % der Heizkosten gehen an denjenigen, der mehr heizt.",
  },
  {
    term: "Gradtagzahlen",
    def: "Klimatische Kennzahl pro Monat, die angibt wie viel in diesem Monat geheizt wird. Jan: 170, Feb: 150, Mrz: 130, Apr: 80, Mai: 40, Jun-Aug: ~13, Sep: 30, Okt: 80, Nov: 120, Dez: 160 (Summe = 1.000). Wird für Mieterwechsel-Abrechnung innerhalb eines Jahres verwendet.",
  },
  {
    term: "Leerstand",
    def: "Eine Wohnung ohne Mieter (oder als Leerstand markierter Mieter). Fixkosten-Anteile (Grundkosten nach m²) werden dem Vermieter zugerechnet. Verbrauchskosten entfallen bei Leerstand (Verbrauch = 0).",
  },
  {
    term: "Abrechnungsperiode",
    def: "Der Zeitraum, für den die Nebenkostenabrechnung erstellt wird (meist 1 Jahr). Status: Offen → In Bearbeitung → Abgeschlossen. Abgeschlossene Perioden können nicht mehr bearbeitet werden.",
  },
  {
    term: "Vorauszahlung",
    def: "Der Mieter zahlt monatlich einen Pauschalbetrag für Nebenkosten (Soll-Betrag, festgelegt im Mietvertrag). Am Jahresende wird mit den tatsächlichen Kosten (Ist) verrechnet: Saldo = Vorauszahlungen − tatsächliche Nebenkosten.",
  },
  {
    term: "Nachzahlung / Guthaben",
    def: "Saldo > 0 → Mieter hat mehr bezahlt als die NK kosten → Guthaben (wird erstattet). Saldo < 0 → NK kosten mehr als vorausgezahlt → Nachzahlung (muss der Mieter leisten).",
  },
  {
    term: "Verteilungsschlüssel",
    def: "Methode, nach der eine Kostenart auf die Wohnungen aufgeteilt wird. Nutzeinheit: gleichmäßig auf alle Einheiten. m² Wohnfläche: proportional zur Größe. Personen: nach Bewohnerzahl. Verbrauch kWh/m³: nach gemessenen Zählerständen.",
  },
  {
    term: "Brennstoff-Kostenart",
    def: "Eine Kostenart, die als Brennstoff markiert ist (z.B. Ölrechnung, Gasjahresrechnung). Diese Kosten bilden die Basis für die HKVO §9-Berechnung des WW-Anteils. Mindestens eine solche Kostenart muss erfasst sein.",
  },
  {
    term: "Ist-Brennstoff / Heiz-Zusatz / WW-Zusatz",
    def: "Brennstoff: Primärkosten Heizung/WW (Öl, Gas). Heiz-Zusatz: Nebenkosten die dem Heizpool zugeschlagen werden (Wartung, Schornsteinfeger). WW-Zusatz: Nebenkosten dem WW-Pool (Legionellenprüfung, Zirkulation). Diese Flags steuern die Poolzuordnung in der Berechnung.",
  },
  {
    term: "Nutzeinheit",
    def: "Jede selbstständige Wohnung oder Gewerbeeinheit zählt als eine Nutzeinheit. Bei Verteilungsschlüssel 'Nutzeinheit' werden Kosten gleichmäßig auf alle Einheiten verteilt.",
  },
  {
    term: "Zähler / Zählerstand",
    def: "Messgerät für Wärme (kWh), Warmwasser (m³), Kaltwasser (m³) oder Strom (kWh). Pro Abrechnungsperiode wird ein Anfangs- und Endstand abgelesen. Verbrauch = Endstand − Anfangsstand.",
  },
  {
    term: "CO₂-Klasse",
    def: "Energetische Einordnung des Gebäudes (A+ bis H) nach Gebäudeenergiegesetz (GEG). Erscheint auf der Abrechnung. Für die Berechnung selbst nicht relevant.",
  },
  {
    term: "Mieterwechsel",
    def: "Wenn ein Mieter im Laufe des Abrechnungsjahres einzieht oder auszieht, werden die Heizkosten anteilig nach Gradtagzahlen und die WW-/Grundkosten nach Tagen aufgeteilt. Mehrere Mieter pro Wohnung in einer Periode sind möglich.",
  },
];

export function GlossarModal({ open, onClose }: GlossarModalProps) {
  return (
    <Modal open={open} title="Glossar — Begriffe &amp; Erklärungen" onClose={onClose} size="xl">
      <div className="space-y-4 text-sm">
        <p className="text-xs text-gray-500">
          Wichtige Begriffe im Kontext der Betriebskostenabrechnung und HeizkostenVO.
        </p>
        {TERMS.map((t) => (
          <div key={t.term} className="border-b border-gray-100 pb-3 last:border-0">
            <p className="font-semibold text-gray-900 mb-0.5">{t.term}</p>
            <p className="text-gray-600 text-xs leading-relaxed">{t.def}</p>
          </div>
        ))}
        <div className="pt-2 text-xs text-gray-400">
          Rechtsgrundlagen: HeizkostenVO (Heizkostenverordnung), BetriebskostenVO (BetrKV),
          Gebäudeenergiegesetz (GEG), DVGW W551 (Warmwassertemperatur).
        </div>
      </div>
    </Modal>
  );
}

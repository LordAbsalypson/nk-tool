import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { api } from "../../api/client";
import type { PersonenSplitPdfErgebnis, PersonenSplitVorlageOut } from "../../types";
import { Modal } from "./Modal";
import { Spinner } from "./Spinner";
import { PdfPreviewModal } from "./PdfPreviewModal";
import { useToast } from "../../hooks/useToast";
import type { PdfAbschnitte } from "../../pages/Live/AbrechnungTab";

interface Zeile {
  name: string;
  anteil: string; // als Text im Formular, wird beim Absenden geparst
}

interface Props {
  open: boolean;
  onClose: () => void;
  periodeId: number;
  /** Einzelner Mieter (Normalfall) — genau eines von mieterId/mieterIds angeben. */
  mieterId?: number;
  /** Mehrere Mieter-Segmente eines kombinierten Zeitraums (Wohnungstausch) — die
   *  Kostenzeilen aller Segmente werden zusammen angezeigt, der Anteil bezieht
   *  sich auf die Summe über den ganzen kombinierten Zeitraum. */
  mieterIds?: number[];
  wohnungId: number;
  wohnungBezeichnung: string;
  vorgeschlagenerName: string;
  /** PDF-Kopf-Abschnitte (Datum/Absender/Adressat) — dieselbe Auswahl wie oben in
   *  der Abrechnung, damit z. B. das manuell gesetzte Datum übernommen wird statt
   *  stillschweigend auf "heute" zurückzufallen. */
  abschnitte: PdfAbschnitte;
  onError: (msg: string) => void;
}

/** Eine Nebenkostenabrechnung auf mehrere Bewohner-Gruppen aufteilen (z. B.
 *  "Mutter & Kind" 50% / "Freund" 50%) — erzeugt pro Gruppe eine eigene PDF
 *  mit vollen Kostenzeilen + einem Anteils-Block im Summenbereich. Ändert
 *  nichts an der normalen Wohnungs-Abrechnung; Vorlage wird nur bei
 *  explizitem "merken" gespeichert und nie automatisch angewendet.
 *  Funktioniert sowohl für einen einzelnen Mieter (mieterId) als auch für
 *  einen kombinierten Wohnungstausch-Zeitraum (mieterIds, mehrere Segmente). */
export function PersonenSplitModal({
  open,
  onClose,
  periodeId,
  mieterId,
  mieterIds,
  wohnungId,
  wohnungBezeichnung,
  vorgeschlagenerName,
  abschnitte,
  onError,
}: Props) {
  const kombiniert = mieterIds !== undefined;
  const { addToast } = useToast();
  const [zeilen, setZeilen] = useState<Zeile[]>([{ name: "", anteil: "" }]);
  const [merken, setMerken] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [ergebnisse, setErgebnisse] = useState<PersonenSplitPdfErgebnis[] | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; dateiname: string } | null>(null);

  const { data: vorlage } = useQuery({
    queryKey: ["personen-split-vorlage", wohnungId],
    queryFn: () => api.get<PersonenSplitVorlageOut[]>(`/wohnungen/${wohnungId}/personen-split-vorlage`),
    enabled: open,
  });

  useEffect(() => {
    if (open) return;
    return () => {
      setInitialized(false);
      setMerken(true);
      setErgebnisse(null);
    };
  }, [open]);

  // Einmalige Initialisierung aus Query-Daten, gleiches Muster wie AusprobierenModal.tsx
  useEffect(() => {
    if (!open || initialized || vorlage === undefined) return;
    if (vorlage.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setZeilen(vorlage.map((v) => ({ name: v.name, anteil: String(v.anteil_prozent) })));
    } else {
      setZeilen([
        { name: vorgeschlagenerName, anteil: "50" },
        { name: "", anteil: "50" },
      ]);
    }
    setInitialized(true);
  }, [open, initialized, vorlage, vorgeschlagenerName]);

  const summe = zeilen.reduce((s, z) => s + (parseFloat(z.anteil.replace(",", ".")) || 0), 0);
  const summeOk = Math.abs(summe - 100) < 0.5;
  const namenOk = zeilen.every((z) => z.name.trim().length > 0) && zeilen.length >= 2;

  const erstellenMutation = useMutation({
    mutationFn: () =>
      api.post<PersonenSplitPdfErgebnis[]>(
        kombiniert
          ? `/perioden/${periodeId}/mieter-kombiniert/personen-split/pdf`
          : `/perioden/${periodeId}/mieter/${mieterId}/personen-split/pdf`,
        {
          ...(kombiniert ? { mieter_ids: mieterIds } : {}),
          gruppen: zeilen.map((z) => ({
            name: z.name.trim(),
            anteil_prozent: parseFloat(z.anteil.replace(",", ".")),
          })),
          speichern: merken,
          ...abschnitte,
        }
      ),
    onSuccess: (result) => setErgebnisse(result),
    onError: (e: Error) => onError(e.message),
  });

  function zeileAendern(i: number, feld: keyof Zeile, wert: string) {
    setZeilen((z) => z.map((row, idx) => (idx === i ? { ...row, [feld]: wert } : row)));
  }

  if (pdfPreview) {
    return (
      <PdfPreviewModal
        downloadUrl={pdfPreview.url}
        dateiname={pdfPreview.dateiname}
        onClose={() => setPdfPreview(null)}
        onSaved={(path) => addToast("success", `PDF gespeichert: ${path}`)}
        onError={onError}
      />
    );
  }

  if (ergebnisse) {
    return (
      <Modal open={open} title={`Auf Bewohner aufteilen — ${wohnungBezeichnung}`} onClose={onClose}>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          {ergebnisse.length} PDF{ergebnisse.length !== 1 ? "s" : ""} erstellt — zum Ansehen anklicken:
        </p>
        <div className="space-y-2">
          {ergebnisse.map((e) => (
            <button
              key={e.dateiname}
              className="btn btn-secondary w-full justify-between flex"
              onClick={() => setPdfPreview({ url: e.download_url, dateiname: e.dateiname })}
            >
              <span>{e.name} ({e.anteil_prozent}%)</span>
              <span className="text-xs text-gray-400">{e.dateiname}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
          <button className="btn btn-primary" onClick={onClose}>
            Fertig
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} title={`Auf Bewohner aufteilen — ${wohnungBezeichnung}`} onClose={onClose} size="lg">
      <p className="text-xs text-gray-500 mb-3">
        Jede Gruppe bekommt eine eigene PDF mit den vollen Kostenzeilen
        {kombiniert ? " über den ganzen kombinierten Zeitraum" : " der Wohnung"} — der Anteil wird
        erst im Summenblock berechnet. Eine Gruppe kann mehrere Bewohner bündeln (z. B.
        „Mutter &amp; Kind"). Ändert nichts an der normalen Wohnungs-Abrechnung.
      </p>

      <div className="space-y-2">
        {zeilen.map((z, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="input flex-1"
              placeholder="Name (z. B. Mutter & Kind)"
              value={z.name}
              onChange={(e) => zeileAendern(i, "name", e.target.value)}
            />
            <input
              type="number"
              step="0.1"
              className="input w-24 text-right"
              placeholder="%"
              value={z.anteil}
              onChange={(e) => zeileAendern(i, "anteil", e.target.value)}
            />
            <span className="text-xs text-gray-400">%</span>
            <button
              type="button"
              className="text-gray-400 dark:text-gray-500 hover:text-red-600 disabled:opacity-30"
              disabled={zeilen.length <= 1}
              onClick={() => setZeilen((z0) => z0.filter((_, idx) => idx !== i))}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn btn-secondary btn-sm mt-2"
        onClick={() => setZeilen((z) => [...z, { name: "", anteil: "" }])}
      >
        + Gruppe hinzufügen
      </button>

      <div className={`mt-3 text-sm ${summeOk ? "text-gray-500" : "text-red-600 font-medium"}`}>
        Summe: {summe.toLocaleString("de-DE", { maximumFractionDigits: 1 })}%{" "}
        {!summeOk && "— muss 100% ergeben"}
      </div>
      {!namenOk && (
        <div className="mt-1 text-sm text-red-600 font-medium">
          Bitte für jede Gruppe einen Namen eintragen, damit PDFs erstellt werden können.
        </div>
      )}

      <label className="flex items-center gap-2 text-sm mt-3">
        <input type="checkbox" checked={merken} onChange={(e) => setMerken(e.target.checked)} />
        Für diese Wohnung merken (nächstes Mal vorausgefüllt, wird nie automatisch angewendet)
      </label>

      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!summeOk || !namenOk || erstellenMutation.isPending}
          onClick={() => erstellenMutation.mutate()}
        >
          {erstellenMutation.isPending ? (
            <span className="flex items-center gap-2">
              <Spinner size="sm" /> Erstelle…
            </span>
          ) : (
            `${zeilen.length} PDFs erstellen`
          )}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Abbrechen
        </button>
      </div>
    </Modal>
  );
}

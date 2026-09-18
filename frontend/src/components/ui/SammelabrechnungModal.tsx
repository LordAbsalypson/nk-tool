import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Modal } from "./Modal";
import { Spinner } from "./Spinner";

interface Props {
  open: boolean;
  onClose: () => void;
  periodeId: number;
  liegenschaftName: string;
  onError: (msg: string) => void;
}

/** Jahresübersicht über eine ganze Liegenschaft für Oma — eine Zeile je
 *  Wohnung, Legende mit den €-Sätzen oben statt Wiederholung in jeder Zeile.
 *  Reine Zusatz-Funktion, ändert nichts an den einzelnen Mieter-Abrechnungen. */
export function SammelabrechnungModal({ open, onClose, periodeId, liegenschaftName, onError }: Props) {
  const [zaehlerstaende, setZaehlerstaende] = useState(true);
  const [vorauszahlungen, setVorauszahlungen] = useState(true);
  const [saldo, setSaldo] = useState(true);
  const [legende, setLegende] = useState(true);

  const erstellenMutation = useMutation({
    mutationFn: () =>
      api.post<{ dateiname: string; download_url: string }>(
        `/perioden/${periodeId}/sammelabrechnung/pdf`,
        { zaehlerstaende, vorauszahlungen, saldo, legende }
      ),
    onSuccess: (d) => {
      window.open(d.download_url, "_blank");
      onClose();
    },
    onError: (e: Error) => onError(e.message),
  });

  return (
    <Modal open={open} title={`Sammelabrechnung — ${liegenschaftName}`} onClose={onClose}>
      <p className="text-xs text-gray-500 mb-3">
        Eine Jahresübersicht über alle Wohnungen dieser Liegenschaft — als Referenz zum
        Nachschlagen, z. B. fürs nächste Jahr. Welche Blöcke sollen rein?
      </p>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={legende} onChange={(e) => setLegende(e.target.checked)} />
          Legende (€-Sätze je Kostenart dieser Periode)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={zaehlerstaende}
            onChange={(e) => setZaehlerstaende(e.target.checked)}
          />
          Zählerstände (Periodenende)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={vorauszahlungen}
            onChange={(e) => setVorauszahlungen(e.target.checked)}
          />
          Vorauszahlungen (Jahr gesamt / pro Monat)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={saldo} onChange={(e) => setSaldo(e.target.checked)} />
          Guthaben / Nachzahlung
        </label>
      </div>

      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
        <button
          type="button"
          className="btn btn-primary"
          disabled={erstellenMutation.isPending}
          onClick={() => erstellenMutation.mutate()}
        >
          {erstellenMutation.isPending ? (
            <span className="flex items-center gap-2">
              <Spinner size="sm" /> Erstelle…
            </span>
          ) : (
            "Erstellen"
          )}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Abbrechen
        </button>
      </div>
    </Modal>
  );
}

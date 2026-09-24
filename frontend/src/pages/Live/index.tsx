import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { Abrechnungsperiode, Liegenschaft } from "../../types";
import { Spinner } from "../../components/ui/Spinner";
import { Badge } from "../../components/ui/Badge";
import { ZaehlerstaendeTab } from "./ZaehlerstaendeTab";
import { VorauszahlungenTab } from "./VorauszahlungenTab";
import { KostenartenTab } from "./KostenartenTab";
import { AbrechnungTab } from "./AbrechnungTab";

const statusBadge = (status: string) => {
  if (status === "abgeschlossen") return <Badge variant="success">Abgeschlossen</Badge>;
  if (status === "in_bearbeitung") return <Badge variant="blue">In Bearbeitung</Badge>;
  return <Badge variant="neutral">Offen</Badge>;
};

interface Props {
  /** 2=Kostenarten · 3=Zählerstände · 4=Vorauszahlungen · 5=Abrechnung */
  stage: 2 | 3 | 4 | 5;
  liegenschaft: Liegenschaft;
  onSaved: () => void;
  onError: (msg: string) => void;
  /** Mieter-ID, zu der in den Vorauszahlungen gescrollt/hervorgehoben werden soll (Sprung aus
   * der Abrechnung über den Stift bei "Vorauszahlung") — null, wenn kein Sprung ansteht. */
  vzFocusMieterId: number | null;
  /** Wird aufgerufen, sobald die Hervorhebung ausgelöst wurde, damit ein erneuter Klick auf
   * denselben Mieter später wieder einen Sprung auslösen kann. */
  onVzFocusConsumed: () => void;
  onGoToVorauszahlung: (mieterId: number) => void;
}

/** Gemeinsame Perioden-Auswahl für die Schritte Kostenarten → Zählerstände →
 * Vorauszahlungen → Abrechnung — eine Periode wird einmal gewählt und gilt für
 * den ganzen Ablauf, statt sie in jedem Schritt neu zu wählen. */
export default function Live({
  stage,
  liegenschaft,
  onSaved,
  onError,
  vzFocusMieterId,
  onVzFocusConsumed,
  onGoToVorauszahlung,
}: Props) {
  const [periodeId, setPeriodeId] = useState<number | null>(null);

  const { data: perioden = [], isLoading } = useQuery({
    queryKey: ["perioden", liegenschaft.id],
    queryFn: () => api.get<Abrechnungsperiode[]>(`/liegenschaften/${liegenschaft.id}/perioden`),
    select: (data) => {
      if (periodeId === null && data.length > 0) {
        const active = data.find((p) => p.status === "in_bearbeitung") ?? data[data.length - 1];
        setPeriodeId(active.id);
      }
      return [...data].sort((a, b) => new Date(b.von_datum).getTime() - new Date(a.von_datum).getTime());
    },
  });

  const selectedPeriode = perioden.find((p) => p.id === periodeId) ?? null;

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 shrink-0 flex-wrap">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Periode</span>
        {isLoading ? (
          <Spinner size="sm" />
        ) : perioden.length === 0 ? (
          <span className="text-sm text-gray-400">
            Keine Perioden vorhanden. Bitte in Stammdaten → Perioden anlegen.
          </span>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <select
              className="input py-1 text-sm"
              value={periodeId ?? ""}
              onChange={(e) => setPeriodeId(Number(e.target.value))}
            >
              {perioden.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.bezeichnung} ({p.von_datum} – {p.bis_datum})
                </option>
              ))}
            </select>
            {selectedPeriode && statusBadge(selectedPeriode.status)}
          </div>
        )}
      </div>

      {periodeId === null ? (
        <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">
          Bitte eine Abrechnungsperiode auswählen.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 p-6">
          {stage === 2 && <KostenartenTab periodeId={periodeId} onSaved={onSaved} />}
          {stage === 3 && (
            <ZaehlerstaendeTab
              periodeId={periodeId}
              liegenschaftId={liegenschaft.id}
              onSaved={onSaved}
              onError={onError}
            />
          )}
          {stage === 4 && (
            <VorauszahlungenTab
              periodeId={periodeId}
              liegenschaftId={liegenschaft.id}
              onSaved={onSaved}
              onError={onError}
              focusMieterId={vzFocusMieterId}
              onFocusConsumed={onVzFocusConsumed}
            />
          )}
          {stage === 5 && (
            <AbrechnungTab
              periodeId={periodeId}
              liegenschaftName={liegenschaft.name}
              onError={onError}
              onGoToVorauszahlung={onGoToVorauszahlung}
            />
          )}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { Abrechnungsperiode } from "../../types";
import { Spinner } from "../../components/ui/Spinner";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { DatePicker } from "../../components/ui/DatePicker";
import { fmtDatumDe } from "../../utils/datum";

const schema = z
  .object({
    bezeichnung: z.string().min(1, "Pflichtfeld"),
    von_datum: z.string().min(1, "Pflichtfeld"),
    bis_datum: z.string().min(1, "Pflichtfeld"),
  })
  .refine((d) => !d.von_datum || !d.bis_datum || d.bis_datum >= d.von_datum, {
    message: "Bis-Datum muss nach Von-Datum liegen",
    path: ["bis_datum"],
  });

type FormData = z.infer<typeof schema>;

interface Props {
  liegenschaftId: number;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function statusBadge(status: string) {
  if (status === "abgeschlossen") return <Badge variant="success">Abgeschlossen</Badge>;
  if (status === "in_bearbeitung") return <Badge variant="blue">In Bearbeitung</Badge>;
  return <Badge variant="neutral">Offen</Badge>;
}

function PeriodeForm({
  initial,
  onSubmit,
  onCancel,
  isPending,
}: {
  initial?: Partial<FormData>;
  onSubmit: (d: FormData) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      bezeichnung: "",
      von_datum: "",
      bis_datum: "",
      ...initial,
    },
  });

  const vonDatum = watch("von_datum");
  const bisDatum = watch("bis_datum");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-3">
          <label className="label">Bezeichnung</label>
          <input
            className="input"
            placeholder="z.B. Abrechnungsjahr 2024"
            {...register("bezeichnung")}
          />
          {errors.bezeichnung && (
            <p className="error-msg">{errors.bezeichnung.message}</p>
          )}
        </div>
        <div>
          <label className="label">Von</label>
          <DatePicker
            className="input"
            allowClear={false}
            value={vonDatum}
            onValueChange={(iso) =>
              setValue("von_datum", iso, { shouldDirty: true, shouldValidate: true })
            }
          />
          {errors.von_datum && (
            <p className="error-msg">{errors.von_datum.message}</p>
          )}
        </div>
        <div>
          <label className="label">Bis</label>
          <DatePicker
            className="input"
            allowClear={false}
            value={bisDatum}
            onValueChange={(iso) =>
              setValue("bis_datum", iso, { shouldDirty: true, shouldValidate: true })
            }
          />
          {errors.bis_datum && (
            <p className="error-msg">{errors.bis_datum.message}</p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={isPending} className="btn btn-primary btn-sm">
          {isPending ? "Speichern…" : "Erstellen"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-secondary btn-sm">
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function suggestNextPeriode(
  perioden: Abrechnungsperiode[]
): Partial<FormData> {
  if (perioden.length === 0) {
    const now = new Date();
    const year = now.getFullYear() - 1;
    return {
      bezeichnung: `Abrechnungsjahr ${year}`,
      von_datum: `${year}-01-01`,
      bis_datum: `${year}-12-31`,
    };
  }
  const last = perioden[perioden.length - 1];
  const lastFrom = new Date(last.von_datum);
  const lastTo = new Date(last.bis_datum);
  const durationMs = lastTo.getTime() - lastFrom.getTime();
  const nextFrom = new Date(lastTo.getTime() + 86400000);
  const nextTo = new Date(nextFrom.getTime() + durationMs);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const year = nextFrom.getFullYear();
  return {
    bezeichnung: `Abrechnungsjahr ${year}`,
    von_datum: fmt(nextFrom),
    bis_datum: fmt(nextTo),
  };
}

interface PeriodeInhalt {
  zaehlerstaende: number;
  vorauszahlungen: number;
  kostenart_saetze: number;
}

/** Löschen einer Periode nimmt alle Zählerstände, Vorauszahlungen und Sätze
 *  dieser Periode mit — deshalb zeigt die Rückfrage, was dranhängt, und verlangt
 *  bei vorhandenen Daten das Eintippen der Bezeichnung. */
function PeriodeLoeschenModal({
  periode,
  isPending,
  onConfirm,
  onClose,
}: {
  periode: Abrechnungsperiode;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [eingabe, setEingabe] = useState("");
  const { data: inhalt, isError } = useQuery({
    queryKey: ["periode-inhalt", periode.id],
    queryFn: () => api.get<PeriodeInhalt>(`/perioden/${periode.id}/inhalt`),
  });

  const hatDaten =
    inhalt !== undefined && inhalt.zaehlerstaende + inhalt.vorauszahlungen + inhalt.kostenart_saetze > 0;
  const bestaetigt = inhalt !== undefined && (!hatDaten || eingabe.trim() === periode.bezeichnung);

  return (
    <Modal
      open
      title={`Periode „${periode.bezeichnung}“ löschen`}
      onClose={onClose}
      footer={
        <>
          <button type="button" autoFocus={!hatDaten} className="btn btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-danger" disabled={!bestaetigt || isPending} onClick={onConfirm}>
            {isPending ? "Lösche…" : "Endgültig löschen"}
          </button>
        </>
      }
    >
      {isError ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          Perioden-Inhalt konnte nicht geladen werden. Bitte erneut versuchen.
        </p>
      ) : inhalt === undefined ? (
        <Spinner size="sm" />
      ) : hatDaten ? (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
          <p>Mit dieser Periode werden unwiderruflich gelöscht:</p>
          <ul className="list-disc pl-5">
            <li>{inhalt.zaehlerstaende} Zählerstände</li>
            <li>{inhalt.vorauszahlungen} eingetragene Vorauszahlungen</li>
            <li>{inhalt.kostenart_saetze} Kostenart-Sätze</li>
          </ul>
          <div>
            <label className="label" htmlFor="periode-loeschen-bestaetigung">
              Zum Bestätigen die Bezeichnung eintippen: <strong>{periode.bezeichnung}</strong>
            </label>
            <input
              id="periode-loeschen-bestaetigung"
              className="input"
              autoFocus
              value={eingabe}
              onChange={(e) => setEingabe(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && bestaetigt && !isPending) onConfirm();
              }}
            />
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-700 dark:text-gray-200">
          Die Periode enthält noch keine Daten und kann gefahrlos gelöscht werden.
        </p>
      )}
    </Modal>
  );
}

export function PeriodenTab({ liegenschaftId, onSaved, onError }: Props) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Abrechnungsperiode | null>(
    null
  );

  const { data: perioden = [], isLoading } = useQuery({
    queryKey: ["perioden", liegenschaftId],
    queryFn: () =>
      api.get<Abrechnungsperiode[]>(
        `/liegenschaften/${liegenschaftId}/perioden`
      ),
  });

  const createMutation = useMutation({
    mutationFn: (d: FormData) =>
      api.post<Abrechnungsperiode>(
        `/liegenschaften/${liegenschaftId}/perioden`,
        d
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["perioden", liegenschaftId] });
      setShowAdd(false);
      onSaved();
    },
    onError: (e: Error) => onError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete<void>(`/perioden/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["perioden", liegenschaftId] });
      setDeleteTarget(null);
      onSaved();
    },
    onError: (e: Error) => onError(e.message),
  });

  if (isLoading)
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );

  const suggestion = suggestNextPeriode(perioden);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">
          {perioden.length} Periode{perioden.length !== 1 ? "n" : ""}
        </h3>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="btn btn-primary btn-sm"
          >
            + Neue Periode
          </button>
        )}
      </div>

      {showAdd && (
        <div className="card mb-4">
          <PeriodeForm
            initial={suggestion}
            onSubmit={(d) => createMutation.mutate(d)}
            onCancel={() => setShowAdd(false)}
            isPending={createMutation.isPending}
          />
        </div>
      )}

      {perioden.length === 0 ? (
        <p className="text-sm text-gray-400">Noch keine Abrechnungsperioden.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-200">
                <th className="pb-2 pr-4 font-medium text-gray-600">Bezeichnung</th>
                <th className="pb-2 pr-4 font-medium text-gray-600">Von</th>
                <th className="pb-2 pr-4 font-medium text-gray-600">Bis</th>
                <th className="pb-2 pr-4 font-medium text-gray-600">Status</th>
                <th className="pb-2 font-medium text-gray-600">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {perioden.map((p) => (
                <tr key={p.id} className="border-b border-gray-100">
                  <td className="py-2 pr-4">{p.bezeichnung}</td>
                  <td className="py-2 pr-4">{fmtDatumDe(p.von_datum)}</td>
                  <td className="py-2 pr-4">{fmtDatumDe(p.bis_datum)}</td>
                  <td className="py-2 pr-4">{statusBadge(p.status)}</td>
                  <td className="py-2">
                    {p.status !== "abgeschlossen" && (
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="btn btn-secondary btn-sm text-red-600 dark:text-red-400"
                      >
                        Löschen …
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <PeriodeLoeschenModal
          periode={deleteTarget}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

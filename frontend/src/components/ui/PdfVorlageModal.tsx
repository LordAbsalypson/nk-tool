import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "../../api/client";
import type { PdfVorlage } from "../../types";
import { Modal } from "./Modal";
import { Spinner } from "./Spinner";

const schema = z.object({
  absender_name: z.string(),
  absender_strasse: z.string(),
  absender_plz: z.string(),
  absender_ort: z.string(),
  absender_kontakt: z.string(),
  kopf_titel: z.string(),
  anrede_text: z.string(),
  schlusstext: z.string(),
  fusszeile_text: z.string(),
  datum_anzeigen: z.boolean(),
  datum_ort_override: z.string(),
  rand_oben_mm: randSchema(),
  rand_unten_mm: randSchema(),
  rand_links_mm: randSchema(),
  rand_rechts_mm: randSchema(),
  auto_skalieren: z.boolean(),
});

function randSchema() {
  return z
    .string()
    .refine(
      (v) => v.trim() === "" || (!isNaN(Number(v)) && Number(v) >= 5 && Number(v) <= 40),
      "5–40 mm"
    );
}

type Form = z.infer<typeof schema>;
const RAND_FELDER = ["rand_oben_mm", "rand_unten_mm", "rand_links_mm", "rand_rechts_mm"] as const;

const EMPTY: Form = {
  absender_name: "",
  absender_strasse: "",
  absender_plz: "",
  absender_ort: "",
  absender_kontakt: "",
  kopf_titel: "",
  anrede_text: "",
  schlusstext: "",
  fusszeile_text: "",
  datum_anzeigen: true,
  datum_ort_override: "",
  rand_oben_mm: "",
  rand_unten_mm: "",
  rand_links_mm: "",
  rand_rechts_mm: "",
  auto_skalieren: true,
};

function toForm(v: PdfVorlage): Form {
  return {
    absender_name: v.absender_name ?? "",
    absender_strasse: v.absender_strasse ?? "",
    absender_plz: v.absender_plz ?? "",
    absender_ort: v.absender_ort ?? "",
    absender_kontakt: v.absender_kontakt ?? "",
    kopf_titel: v.kopf_titel ?? "",
    anrede_text: v.anrede_text ?? "",
    schlusstext: v.schlusstext ?? "",
    fusszeile_text: v.fusszeile_text ?? "",
    datum_anzeigen: v.datum_anzeigen,
    datum_ort_override: v.datum_ort_override ?? "",
    rand_oben_mm: v.rand_oben_mm != null ? String(v.rand_oben_mm) : "",
    rand_unten_mm: v.rand_unten_mm != null ? String(v.rand_unten_mm) : "",
    rand_links_mm: v.rand_links_mm != null ? String(v.rand_links_mm) : "",
    rand_rechts_mm: v.rand_rechts_mm != null ? String(v.rand_rechts_mm) : "",
    auto_skalieren: v.auto_skalieren,
  };
}

/** Leere Strings gehen als null ans Backend — Textfelder fallen dann auf die
 * Liegenschaft zurück, Ränder auf die schmalen Standardwerte. */
function toBody(f: Form) {
  const out: Record<string, string | number | boolean | null> = {
    datum_anzeigen: f.datum_anzeigen,
    auto_skalieren: f.auto_skalieren,
  };
  for (const [k, v] of Object.entries(f)) {
    if (k === "datum_anzeigen" || k === "auto_skalieren") continue;
    const val = v as string;
    if ((RAND_FELDER as readonly string[]).includes(k)) {
      out[k] = val.trim() === "" ? null : Number(val);
    } else {
      out[k] = val.trim() === "" ? null : val;
    }
  }
  return out;
}

export function PdfVorlageModal({
  open,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["pdf-vorlage"],
    queryFn: () => api.get<PdfVorlage>("/pdf-vorlage"),
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { isDirty, errors },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (data) reset(toForm(data));
  }, [data, reset]);

  const saveMutation = useMutation({
    mutationFn: (d: Form) => api.put<PdfVorlage>("/pdf-vorlage", toBody(d)),
    onSuccess: (v) => {
      qc.setQueryData(["pdf-vorlage"], v);
      reset(toForm(v));
      onSaved();
    },
    onError: (e: Error) => onError(e.message),
  });

  const werte = watch();
  const ortZeile = `${werte.absender_plz || "12345"} ${werte.absender_ort || "Musterstadt"}`;

  // Live-Vorschau: rendert bei jeder Formular-Änderung (debounced) den
  // aktuellen, noch nicht gespeicherten Entwurf serverseitig zu PDF-Bytes und
  // zeigt sie als Blob-URL im iframe — kein Download, kein Speichern nötig.
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const pdfUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const werteKey = JSON.stringify(werte);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPreviewLoading(true);
      fetch("/api/v1/pdf-vorlage/vorschau", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toBody(werte)),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            const j = await res.json().catch(() => null);
            throw new Error(j?.error ?? `HTTP ${res.status}`);
          }
          return res.blob();
        })
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
          pdfUrlRef.current = url;
          setPdfUrl(url);
          setPreviewError(null);
        })
        .catch((e: Error) => {
          if (e.name !== "AbortError") setPreviewError(e.message);
        })
        .finally(() => setPreviewLoading(false));
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [werteKey, open]);

  useEffect(
    () => () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    },
    []
  );

  function openPreviewInNewTab() {
    if (pdfUrl) window.open(pdfUrl, "_blank");
  }

  return (
    <Modal open={open} title="PDF-Vorlage — Briefkopf &amp; Texte" onClose={onClose} size="2xl">
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <form
          onSubmit={handleSubmit((d) => saveMutation.mutate(d))}
          className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 content-start">
          <div className="space-y-4">
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                Absenderadresse (Briefkopf)
              </h3>
              <div className="space-y-2">
                <div>
                  <label className="label">Name</label>
                  <input
                    className="input"
                    placeholder="z. B. Max Mustermann"
                    {...register("absender_name")}
                  />
                </div>
                <div>
                  <label className="label">Straße &amp; Hausnummer</label>
                  <input className="input" {...register("absender_strasse")} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">PLZ</label>
                    <input className="input" {...register("absender_plz")} />
                  </div>
                  <div>
                    <label className="label">Ort</label>
                    <input className="input" {...register("absender_ort")} />
                  </div>
                </div>
                <div>
                  <label className="label">Kontakt (optional)</label>
                  <input
                    className="input"
                    placeholder="Tel. 0 44 61 … · name@mail.de"
                    {...register("absender_kontakt")}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Leer gelassene Felder fallen automatisch auf die Adresse der jeweiligen
                Liegenschaft zurück.
              </p>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                Datumszeile
              </h3>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register("datum_anzeigen")} />
                „Ort, den Datum“ oberhalb des Titels anzeigen
              </label>
              {werte.datum_anzeigen && (
                <div className="mt-2">
                  <label className="label">Ort-Override (optional)</label>
                  <input
                    className="input"
                    placeholder={`Standard: „${ortZeile.split(" ").slice(1).join(" ") || "Ort"}“`}
                    {...register("datum_ort_override")}
                  />
                </div>
              )}
            </section>
          </div>

          <div className="space-y-4">
            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                Texte &amp; Bausteine
              </h3>
              <div className="space-y-2">
                <div>
                  <label className="label">Kopf-Titel</label>
                  <input
                    className="input"
                    placeholder="Mietnebenkostenabrechnung"
                    {...register("kopf_titel")}
                  />
                </div>
                <div>
                  <label className="label">Anrede (optional)</label>
                  <input
                    className="input"
                    placeholder="Sehr geehrte Damen und Herren,"
                    {...register("anrede_text")}
                  />
                </div>
                <div>
                  <label className="label">Schlusstext (optional)</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Bei Fragen stehe ich gerne zur Verfügung."
                    {...register("schlusstext")}
                  />
                </div>
                <div>
                  <label className="label">Fußzeile (optional, am Seitenende)</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder={"z. B. Bankverbindung, Steuer-Nr.\nEine Zeile pro Angabe"}
                    {...register("fusszeile_text")}
                  />
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                Seitenränder (mm)
              </h3>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="label">Oben</label>
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="14"
                    {...register("rand_oben_mm")}
                  />
                  {errors.rand_oben_mm && (
                    <p className="error-msg">{errors.rand_oben_mm.message}</p>
                  )}
                </div>
                <div>
                  <label className="label">Unten</label>
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="14"
                    {...register("rand_unten_mm")}
                  />
                  {errors.rand_unten_mm && (
                    <p className="error-msg">{errors.rand_unten_mm.message}</p>
                  )}
                </div>
                <div>
                  <label className="label">Links</label>
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="16"
                    {...register("rand_links_mm")}
                  />
                  {errors.rand_links_mm && (
                    <p className="error-msg">{errors.rand_links_mm.message}</p>
                  )}
                </div>
                <div>
                  <label className="label">Rechts</label>
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="16"
                    {...register("rand_rechts_mm")}
                  />
                  {errors.rand_rechts_mm && (
                    <p className="error-msg">{errors.rand_rechts_mm.message}</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Leer = schmaler Standard (14 mm oben/unten, 16 mm links/rechts). Erlaubt: 5–40 mm.
              </p>
            </section>

            <section>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register("auto_skalieren")} />
                Bei Platzmangel automatisch verkleinern
              </label>
              <p className="text-xs text-gray-400 mt-1">
                Passiert vor allem bei kombinierten Abrechnungen (Wohnungstausch) mit vielen
                Kostenzeilen — Schrift/Abstände werden stufenweise verkleinert, bis alles auf
                eine Seite passt (bleibt dabei lesbar). Aus = wie bisher, notfalls 2 Seiten.
              </p>
            </section>
          </div>

          <div className="md:col-span-2 flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button type="submit" disabled={saveMutation.isPending} className="btn btn-primary">
              {saveMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Spinner size="sm" /> Speichern…
                </span>
              ) : (
                "Speichern"
              )}
            </button>
            <button
              type="button"
              onClick={openPreviewInNewTab}
              disabled={!pdfUrl}
              className="btn btn-secondary"
            >
              In neuem Tab öffnen
            </button>
            {isDirty && (
              <span className="text-xs text-amber-600 dark:text-amber-400 ml-auto">
                Ungespeicherte Änderungen
              </span>
            )}
          </div>
          </div>

          <div className="lg:sticky lg:top-0 self-start">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
              Live-Vorschau
              {previewLoading && <Spinner size="sm" />}
            </h3>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900">
              {pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  title="PDF-Vorschau"
                  className="w-full"
                  style={{ height: "520px" }}
                />
              ) : (
                <div className="h-[520px] flex items-center justify-center text-sm text-gray-400">
                  {previewLoading ? "Erzeuge Vorschau…" : "Keine Vorschau verfügbar"}
                </div>
              )}
            </div>
            {previewError && <p className="error-msg mt-1">{previewError}</p>}
            <p className="text-xs text-gray-400 mt-1">
              Aktualisiert automatisch beim Tippen — nichts wird gespeichert, bis du auf
              „Speichern" klickst.
            </p>
          </div>
        </form>
      )}
    </Modal>
  );
}

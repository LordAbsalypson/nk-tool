import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownTrayIcon,
  ArchiveBoxIcon,
  DocumentTextIcon,
  EyeIcon,
  EyeSlashIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { api } from "../../api/client";
import { getDesktopApi, isDesktopApp } from "../../hooks/getDesktopApi";

export interface PdfArchivEintrag {
  dateiname: string;
  typ: "pdf" | "zip";
  groesse_bytes: number;
  erstellt_am_iso: string;
  erstellt_am_de: string;
  download_url: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  periodeId: number;
  previewFile: string | null;
  onSelectPreviewFile: (dateiname: string | null) => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  });
}

/** Side-Drawer für generierte PDFs und ZIP-Archive einer Periode.
 *  Verhindert, dass der Downloads-Ordner ungefragt zugemüllt wird: Jede generierte
 *  Datei landet mit Zeitstempel im Archiv, kann per Inline-Vorschau geprüft und bei
 *  Bedarf gezielt heruntergeladen werden. */
export function PdfArchivDrawer({
  open,
  onClose,
  periodeId,
  previewFile,
  onSelectPreviewFile,
  onSaved,
  onError,
}: Props) {
  const qc = useQueryClient();
  const [previewBlob, setPreviewBlob] = useState<{ file: string; url: string } | null>(null);
  const [savingFile, setSavingFile] = useState<string | null>(null);

  const { data: dateien = [], isLoading } = useQuery({
    queryKey: ["pdf-archiv", periodeId],
    queryFn: () => api.get<PdfArchivEintrag[]>(`/perioden/${periodeId}/pdf-archiv`),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const activeEntry = dateien.find((d) => d.dateiname === previewFile && d.typ === "pdf") ?? null;
  const activeUrl = activeEntry?.download_url ?? null;
  const activeName = activeEntry?.dateiname ?? null;

  useEffect(() => {
    if (!open || !activeUrl || !activeName) {
      return;
    }
    let revoked = false;
    let objectUrl: string | null = null;
    api
      .getBlob(activeUrl)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewBlob({ file: activeName, url: objectUrl });
      })
      .catch(() => {
        if (!revoked) setPreviewBlob({ file: activeName, url: "" });
      });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, activeUrl, activeName]);

  const previewBlobUrl =
    activeName && previewBlob?.file === activeName && previewBlob.url ? previewBlob.url : null;
  const previewLoading = Boolean(activeName && previewBlob?.file !== activeName);

  const deleteMut = useMutation({
    mutationFn: (dateiname: string) =>
      api.delete(`/perioden/${periodeId}/pdf-archiv?dateiname=${encodeURIComponent(dateiname)}`),
    onSuccess: (_data, dateiname) => {
      if (previewFile === dateiname) onSelectPreviewFile(null);
      qc.invalidateQueries({ queryKey: ["pdf-archiv", periodeId] });
    },
    onError: (e: Error) => onError(e.message),
  });

  async function handleDownload(entry: PdfArchivEintrag) {
    setSavingFile(entry.dateiname);
    try {
      const blob = await api.getBlob(entry.download_url);
      if (isDesktopApp()) {
        const b64 = await blobToBase64(blob);
        const filterLabel = entry.typ === "zip" ? "ZIP Archiv (*.zip)" : "PDF Dokument (*.pdf)";
        const res = await getDesktopApi().save_file(entry.dateiname, b64, filterLabel);
        if (res.ok === false) {
          onError(res.error ?? "Datei konnte nicht gespeichert werden.");
          return;
        }
        if (res.path) {
          onSaved(`Gespeichert unter: ${res.path}`);
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = entry.dateiname;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        onSaved(`${entry.dateiname} in Downloads gespeichert`);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Download fehlgeschlagen.");
    } finally {
      setSavingFile(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-archiv-drawer-title"
        className="w-full max-w-2xl bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <ArchiveBoxIcon className="w-4 h-4" />
            </span>
            <div>
              <h3 id="pdf-archiv-drawer-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                PDF-Archiv &amp; Vorschau ({dateien.length})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Generierte Abrechnungen mit Zeitstempel prüfen und gezielt in Downloads speichern.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="PDF-Archiv schließen"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Inline PDF-Vorschau (wenn aktiv) */}
        {activeEntry && (
          <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                  Vorschau: {activeEntry.dateiname}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Erstellt am {activeEntry.erstellt_am_de} · {fmtSize(activeEntry.groesse_bytes)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownload(activeEntry)}
                  disabled={savingFile === activeEntry.dateiname}
                  className="btn btn-primary btn-sm"
                >
                  <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                  {savingFile === activeEntry.dateiname ? "Speichere…" : "Herunterladen"}
                </button>
                <button
                  type="button"
                  onClick={() => onSelectPreviewFile(null)}
                  className="btn btn-secondary btn-sm"
                >
                  Vorschau schließen
                </button>
              </div>
            </div>
            <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white">
              {previewLoading ? (
                <div className="h-[380px] flex items-center justify-center text-xs text-slate-400">
                  Lade PDF-Vorschau…
                </div>
              ) : previewBlobUrl ? (
                <iframe
                  src={previewBlobUrl}
                  title={`PDF-Vorschau ${activeEntry.dateiname}`}
                  className="w-full"
                  style={{ height: "380px" }}
                />
              ) : (
                <div className="h-[120px] flex items-center justify-center text-xs text-slate-400">
                  Vorschau konnte nicht geladen werden — bitte direkt herunterladen.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dateiliste */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
          {isLoading ? (
            <p className="text-xs text-slate-400 text-center py-8">Lade Archiv…</p>
          ) : dateien.length === 0 ? (
            <div className="text-center py-12">
              <DocumentTextIcon className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Noch keine PDFs in dieser Periode generiert
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Klicke bei einem Mieter auf „PDF" oder oben auf „Alle Abrechnungen als ZIP".
              </p>
            </div>
          ) : (
            dateien.map((entry) => {
              const isSelected = previewFile === entry.dateiname;
              return (
                <div
                  key={entry.dateiname}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition-all ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/70 hover:border-slate-300 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      className={`mt-0.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase shrink-0 ${
                        entry.typ === "zip"
                          ? "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {entry.typ}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate" title={entry.dateiname}>
                        {entry.dateiname}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        {entry.erstellt_am_de} · {fmtSize(entry.groesse_bytes)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {entry.typ === "pdf" && (
                      <button
                        type="button"
                        onClick={() => onSelectPreviewFile(isSelected ? null : entry.dateiname)}
                        className="btn btn-secondary btn-sm"
                        title={isSelected ? "Vorschau ausblenden" : "PDF-Vorschau im Seitenmenü anzeigen"}
                      >
                        {isSelected ? (
                          <>
                            <EyeSlashIcon className="w-3.5 h-3.5" /> Vorschau zu
                          </>
                        ) : (
                          <>
                            <EyeIcon className="w-3.5 h-3.5" /> Vorschau
                          </>
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDownload(entry)}
                      disabled={savingFile === entry.dateiname}
                      className="btn btn-primary btn-sm"
                      title="Datei in Downloads / Wunschordner speichern"
                    >
                      <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                      {savingFile === entry.dateiname ? "…" : "Download"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMut.mutate(entry.dateiname)}
                      disabled={deleteMut.isPending}
                      aria-label={`${entry.dateiname} aus Archiv löschen`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      title="Aus Archiv entfernen"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

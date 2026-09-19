import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";

interface PdfPreviewModalProps {
  /** Vollständiger download_url-Pfad vom Backend (inkl. /api/v1-Präfix). */
  downloadUrl: string;
  dateiname: string;
  onClose: () => void;
}

/** Zeigt eine erzeugte PDF inline an (Schließen/Drucken/Herunterladen), statt
 * sie per window.open() in einem neuen Tab zu öffnen. Zwei Gründe, warum das
 * nötig war, nicht nur UX-Wunsch: (1) window.open() funktioniert in der
 * Desktop-App nicht zuverlässig — pywebviews eingebettete WebView hat kein
 * Tab-Konzept, öffnet dort de facto nichts sichtbares. (2) Seit dem
 * Passwortschutz-Feature ist der Download-Endpunkt durch require_auth()
 * geschützt — ein simpler window.open() schickt keinen Authorization-Header
 * mit und bekäme 401 statt der PDF. Lädt die Datei stattdessen authentifiziert
 * als Blob (api.getBlob) und zeigt sie in einem <iframe>. */
export function PdfPreviewModal({ downloadUrl, dateiname, onClose }: PdfPreviewModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    api
      .getBlob(downloadUrl)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "PDF konnte nicht geladen werden.");
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [downloadUrl]);

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print();
  };

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = dateiname;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full h-full max-w-4xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2 className="text-sm font-semibold truncate">{dateiname}</h2>
          <div className="flex items-center gap-2 shrink-0">
            <button className="btn btn-secondary btn-sm" disabled={!blobUrl} onClick={handleDownload}>
              Herunterladen
            </button>
            <button className="btn btn-secondary btn-sm" disabled={!blobUrl} onClick={handlePrint}>
              Drucken
            </button>
            <button className="btn btn-primary btn-sm" onClick={onClose}>
              Schließen
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 bg-gray-100 dark:bg-gray-900">
          {error ? (
            <div className="flex h-full items-center justify-center p-6">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          ) : blobUrl ? (
            <iframe ref={iframeRef} src={blobUrl} title={dateiname} className="w-full h-full border-0" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">PDF wird geladen …</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

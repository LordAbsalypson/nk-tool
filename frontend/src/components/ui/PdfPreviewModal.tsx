import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { getDesktopApi, isDesktopApp } from "../../hooks/getDesktopApi";

interface PdfPreviewModalProps {
  /** Vollständiger download_url-Pfad vom Backend (inkl. /api/v1-Präfix). */
  downloadUrl: string;
  dateiname: string;
  onClose: () => void;
  /** Desktop-App: wird nach erfolgreichem Speichern mit dem gewählten Pfad aufgerufen. */
  onSaved?: (path: string) => void;
  /** Desktop-App: wird bei Lade-/Speicherfehlern aufgerufen (kein Modal zum Anzeigen vorhanden). */
  onError?: (msg: string) => void;
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

/** Web/Browser: zeigt eine erzeugte PDF inline an (Schließen/Drucken/Herunterladen)
 * per authentifiziertem Blob in einem <iframe> — funktioniert dort zuverlässig.
 *
 * Desktop-App: rendert bewusst KEIN iframe/keine Vorschau. WKWebView (macOS, über
 * pywebview) zeigt eingebettete PDFs über eine native PDFKit-Ebene an, die die
 * restliche Seite überlagern und jede Interaktion blockieren kann (bestätigter
 * Bug: weder "Herunterladen" noch "Schließen" reagierten mehr, nur ein Kill der
 * App half). Der HTML5 <a download>-Mechanismus funktioniert für blob:-URLs in
 * WKWebView außerdem ohnehin nicht zuverlässig. Stattdessen wird die PDF direkt
 * über den nativen "Speichern unter"-Dialog gespeichert (DesktopApi.save_pdf,
 * siehe desktop/app.py) — kein Modal, kein iframe, keine Absturzgefahr. */
export function PdfPreviewModal({ downloadUrl, dateiname, onClose, onSaved, onError }: PdfPreviewModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const desktop = isDesktopApp();

  useEffect(() => {
    let cancelled = false;

    if (desktop) {
      api
        .getBlob(downloadUrl)
        .then((blob) => blobToBase64(blob))
        .then((base64) => getDesktopApi().save_pdf(dateiname, base64))
        .then((result) => {
          if (cancelled) return;
          if (result.path) onSaved?.(result.path);
        })
        .catch((err) => {
          if (!cancelled) {
            onError?.(err instanceof Error ? err.message : "PDF konnte nicht gespeichert werden.");
          }
        })
        .finally(() => {
          if (!cancelled) onClose();
        });
      return () => {
        cancelled = true;
      };
    }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadUrl, desktop]);

  if (desktop) return null;

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

import { useState, useEffect, useCallback } from "react";

const ZOOM_STORAGE_KEY = "nk-tool-zoom";
const MIN_ZOOM = 80;
const MAX_ZOOM = 150;
const STEP_ZOOM = 10;
const DEFAULT_ZOOM = 100;

function loadZoom(): number {
  try {
    const raw = Number(localStorage.getItem(ZOOM_STORAGE_KEY));
    if (!Number.isNaN(raw) && raw >= MIN_ZOOM && raw <= MAX_ZOOM) {
      return Math.round(raw / 5) * 5;
    }
  } catch {
    // localStorage evtl. nicht verfügbar
  }
  return DEFAULT_ZOOM;
}

export function useUiZoom() {
  const [zoom, setZoom] = useState<number>(loadZoom);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, z + STEP_ZOOM));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(MIN_ZOOM, z - STEP_ZOOM));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(DEFAULT_ZOOM);
  }, []);

  useEffect(() => {
    // Alle Tailwind-Größen (rem) skalieren proportional über die Root-Schriftgröße (100% = 16px)
    const rootPx = (zoom / 100) * 16;
    document.documentElement.style.fontSize = `${rootPx}px`;
    try {
      localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
    } catch {
      // ignore
    }
  }, [zoom]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      if (e.key === "+" || e.key === "=" || e.code === "NumpadAdd") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-" || e.key === "_" || e.code === "NumpadSubtract") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0" || e.code === "Numpad0") {
        e.preventDefault();
        resetZoom();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomIn, zoomOut, resetZoom]);

  return { zoom, zoomIn, zoomOut, resetZoom, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM };
}

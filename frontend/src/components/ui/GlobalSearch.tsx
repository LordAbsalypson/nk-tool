import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { api } from "../../api/client";
import type { SucheTreffer } from "../../types";
import { Spinner } from "./Spinner";

export interface SuchZiel {
  liegenschaftId: number;
  stage: number;
  tab: string;
  periodeId: number | null;
}

interface Props {
  onNavigate: (ziel: SuchZiel) => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

/** Wert direkt im Suchergebnis ändern — ohne die Seite zu verlassen. */
function InlineWert({
  treffer,
  onSaved,
  onError,
}: {
  treffer: SucheTreffer;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [wert, setWert] = useState(
    treffer.wert_zahl !== null ? String(treffer.wert_zahl) : ""
  );

  const mutation = useMutation({
    mutationFn: (neu: number) =>
      api.patch("/suche/wert", {
        entity_typ: treffer.entity_typ,
        entity_id: treffer.entity_id,
        feld: treffer.feld,
        wert: neu,
      }),
    onSuccess: () => {
      // Alles neu laden, was den Wert anzeigen könnte — damit die normalen
      // Tabs sofort denselben Stand haben wie die Suche.
      qc.invalidateQueries();
      setEditing(false);
      onSaved();
    },
    onError: (e: Error) => {
      onError(e.message);
      setEditing(false);
      setWert(treffer.wert_zahl !== null ? String(treffer.wert_zahl) : "");
    },
  });

  const aenderbar = treffer.entity_typ !== null && treffer.feld !== null;

  function speichern() {
    const num = parseFloat(wert.replace(",", "."));
    if (isNaN(num) || num === treffer.wert_zahl) {
      setEditing(false);
      setWert(treffer.wert_zahl !== null ? String(treffer.wert_zahl) : "");
      return;
    }
    mutation.mutate(num);
  }

  if (!aenderbar) {
    return (
      <span className="text-sm text-gray-500 whitespace-nowrap">{treffer.wert_text}</span>
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <input
          type="number"
          step="any"
          autoFocus
          value={wert}
          onChange={(e) => setWert(e.target.value)}
          onBlur={speichern}
          onKeyDown={(e) => {
            if (e.key === "Enter") speichern();
            if (e.key === "Escape") {
              setWert(treffer.wert_zahl !== null ? String(treffer.wert_zahl) : "");
              setEditing(false);
            }
          }}
          className="w-24 px-1.5 py-0.5 text-sm border border-blue-400 rounded text-right focus:outline-none"
        />
        {treffer.einheit && (
          <span className="text-xs text-gray-400">{treffer.einheit}</span>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="text-sm font-medium text-gray-800 hover:text-blue-600 hover:bg-blue-50 rounded px-1.5 py-0.5 whitespace-nowrap transition-colors"
      title="Klicken zum Ändern"
    >
      {mutation.isPending ? "…" : treffer.wert_text}
    </button>
  );
}

export function GlobalSearch({ onNavigate, onSaved, onError }: Props) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [offen, setOffen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Cmd/Ctrl+K fokussiert die Suche
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOffen(true);
      }
      if (e.key === "Escape") setOffen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Klick außerhalb schließt das Dropdown
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOffen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: treffer = [], isFetching } = useQuery({
    queryKey: ["suche", debounced],
    queryFn: () =>
      api.get<SucheTreffer[]>(`/suche?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.trim().length >= 2,
  });

  // Nach Kategorie gruppieren, Reihenfolge der Treffer (= Score) bleibt erhalten
  const gruppen: { kategorie: string; items: SucheTreffer[] }[] = [];
  for (const t of treffer) {
    const g = gruppen.find((x) => x.kategorie === t.kategorie);
    if (g) g.items.push(t);
    else gruppen.push({ kategorie: t.kategorie, items: [t] });
  }

  const zeigeDropdown = offen && debounced.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative flex-1 max-w-lg">
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
          ⌕
        </span>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOffen(true);
          }}
          onFocus={() => setOffen(true)}
          placeholder={'Suchen… z. B. "Whg 1 Strompreis" oder "Mustermann"'}
          className="w-full pl-7 pr-14 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 border border-gray-200 rounded px-1 pointer-events-none select-none">
          ⌘K
        </span>
      </div>

      {zeigeDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-[70vh] overflow-y-auto z-50">
          {isFetching && treffer.length === 0 ? (
            <div className="flex justify-center py-6">
              <Spinner size="sm" />
            </div>
          ) : treffer.length === 0 ? (
            <p className="text-sm text-gray-400 px-4 py-6 text-center">
              Nichts gefunden. Versuch's mit einem Namen, einer Wohnung („Whg 3") oder
              einem Stichwort wie „Vorauszahlung" oder „Zählerstand".
            </p>
          ) : (
            gruppen.map((g) => (
              <div key={g.kategorie}>
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 bg-gray-50 dark:bg-gray-900 sticky top-0">
                  {g.kategorie}
                </div>
                {g.items.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-blue-50 dark:hover:bg-gray-700 border-b border-gray-50 dark:border-gray-700 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 dark:text-gray-100 truncate">
                        {t.titel}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{t.kontext}</p>
                    </div>
                    <InlineWert treffer={t} onSaved={onSaved} onError={onError} />
                    <button
                      onClick={() => {
                        onNavigate({
                          liegenschaftId: t.liegenschaft_id,
                          stage: t.stage,
                          tab: t.tab,
                          periodeId: t.periode_id,
                        });
                        setOffen(false);
                      }}
                      className="text-gray-300 hover:text-blue-600 px-1 shrink-0"
                      title="Zur passenden Seite springen"
                    >
                      <ArrowRightIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

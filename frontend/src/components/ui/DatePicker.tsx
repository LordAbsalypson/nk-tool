import {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  type KeyboardEvent,
  type FocusEvent,
} from "react";
import { createPortal } from "react-dom";

const MONATE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIso(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

function heuteIso(): string {
  const d = new Date();
  return toIso(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Formatiert YYYY-MM-DD nach TT.MM.JJJJ */
function isoToDe(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/** Parst deutsche Eingaben wie "01.06.2025", "1.6.25", "01062025", "010625" oder ISO "2025-06-01" */
function parseDeOrIsoToIso(raw: string): string | null {
  const s = raw.trim();
  if (!s) return "";

  // ISO YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (isValidDate(y, m, d)) return toIso(y, m - 1, d);
    return null;
  }

  // Deutsch mit Punkt, Schrägstrich oder Bindestrich: TT.MM.JJJJ oder T.M.JJ
  const deMatch = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s);
  if (deMatch) {
    const d = Number(deMatch[1]);
    const m = Number(deMatch[2]);
    let y = Number(deMatch[3]);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    if (isValidDate(y, m, d)) return toIso(y, m - 1, d);
    return null;
  }

  // Kompakt ohne Punkte: TTMMJJJJ (8 Ziffern) oder TTMMJJ (6 Ziffern)
  const digitsMatch = /^(\d{2})(\d{2})(\d{2}|\d{4})$/.exec(s);
  if (digitsMatch) {
    const d = Number(digitsMatch[1]);
    const m = Number(digitsMatch[2]);
    let y = Number(digitsMatch[3]);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    if (isValidDate(y, m, d)) return toIso(y, m - 1, d);
    return null;
  }

  return null;
}

function isValidDate(year: number, month1: number, day: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month1 < 1 || month1 > 12) return false;
  const maxDay = new Date(year, month1, 0).getDate();
  return day >= 1 && day <= maxDay;
}

function shiftIsoDays(iso: string, deltaDays: number): string {
  const base = iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T12:00:00") : new Date();
  base.setDate(base.getDate() + deltaDays);
  return toIso(base.getFullYear(), base.getMonth(), base.getDate());
}

function shiftIsoMonths(iso: string, deltaMonths: number): string {
  const base = iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T12:00:00") : new Date();
  base.setMonth(base.getMonth() + deltaMonths);
  return toIso(base.getFullYear(), base.getMonth(), base.getDate());
}

export interface DatePickerProps {
  value?: string | null;
  onChange?: (e: { target: { value: string; name?: string } }) => void;
  onValueChange?: (iso: string) => void;
  name?: string;
  id?: string;
  placeholder?: string;
  className?: string;
  compact?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  allowClear?: boolean;
  title?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
}

export function DatePicker({
  value,
  onChange,
  onValueChange,
  name,
  id,
  placeholder = "TT.MM.JJJJ",
  className = "input",
  compact = false,
  autoFocus = false,
  disabled = false,
  allowClear = true,
  title,
  onKeyDown,
  onBlur,
}: DatePickerProps) {
  const isoValue = value ?? "";
  const [prevIso, setPrevIso] = useState(isoValue);
  const [text, setText] = useState(() => isoToDe(isoValue));
  const [open, setOpen] = useState(false);

  const parsedInitial =
    isoValue && /^\d{4}-\d{2}-\d{2}$/.test(isoValue)
      ? new Date(isoValue + "T12:00:00")
      : new Date();
  const [viewYear, setViewYear] = useState(parsedInitial.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsedInitial.getMonth());

  if (isoValue !== prevIso) {
    setPrevIso(isoValue);
    setText(isoToDe(isoValue));
    if (isoValue && /^\d{4}-\d{2}-\d{2}$/.test(isoValue)) {
      const [y, m] = isoValue.split("-").map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; flipUp: boolean }>({
    top: 0,
    left: 0,
    flipUp: false,
  });

  function emitChange(nextIso: string) {
    setText(isoToDe(nextIso));
    if ( nextIso && /^\d{4}-\d{2}-\d{2}$/.test(nextIso)) {
      const [y, m] = nextIso.split("-").map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
    onValueChange?.(nextIso);
    onChange?.({ target: { value: nextIso, name } });
  }

  function commitText(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (allowClear) emitChange("");
      else setText(isoToDe(isoValue));
      return;
    }
    const parsed = parseDeOrIsoToIso(trimmed);
    if (parsed !== null) {
      emitChange(parsed);
    } else {
      // Zurück auf letzten gültigen Wert, falls Tippfehler
      setText(isoToDe(isoValue));
    }
  }

  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    function updatePosition() {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const popoverHeight = 365;
      const popoverWidth = 312;
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipUp = spaceBelow < popoverHeight && rect.top > popoverHeight;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - popoverWidth - 8));
      const top = flipUp ? rect.top - 6 : rect.bottom + 6;
      setCoords({ top, left, flipUp });
    }
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        wrapperRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.shiftKey ? shiftIsoMonths(isoValue, 1) : shiftIsoDays(isoValue, 1);
      emitChange(next);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = e.shiftKey ? shiftIsoMonths(isoValue, -1) : shiftIsoDays(isoValue, -1);
      emitChange(next);
      return;
    }
    if (e.key === "Enter") {
      commitText(text);
      setOpen(false);
    }
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      return;
    }
    onKeyDown?.(e);
  }

  function handleInputBlur(e: FocusEvent<HTMLInputElement>) {
    const related = e.relatedTarget as HTMLElement | null;
    if (
      related &&
      (wrapperRef.current?.contains(related) ||
        popoverRef.current?.contains(related) ||
        related.closest?.("[data-datepicker-popover]"))
    ) {
      return;
    }
    commitText(text);
    onBlur?.(e);
  }

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function selectIsoAndClose(iso: string) {
    emitChange(iso);
    setOpen(false);
    inputRef.current?.focus();
  }

  // Kalender-Zellen für (viewYear, viewMonth) berechnen (Montag = 0 ... Sonntag = 6)
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const cells: Array<{ iso: string; day: number; inMonth: boolean }> = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const pm = viewMonth === 0 ? 11 : viewMonth - 1;
    const py = viewMonth === 0 ? viewYear - 1 : viewYear;
    cells.push({ iso: toIso(py, pm, d), day: d, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: toIso(viewYear, viewMonth, d), day: d, inMonth: true });
  }
  while (cells.length < 42) {
    const d = cells.length - (startOffset + daysInMonth) + 1;
    const nm = viewMonth === 11 ? 0 : viewMonth + 1;
    const ny = viewMonth === 11 ? viewYear + 1 : viewYear;
    cells.push({ iso: toIso(ny, nm, d), day: d, inMonth: false });
  }

  const today = heuteIso();
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear + 5; y >= 1990; y--) {
    years.push(y);
  }

  return (
    <div ref={wrapperRef} className="relative inline-block w-full">
      <div className="relative flex items-center w-full">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoFocus={autoFocus}
          disabled={disabled}
          value={text}
          placeholder={placeholder}
          title={
            title ??
            "Datum eingeben (z. B. 01.06.2025 oder 01062025) oder Kalender rechts öffnen. Pfeiltasten ↑/↓ ändern den Tag."
          }
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          onChange={(e) => {
            const val = e.target.value;
            setText(val);
            // Wenn vollständiges 10-Zeichen-Datum TT.MM.JJJJ eingetippt wurde, live übernehmen
            if (/^\d{2}\.\d{2}\.\d{4}$/.test(val.trim())) {
              const parsed = parseDeOrIsoToIso(val);
              if (parsed) {
                onValueChange?.(parsed);
                onChange?.({ target: { value: parsed, name } });
                const [y, m] = parsed.split("-").map(Number);
                setViewYear(y);
                setViewMonth(m - 1);
              }
            }
          }}
          onKeyDown={handleInputKeyDown}
          onBlur={handleInputBlur}
          className={`${className} font-mono tabular-nums ${
            compact ? "pr-6" : "pr-8"
          }`}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          title="Kalender öffnen"
          aria-label="Kalender öffnen"
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors ${
            compact ? "p-0.5" : "p-1"
          }`}
        >
          <svg
            className={compact ? "w-3.5 h-3.5" : "w-4 h-4"}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </button>
      </div>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            data-datepicker-popover="true"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              transform: coords.flipUp ? "translateY(-100%)" : undefined,
              zIndex: 9999,
            }}
            className="w-[312px] rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 shadow-2xl p-3 text-slate-800 dark:text-slate-100 select-none"
          >
            {/* Schnellauswahl-Chips für typische NK-Abrechnungsdaten */}
            <div className="flex flex-wrap gap-1 pb-2.5 mb-2.5 border-b border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => selectIsoAndClose(today)}
                className="px-2 py-1 text-xs font-medium rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 transition-colors"
              >
                Heute
              </button>
              <button
                type="button"
                onClick={() => selectIsoAndClose(toIso(viewYear, 5, 1))}
                title={`Periodenanfang 01.06.${viewYear}`}
                className="px-2 py-1 text-xs font-medium rounded-md bg-slate-100 dark:bg-slate-700/80 text-slate-800 dark:text-slate-100 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
              >
                01.06.{String(viewYear).slice(2)}
              </button>
              <button
                type="button"
                onClick={() => selectIsoAndClose(toIso(viewYear, 4, 31))}
                title={`Periodenende 31.05.${viewYear}`}
                className="px-2 py-1 text-xs font-medium rounded-md bg-slate-100 dark:bg-slate-700/80 text-slate-800 dark:text-slate-100 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
              >
                31.05.{String(viewYear).slice(2)}
              </button>
              <button
                type="button"
                onClick={() => selectIsoAndClose(toIso(viewYear, viewMonth, 1))}
                title="Erster Tag des angezeigten Monats (z. B. für Einzug)"
                className="px-2 py-1 text-xs font-medium rounded-md bg-slate-100 dark:bg-slate-700/80 text-slate-800 dark:text-slate-100 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
              >
                1. {MONATE[viewMonth].slice(0, 3)}
              </button>
              <button
                type="button"
                onClick={() =>
                  selectIsoAndClose(toIso(viewYear, viewMonth, daysInMonth))
                }
                title="Letzter Tag des angezeigten Monats (z. B. für Auszug)"
                className="px-2 py-1 text-xs font-medium rounded-md bg-slate-100 dark:bg-slate-700/80 text-slate-800 dark:text-slate-100 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
              >
                {daysInMonth}. {MONATE[viewMonth].slice(0, 3)}
              </button>
            </div>

            {/* Monat & Jahr direkt wählen */}
            <div className="flex items-center justify-between gap-1.5 mb-2">
              <button
                type="button"
                onClick={prevMonth}
                title="Vorheriger Monat"
                aria-label="Vorheriger Monat"
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors font-semibold"
              >
                ‹
              </button>
              <div className="flex items-center gap-1.5 flex-1">
                <select
                  aria-label="Monat wählen"
                  value={viewMonth}
                  onChange={(e) => setViewMonth(Number(e.target.value))}
                  className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:border-indigo-500 focus:outline-none"
                >
                  {MONATE.map((m, idx) => (
                    <option key={m} value={idx}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Jahr wählen"
                  value={viewYear}
                  onChange={(e) => setViewYear(Number(e.target.value))}
                  className="w-[78px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-semibold font-mono text-slate-800 dark:text-slate-100 focus:border-indigo-500 focus:outline-none"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={nextMonth}
                title="Nächster Monat"
                aria-label="Nächster Monat"
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors font-semibold"
              >
                ›
              </button>
            </div>

            {/* Wochentage Mo–So */}
            <div className="grid grid-cols-7 gap-1 mb-1 text-center">
              {WOCHENTAGE.map((w) => (
                <div
                  key={w}
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 py-1"
                >
                  {w}
                </div>
              ))}
            </div>

            {/* Tage-Raster */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((c) => {
                const isSelected = c.iso === isoValue;
                const isToday = c.iso === today;
                return (
                  <button
                    key={c.iso}
                    type="button"
                    onClick={() => selectIsoAndClose(c.iso)}
                    className={`h-9 w-full rounded-lg text-xs font-mono tabular-nums transition-colors flex items-center justify-center ${
                      isSelected
                        ? "bg-indigo-600 text-white font-bold shadow-sm"
                        : isToday
                        ? "ring-2 ring-indigo-500 text-indigo-700 dark:text-indigo-300 font-bold bg-indigo-50/60 dark:bg-indigo-950/40"
                        : c.inMonth
                        ? "text-slate-800 dark:text-slate-100 font-medium hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-700 dark:hover:text-indigo-300"
                        : "text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                    }`}
                  >
                    {c.day}
                  </button>
                );
              })}
            </div>

            {/* Fußzeile im Kalender */}
            <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
              <span className="text-slate-600 dark:text-slate-300 font-mono">
                {isoValue ? `Gewählt: ${isoToDe(isoValue)}` : "Kein Datum gewählt"}
              </span>
              <div className="flex items-center gap-2">
                {allowClear && isoValue && (
                  <button
                    type="button"
                    onClick={() => selectIsoAndClose("")}
                    className="text-rose-600 dark:text-rose-400 hover:underline font-medium"
                  >
                    Leeren
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 font-medium"
                >
                  Schließen
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

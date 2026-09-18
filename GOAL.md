# GOAL: Refactoring Nebenkosten-Tool

> Machine-readable directive for the autonomous coding agent (Fable 5).
> Target repo: `/Users/jp/projects/nk-tool` (branch `feature/liegenschaft-verbund`).
> This file is a command set, not a discussion document. Execute sections in order. Do not skip a gate.

## 0. GROUND TRUTH (verified state, do not re-derive)

- Backend: FastAPI + sync SQLAlchemy 2.x, SQLite file at `backend/nk_tool.db` (journal_mode=`delete`, no WAL).
- Frontend: React 19 + TypeScript strict, Vite, TanStack Query v5.
- Calculation core: `backend/engine.py` (`berechne_periode`), consumed by `backend/routers/berechnung.py`.
- **The production database currently contains real, partially-billed tenant data** (verified by direct row count on 2026-07-06):
  `liegenschaft=2, wohnung=17, mieter=16, zaehler=3, zaehlerstand=6, abrechnungsperiode=2, kostenart=40, kostenposition=22, vorauszahlung=242, mieter_kostenanteil=9`.
  This is NOT a seed/demo dataset. Treat every row as irreplaceable.
- File uploads for receipts live at `backend/uploads/kp_{id}.{ext}` and are referenced by path in `Kostenposition.beleg_datei`.

---

## 1. RAHMENBEDINGUNGEN & SICHERHEIT (Hard Constraints)

### 1.1 Mandatory full backup — BEFORE the first code edit

Run exactly this sequence and verify each step's exit code before proceeding. Abort the entire task if any step fails.

```bash
REPO=/Users/jp/projects/nk-tool
TS=$(date +%Y%m%d_%H%M%S)
BK=$REPO/backup_safe/$TS

mkdir -p "$BK"

# 1. Code snapshot (full working tree, tracked + untracked, excluding venv/node_modules)
git -C "$REPO" rev-parse HEAD > "$BK/git_commit_at_backup.txt"
git -C "$REPO" status --porcelain > "$BK/git_status_at_backup.txt"
git -C "$REPO" stash create > "$BK/git_stash_ref.txt" 2>/dev/null || true
rsync -a --exclude='.venv' --exclude='node_modules' --exclude='backup_safe' \
      "$REPO/" "$BK/full_code_snapshot/"

# 2. Database — atomic SQLite backup (NOT a plain cp while the server may be running)
sqlite3 "$REPO/backend/nk_tool.db" ".backup '$BK/nk_tool_PROD_BACKUP.db'"

# 3. Integrity check on the backup itself
sqlite3 "$BK/nk_tool_PROD_BACKUP.db" "PRAGMA integrity_check;"

# 4. Uploaded receipt files (referenced by DB rows — must travel with the DB)
rsync -a "$REPO/backend/uploads/" "$BK/uploads/"

# 5. Checksum manifest — used later to prove the prod DB was never touched
sha256sum "$REPO/backend/nk_tool.db" "$BK/nk_tool_PROD_BACKUP.db" > "$BK/CHECKSUMS.txt"
```

**Gate:** `PRAGMA integrity_check;` must return exactly `ok`. If it returns anything else, STOP — do not proceed with refactoring; report the corruption to JP first.

### 1.2 Isolation — the agent works against a copy, never the original

1. Copy the DB once into a scratch/test location, e.g. `backend/nk_tool_test.db`, from the backup created in 1.1 (not from the live file, to avoid touching it twice):
   ```bash
   cp "$BK/nk_tool_PROD_BACKUP.db" "$REPO/backend/nk_tool_test.db"
   ```
2. `backend/database.py` currently hardcodes `_DB_PATH = Path(__file__).parent / "nk_tool.db"`. As the **first and only infrastructure change**, make the DB path overridable via an environment variable, defaulting to the existing behavior so nothing else changes:
   ```python
   import os
   _DB_PATH = Path(os.environ.get("NK_TOOL_DB_PATH", Path(__file__).parent / "nk_tool.db"))
   ```
3. For every subsequent command in this task (dev server, test runs, scripts, migrations) export:
   ```bash
   export NK_TOOL_DB_PATH="$REPO/backend/nk_tool_test.db"
   ```
4. Before ending the task, re-run the checksum from step 1.1 against the live file and diff against `CHECKSUMS.txt`. **`backend/nk_tool.db` must be byte-identical to the pre-refactor state.** Any deviation is a hard failure of the task — halt and report, do not attempt to "fix" it by overwriting.
5. Never write code that opens `nk_tool.db` directly (bypassing the env var), and never remove/rename the original file.

---

## 2. MATHEMATISCHE VALIDIERUNG (Regression Tests)

### 2.1 Baseline snapshot (create once, against the test-DB copy, before any refactor)

For every `Abrechnungsperiode` row present in `nk_tool_test.db` (enumerate dynamically — do not hardcode IDs, currently 2 periods exist but this must not be assumed to stay fixed):

1. Call `berechne_periode(db, periode_id)` (or `POST /api/v1/perioden/{id}/berechnung`) against the test DB.
2. Persist the full return dict (`gesamt_kosten`, `heiz_gesamt`, `ww_gesamt`, `ww_anteil_prozent`, `haus_kosten`, `mieter_anteil`, `vermieter_anteil`, `rows_created`) to `backup_safe/baseline/periode_{id}_summary.json`.
3. Persist every resulting `MieterKostenanteil` row (`mieter_id`, `kostenart_id`, `pool`, `bezeichnung`, `betrag_pro_einheit`, `einheiten`, `kostenanteil`, `traeger`, `erlaeuterung`) sorted by `(mieter_id, pool, kostenart_id)` to `backup_safe/baseline/periode_{id}_rows.json`.

### 2.2 Regression rule — enforced after EVERY refactoring step, not just at the end

1. Restore `nk_tool_test.db` fresh from `nk_tool_PROD_BACKUP.db` (never reuse a DB that a previous test run may have mutated).
2. Re-run step 2.1 against the refactored code.
3. Diff every numeric field against the baseline JSON.
4. **Pass condition: the deviation must be exactly `0.00 €` — i.e. `round(new_value, 2) == round(baseline_value, 2)` for every single field of every single row, and every summary field.** Do not average, do not use an epsilon/tolerance comparison, do not treat "close enough" as a pass.
5. Any diff greater than 0.00 € blocks the commit. Revert the offending change, isolate which line caused the drift, fix it, and re-run from step 1 of this subsection.
6. Additionally assert `rows_created` is identical in count AND in the exact set of `(mieter_id, pool, kostenart_id)` keys — a refactor that produces the same totals through a different row structure (e.g. merged/split rows) still fails this gate, since Stage 3 UI and printed Einzelabrechnungen depend on row-level shape.

### 2.3 Edge cases the regression suite must additionally cover (synthetic, on the test DB copy only)

The current 2 real periods do not exercise every branch of `engine.py`. Before declaring the refactor done, add synthetic fixtures (in the test DB copy, never in prod) for:
- A `Mieter` with `ist_leerstand=True` spanning a partial period (verifies `traeger="vermieter"` routing).
- A mid-period Mieterwechsel (two overlapping-boundary tenants in one Wohnung) to verify `time_frac` / `gradtag_frac` segment splitting.
- A `Zaehler` with only a `periode_start` reading and no `periode_ende` (verifies `_get_verbrauch_geschaetzt` estimation branches, lines ~227–303 in `engine.py`).
- A `Wohnung` with `flaeche_m2` at the boundary (see 3.2.1) to confirm the new validation rejects it rather than silently zeroing a tenant's share.
- A `Liegenschaft` with `mittlere_ww_temperatur` at/below 10.0 (see 3.2.2) to confirm the new validation rejects it rather than producing a zero/negative HKVO split.

---

## 3. OPTIMIERUNGSZIELE (Requirements)

### 3.1 Performance

**3.1.1 N+1 query pattern in `engine.py` (confirmed by code read, not assumed).**
`_get_verbrauch_geschaetzt` and `_get_prev_daily_rate` are called per `Wohnung` × per meter type (`_SCHAETZUNG_TYPEN`, 4 types) × per `Zaehler`, and each call issues multiple independent `db.query(...).first()` round-trips (`_get_prev_daily_rate` alone does up to 6 sequential queries: `Zaehler` get, `Wohnung` get, `Abrechnungsperiode` get + lookup, 2× `Zaehlerstand` filter). For the current 17-Wohnung portfolio this is on the order of hundreds of small queries per `berechne_periode` call. Refactor to:
- Load all `Zaehler` rows for the `Liegenschaft` once.
- Load all `Zaehlerstand` rows for the current period AND the relevant previous period once (two bulk queries total, not per-meter), and index them in-memory by `(zaehler_id, art)`.
- Load the "previous Abrechnungsperiode per Liegenschaft" once, not once per meter.
- Keep the exact same estimation logic/branches — this is a data-access refactor only, the math must not change (enforced by section 2).

**3.1.2 Do not introduce new query patterns that reintroduce N+1** (e.g. lazy-loaded ORM relationship access inside a loop). Prefer explicit `db.query(...).filter(Model.id.in_(ids))` bulk fetches, consistent with the pattern already used correctly in `routers/verbund.py::_berechne_aufteilung` (`func.sum`/`func.count` with `.in_()` subqueries) — replicate that style.

**3.1.3 Verify with EXPLAIN or query counting**, not guesswork: instrument a query counter (SQLAlchemy `event.listen(engine, "before_cursor_execute", ...)`) around `berechne_periode` before and after, and report the before/after count in the PR description.

### 3.2 Robustheit & UX (input validation)

Each of these is a currently-unguarded path confirmed in `models.py` / `engine.py`. Add validation at the Pydantic schema boundary (`schemas.py`), not deep inside `engine.py`, so the API rejects bad input with a clear `{"ok": false, "error": "..."}` message instead of silently producing a wrong bill.

**3.2.1 `Wohnung.flaeche_m2`** — currently `nullable=False` but unconstrained at `>0`. A `0` (or negative) value does not crash; it silently zeroes that tenant's share in every m²-weighted pool (`heiz_grund`, `ww_grund`, `m2_wohnflaeche` direct Kostenarten) — a silent financial error, worse than a crash. Add `gt=0` validation on create/update.

**3.2.2 `Liegenschaft.mittlere_ww_temperatur`** — used in `engine.py:501` as `(tw - 10.0)`. Currently defaults to `60.0` and is `nullable=False`, but nothing prevents a user from setting it to `≤10.0`, which makes `q_ww` zero or negative and silently corrupts the entire HKVO §9 WW/Heizung split for the whole Liegenschaft. Add `gt=10.0` validation (with a clear message referencing HKVO §9).

**3.2.3 `Abrechnungsperiode.von_datum` / `bis_datum`** — stored as ISO strings, no check that `von_datum < bis_datum`. If violated, `_days()` returns `0`, `total_days=0`, and every `time_frac` in the period silently becomes `0.0` (no exception, no rows for anyone). Add a schema-level validator rejecting `bis_datum <= von_datum`.

**3.2.4 `Liegenschaft.heiz_grundkosten_anteil` / `ww_grundkosten_anteil`** — verify current bounds; constrain to `[0.0, 1.0]` inclusive if not already enforced, since `engine.py` uses `1.0 - anteil` directly as the "Verbrauchskosten" complement.

**3.2.5 Preserve the input-validation patterns that are already correct** — do not regress them: the `manuell_prozent` all-zero guard in `routers/verbund.py:118-120`, and the whitelisted-extension file upload check in `routers/kostenpositionen.py:117-119` (note: only the file *extension* is trusted, the destination filename is server-generated as `kp_{kp_id}{ext}` — this is already safe against path traversal; do not "simplify" it into trusting `file.filename` directly).

### 3.3 Code-Qualität

- Consolidate the duplicated meter-lookup query pattern shared by `_get_verbrauch` and `_get_verbrauch_geschaetzt` in `engine.py` into one helper — same behavior, less duplication.
- Replace magic strings (`pool` values `"heiz_grund"|"heiz_verbrauch"|"ww_grund"|"ww_verbrauch"|"strom"`, `traeger` values `"mieter"|"vermieter"`, `verteilungsschluessel` values) with `Enum`/`Literal` types for compile-time safety — **but the serialized string values written to the DB must stay byte-identical**, since existing `mieter_kostenanteil` rows already contain these strings and Stage 3 frontend code matches on them literally.
- Add strict typing (mypy or pyright) to the backend; keep Pydantic v2 `ConfigDict(from_attributes=True)` conventions already in use.
- Do not change the `{"ok": true/false, "data"/"error": ...}` API envelope — the frontend `api/client.ts` wrapper depends on it exactly as documented in `CLAUDE.md`.
- Do not touch the idempotent `ALTER TABLE ... ; except: pass` migration pattern in `main.py` structurally (no Alembic introduction) — this is an intentional project convention. You may upgrade the bare `except: pass` to log the specific exception when it is NOT the expected "duplicate column" error, without changing control flow.

---

## 4. EXECUTION ORDER (do not reorder)

1. Section 1.1 — full backup. Gate: `integrity_check == ok`.
2. Section 1.2 — isolation (env-var DB path + test DB copy). Gate: `NK_TOOL_DB_PATH` verified in effect for all subsequent commands.
3. Section 2.1 — baseline snapshot from current (pre-refactor) code against the test DB copy.
4. Section 3.1 (performance) — one change at a time, regression gate (2.2) after each.
5. Section 3.2 (validation) — one rule at a time, regression gate (2.2) after each (validation additions must not change output for currently-valid data — same 0.00 € rule applies).
6. Section 3.3 (code quality) — regression gate (2.2) after each meaningful change.
7. Section 2.3 — add synthetic edge-case fixtures and prove they now behave correctly (reject bad input / handle Leerstand / Mieterwechsel / partial readings correctly).
8. Final gate — re-verify `backend/nk_tool.db` checksum unchanged (section 1.2 step 4) before declaring the task complete.

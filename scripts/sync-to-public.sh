#!/usr/bin/env bash
# Synchronisiert den App-Code (und nur den App-Code) dieses privaten Repos in eine
# separate lokale Arbeitskopie des öffentlichen "nk-tool"-Repos und pusht sie.
#
# Wichtig: läuft NIE mit `git push` in diesem (privaten) Repo — die Historie des
# privaten Repos (inkl. CLAUDE.md/NEBENKOSTEN_STATUS.md/PROJEKT.md mit echten
# Mieterdaten) berührt das öffentliche Repo zu keinem Zeitpunkt. Es wird jedes Mal
# ein frischer Snapshot der Whitelist kopiert, automatisiert auf echte Mieter-/
# Adressdaten geprüft und erst danach im öffentlichen Repo committet.
#
# Usage:
#   ./scripts/sync-to-public.sh [PUBLIC_REPO_DIR] [COMMIT_MESSAGE] [--dry-run]
#
# PUBLIC_REPO_DIR default: ../nk-tool-public (Klon von https://github.com/LordAbsalypson/nk-tool.git)

set -euo pipefail

PRIVATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN=false
PositionalArgs=()
for arg in "$@"; do
  if [ "$arg" = "--dry-run" ]; then
    DRY_RUN=true
  else
    PositionalArgs+=("$arg")
  fi
done

PUBLIC_DIR="${PositionalArgs[0]:-$PRIVATE_DIR/../nk-tool-public}"
COMMIT_MSG="${PositionalArgs[1]:-sync: App-Code-Update aus privatem Repo}"

if [ ! -d "$PUBLIC_DIR/.git" ]; then
  echo "FEHLER: $PUBLIC_DIR ist kein Git-Repo. Erst klonen:"
  echo "  git clone https://github.com/LordAbsalypson/nk-tool.git $PUBLIC_DIR"
  exit 1
fi

# Whitelist: nur App-Code + generische, geprüfte Doku. Alles andere (CLAUDE.md,
# NEBENKOSTEN_STATUS.md, PROJEKT.md, temp_ista_analyse.md, GOAL.md-Backups, .db,
# uploads/, backup_safe/, abrechnungen_pdf/) bleibt bewusst NUR im privaten Repo.
#
# WICHTIG: rsync wertet Filterregeln in Reihenfolge aus (erste passende Regel
# gewinnt) — generierte/sensible Verzeichnisse müssen daher VOR den rekursiven
# `***`-Includes ausgeschlossen werden, sonst greift der Exclude nicht.
RSYNC_FILTERS=(
  --exclude="*.db"
  --exclude="*.db-journal"
  --exclude="*.db-wal"
  --exclude="*.db-shm"
  --exclude="~$*"
  --exclude="__pycache__/"
  --exclude="*.pyc"
  --exclude=".pytest_cache/"
  --exclude=".mypy_cache/"
  --exclude="node_modules/"
  --exclude="dist/"
  --exclude=".vite/"
  --exclude="uploads/"
  --exclude="backup_safe/"
  --exclude="backups/"
  --exclude="abrechnungen_pdf/"
  --exclude=".venv/"
  --exclude="venv/"
  --exclude="*.egg-info/"
  --exclude="build/"
  --include="/VERSION"
  --include="/.mcp.json"
  --include="/backend/***"
  --include="/desktop/***"
  --include="/mcp-server/***"
  --include="/.github/***"
  --include="/frontend/"
  --include="/frontend/src/***"
  --include="/frontend/public/"
  --include="/frontend/public/***"
  --include="/frontend/scripts/"
  --include="/frontend/scripts/***"
  --include="/frontend/package.json"
  --include="/frontend/package-lock.json"
  --include="/frontend/tsconfig*.json"
  --include="/frontend/vite.config.ts"
  --include="/frontend/tailwind.config.js"
  --include="/frontend/postcss.config.js"
  --include="/frontend/index.html"
  --include="/scripts/***"
  --include="/docs/***"
  --include="/README.md"
  --include="/CHANGELOG.md"
  --include="/CONTRIBUTING.md"
  --include="/SECURITY.md"
  --include="/LICENSE"
  --include="/FEATURES_ROADMAP.md"
  --include="/LEGAL_NOTES.md"
  --include="/ARCHITECTURE.md"
  --include="/AI_COMMANDS.md"
  --include="/GOAL.md"
  --include="/.gitignore"
  --exclude="*"
)

echo "Synchronisiere $PRIVATE_DIR -> $PUBLIC_DIR (Whitelist, siehe Skript)"
# ACHTUNG: --delete-excluded NIE verwenden — rsync behandelt dabei auch
# .git/ als "excluded" (matcht keine der obigen --include-Regeln) und löscht
# es trotz Protect-Filter. Stray __pycache__/*.pyc werden stattdessen gezielt
# per find aufgeräumt.
rsync -av --delete \
  "${RSYNC_FILTERS[@]}" \
  "$PRIVATE_DIR/" "$PUBLIC_DIR/"

find "$PUBLIC_DIR/backend" -depth \( -name "__pycache__" -o -name "*.pyc" \) -exec rm -rf {} +

# Automatischer Privacy-Gate-Scan: liest Straßen-/Orts-/Mieternamen dynamisch aus
# der lokalen Arbeits-DB (ohne Namen im Skript selbst zu speichern) und bricht ab,
# falls ein echter Datensatz in einer öffentlich synchronisierten Datei auftaucht.
python3 - "$PRIVATE_DIR" "$PUBLIC_DIR" <<'PY'
import pathlib, re, sqlite3, sys

private_dir = pathlib.Path(sys.argv[1])
public_dir = pathlib.Path(sys.argv[2])

STOPWORDS = {
    "straße", "str.", "haus", "wohnung", "links", "rechts", "oben", "unten",
    "frau", "herr", "familie", "leerstand", "muster", "musterstraße", "musterstadt",
    "inge", "paar", "alert", "peter", "michael", "thomas", "andreas", "stefan",
    "christian", "martin", "alexander", "daniel", "tobias", "jan", "anna", "maria",
    "sabine", "petra", "monika", "claudia", "birgit", "stephanie", "stefanie",
    "doris", "timo", "serhan", "unbekannt", "aktuell",
}

sensitive_tokens: set[str] = set()
for db_candidate in (
    private_dir / "backend" / "nk_tool_test.db",
    private_dir / "backend" / "nk_tool.db",
):
    if not db_candidate.exists():
        continue
    con = sqlite3.connect(f"file:{db_candidate}?mode=ro", uri=True)
    try:
        cur = con.cursor()
        for row in cur.execute("SELECT name, adresse, ort FROM liegenschaft"):
            for val in row:
                if not val:
                    continue
                for part in re.split(r"[\s,+/()-]+", val):
                    if len(part) >= 5 and not part.isdigit() and part.lower() not in STOPWORDS:
                        sensitive_tokens.add(part)
        for row in cur.execute("SELECT anzeigename FROM mieter"):
            val = row[0] or ""
            if "leerstand" in val.lower():
                continue
            parts = [p for p in re.split(r"[\s,+/()-]+", val) if len(p) >= 5 and not p.isdigit()]
            # Nachnamen (jeweils letztes Wort eines Namenssegments) prüfen
            for p in parts:
                if p.lower() not in STOPWORDS:
                    sensitive_tokens.add(p)
    finally:
        con.close()

blocklist_file = private_dir / ".privacy-blocklist"
if blocklist_file.exists():
    for line in blocklist_file.read_text(encoding="utf-8").splitlines():
        t = line.strip()
        if t and not t.startswith("#"):
            sensitive_tokens.add(t)

leaks = []
for path in public_dir.rglob("*"):
    if not path.is_file() or ".git" in path.parts:
        continue
    if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".icns", ".ico", ".woff", ".woff2", ".ttf"}:
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue
    for token in sorted(sensitive_tokens):
        if re.search(rf"\b{re.escape(token)}\b", text, flags=re.IGNORECASE):
            leaks.append((str(path.relative_to(public_dir)), token))

if leaks:
    print("PRIVACY-GATE FEHLGESCHLAGEN! Sensible Begriffe im öffentlichen Repo gefunden:")
    for rel, tok in leaks:
        print(f"  - {rel}: '{tok}'")
    sys.exit(1)
print(f"Privacy-Gate OK ({len(sensitive_tokens)} sensible Begriffe geprüft, 0 Treffer in {public_dir}).")
PY

if [ "$DRY_RUN" = true ]; then
  echo "Dry-Run beendet — kein Commit/Push im öffentlichen Repo ausgeführt."
  exit 0
fi

cd "$PUBLIC_DIR"
git add -A
if git diff --cached --quiet; then
  echo "Keine Änderungen — nichts zu committen."
  exit 0
fi
git commit -m "$COMMIT_MSG"
git push origin HEAD
echo "Fertig: öffentliches Repo aktualisiert."

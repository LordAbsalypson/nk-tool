#!/usr/bin/env bash
# Synchronisiert den App-Code (und nur den App-Code) dieses privaten Repos in eine
# separate lokale Arbeitskopie des öffentlichen "nk-tool"-Repos und pusht sie.
#
# Wichtig: läuft NIE mit `git push` in diesem (privaten) Repo — die Historie des
# privaten Repos (inkl. CLAUDE.md/NEBENKOSTEN_STATUS.md/PROJEKT.md mit echten
# Mieterdaten) berührt das öffentliche Repo zu keinem Zeitpunkt. Es wird jedes Mal
# ein frischer Snapshot der Whitelist kopiert und im öffentlichen Repo neu committet.
#
# Usage:
#   ./scripts/sync-to-public.sh [PUBLIC_REPO_DIR] [COMMIT_MESSAGE]
#
# PUBLIC_REPO_DIR default: ../nk-tool-public (Klon von git@github.com:LordAbsalypson/nk-tool.git)

set -euo pipefail

PRIVATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC_DIR="${1:-$PRIVATE_DIR/../nk-tool-public}"
COMMIT_MSG="${2:-sync: App-Code-Update aus privatem Repo}"

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
  --exclude="__pycache__/"
  --exclude="*.pyc"
  --exclude=".pytest_cache/"
  --exclude=".mypy_cache/"
  --exclude="node_modules/"
  --exclude="dist/"
  --exclude=".vite/"
  --exclude="uploads/"
  --exclude="backup_safe/"
  --exclude="abrechnungen_pdf/"
  --exclude=".venv/"
  --exclude="venv/"
  --exclude="*.egg-info/"
  --exclude="build/"
  --include="/backend/***"
  --include="/desktop/***"
  --include="/mcp-server/***"
  --include="/.github/***"
  --include="/frontend/"
  --include="/frontend/src/***"
  --include="/frontend/public/"
  --include="/frontend/public/***"
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
# es trotz Protect-Filter (real passiert, 2026-09-18: lokaler Klon verloren,
# zum Glück war der Push vorher schon durch). Stray __pycache__/*.pyc werden
# stattdessen gezielt per find aufgeräumt, niemals via rsync --delete-excluded.
rsync -av --delete \
  "${RSYNC_FILTERS[@]}" \
  "$PRIVATE_DIR/" "$PUBLIC_DIR/"

find "$PUBLIC_DIR/backend" -depth \( -name "__pycache__" -o -name "*.pyc" \) -exec rm -rf {} +

cd "$PUBLIC_DIR"
git add -A
if git diff --cached --quiet; then
  echo "Keine Änderungen — nichts zu committen."
  exit 0
fi
git commit -m "$COMMIT_MSG"
git push origin HEAD
echo "Fertig: öffentliches Repo aktualisiert."

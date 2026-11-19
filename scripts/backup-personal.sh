#!/usr/bin/env bash
# Erstellt ein konsistentes, verifiziertes persönliches Backup aller lokalen
# NK-Tool-Datenbanken (verknüpfte iCloud-DB, Desktop-App-DB, Repo-Arbeits-DB)
# sowie der generierten Abrechnungs-PDFs nach backup_safe/personal_<timestamp>/.
#
# Wichtig: backup_safe/ steht in .gitignore und ist in scripts/sync-to-public.sh
# explizit ausgeschlossen — persönliche Backups gelangen niemals zu GitHub.
#
# Usage:
#   ./scripts/backup-personal.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$REPO_ROOT/backup_safe/personal_$STAMP"
mkdir -p "$BACKUP_DIR"

python3 - "$REPO_ROOT" "$BACKUP_DIR" <<'PY'
import hashlib, json, pathlib, shutil, sqlite3, sys

repo_root = pathlib.Path(sys.argv[1])
backup_dir = pathlib.Path(sys.argv[2])
app_dir = pathlib.Path.home() / "Library" / "Application Support" / "NK-Tool"

candidates: list[tuple[str, pathlib.Path]] = []

pointer = app_dir / "db_location.json"
if pointer.exists():
    try:
        info = json.loads(pointer.read_text(encoding="utf-8"))
        if info.get("path"):
            candidates.append(("icloud_linked", pathlib.Path(info["path"])))
    except Exception:
        pass

candidates.append(("desktop_default", app_dir / "nk_tool.db"))
candidates.append(("repo_test_db", repo_root / "backend" / "nk_tool_test.db"))
candidates.append(("repo_orig_db", repo_root / "backend" / "nk_tool.db"))

manifest = []
for label, src in candidates:
    if not src.exists():
        continue
    dst = backup_dir / f"{label}__{src.name}"
    src_con = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    dst_con = sqlite3.connect(str(dst))
    try:
        src_con.backup(dst_con)
    finally:
        dst_con.close()
        src_con.close()

    # Prüfe Zeilenzahlen & MD5
    con = sqlite3.connect(f"file:{dst}?mode=ro", uri=True)
    try:
        cur = con.cursor()
        counts = {}
        for tbl in ("liegenschaft", "wohnung", "mieter", "zaehler", "zaehlerstand", "direkt_kostenart_wert"):
            try:
                counts[tbl] = cur.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
            except sqlite3.Error:
                pass
    finally:
        con.close()

    md5 = hashlib.md5(dst.read_bytes()).hexdigest()
    manifest.append({
        "label": label,
        "source": str(src),
        "backup_file": dst.name,
        "size_bytes": dst.stat().st_size,
        "md5": md5,
        "counts": counts,
    })
    print(f"✓ Gesichert [{label}]: {dst.name} ({dst.stat().st_size:,} Bytes, MD5={md5}, {counts})")

# PDF-Archive sichern, falls vorhanden
for pdf_src_name, pdf_src in (
    ("desktop_pdfs", app_dir / "abrechnungen_pdf"),
    ("repo_pdfs", repo_root / "abrechnungen_pdf"),
):
    if pdf_src.exists() and any(pdf_src.rglob("*.pdf")):
        shutil.copytree(pdf_src, backup_dir / pdf_src_name, dirs_exist_ok=True)
        print(f"✓ PDF-Archiv gesichert: {pdf_src_name}")

(backup_dir / "manifest.json").write_text(
    json.dumps({"timestamp": backup_dir.name, "backups": manifest}, indent=2, ensure_ascii=False),
    encoding="utf-8",
)
print(f"\nPersönliches Backup abgeschlossen: {backup_dir}")
PY

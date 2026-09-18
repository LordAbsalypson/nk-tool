"""Pytest configuration for the NK-Tool regression suite.

CRITICAL SAFETY RULES:
1. Tests must NEVER touch the production database ``backend/nk_tool.db``
   (GOAL.md section 1.2).
2. Tests must NEVER touch ``backend/nk_tool_test.db`` either — that file is
   the live working DB used by the ``backend-testdb`` dev server
   (``.claude/launch.json``) and contains real, hand-entered tenant data.
   An earlier version of this file restored a stale backup directly onto
   ``nk_tool_test.db`` and wiped a live session's data. Tests get their own
   dedicated scratch file instead, restored fresh every session and never
   read by anything except the test run itself.

``NK_TOOL_DB_PATH`` must be exported *before* ``database`` is imported,
because ``database.py`` resolves the path at import time. This conftest is
imported by pytest before any test module, so setting it here is sufficient.
"""

import os
import re
import shutil
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
# Dedicated to pytest only — deliberately NOT nk_tool_test.db (see module
# docstring). Gitignored, recreated from a backup_safe/ snapshot every run.
TEST_DB = BACKEND_DIR / "nk_tool_pytest_scratch.db"
PROD_DB = BACKEND_DIR / "nk_tool.db"
LIVE_WORKING_DB = BACKEND_DIR / "nk_tool_test.db"
BASELINE_DIR = REPO_DIR / "backup_safe" / "baseline"

# Must happen before any `import database` anywhere in the test session.
os.environ["NK_TOOL_DB_PATH"] = str(TEST_DB)

# Backend uses a flat module layout (`import models`, `import database`).
sys.path.insert(0, str(BACKEND_DIR))


def find_latest_backup() -> Path:
    """Newest *.db snapshot directly under backup_safe/<timestamp>/ — either
    a full nk_tool_PROD_BACKUP.db or a nk_tool_test_pre_<feature>.db safety
    snapshot. Directory names are sortable timestamps (YYYYMMDD_HHMMSS), so
    sorting the directories picks the most recent one. Excludes nested
    backup_safe/*/full_code_snapshot/ copies (one dir deeper, not matched by
    this single-level glob).

    If that newest directory contains more than one *.db file, this refuses
    to guess (a silent wrong pick here is exactly what wiped the live DB
    once already — see NEBENKOSTEN_STATUS.md Runde 15): prefer
    nk_tool_PROD_BACKUP.db if present, otherwise raise and require a human
    to clean up the ambiguous directory."""
    backup_root = REPO_DIR / "backup_safe"
    zeitstempel_re = re.compile(r"^\d{8}_\d{6}$")
    zeitstempel_dirs = sorted(
        d for d in backup_root.glob("*") if d.is_dir() and zeitstempel_re.match(d.name)
    )
    if not zeitstempel_dirs:
        raise FileNotFoundError(
            "No timestamped snapshot directory found under backup_safe/ — "
            "run the GOAL.md section 1.1 backup first."
        )
    neueste = zeitstempel_dirs[-1]
    dbs = sorted(neueste.glob("*.db"))
    if not dbs:
        raise FileNotFoundError(f"No *.db file directly under {neueste} — run the backup again.")
    if len(dbs) == 1:
        return dbs[0]
    prod = neueste / "nk_tool_PROD_BACKUP.db"
    if prod in dbs:
        return prod
    raise RuntimeError(
        f"Ambiguous backup: {neueste} contains {len(dbs)} *.db files and none is "
        "nk_tool_PROD_BACKUP.db — refusing to guess which one is the verified "
        "snapshot. Remove the extras or rename the correct one."
    )


def restore_test_db() -> None:
    """Restore the pytest scratch DB from the newest verified snapshot."""
    shutil.copyfile(find_latest_backup(), TEST_DB)


@pytest.fixture(scope="session", autouse=True)
def _guard_prod_db():
    """Hard gate: neither the production DB nor the live working DB used by
    the dev server may change one byte because of a test run."""
    import hashlib

    def _sha256(p: Path) -> str | None:
        return hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None

    before_prod = _sha256(PROD_DB)
    before_live = _sha256(LIVE_WORKING_DB)
    yield
    assert _sha256(PROD_DB) == before_prod, (
        "FATAL: production DB backend/nk_tool.db was modified during the test "
        "run. Do NOT overwrite it — restore from backup_safe/ and investigate."
    )
    assert _sha256(LIVE_WORKING_DB) == before_live, (
        "FATAL: live working DB backend/nk_tool_test.db was modified during "
        "the test run. Do NOT overwrite it — restore from backup_safe/ and "
        "investigate why a test touched it instead of the pytest scratch DB."
    )


@pytest.fixture(scope="session")
def fresh_test_db():
    """Session-scoped fresh scratch DB restored from the prod backup."""
    restore_test_db()
    return TEST_DB


@pytest.fixture()
def db_session(fresh_test_db):
    import database

    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

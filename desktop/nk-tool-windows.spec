# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller-Spec für die NK-Tool-Desktop-App (Windows).

Build (auf Windows, z.B. via GitHub Actions windows-latest):
    cd desktop && pyinstaller --noconfirm nk-tool-windows.spec

Voraussetzung: `frontend/dist` muss aktuell sein (`cd frontend && npm run build`).
Ergebnis: desktop/dist/NK-Tool/NK-Tool.exe (+ begleitende Dateien im selben Ordner)

Unterschied zum macOS-Spec (nk-tool.spec): kein BUNDLE()-Schritt (das ist ein
reines .app-Konzept) — COLLECT liefert direkt einen startfähigen Ordner.
pywebview nutzt unter Windows WebView2 (Microsoft Edge Runtime, auf Windows
10/11 vorinstalliert) statt WebKit.
"""

import os

block_cipher = None

BACKEND_DIR = os.path.join(SPECPATH, "..", "backend")
FRONTEND_DIST = os.path.join(SPECPATH, "..", "frontend", "dist")

a = Analysis(
    ["app.py"],
    pathex=[BACKEND_DIR],
    binaries=[],
    datas=[],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets.wsproto_impl",
        "uvicorn.lifespan.on",
        "uvicorn.lifespan.off",
    ],
    # pywebview wählt sein Windows-Backend (webview.platforms.winforms ->
    # edgechromium/WebView2) über statische `import`-Statements in
    # guilib.py/winforms.py — PyInstaller findet die per Modulgraph-Analyse
    # automatisch, kein manuelles Hiddenimport nötig (anders als bei
    # `importlib.import_module()` mit berechnetem Namen). pywebview bringt
    # zudem einen eigenen PyInstaller-Hook mit (webview/__pyinstaller/),
    # der die JS-Assets/DLL-Daten des Pakets ergänzt.
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    cipher=block_cipher,
)

a.datas += Tree(
    BACKEND_DIR,
    prefix="backend",
    excludes=["*.db", "*.db-journal", "__pycache__", "tests", "*.pyc", ".pytest_cache"],
)
a.datas += Tree(FRONTEND_DIST, prefix=os.path.join("frontend", "dist"))
a.datas += [(os.path.join("desktop", "onboarding.html"), "onboarding.html", "DATA")]

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="NK-Tool",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="NK-Tool",
)

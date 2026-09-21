# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller-Spec für die NK-Tool-Desktop-App (macOS).

Build:
    cd desktop && pyinstaller --noconfirm nk-tool.spec

Voraussetzung: `frontend/dist` muss aktuell sein (`cd frontend && npm run build`).
Ergebnis: desktop/dist/NK-Tool.app
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
        # uvicorn wählt Loop/Protokoll-Implementierung zur Laufzeit dynamisch aus
        # (uvloop/httptools sind hier nicht installiert -> reiner asyncio/h11-Pfad,
        # explizit in desktop/app.py über uvicorn.Config(loop="asyncio", http="h11")).
        "uvicorn.logging",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets.wsproto_impl",
        "uvicorn.lifespan.on",
        "uvicorn.lifespan.off",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    cipher=block_cipher,
)

# Backend-Quellcode + Frontend-Production-Build + Onboarding-HTML als Daten
# bündeln (kein kompilierter Python-Code nötig, main.py wird zur Laufzeit
# ganz normal importiert — siehe desktop/app.py:_resource_root()).
a.datas += Tree(
    BACKEND_DIR,
    prefix="backend",
    excludes=["*.db", "*.db-journal", "__pycache__", "tests", "*.pyc", ".pytest_cache"],
)
a.datas += Tree(FRONTEND_DIST, prefix=os.path.join("frontend", "dist"))

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
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
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

app = BUNDLE(
    coll,
    name="NK-Tool.app",
    icon=os.path.join(SPECPATH, "icon.icns"),
    bundle_identifier="io.github.lordabsalypson.nktool",
    info_plist={
        "CFBundleName": "NK-Tool",
        "CFBundleDisplayName": "NK-Tool",
        "CFBundleShortVersionString": "1.0.0",
        "NSHighResolutionCapable": True,
    },
)

# PyInstaller recipe. Build with:  pyinstaller --noconfirm KhataDesk.spec   (run inside backend/)
import os
import sys

from PyInstaller.utils.hooks import collect_submodules

hidden = (
    collect_submodules("uvicorn")
    + collect_submodules("app")
    + ["pymysql", "sqlalchemy.dialects.sqlite", "sqlalchemy.dialects.mysql.pymysql", "multipart"]
)
icon = os.path.join(SPECPATH, "..", "packaging", "icon.ico")

a = Analysis(
    ["desktop.py"],
    pathex=[SPECPATH],
    datas=[(os.path.join(SPECPATH, "..", "frontend", "dist"), "web")],
    hiddenimports=hidden,
    excludes=["pytest", "tkinter"],
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="KhataDesk",
    console=os.getenv("KHATA_CONSOLE") == "1" or sys.platform != "win32",  # no black window on Windows
    icon=icon if os.path.exists(icon) else None,
)
coll = COLLECT(exe, a.binaries, a.datas, name="KhataDesk")

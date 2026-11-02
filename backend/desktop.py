"""Launcher for the Windows app. It starts the API on this computer, opens KhataDesk in its own
window and keeps the data in the user's AppData folder (a SQLite file).

To use MySQL instead, create  %APPDATA%\\KhataDesk\\settings.json  containing
    {"database_url": "mysql+pymysql://user:password@127.0.0.1:3306/khata?charset=utf8mb4"}
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

PREFERRED_PORT = 8765


def data_dir() -> Path:
    base = os.getenv("APPDATA") or os.getenv("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    d = Path(base) / "KhataDesk"
    d.mkdir(parents=True, exist_ok=True)
    return d


def resource(*parts: str) -> Path:
    root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return root.joinpath(*parts)


def port_free(port: int) -> bool:
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def is_khatadesk(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/meta", timeout=1.5) as r:
            return json.load(r).get("desktop") is True
    except Exception:
        return False


def open_window(url: str) -> None:
    if os.getenv("KHATA_NO_BROWSER") == "1":
        return
    if sys.platform == "win32":
        # Edge and Chrome can show a site as an app window, with no tabs or address bar.
        roots = [os.getenv("ProgramFiles(x86)"), os.getenv("ProgramFiles"), os.getenv("LOCALAPPDATA")]
        for rel in (r"Microsoft\Edge\Application\msedge.exe", r"Google\Chrome\Application\chrome.exe"):
            for root in filter(None, roots):
                exe = Path(root) / rel
                if exe.exists():
                    subprocess.Popen([str(exe), f"--app={url}"])
                    return
    webbrowser.open(url)


def main() -> None:
    folder = data_dir()

    # A packaged app with no console has no stdout: send messages to a log file instead.
    if getattr(sys, "frozen", False) or sys.stdout is None:
        log = open(folder / "khatadesk.log", "a", buffering=1, encoding="utf-8")
        sys.stdout = sys.stderr = log

    port = PREFERRED_PORT
    if not port_free(port):
        if is_khatadesk(port):  # already running: just show the window again
            open_window(f"http://127.0.0.1:{port}")
            return
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]

    db_url = f"sqlite:///{(folder / 'khata.db').as_posix()}"
    settings = folder / "settings.json"
    if settings.exists():
        try:
            db_url = json.loads(settings.read_text(encoding="utf-8")).get("database_url") or db_url
        except Exception as e:
            print("Ignoring unreadable settings.json:", e)
    os.environ.setdefault("DATABASE_URL", db_url)
    os.environ["KHATA_DESKTOP"] = "1"
    os.environ["KHATA_DIST"] = str(resource("web"))

    import uvicorn

    from app.main import app  # imported after the environment is ready

    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_config=None))

    def open_when_ready():
        for _ in range(100):
            if not port_free(port):
                break
            time.sleep(0.1)
        open_window(f"http://127.0.0.1:{port}")

    threading.Thread(target=open_when_ready, daemon=True).start()
    server.run()


if __name__ == "__main__":
    main()

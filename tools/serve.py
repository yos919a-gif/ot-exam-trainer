#!/usr/bin/env python3
"""OT国試トレーナー配信サーバー＋学習記録（セーブデータ）のファイル保存API

フォルダの役割（2026-11-01〜）:
  app/      本体（画面）
  content/  アプリが読むデータ（tools/publish_content.py が data/ から出版）
  user/     セーブデータ（学習記録）。更新・出版では触らない
  data/     作業場（配布しない）

- 静的配信: リポジトリ直下（http.server互換）
- GET  /api/load/<name> : user/<name>.json を返す（無ければ {}）
- POST /api/save/<name> : ボディ(JSON)を user/<name>.json に保存
<name>は英数・ハイフン・下線のみ。USBごと・コピーごとに個別の記録を持てる。
旧置き場 data/user/ に記録があり user/ に無いときは、起動時に user/ へコピーする（元は残す）。
"""
import json
import re
import shutil
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
USER = ROOT / "user"
OLD_USER = ROOT / "data" / "user"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
_API = re.compile(r"^/api/(load|save)/([A-Za-z0-9_-]{1,40})$")


def migrate():
    """旧置き場（data/user）の記録を user/ へ移す（user/ に同名が無いものだけ。元は残す）"""
    if not OLD_USER.exists():
        return
    USER.mkdir(parents=True, exist_ok=True)
    for f in OLD_USER.glob("*.json"):
        if not (USER / f.name).exists():
            shutil.copy2(f, USER / f.name)
            print(f"学習記録を移しました: {f} → {USER / f.name}（元は残しています）")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def _reply(self, body, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        m = _API.match(self.path.split("?")[0])
        if m and m.group(1) == "load":
            f = USER / (m.group(2) + ".json")
            self._reply(f.read_bytes() if f.exists() else b"{}")
            return
        super().do_GET()

    def do_POST(self):
        m = _API.match(self.path.split("?")[0])
        if not (m and m.group(1) == "save"):
            self.send_error(404)
            return
        n = int(self.headers.get("Content-Length") or 0)
        if not 0 < n <= 20_000_000:
            self.send_error(413)
            return
        raw = self.rfile.read(n)
        try:
            json.loads(raw.decode("utf-8"))
        except Exception:
            self.send_error(400, "invalid json")
            return
        USER.mkdir(parents=True, exist_ok=True)
        f = USER / (m.group(2) + ".json")
        tmp = f.with_suffix(".json.tmp")
        tmp.write_bytes(raw)
        tmp.replace(f)
        self._reply(b'{"ok":true}')

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    migrate()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"http://localhost:{PORT}/app/  学習記録: {USER}\\progress.json  (Ctrl+Cで終了)")
    srv.serve_forever()

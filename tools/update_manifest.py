"""content/ のデータを手で直したあとに content/manifest.json の sha1・bytes を付け直す。

アプリは content のファイルを ?v=<sha1> 付きで読むので、これを忘れると
端末に保存された古いデータが出続ける。リポジトリに無いファイル（非公開の辞書など）は触らない。
使い方: python tools/update_manifest.py
Windows の作業コピーで使うときは git config core.autocrlf false で取り直してから（CRLF に変わると値がずれる）。
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MF = ROOT / "content" / "manifest.json"

m = json.loads(MF.read_text(encoding="utf-8"))
changed = []
for name, info in m["files"].items():
    p = ROOT / "content" / name
    if not p.is_file():
        continue
    data = p.read_bytes()
    sha1 = hashlib.sha1(data).hexdigest()[:10]
    if info.get("sha1") != sha1 or info.get("bytes") != len(data):
        info["sha1"], info["bytes"] = sha1, len(data)
        changed.append(name)
if changed:
    MF.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
print("更新:", ", ".join(changed) if changed else "なし")

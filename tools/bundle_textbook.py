#!/usr/bin/env python3
"""教科書データを1つのファイルにまとめる: private/ot-textbook-data.json を作る

content/dictionary/（entries.json・index.json・meta.json）には教科書の文（OCRの根拠）が入っているので、
公開サイトには載せない（.gitignore で除外）。代わりにこのファイルを各自の Google Drive に置き、
アプリの「教科書データを取り込む」で読み込む。アプリは端末（IndexedDB）と、ログインしていれば
Drive のアプリ専用領域に保存する。

    python3 tools/bundle_textbook.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "dictionary"
OUT = ROOT / "private" / "ot-textbook-data.json"


def main():
    entries = json.loads((SRC / "entries.json").read_text(encoding="utf-8"))
    index = json.loads((SRC / "index.json").read_text(encoding="utf-8"))
    meta = json.loads((SRC / "meta.json").read_text(encoding="utf-8"))
    slim = {}
    for e in entries:
        rels = []
        for b in e.get("文献ごとの説明", []):
            for r in b.get("関係", []):
                rels.append([b.get("本", ""), r.get("p"), r.get("rel", ""), r.get("相手", ""), r.get("根拠", "")])
        slim[e["id"]] = {"w": e["見出し"], "n": e.get("出現冊数", 0), "r": rels}
    out = {"kind": "ot-textbook-data", "version": meta.get("版", ""),
           "説明": "OT国試トレーナーの教科書データ（個人の学習用。再配布しないでください）",
           "entries": slim, "index": index}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n_rel = sum(1 for v in slim.values() if v["r"])
    print(f"{len(slim)} 語（教科書の関係あり {n_rel} 語）・索引 {len(index)} → {OUT}（{OUT.stat().st_size // 1024} KB）")


if __name__ == "__main__":
    main()

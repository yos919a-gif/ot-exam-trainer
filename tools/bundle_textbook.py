#!/usr/bin/env python3
"""教科書データを1つのファイルにまとめる: private/ot-textbook-data.json を作る

content/dictionary/（entries.json・index.json・meta.json）には教科書の文（OCRの根拠）が入っているので、
公開サイトには載せない（.gitignore で除外）。代わりにこのファイルを各自の Google Drive に置き、
アプリの「教科書データを取り込む」で読み込む。アプリは端末（IndexedDB）と、ログインしていれば
Drive のアプリ専用領域に保存する。
教科書の総合索引（content/refs/総合索引.json、語→本・ページ）も教科書から作ったものなので、
同じファイルに入れ、取り込んだ人だけが総合索引のページを使えるようにする（content/refs/ も公開しない）。

    python3 tools/bundle_textbook.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "dictionary"
OUT = ROOT / "private" / "ot-textbook-data.json"

# 辞書の説明の出どころ（本の名前）→ 総合索引の本の id。アプリはこの id で本を選ぶ（説明と総合索引の両方に効く）
SRC_BOOK = {
    "解剖学": "anatomy", "生理学": "physiology", "新・徒手筋力検査法": "b027",
    "標準理学療法学・作業療法学　内科学": "b041", "標準理学療法学･作業療法学 老年学": "b040",
    "標準理学療法学・作業療法学　小児科学": "b015", "作業療法評価額": "b043", "シンプル病理学　普通画質": "b023",
    "理学療法・作業療法テキスト　運動学　普通画質": "b032", "ベッドサイドの神経の診かた": "b026",
    "精神障害作業療法学　普通画質": "b007", "精神医学　普通画質": "b008", "ROMナビ": "b029",
    "基礎作業学　普通画質": "b006", "環境適応": "b003",
}


def main():
    entries = json.loads((SRC / "entries.json").read_text(encoding="utf-8"))
    index = json.loads((SRC / "index.json").read_text(encoding="utf-8"))
    meta = json.loads((SRC / "meta.json").read_text(encoding="utf-8"))
    sakuin = json.loads((ROOT / "content" / "refs" / "総合索引.json").read_text(encoding="utf-8"))
    slim = {}
    for e in entries:
        rels = []
        for b in e.get("文献ごとの説明", []):
            for r in b.get("関係", []):
                rels.append([b.get("本", ""), r.get("p"), r.get("rel", ""), r.get("相手", ""), r.get("根拠", "")])
        slim[e["id"]] = {"w": e["見出し"], "n": e.get("出現冊数", 0), "r": rels}
    out = {"kind": "ot-textbook-data", "version": meta.get("版", ""),
           "説明": "OT国試トレーナーの教科書データ（個人の学習用。再配布しないでください）",
           "entries": slim, "index": index, "sakuin": sakuin, "srcBook": SRC_BOOK}
    missing = sorted({r[0] for v in slim.values() for r in v["r"]} - set(SRC_BOOK))
    if missing:
        print("要確認: 総合索引の本に結び付いていない出どころ:", missing)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n_rel = sum(1 for v in slim.values() if v["r"])
    print(f"{len(slim)} 語（教科書の関係あり {n_rel} 語）・索引 {len(index)}・総合索引 {len(sakuin['terms'])} 語 → {OUT}（{OUT.stat().st_size // 1024} KB）")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""教科書データ（辞書データ）を本ごとのファイルに分ける: private/辞書データ/辞書_<id>_<書名>.json

content/dictionary/（entries.json・index.json・meta.json）には教科書の文（OCRの根拠）が、
content/refs/総合索引.json には教科書の索引（語→本・ページ）が入っているので、どちらも公開サイトには載せない
（.gitignore で除外）。代わりに本ごとのファイルを Google Drive の「国家試験トレーナー/辞書データ」に置き、
アプリの「教科書データを取り込む」で読み込む（複数まとめて選べる）。本を足すときはファイルを足して取り込み、
外すときはアプリの一覧から削除する。アプリは端末（IndexedDB）と、ログインしていれば Drive のアプリ専用領域に
本ごとに保存する。

1冊のファイルの中身:
  terms   総合索引のうちこの本の分 {語: {r 読み, n 国試の出題数, al 別表記, e [[補足, [ページ], 本文なら"b"]]}}
  entries 辞書の説明のうちこの本の分 {項目id: {w 見出し, n 出現冊数, r [[ページ, 関係, 相手, 根拠の文]]}}
  index   entries の項目を引く表記 {表記: [項目id]}

基本辞書（辞書_kotoba_基本辞書（語の説明）.json）: 語のつながり（kotoba.html）の説明の文。公開版には語のつながりと
索引ページ（content/knowledge/<id>_links.json）だけを載せ、文はこのファイルを取り込んだ人にだけ出す（パッチ）。
本ではないので terms/entries/index は空、kotoba に content/knowledge/<id>_terms.json の中身を入れる

    python3 tools/bundle_textbook.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "dictionary"
OUT_DIR = ROOT / "private" / "辞書データ"

# 辞書の説明の出どころ（本の名前）→ 総合索引の本の id
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
    books = {bid: {"terms": {}, "entries": {}} for bid in sakuin["books"]}
    missing = set()
    for word, t in sakuin["terms"].items():
        for e in t["e"]:
            b = books[e[0]]["terms"].setdefault(word, {"r": t.get("r", ""), "n": t.get("n", 0), "al": t.get("al", []), "e": []})
            b["e"].append(e[1:])
    for e in entries:
        for src in e.get("文献ごとの説明", []):
            bid = SRC_BOOK.get(src.get("本", ""))
            if not bid:
                missing.add(src.get("本", ""))
                continue
            ent = books[bid]["entries"].setdefault(e["id"], {"w": e["見出し"], "n": e.get("出現冊数", 0), "r": []})
            ent["r"] += [[r.get("p"), r.get("rel", ""), r.get("相手", ""), r.get("根拠", "")] for r in src.get("関係", [])]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("辞書_*.json"):
        old.unlink()
    total = 0
    for bid, b in books.items():
        ids = set(b["entries"])
        sub_index = {k: [i for i in v if i in ids] for k, v in index.items()}
        sub_index = {k: v for k, v in sub_index.items() if v}
        name = sakuin["books"][bid]
        out = {"kind": "ot-textbook-book", "version": meta.get("版", ""), "id": bid, "name": name,
               "説明": "OT国試トレーナーの教科書データ（1冊分・個人の学習用。再配布しないでください）",
               "terms": b["terms"], "entries": b["entries"], "index": sub_index}
        safe = re.sub(r'[\\/:*?"<>|]', "_", name)
        path = OUT_DIR / f"辞書_{bid}_{safe}.json"
        path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        total += path.stat().st_size
        n_rel = sum(len(x["r"]) for x in b["entries"].values())
        print(f"{bid:10s} 索引 {len(b['terms']):5d} 語・説明 {n_rel:5d} 件  {path.name}（{path.stat().st_size // 1024} KB）")
    kot = {}
    for kp in sorted((ROOT / "content" / "knowledge").glob("*_terms.json")):
        kot[kp.name[:-len("_terms.json")]] = json.loads(kp.read_text(encoding="utf-8"))
    if kot:
        out = {"kind": "ot-textbook-book", "version": meta.get("版", ""), "id": "kotoba", "name": "基本辞書（語の説明）",
               "説明": "OT国試トレーナーの基本辞書（語のつながりの説明の文。個人の学習用。再配布しないでください）",
               "terms": {}, "entries": {}, "index": {}, "kotoba": kot}
        know = ROOT / "content" / "knowledge"
        out["links"] = {p.name[:-len("_links.json")]: json.loads(p.read_text(encoding="utf-8")) for p in sorted(know.glob("*_links.json"))}
        src_p = know / "glossary_src.json"   # 用語集の教科書ページ（公開版の用語集からは外してある）
        out["glossSrc"] = json.loads(src_p.read_text(encoding="utf-8")) if src_p.exists() else {}
        if not out["links"] or not out["glossSrc"]:
            print("要確認: content/knowledge の *_links.json か glossary_src.json が無く、基本辞書に入っていません")
        path = OUT_DIR / "辞書_kotoba_基本辞書（語の説明）.json"
        path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"基本辞書 {', '.join(kot)} → {path.name}（{path.stat().st_size // 1024} KB）")
    print(f"{len(books)} 冊 → {OUT_DIR}（計 {total // 1024} KB）")
    if missing:
        print("要確認: 総合索引の本に結び付いていない出どころ:", sorted(missing))
    old = ROOT / "private" / "ot-textbook-data.json"   # 以前の1ファイル版
    if old.exists():
        old.unlink()


if __name__ == "__main__":
    main()

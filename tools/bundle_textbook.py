#!/usr/bin/env python3
"""教科書データ（辞書データ）を本ごとのファイルに分ける: private/辞書データ/辞書_<id>_<書名>.txt

content/dictionary/（entries.json・index.json・meta.json）には教科書の文（OCRの根拠）が、
content/refs/総合索引.json には教科書の索引（語→本・ページ）が入っているので、どちらも公開サイトには載せない
（.gitignore で除外）。代わりに本ごとのファイルを Google Drive の「国家試験トレーナー/辞書データ」に置き、
アプリの「教科書データを取り込む」で読み込む（複数まとめて選べる）。本を足すときはファイルを足して取り込み、
外すときはアプリの一覧から削除する。アプリは端末（IndexedDB）と、ログインしていれば Drive のアプリ専用領域に
本ごとに保存する。

1冊のファイルは `|` 区切りのテキスト（UTF-8・BOM付き・改行 LF。表計算ソフトでそのまま開ける）:
  1行目 `#OT国試トレーナー 教科書データ v1`、続いてメタ行 `#id=` `#name=` `#version=` `#説明=`、
  見出し行（16列: 単語名|かな|ページ|説明|出現文脈|関係|相手|分類|行の種類|本文|別表記|出現冊数|国試出題数|本id|項目id|引く表記）、
  データ行。
  索引の行  総合索引のうちこの本の分。1行＝単語×ページ（説明＝補足、本文なら「本文」、別表記は；区切り）
  説明の行  辞書の説明のうちこの本の分。1行＝関係1つ（ページ・関係・相手・出現文脈＝根拠の文、引く表記は；区切り）
  分類（筋・神経・骨…）は整理用の自動分類で、読み込みには使わない（ルールは下の 分類ルール）。
  アプリは読むときに以前の JSON と同じ1冊のデータ {terms, entries, index} に戻す（text_to_book と同じ手順）。
同じ場所に、全冊の筋の 起始・停止・支配・作用 をまとめた 筋一覧.txt も作る（整理用。アプリは読まない）。

    python3 tools/bundle_textbook.py
    python3 tools/bundle_textbook.py --from-json 辞書_*.json [--out DIR]   # 以前の1冊ずつの JSON を .txt に変える
                                                                         # （入力と同じ場所、--out があればそこへ）
"""
import argparse
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
BOOK_NOTE = "OT国試トレーナーの教科書データ（1冊分・個人の学習用。再配布しないでください）"

# 分類（H列）の自動ルール。上から順に、最初に当てはまったもの（どれも当てはまらなければ その他）。
# (分類, その語が主語の関係, 語の正規表現, その語が他の語の相手になっている関係)  … どれか1つ当てはまれば
分類ルール = [
    ("筋", {"起始", "停止"}, None, ()),
    ("疾患", {"症状"}, r"(病|症|症候群|炎|麻痺|障害|不全|腫|癌|がん|骨折|損傷|脱臼|拘縮)$", ()),
    ("神経", {"支配"}, r"(神経|神経叢|神経根|神経節|ニューロン)$", ()),
    ("筋", (), r"(筋|筋群|ハムストリングス)$", ()),
    ("関節", (), r"(関節|靱帯|靭帯|半月板|半月|関節包|関節円板)$", ()),
    ("骨", (), r"(骨|椎|突起|結節|粗面|棘|顆|上顆|骨頭|切痕|稜)$", ()),
    ("血管", (), r"(動脈|静脈|門脈|毛細血管)$", ()),
    ("ホルモン・物質", {"促進", "抑制"}, r"ホルモン$", {"分泌"}),
]

MAGIC = "#OT国試トレーナー 教科書データ v1"
META = ["id", "name", "version", "説明"]
COLS = ["単語名", "かな", "ページ", "説明", "出現文脈", "関係", "相手", "分類", "行の種類", "本文",
        "別表記", "出現冊数", "国試出題数", "本id", "項目id", "引く表記"]
筋の列 = ["起始", "停止", "支配", "作用"]


def classifier(book):
    """語 → 分類 を返す関数（同じ本の説明の関係から決める）"""
    rels, targets, memo = {}, {}, {}
    for en in book["entries"].values():
        for r in en["r"]:
            rels.setdefault(en["w"], set()).add(r[1])
            if r[2] != en["w"]:
                targets.setdefault(r[1], set()).add(r[2])

    def cls(w):
        if w not in memo:
            memo[w] = next((name for name, rs, pat, tr in 分類ルール
                            if rels.get(w, set()) & set(rs) or (pat and re.search(pat, w))
                            or any(w in targets.get(t, ()) for t in tr)), "その他")
        return memo[w]
    return cls


def clean(v):
    """1つの値: | は全角に、改行・タブは半角スペースに"""
    return re.sub(r"\r\n|[\r\n\t]", " ", "" if v is None else str(v)).replace("|", "｜")


def join(xs):
    return "；".join(clean(x).replace("；", ";") for x in xs)


def page(s, empty=None):
    return int(s) if re.fullmatch(r"[0-9]+", s) else (s or empty)


def to_int(s):
    return int(s) if re.fullmatch(r"-?[0-9]+", s) else 0


def book_to_text(book):
    """1冊のデータ（旧 JSON の形）→ 新形式のテキスト（BOM付き）"""
    cls, terms, entries = classifier(book), book["terms"], book["entries"]
    keys = {}   # 項目id → 引く表記（index の元の順）
    for k, ids in book["index"].items():
        for i in ids:
            keys.setdefault(i, []).append(k)
    bid = book["id"]
    lines = [MAGIC] + [f"#{k}={clean(book.get(k, ''))}" for k in META] + ["|".join(COLS)]

    def row(*v):
        lines.append("|".join(map(clean, v)))
    for w, t in terms.items():
        first = (book["index"].get(w) or [""])[0]
        n_book = entries[first]["n"] if first in entries else ""
        for e in t["e"]:
            for p in e[1] or [""]:
                row(w, t.get("r", ""), p, e[0], "", "", "", cls(w), "索引", "本文" if e[2:3] == ["b"] else "",
                    join(t.get("al", [])), n_book, t.get("n", 0), bid, first, "")
    for i, en in entries.items():
        t = terms.get(en["w"], {})
        for p, rel, aite, ctx in en["r"] or [[None, "", "", ""]]:
            row(en["w"], t.get("r", ""), p, f"{rel}：{aite}" if rel or aite else "", ctx, rel, aite, cls(en["w"]),
                "説明", "", join(t.get("al", [])), en.get("n", 0), t.get("n", ""), bid, i, join(keys.get(i, [])))
    return "\ufeff" + "\n".join(lines) + "\n"


def text_to_book(text):
    """新形式のテキスト → 1冊のデータ（旧 JSON の形）。アプリの読み込みと同じ手順"""
    lines = [s.rstrip("\r") for s in text.lstrip("\ufeff").split("\n")]
    if lines[0] != MAGIC:
        raise ValueError("教科書データ v1 のファイルではありません")
    book = {"kind": "ot-textbook-book", "version": "", "id": "", "name": "", "説明": ""}
    terms, entries, index = {}, {}, {}
    col, prev = None, None
    for line in lines[1:]:
        if not line.strip():
            continue
        if col is None:   # 見出し行まではメタ行
            if line.startswith("#"):
                k, _, v = line[1:].partition("=")
                if k in META:
                    book[k] = v
            else:
                col = {c: j for j, c in enumerate(line.split("|"))}
            continue
        cells = line.split("|")
        g = lambda c: cells[col[c]] if col.get(c, len(cells)) < len(cells) else ""
        kind = g("行の種類")
        if kind == "索引":
            w, d, body, p = g("単語名"), g("説明"), g("本文") == "本文", g("ページ")
            t = terms.get(w)
            if t is None:
                t = terms[w] = {"r": g("かな"), "n": to_int(g("国試出題数")),
                                "al": [a for a in g("別表記").split("；") if a], "e": []}
            if prev != (w, d, body):   # 直前の行と同じ語・補足・本文ならページを足す
                t["e"].append([d, []] + (["b"] if body else []))
            if p:
                t["e"][-1][1].append(page(p))
            prev = (w, d, body)
            continue
        prev = None
        i = g("項目id")
        if kind != "説明" or not i:
            continue
        en = entries.setdefault(i, {"w": g("単語名"), "n": to_int(g("出現冊数")), "r": []})
        r = [g("ページ"), g("関係"), g("相手"), g("出現文脈")]
        if any(r) or g("説明"):
            en["r"].append([page(r[0])] + r[1:])
        for k in g("引く表記").split("；"):
            if k and i not in index.setdefault(k, []):
                index[k].append(i)
    return {**book, "terms": terms, "entries": entries, "index": index}


def muscle_table(books):
    """全冊の筋（分類＝筋）の 起始・停止・支配・作用・出典 の一覧（BOM付き）"""
    rows = {}
    for b in books:
        cls = classifier(b)
        for w in [*b["terms"], *(en["w"] for en in b["entries"].values())]:
            if cls(w) == "筋":
                rows.setdefault(w, {"かな": "", **{c: [] for c in [*筋の列, "出典"]}})

    def add(lst, v):
        if v not in ("", None) and v not in lst:
            lst.append(v)
    for b in books:
        for w, t in b["terms"].items():
            if w in rows and not rows[w]["かな"]:
                rows[w]["かな"] = t.get("r", "")
        for en in b["entries"].values():
            for p, rel, aite, _ in en["r"]:
                src = b["id"] if p is None else f"{b['id']} p.{p}"
                if en["w"] in rows and rel in 筋の列:
                    add(rows[en["w"]][rel], aite)
                    add(rows[en["w"]]["出典"], src)
                if rel == "支配" and aite in rows and aite != en["w"]:   # 神経 支配 筋
                    add(rows[aite]["支配"], en["w"])
                    add(rows[aite]["出典"], src)
    lines = ["筋名|かな|" + "|".join(筋の列) + "|出典"]
    for w, m in sorted(rows.items(), key=lambda x: (not x[1]["かな"], x[1]["かな"], x[0])):   # かなの無い筋は最後
        lines.append("|".join([clean(w), clean(m["かな"])] + [join(m[c]) for c in [*筋の列, "出典"]]))
    return "\ufeff" + "\n".join(lines) + "\n", len(rows)


def write_book(book, out_dir):
    text = book_to_text(book)
    safe = re.sub(r'[\\/:*?"<>|]', "_", book["name"])
    path = out_dir / f"辞書_{book['id']}_{safe}.txt"
    path.write_bytes(text.encode("utf-8"))
    return path, text.count("\n") - len(META) - 2


def write_muscles(books, out_dir):
    text, n = muscle_table(books)
    path = out_dir / "筋一覧.txt"
    path.write_bytes(text.encode("utf-8"))
    print(f"筋一覧 {n} 筋  {path}")


def build_books():
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
    if missing:
        print("要確認: 総合索引の本に結び付いていない出どころ:", sorted(missing))
    out = []
    for bid, b in books.items():
        ids = set(b["entries"])
        sub_index = {k: [i for i in v if i in ids] for k, v in index.items()}
        out.append({"kind": "ot-textbook-book", "version": meta.get("版", ""), "id": bid, "name": sakuin["books"][bid],
                    "説明": BOOK_NOTE, "terms": b["terms"], "entries": b["entries"],
                    "index": {k: v for k, v in sub_index.items() if v}})
    return out


def main():
    ap = argparse.ArgumentParser(description="教科書データを本ごとの .txt に書き出す")
    ap.add_argument("--from-json", nargs="+", metavar="FILE", help="以前の1冊ずつの JSON を .txt に変える")
    ap.add_argument("--out", metavar="DIR", help="--from-json の書き出し先（省略時は入力と同じ場所）")
    args = ap.parse_args()
    if args.from_json:
        books = []
        for f in map(Path, args.from_json):
            book = json.loads(f.read_text(encoding="utf-8-sig"))
            if book.get("kind") != "ot-textbook-book":
                print(f"飛ばす: {f}（1冊分の教科書データではありません）")
                continue
            out_dir = Path(args.out) if args.out else f.parent
            out_dir.mkdir(parents=True, exist_ok=True)
            path, n = write_book(book, out_dir)
            books.append(book)
            print(f"{book['id']:10s} {n:6d} 行  {f.stat().st_size // 1024} KB → {path.stat().st_size // 1024} KB  {path}")
        if books:
            write_muscles(books, Path(args.out) if args.out else Path(args.from_json[0]).parent)
        return
    books = build_books()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in [*OUT_DIR.glob("辞書_*.json"), *OUT_DIR.glob("辞書_*.txt")]:
        old.unlink()
    total = 0
    for b in books:
        path, n = write_book(b, OUT_DIR)
        total += path.stat().st_size
        n_rel = sum(len(x["r"]) for x in b["entries"].values())
        print(f"{b['id']:10s} 索引 {len(b['terms']):5d} 語・説明 {n_rel:5d} 件・{n:6d} 行  {path.name}（{path.stat().st_size // 1024} KB）")
    print(f"{len(books)} 冊 → {OUT_DIR}（計 {total // 1024} KB）")
    write_muscles(books, OUT_DIR)
    old = ROOT / "private" / "ot-textbook-data.json"   # 以前の1ファイル版
    if old.exists():
        old.unlink()


if __name__ == "__main__":
    main()

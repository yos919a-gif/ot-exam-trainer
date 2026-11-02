#!/usr/bin/env python3
"""MMT（Daniels）の図の過去問から、図を1枚ずつ切り抜く: content/images/mmt/ と content/exam/mmt_figures.json

問題の切り抜き画像（content/images/<回>/qNNN_*_clip.png）は「問題文 → 図（2列）＋その下に番号と検査名」の並び。
白い行で帯に分け、背の高い帯を図の段、低い帯を文字（問題文・番号と検査名・ページ番号）とみなし、
図の段を白い列で左右に分けて、読む順（上の段の左→右→次の段）に 1〜5 の番号を振る。
検査名の行は切り抜きに入れない（図だけを見て何の検査か答えられるように）。

各図には 選択肢の文（検査名）・正しいか（正答）・誤りの理由（explanations.json）・問い方（問題文から）を付ける。

    python3 tools/crop_mmt_figures.py
"""
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
OUT_DIR = CONTENT / "images" / "mmt"
OUT_JSON = CONTENT / "exam" / "mmt_figures.json"

# 図で出た Daniels の問題（第50〜61回）
QIDS = ["50-pm-002", "51-pm-001", "53-am-003", "54-pm-001", "57-am-001", "58-pm-001", "59-am-003", "60-pm-001", "61-am-001"]

# 選択肢が「図1」などで検査名が無いものの表示名
LABEL = {"51-pm-001_4": "肩関節外旋（棘下筋）",
         "51-pm-001_1": "棘下筋（肩関節外旋）のテストとして", "51-pm-001_2": "棘下筋（肩関節外旋）のテストとして",
         "51-pm-001_3": "棘下筋（肩関節外旋）のテストとして", "51-pm-001_5": "棘下筋（肩関節外旋）のテストとして"}

# 間違いの図の「どこが違うか」。誤り理由の文を1枚ずつ読んで決めた（主な答え, ほかに正解にしてよい答え）。
# None は誤り理由が「判断保留」で、図だけでは決められないもの（採点しない）
WRONG_KINDS = ["抵抗を加える位置", "抵抗の方向", "検査肢位（体位）", "固定", "触診する位置", "別の筋・運動の検査", "運動の方向"]
WRONG_KIND = {
    "50-pm-002_1": ("触診する位置", ["別の筋・運動の検査"]),          # 菱形筋の触診になっている
    "50-pm-002_2": ("検査肢位（体位）", ["別の筋・運動の検査", "触診する位置"]),   # 前腕回外位 → 上腕二頭筋。腕橈骨筋は中間位
    "50-pm-002_4": ("触診する位置", ["別の筋・運動の検査"]),          # 母指基部橈側 → 長母指外転筋
    "51-pm-001_1": ("別の筋・運動の検査", ["運動の方向"]),             # 外旋方向の運動ではない
    "51-pm-001_2": ("別の筋・運動の検査", []),
    "51-pm-001_3": ("別の筋・運動の検査", []),
    "51-pm-001_5": ("別の筋・運動の検査", []),
    "53-am-003_1": ("検査肢位（体位）", ["抵抗を加える位置"]),          # 腕を下垂させた位置ではなく肩90°外転位
    "53-am-003_3": ("抵抗を加える位置", ["抵抗の方向", "別の筋・運動の検査"]),   # 前腕を持って長軸方向に引いている
    "53-am-003_5": ("抵抗を加える位置", []),                            # 手を握らず前腕遠位
    "54-pm-001_1": ("触診する位置", ["別の筋・運動の検査"]),          # 側腹部の外腹斜筋を触れている
    "54-pm-001_3": ("検査肢位（体位）", []),                            # 上肢を台から垂らしている（広背筋の肢位）
    "54-pm-001_4": ("検査肢位（体位）", []),                            # 段階5〜3の肢位
    "57-am-001_1": ("抵抗を加える位置", []),                            # 手部を握っている
    "57-am-001_2": ("抵抗を加える位置", []),                            # 指節部でなく第1・第5中手骨頭
    "57-am-001_3": ("抵抗を加える位置", []),                            # 手部を握っている
    "58-pm-001_2": (None, []),
    "58-pm-001_4": ("検査肢位（体位）", []),                            # 前腕中間位 → 回内位で前腕を台に乗せる
    "58-pm-001_5": ("検査肢位（体位）", []),                            # 背臥位で踵をすべらせるのは段階2
    "59-am-003_2": ("検査肢位（体位）", ["別の筋・運動の検査"]),      # 中間位 → 腕橈骨筋の検査
    "59-am-003_3": ("抵抗の方向", ["別の筋・運動の検査", "運動の方向"]),   # 回外の検査になっている
    "59-am-003_4": (None, []),
    "59-am-003_5": (None, []),
    "60-pm-001_1": ("抵抗を加える位置", []),                            # 上腕でなく肩の上
    "60-pm-001_2": ("抵抗を加える位置", []),                            # 手部を握っている
    "60-pm-001_5": ("抵抗を加える位置", []),                            # 下腿でなく大腿遠位内側
    "61-am-001_1": ("抵抗を加える位置", []),                            # 上腕近位 → 上腕遠位
    "61-am-001_3": ("検査肢位（体位）", ["別の筋・運動の検査"]),      # 回内位（上腕筋の肢位）→ 中間位
    "61-am-001_4": ("抵抗を加える位置", []),                            # 下腿の中枢寄り → 足関節の直上
    "61-am-001_5": ("検査肢位（体位）", []),                            # 段階5・4は立位の片脚つま先立ち
}

DARK = 200          # これより暗い画素を「描いてある」とみなす
ROW_GAP = 14        # 帯を分ける白い行の数
COL_GAP = 40        # 図の段を左右に分ける白い列の数
LABEL_GAP = 60      # 番号と検査名の行を、図ごとの文字のかたまりに分ける白い列の数
FIG_MIN_H = 150     # これより背の高い帯を図の段とみなす
PAD = 12


def runs(flags, gap):
    """True が続く区間を、gap 未満の False の切れ目はつなげて返す"""
    out, start, last = [], None, None
    for i, f in enumerate(flags):
        if f:
            if start is None:
                start = i
            elif i - last > gap:
                out.append((start, last))
                start = i
            last = i
    if start is not None:
        out.append((start, last))
    return out


def ask_of(text):
    """問題文から、何を問う図か（段階と観点）"""
    grade = "段階1・0" if "段階1" in text else "段階2" if "段階2" in text else "段階3" if "段階3" in text else "段階5・4"
    if "触診" in text:
        point = "触診する位置"
    elif "抵抗" in text:
        point = "抵抗を加える位置・方向"
    elif "体位" in text or "肢位" in text:
        point = "検査肢位"
    elif "主動作筋" in text:
        point = "主動作筋"
    else:
        point = "検査の方法"
    return grade, point


def main():
    qs = {q["id"]: q for q in json.loads((CONTENT / "exam" / "questions.json").read_text(encoding="utf-8"))}
    ex = json.loads((CONTENT / "exam" / "explanations.json").read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cards, problems = [], []
    for qid in QIDS:
        q = qs[qid]
        im = Image.open(CONTENT / q["画像"]["切り抜き"]).convert("L")
        w, h = im.size
        px = im.load()
        dark_rows = [any(px[x, y] < DARK for x in range(0, w, 2)) for y in range(h)]
        bands = runs(dark_rows, ROW_GAP)
        figs, legend = [], None
        for bi, (y0, y1) in enumerate(bands):
            if y1 - y0 < FIG_MIN_H:
                continue
            # 図の段の真下の帯（番号と検査名）を、文字のかたまりごとに分ける → その段の図の数と位置
            labels = []
            if bi + 1 < len(bands) and bands[bi + 1][1] - bands[bi + 1][0] < FIG_MIN_H:
                ly0, ly1 = bands[bi + 1]
                lcols = [any(px[x, y] < DARK for y in range(ly0, ly1 + 1)) for x in range(w)]
                labels = [(a + b) / 2 for a, b in runs(lcols, LABEL_GAP)]
            ink = [sum(1 for y in range(y0, y1 + 1, 2) if px[x, y] < DARK) for x in range(w)]
            for (x0, x1) in runs([v > 0 for v in ink], COL_GAP):
                if x1 - x0 <= 80:
                    continue
                inside = [c for c in labels if x0 - 60 <= c <= x1 + 60]
                if not inside:              # 下に番号の無いかたまり = 矢印の凡例
                    legend = (x0, y0, x1, y1)
                    continue
                # 番号が2つ以上ある = 図がつながっている。番号の間で墨のいちばん少ない列で切る
                cuts = [x0]
                for a, b in zip(inside, inside[1:]):
                    lo, hi = int(a), int(b)
                    cuts.append(min(range(lo, hi), key=lambda x: (ink[x], abs(x - (lo + hi) / 2))))
                cuts.append(x1)
                for a, b in zip(cuts, cuts[1:]):
                    figs.append((a, y0, b, y1))
        if len(figs) != len(q["選択肢"]):
            problems.append(f"{qid}: 図を {len(figs)} 枚と判定（選択肢 {len(q['選択肢'])}）")
        legend_img = ""
        if legend:
            x0, y0, x1, y1 = legend
            legend_img = f"images/mmt/{qid}_legend.png"
            Image.open(CONTENT / q["画像"]["切り抜き"]).convert("RGB").crop(
                (max(0, x0 - PAD), max(0, y0 - PAD), min(w, x1 + PAD), min(h, y1 + PAD))).save(CONTENT / legend_img, optimize=True)
        grade, point = ask_of(q["問題文"])
        reasons = (ex.get(qid) or {}).get("c") or {}
        for i, (x0, y0, x1, y1) in enumerate(figs[:len(q["選択肢"])], start=1):
            box = (max(0, x0 - PAD), max(0, y0 - PAD), min(w, x1 + PAD), min(h, y1 + PAD))
            name = f"{qid}_{i}.png"
            Image.open(CONTENT / q["画像"]["切り抜き"]).convert("RGB").crop(box).save(OUT_DIR / name, optimize=True)
            cid = f"{qid}_{i}"
            card = {"id": cid, "qid": qid, "num": i, "label": LABEL.get(cid, q["選択肢"][i - 1]),
                    "ok": i in q["正答"], "reason": reasons.get(str(i), ""),
                    "grade": grade, "point": point, "img": f"images/mmt/{name}", "legend": legend_img}
            if not card["ok"]:
                kind, also = WRONG_KIND.get(cid, (None, []))
                card["wrong_kind"], card["wrong_also"] = kind, also
            cards.append(card)
    out = {"説明": "Daniels の図の過去問を1枚ずつ切り抜いたもの（tools/crop_mmt_figures.py）", "wrong_kinds": WRONG_KINDS, "cards": cards}
    raw = json.dumps(out, ensure_ascii=False, indent=1).encode("utf-8")
    OUT_JSON.write_bytes(raw)
    mpath = CONTENT / "manifest.json"
    mf = json.loads(mpath.read_text(encoding="utf-8"))
    mf.setdefault("files", {})["exam/mmt_figures.json"] = {"説明": "MMT の図（1枚ずつ）", "件数": len(cards), "bytes": len(raw),
                                                           "sha1": hashlib.sha1(raw).hexdigest()[:10]}
    mpath.write_text(json.dumps(mf, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(cards)} 枚 → {OUT_DIR}")
    for p in problems:
        print("要確認:", p)


if __name__ == "__main__":
    main()

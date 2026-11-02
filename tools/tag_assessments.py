#!/usr/bin/env python3
"""評価（検査・尺度・分類）の問題にタグを付ける: content/exam/assessments.json を作る

用語集（content/glossary/glossary.json）から評価法らしい語を拾い、問題文・選択肢にその語が
出る問題を評価ごとにまとめる。アプリはこれを疾患グループ（diseases.json）と掛け合わせて
「この疾患でよく出る評価」を出す。

拾い方: 見出しに 評価/検査/テスト/尺度/分類… を含む語、または英字略語で意味の冒頭が
Test/Scale/Index/検査/尺度… の語。評価でないもの（CT・pH など）は EXCLUDE で外し、
同じ評価の別表記は MERGE でまとめる。直したいときは下の表を書き換えて実行し直す。

    python3 tools/tag_assessments.py
"""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
OUT = CONTENT / "exam" / "assessments.json"

NAME_PAT = re.compile(r"評価|検査|テスト|尺度|指数|スケール|分類|ステージ|stage|scale|index|test|inventory|questionnaire|assessment|measure|battery", re.I)
MEAN_PAT = re.compile(r"検査|評価法|評価尺度|尺度|スケール|分類|ステージ|指数|Test|Scale|Measure|Index|Assessment|Inventory|Battery|Examination|Rating|Questionnaire|Profile|Classification|Stage", re.I)
ABBR = re.compile(r"^[A-Za-z][A-Za-z0-9\-&\s\.]*$")
JP_END = re.compile(r"(検査|尺度|テスト|分類|指数|スケール|ステージ|評価法|評価|質問紙|チェックリスト|プロフィール|インデックス|法)$")
NOT_ASSESS = re.compile(r"療法|訓練$|手技$|法則$|原理$|理論$|技法$|手法$")

# 評価法ではない語・総称すぎる語
EXCLUDE = set("""
CT pH HbA1c BMI SOAP ICF ICIDH ライフステージ 再検査法 尺度化スコア 数値的評価 投影法 質問紙法 家屋評価
診断 行動 構成 所見 興味 面接 言動 意識 立位 心拍数 指標 認識 言語 遂行度 作業遂行 頭部MRI 頭部CT 血液検査
テストステロン 心不全 ヘモグロビン 更衣 筋緊張 地域障害者職業センター 陽性 評価尺度 下位尺度 間隔尺度 順序尺度
名義尺度 比率尺度 サブテスト 心理検査 知能検査 人格検査 性格検査 感覚検査 認知機能検査 発達段階 段階付け 病期分類
重症度分類 自己評価 職業評価 高次脳機能評価 末梢神経伝導検査 脳波検査 嚥下内視鏡検査 嚥下造影検査 知能指数 全検査IQ
機能障害度分類 機能障害尺度 国際生活機能分類 作業療法評価 評価 検査 尺度 分類 方法 検査法 評価法 測定 肺機能検査
""".split())

# 別表記 → 表示名（用語集の別の見出しになっているもの）
MERGE = {
    "リバーミード行動記憶検査": "RBMT", "改訂長谷川式簡易知能評価スケール": "HDS-R", "簡易上肢機能検査": "STEF",
    "重症度分類ステージ": "Hoehn&Yahr", "四肢麻痺上肢機能分類": "Zancolli分類", "BarthelIndex": "Barthel Index",
    "TMT-A": "TMT", "TMT-B": "TMT", "NYHA分類Ⅱ度": "NYHA分類", "mMRCスケール": "mMRC",
    "Kohs立方体組み合わせテスト": "Kohs立方体組合せテスト", "立方体組合せテスト": "Kohs立方体組合せテスト",
    "職業興味検査": "VPI", "職業レディネステスト": "VRT", "社会生活能力検査": "S-M社会生活能力検査", "S-M": "S-M社会生活能力検査",
    "AIS": "ASIA機能障害尺度", "Fugl-Meyer": "Fugl-Meyer Assessment", "Rorschachテスト": "Rorschachテスト",
}


def aliases(v):
    a = v.get("別名", [])
    return [a] if isinstance(a, str) else list(a)


def main():
    g = json.loads((CONTENT / "glossary" / "glossary.json").read_text(encoding="utf-8"))
    qs = json.loads((CONTENT / "exam" / "questions.json").read_text(encoding="utf-8"))
    terms = {}
    for k, v in g.items():
        if k in EXCLUDE or NOT_ASSESS.search(k):
            continue
        ok = bool(NAME_PAT.search(k))
        if not ok and (ABBR.match(k) or JP_END.search(k)) and MEAN_PAT.search(v.get("意味", "")[:60]):
            ok = True
        if ok:
            terms[k] = v
    alias = {}   # 文中の表記 → 表示名
    for k, v in terms.items():
        disp = MERGE.get(k, k)
        for a in [k] + aliases(v):
            if len(a) >= 2:
                alias[a] = disp
    pat = re.compile("|".join(map(re.escape, sorted(alias, key=len, reverse=True))))
    ids = {}
    for q in qs:
        if q.get("採点除外"):
            continue
        text = re.sub(r"\s+", "", q["問題文"] + " " + " ".join(q["選択肢"]))
        for m in set(pat.findall(text)):
            ids.setdefault(alias[m], []).append(q["id"])
    out_terms = [{"name": n, "ids": sorted(set(v))} for n, v in ids.items()]
    out_terms.sort(key=lambda t: (-len(t["ids"]), t["name"]))
    tagged = set(i for t in out_terms for i in t["ids"])
    out = {"説明": "評価（検査・尺度・分類）の問題。用語集の評価法の語が問題文・選択肢に出る問題",
           "対象問題数": len(tagged), "terms": out_terms}
    raw = json.dumps(out, ensure_ascii=False, indent=1).encode("utf-8")
    OUT.write_bytes(raw)

    mpath = CONTENT / "manifest.json"
    if mpath.exists():
        mf = json.loads(mpath.read_text(encoding="utf-8"))
        mf.setdefault("files", {})["exam/assessments.json"] = {
            "説明": "評価の問題（評価法ごとの問題id）", "件数": len(out_terms), "bytes": len(raw),
            "sha1": hashlib.sha1(raw).hexdigest()[:10]}
        mpath.write_text(json.dumps(mf, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"評価法 {len(out_terms)} 種、{len(tagged)} / {len(qs)} 問にタグ → {OUT}")
    for t in out_terms[:25]:
        print(f"{len(t['ids']):4d}  {t['name']}")


if __name__ == "__main__":
    main()

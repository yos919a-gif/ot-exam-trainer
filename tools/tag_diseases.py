#!/usr/bin/env python3
"""疾患別模試のためのタグ付け: content/exam/diseases.json を作る

問題文・選択肢・誤り理由（content/exam/explanations.json）に疾患名の語が含まれる問題を
疾患グループに入れる。1問が複数のグループに入ることもある。
疾患の語を直したいときは下の GROUPS を書き換えて、このスクリプトを実行し直す。

    python3 tools/tag_diseases.py
"""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
OUT = CONTENT / "exam" / "diseases.json"

# グループ名 → その疾患だと分かる語（部分一致。短すぎる語は他の文に当たるので避ける）
GROUPS = {
    "脳卒中・脳血管障害": ["脳卒中", "脳血管障害", "脳梗塞", "脳出血", "くも膜下出血", "片麻痺", "Brunnstrom", "Wernicke", "Broca"],
    "高次脳機能障害": ["高次脳", "半側空間無視", "失行", "失認", "失語", "注意障害", "遂行機能", "記憶障害", "BIT"],
    "脊髄損傷": ["脊髄損傷", "頸髄損傷", "対麻痺", "四肢麻痺", "Zancolli", "完全麻痺", "自律神経過反射"],
    "関節リウマチ": ["関節リウマチ", "リウマチ", "スワンネック", "ボタン穴変形", "尺側偏位", "ムチランス"],
    "Parkinson病": ["Parkinson", "パーキンソン", "Hoehn", "すくみ足", "固縮", "L-dopa", "レボドパ"],
    "認知症": ["認知症", "Alzheimer", "アルツハイマー", "Lewy", "レビー", "前頭側頭型", "HDS-R", "MMSE"],
    "統合失調症": ["統合失調症", "幻聴", "妄想", "陰性症状", "陽性症状", "抗精神病薬"],
    "うつ病・双極性障害": ["うつ病", "抑うつ", "双極", "躁", "抗うつ薬", "電気けいれん"],
    "脳性麻痺": ["脳性麻痺", "痙直型", "アテトーゼ", "GMFCS"],
    "発達障害（ASD・ADHD・LD）・知的障害": ["自閉", "ASD", "ADHD", "注意欠如", "学習障害", "発達障害", "知的障害", "Down症", "ダウン症"],
    "切断・義肢": ["切断", "義手", "義足", "断端", "ソケット", "幻肢"],
    "骨折・整形外科疾患": ["骨折", "大腿骨頸部", "人工関節", "THA", "TKA", "変形性", "脱臼", "腱板", "五十肩", "肩関節周囲炎"],
    "手の外傷・末梢神経障害": ["腱損傷", "正中神経", "尺骨神経", "橈骨神経", "手根管", "Dupuytren", "Volkmann", "末梢神経", "絞扼", "腕神経叢", "CRPS", "複合性局所疼痛"],
    "神経筋疾患（ALS・MS・筋ジス・GBS など）": ["筋萎縮性側索硬化症", "ALS", "多発性硬化症", "筋ジストロフィー", "Duchenne", "Guillain", "ギラン", "重症筋無力症", "脊髄小脳変性症", "Huntington", "ポリオ"],
    "心疾患・呼吸器疾患": ["心筋梗塞", "心不全", "狭心症", "COPD", "慢性閉塞性", "呼吸不全", "METs", "心臓リハ", "Borg", "酸素療法"],
    "糖尿病・腎・がん・内科疾患": ["糖尿病", "腎不全", "透析", "肝硬変", "高血圧", "がん患者", "癌", "悪性腫瘍", "終末期", "緩和ケア", "化学療法"],
    "熱傷": ["熱傷"],
    "依存症・摂食障害・パーソナリティ障害": ["依存症", "アルコール依存", "薬物依存", "物質使用", "摂食障害", "神経性やせ症", "神経性過食症", "パーソナリティ障害", "境界性"],
    "不安症・PTSD・てんかん など": ["不安症", "不安障害", "パニック", "強迫", "PTSD", "心的外傷", "てんかん", "解離", "身体症状症", "適応障害", "睡眠障害"],
}


def main():
    qs = json.loads((CONTENT / "exam" / "questions.json").read_text(encoding="utf-8"))
    try:
        ex = json.loads((CONTENT / "exam" / "explanations.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        ex = {}
    pats = {g: re.compile("|".join(map(re.escape, words))) for g, words in GROUPS.items()}
    groups = [{"name": g, "words": w, "ids": []} for g, w in GROUPS.items()]
    tagged = set()
    for q in qs:
        if q.get("採点除外"):
            continue
        reasons = (ex.get(q["id"], {}).get("c") or {}).values()
        text = q["問題文"] + "\n" + "\n".join(q["選択肢"]) + "\n" + "\n".join(reasons)
        for g in groups:
            if pats[g["name"]].search(text):
                g["ids"].append(q["id"])
                tagged.add(q["id"])
    out = {"説明": "疾患別模試のグループ（問題文・選択肢・誤り理由の語で自動タグ付け）",
           "対象問題数": len(tagged), "groups": groups}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(out, ensure_ascii=False, indent=1).encode("utf-8")
    OUT.write_bytes(raw)

    # manifest.json に載せる（版の管理は publish_content.py と同じ形）
    mpath = CONTENT / "manifest.json"
    if mpath.exists():
        mf = json.loads(mpath.read_text(encoding="utf-8"))
        mf.setdefault("files", {})["exam/diseases.json"] = {
            "説明": "疾患別模試のグループ", "件数": len(groups), "bytes": len(raw),
            "sha1": hashlib.sha1(raw).hexdigest()[:10]}
        mpath.write_text(json.dumps(mf, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"{len(tagged)} / {len(qs)} 問にタグ → {OUT}")
    for g in sorted(groups, key=lambda g: -len(g["ids"])):
        print(f"{len(g['ids']):5d}  {g['name']}")


if __name__ == "__main__":
    main()

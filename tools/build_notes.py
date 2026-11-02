#!/usr/bin/env python3
"""まとめノート: content/exam/notes.json を作る

テーマごとのまとめ（表・要点）と、そのテーマの過去問へのリンク（語の正規表現）。
ノートを足すときは NOTES に1件足して実行し直す。アプリの「まとめノート」に出る。
要点は過去問の正答で確かめられる点を中心に書く。

    python3 tools/build_notes.py
"""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
OUT = CONTENT / "exam" / "notes.json"

NOTES = [
    {
        "id": "dementia",
        "title": "認知症の種類（萎縮・病変の部位、特徴、進行）",
        "table": {
            "cols": ["種類", "萎縮・病変の部位", "主な特徴", "進行"],
            "rows": [
                ["Alzheimer型（最も多い）",
                 "海馬・側頭葉内側から始まり、頭頂葉へ広がる（SPECT で後部帯状回・楔前部・頭頂葉の血流低下）。老人斑（アミロイドβの沈着）と神経原線維変化（タウ）",
                 "近時記憶の障害から始まる。見当識障害（時間→場所→人の順）、物盗られ妄想、取り繕い、病識の低下、道に迷う（視空間認知の障害）",
                 "ゆるやかに進む（FAST で段階づけ）。末期は失禁・歩行困難・寝たきり"],
                ["Lewy小体型",
                 "大脳皮質や脳幹に Lewy 小体（αシヌクレイン）。海馬の萎縮は比較的軽い。後頭葉の血流低下、MIBG 心筋シンチで取り込み低下",
                 "繰り返す具体的な幻視、認知機能の変動（日や時間によって活動にむら）、パーキンソニズム（転倒しやすい）、レム睡眠行動障害、抗精神病薬に過敏、自律神経症状（起立性低血圧・便秘）",
                 "Alzheimer型より速く進むことが多い。転倒・誤嚥に注意"],
                ["前頭側頭型（Pick病など）",
                 "前頭葉と側頭葉前方の限局した萎縮",
                 "65歳未満の発症が多い。人格の変化・脱抑制（自分本位にふるまう、万引きなど）、常同行動（毎日同じ時刻に同じ行動をする、同じ言葉を繰り返す）、食行動の変化（甘い物を好む）、無関心、病識がない。初期は記憶・視空間認知が比較的保たれ、幻視は少ない",
                 "ゆるやかに進む"],
                ["血管性",
                 "脳梗塞・脳出血の部位による（多発性のラクナ梗塞、大脳白質の病変など）",
                 "まだら認知症（できることとできないことが混在）、情動失禁（感情失禁）、意欲の低下・抑うつ、病識は比較的保たれる。片麻痺・構音障害・嚥下障害などの神経症状を伴う",
                 "脳卒中を繰り返すたびに階段状に悪化"],
                ["正常圧水頭症（手術で改善しうる）",
                 "脳室の拡大（高い位置の脳溝は狭くなる）",
                 "三徴：歩行障害（小刻み・すり足・開脚）、認知障害、尿失禁",
                 "髄液を抜く（タップテスト）と改善する。シャント手術で改善が期待できる"],
                ["Creutzfeldt-Jakob病",
                 "プリオンによる感染性の疾患。大脳皮質の海綿状の変化",
                 "急に進む認知症、ミオクローヌス、脳波で周期性同期性放電",
                 "数か月で寝たきり（無動性無言）に至ることが多い"],
            ],
        },
        "points": [
            "症状は「中核症状」（記憶障害・見当識障害・判断力の低下・実行機能障害・失語・失行・失認）と「BPSD」（徘徊・妄想・幻覚・興奮・抑うつ・不眠など）に分けて考える",
            "手術で改善する可能性がある：正常圧水頭症、慢性硬膜下血腫。内科の治療で改善しうる：甲状腺機能低下症、ビタミンB12欠乏など",
            "評価：HDS-R（9項目・30点満点、20点以下で認知症を疑う）、MMSE（30点満点、23点以下で疑う）、CDR（重症度）、FAST（Alzheimer型の進行の段階）、NPI（BPSD）",
            "FAST：1 正常／2 年相応の物忘れ／3 境界（複雑な仕事に支障）／4 軽度（買い物・金銭管理などの IADL に支障）／5 中等度（季節に合った服を選べない）／6 やや高度（着衣・入浴・トイレに介助、失禁）／7 高度（言葉・歩行・座位・笑顔が失われる）",
            "作業療法：Alzheimer型は手続き記憶が保たれやすく、なじみの作業（長年の趣味など）を活かす。Lewy小体型は日による変動に合わせ、転倒に注意する。前頭側頭型は常同行動を日課づくりに活かす",
        ],
        "links": [
            ["Alzheimer型", "Alzheimer|アルツハイマー"],
            ["Lewy小体型", "Lewy|レビー"],
            ["前頭側頭型", "前頭側頭|Pick|ピック|意味性認知症"],
            ["血管性", "血管性認知症"],
            ["正常圧水頭症・慢性硬膜下血腫", "正常圧水頭症|慢性硬膜下血腫"],
            ["Creutzfeldt-Jakob病", "Creutzfeldt|クロイツフェルト"],
            ["評価（HDS-R・MMSE・CDR・FAST）", "HDS-R|長谷川|MMSE|CDR|FAST"],
        ],
    },
]


def main():
    qs = [q for q in json.loads((CONTENT / "exam" / "questions.json").read_text(encoding="utf-8")) if not q.get("採点除外")]
    out_notes = []
    for n in NOTES:
        links = []
        for label, pattern in n.get("links", []):
            p = re.compile(pattern)
            ids = [q["id"] for q in qs if p.search(q["問題文"] + " " + " ".join(q["選択肢"]))]
            links.append({"label": label, "ids": ids})
        out_notes.append({k: v for k, v in n.items() if k != "links"} | {"links": links})
        print(f"{n['id']}: " + "・".join(f"{l['label']} {len(l['ids'])}問" for l in links))
    raw = json.dumps({"説明": "まとめノート（tools/build_notes.py）", "notes": out_notes}, ensure_ascii=False, indent=1).encode("utf-8")
    OUT.write_bytes(raw)
    mpath = CONTENT / "manifest.json"
    mf = json.loads(mpath.read_text(encoding="utf-8"))
    mf.setdefault("files", {})["exam/notes.json"] = {"説明": "まとめノート", "件数": len(out_notes), "bytes": len(raw),
                                                     "sha1": hashlib.sha1(raw).hexdigest()[:10]}
    mpath.write_text(json.dumps(mf, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(out_notes)} 件 → {OUT}")


if __name__ == "__main__":
    main()

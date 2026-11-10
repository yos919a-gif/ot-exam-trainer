# OT国試トレーナー — 編集する AI（ChatGPT / Codex など）への引き継ぎ

作業療法士国家試験（第50〜61回・2,400問）の過去問アプリ。GitHub Pages で公開している
（https://yos919a-gif.github.io/ot-exam-trainer/ 、main に入ると約40秒で反映）。
返事・コメント・コミットメッセージ・PR の説明は日本語で書く。

## 構成
- `index.html` … `app/` へ飛ばすだけ
- `app/` … アプリ本体。ビルドなしの素の HTML/CSS/JS（フレームワーク・npm なし）
  - `index.html` 本体（演習・模試・復習・暗記カード）、`graph.html` 引っ掛けマップ、`sakuin.html`・`kotoba.html` 辞書、`dendrogram.html`
  - `content.js` データ読み込み、`textbook.js` 辞書データ（IndexedDB）、`sync.js` Google ドライブ同期、`drill.js` ROM/MMT ドリル、`print.js` 印刷
  - `sw.js` Service Worker（圏外対応）、`config.js` 設定
- `content/` … アプリが読むデータ。`manifest.json` に各ファイルの `sha1`（先頭10桁）と `bytes`
- `private/辞書データ/` … 教科書の辞書データ（起動時に自動で読み込む）。形式を変えない
- `tools/serve.py` … 手元で動かすサーバー（学習記録の保存 API つき）。`python tools/serve.py 8765` → http://localhost:8765/app/

## 守ること
1. **app/ の画面ファイルを変えたら `app/sw.js` の `SHELL_CACHE`（例 `ot-shell-v8`）の番号を1つ上げる。** 上げないと利用者の端末に古い画面が残る。新しいファイルを足したら `SHELL` の一覧にも入れる。
2. **content/ のデータを変えたら `python tools/update_manifest.py` を実行**し、`content/manifest.json` も一緒にコミットする（`?v=sha1` で端末のキャッシュを切り替えているため）。
3. 採点は問題の **「採点方式」フィールドに従う**（通常／採点除外／いずれか1つで正解／正解肢3のうち2つ）。「複数正答＝全部選ぶ」と決めつけない。
4. 問題文・正答・誤り理由（explanations.json）・用語集（glossary.json）の中身は、公式の正答と原典で照合済み。**医学的な内容を書き換えるときは根拠（法令・学会資料・教科書・論文）を PR の説明に書く。** 推測で直さない。
5. これらのデータの正本は作者の手元の作業場にあり、そこから出版し直すと上書きされる。データを直した PR には「どのファイルのどの問題 id を、なぜ直したか」を一覧で書く（作者が手元に取り込むため）。
6. 学習記録（`user/`）・非公開の資料（`content/dictionary/`・`content/refs/`・`content/knowledge/`）は `.gitignore` 済み。コミットしない。
7. 外部ライブラリは `app/lib/` に置いた版だけを使う（CDN を増やさない）。スマホ（Android の Chrome）で崩れない幅にする。
8. 大きい JSON は1行ずつ手で編集せず、短い Python で読み書きする（`ensure_ascii=False`、元の字下げに合わせる）。

## 確認のしかた
- `python tools/serve.py 8765` で起動し、http://localhost:8765/app/ で変えた画面を開く。
- JS を変えたら最低限、ブラウザのコンソールにエラーが出ないこと・演習を1問解いて採点と誤り理由が出ることを確かめる。
- 確かめられなかったことは PR の説明に「未確認」と書く。

## 進め方
- main へ直接 push しない。ブランチを切って PR にする（作者が確認してマージする）。
- 1つの PR は1つの目的に絞る。

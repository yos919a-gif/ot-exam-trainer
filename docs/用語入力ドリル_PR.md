短い問いを見て答えを思い出し、読みを入力して候補の用語を選ぶ練習を追加します。例えば「がいじつ」で「概日リズム」を候補表示し、選択後の「解答する」で採点します。

生理学20問から5・10・20問を問題順／ランダム順で出題。解答後に解説と出典、最後に回答一覧を表示します。不正解と答えを見た問題だけを解き直せます。回答・中断位置はブラウザーへ保存し、過去問の成績・復習予定・同期記録には書き込みません。

医学的内容は新規 `app/term-questions.js` の20問です。全正答キーを既存用語集に照合し、各問に一次資料へのリンクを付け、作成担当とは別の担当が問題文・説明・許容別名18件と出典16URLを独立検品しました。既存の問題本文・正答・用語集本文の変更はありません。

対象IDと正答：

| ID（すべて `physiology-` 接頭辞） | 正答 |
| --- | --- |
| circadian-001 | 概日リズム |
| homeostasis-001 | ホメオスターシス |
| insulin-001 | インスリン |
| glucagon-001 | グルカゴン |
| adh-001 | 抗利尿ホルモン |
| oxytocin-001 | オキシトシン |
| growth-hormone-001 | 成長ホルモン |
| pth-001 | 副甲状腺ホルモン |
| aldosterone-001 | アルドステロン |
| cortisol-001 | コルチゾール |
| melatonin-001 | メラトニン |
| calcitonin-001 | カルシトニン |
| erythropoietin-001 | エリスロポエチン |
| action-potential-001 | 活動電位 |
| acetylcholine-001 | アセチルコリン |
| sinoatrial-node-001 | 洞房結節 |
| cardiac-output-001 | 心拍出量 |
| tidal-volume-001 | 1回換気量 |
| vital-capacity-001 | 肺活量 |
| residual-volume-001 | 残気量 |

主な根拠：[NIGMS 概日リズム](https://www.nigms.nih.gov/education/fact-sheets/Pages/circadian-rhythms)、[OpenStax 内分泌](https://openstax.org/books/anatomy-and-physiology-2e/pages/17-3-the-pituitary-gland-and-hypothalamus)、[OpenStax 呼吸](https://openstax.org/books/anatomy-and-physiology-2e/pages/22-3-the-process-of-breathing)、[東大病院 不整脈](https://cardiovasc.m.u-tokyo.ac.jp/consultation/diseases/irregular_pulse)。各問の `sources` に該当ページを記載しています。

検証：`node tools/term_input_check.cjs` の195項目に合格。独立したChromeで、360・390・412・1280px、暗色、候補入力・IME変換中Enter・Enter長押し、全正答と別名、複数問の集計・再開・復習、保存不可・不整合保存、読込失敗、候補表示中のクリック／タップ、既存過去問1問の採点と誤り理由を確認しました。JS例外・予期しないconsoleエラー0件。結果と画像は `docs/用語入力連続確認/` に保存しています。

未確認：Android実機のIME・ソフトウェアキーボード、スクリーンリーダー、実ネット配信とService Workerの圏外動作。端末間同期は今回の実装対象外です。

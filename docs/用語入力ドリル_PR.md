短い問いを見て答えを思い出し、読みを入力して候補の用語を選ぶ練習を追加します。例えば「がいじつ」で「概日リズム」を候補表示し、選択後の「解答する」で採点します。

解剖学・生理学・運動学の各20問、計60問を用意し、科目別または混合で5・10・20問・すべてを問題順／ランダム順で出題します。全科目の問題順は解剖→生理→運動と交互にし、短いセットでも3科目を練習できます。

解答後に解説と出典、最後に回答一覧と実際に解いた科目別件数を表示します。不正解と答えを見た問題だけを解き直せます。回答・中断位置はブラウザーへ保存し、旧生理学20問の記録からも再開できます。過去問の成績・復習予定・同期記録には書き込みません。

医学的内容は `app/term-questions.js`（生理20問）、`app/term-questions-anatomy.js`（解剖20問）、`app/term-questions-kinesiology.js`（運動20問）です。全正答キーを既存用語集に照合し、各問に一次資料へのリンクを付けています。生理20問は前回、追加40問は今回、作成担当とは別の担当が問題文・説明・許容別名・出典を独立検品しました。全60問の明示別名49件、掲載出典44URL。既存の過去問本文・正答・用語集本文は変更していません。

全問の対象ID・正答・別名・出典は[用語入力問題一覧](https://github.com/yos919a-gif/ot-exam-trainer/blob/feature/term-input-practice/docs/用語入力問題一覧.md)に記載しました。

主な根拠：[NIGMS 概日リズム](https://www.nigms.nih.gov/education/fact-sheets/Pages/circadian-rhythms)、[OpenStax](https://openstax.org/books/anatomy-and-physiology-2e/pages/17-3-the-pituitary-gland-and-hypothalamus)、[日本整形外科学会 手根管](https://www.joa.or.jp/public/sick/condition/carpal_tunnel_syndrome.html)、[AAPM&R 正常歩行](https://now.aapmr.org/biomechanics-normal-gait/)。各問の `sources` に該当ページを記載しています。

検証：`node tools/term_input_check.cjs` の502項目に合格。独立したChromeで、360・390・412・1280px、暗色、科目別20問と全60問完走、全正答と別名、科目選択・混合・全問指定、旧記録互換、候補の科目非依存、IME・Enter長押し、再開・復習、保存不可・不整合保存、読込失敗、既存過去問1問の採点と誤り理由を確認しました。JS例外・予期しないconsoleエラー0件。結果と画像22枚は `docs/用語入力3科目確認/` に保存しています。従来の195項目の検査記録も保持しています。

データ準備完了ガードを追加した後は、不正な用語集の200応答時の操作抑止と正常復帰を11項目で差分検証し、すべて合格。基礎502項目の全再実行ではありません。追加JSON・画像1枚も同フォルダーに保存しています。

未確認：Android実機のIME・ソフトウェアキーボード、スクリーンリーダー、実ネット配信とService Workerの圏外動作。端末間同期は今回の実装対象外です。

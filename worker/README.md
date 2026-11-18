# AI 採点の中継（Cloudflare Workers）

「1文の○×」の直した文と「1つ挙げて」の答えを、AI（Claude Haiku）が意味で採点するための中継。
API キーはここにだけ置き、アプリ（公開ページ）には入れない。

## 最初の1回（本人がやる）

1. https://dash.cloudflare.com/sign-up で Cloudflare のアカウントを作る（無料プラン）
2. https://console.anthropic.com で API キーを作り、**Billing の利用上限（月の上限額）を設定**する
3. このフォルダで:
   ```
   npx wrangler login
   npx wrangler secret put ANTHROPIC_API_KEY     ← 聞かれたらキーを貼る
   npx wrangler secret put ACCESS_CODES          ← 合言葉をカンマ区切り（例: 自分用,Aさん用,Bさん用 の3つ）
   npx wrangler deploy
   ```
4. 出てきた URL（https://ot-grade.<名前>.workers.dev）をアプリの「設定 → AI 採点」に、合言葉と一緒に入れる

## 運用

- 合言葉を止める: `npx wrangler secret put ACCESS_CODES` で、その人の合言葉を外した一覧を入れ直す
- 1日の回数の上限（任意）: wrangler.toml の KV の説明どおり。既定 200回/合言葉
- 呼べるページは GitHub Pages（yos919a-gif.github.io）と localhost だけ

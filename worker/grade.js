// OT国試トレーナーの AI 採点の中継（Cloudflare Workers。2026-11-18）
// アプリ（GitHub Pages）は API キーを持てないので、ここにキーを置いて採点だけを中継する。
// 秘密の値（wrangler secret put で入れる。コードには書かない）:
//   ANTHROPIC_API_KEY … Anthropic の API キー
//   ACCESS_CODES      … 使える人の合言葉をカンマ区切り（例: "aaaa,bbbb,cccc"。1人1つ。外せばその人だけ止まる）
// 任意の設定（wrangler.toml の [vars]）:
//   DAILY_LIMIT       … 合言葉ごとの1日の採点回数（既定 200。KV の COUNTS が無ければ数えない）
//   ALLOW_ORIGINS     … 呼べるページ（カンマ区切り。既定 GitHub Pages と localhost）

const MODEL = "claude-haiku-5-5";

const SYSTEM = `あなたは作業療法士国家試験の勉強の採点係です。学生の答え（声の書き起こしのことがあり、誤字・かな書き・言い換えを含む）を、模範と照らして意味で採点します。
- 「直す」問題: 誤った文を学生が正しい文に直した。誤りの部分が正しく直っていれば「正」。一部だけなら「部分」。直っていない・別の誤りを入れたら「誤」
- 「挙げる」問題: 問いに当てはまるものを1つ挙げた。答えの例に無くても、作業療法士国家試験の水準で正しく当てはまれば「正」（その場合は 例に無い: true）。あいまい・不十分なら「部分」。当てはまらなければ「誤」
- 表記ゆれ・かな書き・略語・言い換えは減点しない。医学的に誤ったことを言っていれば「誤」
- 出力は JSON だけ: {"判定":"正|部分|誤","理由":"40字以内","例に無い":false}`;

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {status, headers: {"Content-Type": "application/json; charset=utf-8", ...cors(origin)}});
}

function clip(x, n) { return String(x ?? "").slice(0, n); }

export default {
  async fetch(req, env) {
    const allow = (env.ALLOW_ORIGINS || "https://yos919a-gif.github.io,http://localhost:8765,http://localhost:8790").split(",");
    const origin = req.headers.get("Origin") || "";
    if (!allow.includes(origin)) return new Response("forbidden", {status: 403});
    if (req.method === "OPTIONS") return new Response(null, {status: 204, headers: cors(origin)});
    if (req.method !== "POST") return json({error: "POST only"}, 405, origin);

    let b;
    try { b = await req.json(); } catch { return json({error: "bad json"}, 400, origin); }
    const codes = (env.ACCESS_CODES || "").split(",").map(s => s.trim()).filter(Boolean);
    if (!b.code || !codes.includes(b.code)) return json({error: "合言葉が違います"}, 401, origin);

    // 合言葉ごとの1日の回数（KV の COUNTS があるときだけ）
    if (env.COUNTS) {
      const day = new Date().toISOString().slice(0, 10);
      const key = `${b.code}:${day}`;
      const n = parseInt(await env.COUNTS.get(key) || "0", 10);
      if (n >= parseInt(env.DAILY_LIMIT || "200", 10)) return json({error: "今日の採点回数の上限です"}, 429, origin);
      await env.COUNTS.put(key, String(n + 1), {expirationTtl: 172800});
    }

    const kind = b.kind === "ask" ? "挙げる" : "直す";
    const ans = clip(b.回答, 400);
    if (ans.replace(/\s/g, "").length < 2) return json({error: "答えが空です"}, 400, origin);
    const user = kind === "直す"
      ? `【直す】\n誤った文: ${clip(b.文, 300)}\n模範の直した文: ${clip(b.直した文, 300)}\n要点: ${clip((b.要点 || []).join("、"), 200)}\n学生の答え: ${ans}`
      : `【挙げる】\n問い: ${clip(b.問い, 200)}\n答えの例: ${clip((b.答え || []).join("、"), 400)}\n学生の答え: ${ans}`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {"x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
      body: JSON.stringify({model: MODEL, max_tokens: 200, system: SYSTEM, messages: [{role: "user", content: user}]}),
    });
    if (!r.ok) return json({error: `AI の呼び出しに失敗（${r.status}）`}, 502, origin);
    const out = await r.json();
    const text = (out.content || []).map(c => c.text || "").join("");
    const m = text.match(/\{[\s\S]*\}/);
    try {
      const g = JSON.parse(m ? m[0] : text);
      if (!["正", "部分", "誤"].includes(g.判定)) throw 0;
      return json({判定: g.判定, 理由: clip(g.理由, 80), 例に無い: !!g.例に無い}, 200, origin);
    } catch {
      return json({error: "AI の答えを読めませんでした"}, 502, origin);
    }
  },
};

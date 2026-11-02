// ROM・MMT ドリル（過去問とは別枠）
//  - ROM 全範囲: 関節可動域表示ならびに測定法（2022年改訂）の表（content/exam/rom_table.json）から、参考可動域・基本軸・移動軸、
//    または「この軸と角度はどの運動？」を出す
//  - MMT 正しい図: 過去問の図のうち正答の図（15枚）を見て、何の検査かを答える
//  - MMT 間違い探し: 正答でない図（30枚）を「誤りの図」として見せ、どこが違うかを答える（正しい図と混ぜない）
//  - 答え方: 入力すると候補が出て、選んで確定する（乗換案内の駅名入力と同じ）。ひらがなでも候補に出るように読みを持つ
//  - 記録: S.drill[キー] = [{t, ok}]（過去問の回答履歴・復習予定とは別）
"use strict";
window.DRILL = (() => {
  let ROM = null, MMT = null, ds = null;   // ds: 実行中のドリル {kind, list, idx, results, answered}
  const ROM_ASKS = ["参考可動域", "基本軸", "移動軸", "逆"];

  // MMT の検査名・筋名の候補（図に出てくるもの＋紛らわしい名前）と読み
  const MMT_NAMES = {
    "僧帽筋下部": "そうぼうきんかぶ", "僧帽筋中部線維": "そうぼうきんちゅうぶせんい", "腕橈骨筋": "わんとうこつきん",
    "尺側手根屈筋": "しゃくそくしゅこんくっきん", "長母指伸筋": "ちょうぼししんきん", "長母指外転筋": "ちょうぼしがいてんきん",
    "前脛骨筋": "ぜんけいこつきん", "腹直筋": "ふくちょくきん", "外腹斜筋": "がいふくしゃきん", "前鋸筋": "ぜんきょきん",
    "上腕三頭筋": "じょうわんさんとうきん", "上腕二頭筋": "じょうわんにとうきん", "上腕筋": "じょうわんきん", "長橈側手根伸筋": "ちょうとうそくしゅこんしんきん",
    "菱形筋": "りょうけいきん", "広背筋": "こうはいきん", "棘下筋": "きょくかきん", "棘上筋": "きょくじょうきん", "三角筋": "さんかくきん",
    "大胸筋": "だいきょうきん", "縫工筋": "ほうこうきん", "中殿筋": "ちゅうでんきん", "大殿筋": "だいでんきん", "腸腰筋": "ちょうようきん",
    "大腿四頭筋": "だいたいしとうきん", "下腿三頭筋": "かたいさんとうきん",
    "肩関節外旋（棘下筋）": "かたかんせつがいせん きょくかきん", "肩関節外転": "かたかんせつがいてん", "肩関節内旋": "かたかんせつないせん",
    "肩関節水平内転": "かたかんせつすいへいないてん", "肩関節水平外転": "かたかんせつすいへいがいてん", "肩屈曲": "かたくっきょく", "肩伸展": "かたしんてん",
    "肩甲骨挙上": "けんこうこつきょじょう", "肩甲骨内転": "けんこうこつないてん", "肩甲骨内転と下方回旋": "けんこうこつないてんとかほうかいせん",
    "肩甲骨外転と上方回旋": "けんこうこつがいてんとじょうほうかいせん", "肩甲骨下制と内転": "けんこうこつかせいとないてん",
    "肘屈曲": "ひじくっきょく ちゅうかんせつくっきょく", "肘屈曲(上腕筋)": "ひじくっきょく じょうわんきん", "肘屈曲(腕橈骨筋)": "ひじくっきょく わんとうこつきん",
    "肘伸展": "ひじしんてん", "前腕回内": "ぜんわんかいない", "前腕回外": "ぜんわんかいがい", "手関節伸展": "しゅかんせつしんてん", "手関節屈曲": "しゅかんせつくっきょく",
    "指の中手指節関節伸展": "ゆびのちゅうしゅしせつかんせつしんてん", "母指内転": "ぼしないてん", "対立運動": "たいりつうんどう", "体幹屈曲": "たいかんくっきょく",
    "股関節屈曲、外転、外旋と膝屈曲": "こかんせつくっきょく がいてん がいせんとひざくっきょく ほうこうきん", "股関節内転": "こかんせつないてん",
    "股関節外転": "こかんせつがいてん", "股関節伸展": "こかんせつしんてん", "膝伸展": "ひざしんてん", "膝屈曲": "ひざくっきょく", "足底屈": "あしていくつ そくていくつ",
    "足背屈と内がえし": "あしはいくつとうちがえし",
  };
  const MMT_WRONG_YOMI = {"抵抗を加える位置": "ていこうをくわえるいち", "抵抗の方向": "ていこうのほうこう", "検査肢位（体位）": "けんさしい たいい",
    "固定": "こてい", "触診する位置": "しょくしんするいち", "別の筋・運動の検査": "べつのきん うんどうのけんさ", "運動の方向": "うんどうのほうこう"};

  /* ---------- 文字のそろえ方（全角半角・カタカナ・空白・記号の違いを吸収） ---------- */
  function norm(t){
    return String(t || "").normalize("NFKC").toLowerCase()
      .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))   // カタカナ → ひらがな
      .replace(/[\s・()（）、,，.。\-－ー〜~°]/g, "");
  }
  const sameName = (a, b) => norm(a).replace(/関節/g, "") === norm(b).replace(/関節/g, "");   // 「肘屈曲」と「肘関節屈曲」は同じ

  /* ---------- 入力 → 候補 → 確定（乗換案内の駅名入力） ---------- */
  // options: [{label, yomi, keys?}]。候補が12個以下なら、何も打たなくても全部出す
  function pickerHtml(placeholder){
    return `<div class="pk"><input class="pk-in" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done"
      placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"><ul class="pk-list" role="listbox"></ul></div>`;
  }
  function pickerInit(box, options, onChange){
    const inp = box.querySelector(".pk-in"), ul = box.querySelector(".pk-list");
    const opts = options.map(o => Object.assign({}, o, {_n: norm(o.label), _y: norm(o.yomi || ""), _k: (o.keys || []).map(norm)}));
    let shown = [], hi = 0, picked = null;
    function filter(){
      const q = norm(inp.value);
      if(picked && inp.value !== picked.label){ picked = null; onChange(null); }
      if(picked || inp.disabled) return [];   // 選んだら候補を閉じる（打ち直すとまた開く）
      if(!q) return opts.length <= 12 ? opts : [];
      const hit = opts.filter(o => o._n.includes(q) || o._y.includes(q) || o._k.some(k => k.includes(q)));
      const head = o => (o._n.startsWith(q) || o._y.startsWith(q)) ? 0 : 1;
      return hit.sort((a, b) => head(a) - head(b) || a.label.length - b.label.length).slice(0, 8);
    }
    function draw(){
      shown = filter(); hi = Math.min(hi, Math.max(0, shown.length - 1));
      ul.innerHTML = shown.map((o, i) => `<li role="option" class="${i === hi ? "hi" : ""} ${picked === o ? "sel" : ""}" data-i="${i}">${esc(o.label)}</li>`).join("")
        || (inp.value && !picked ? `<li class="none">候補がありません。別の言い方やひらがなで打ってみてください</li>` : "");
    }
    function pick(o){ picked = o; inp.value = o.label; onChange(o); draw(); }
    const later = () => setTimeout(draw, 0);   // Gboard などの変換中も、確定前のひらがなで絞り込む
    ["input", "compositionupdate", "compositionend", "keyup", "focus"].forEach(ev => inp.addEventListener(ev, e => {
      if(ev === "keyup" && ["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key)) return;
      later();
    }));
    inp.addEventListener("keydown", e => {
      if(e.isComposing || e.keyCode === 229) return;
      if(e.key === "ArrowDown"){ hi = Math.min(hi + 1, shown.length - 1); draw(); e.preventDefault(); }
      else if(e.key === "ArrowUp"){ hi = Math.max(hi - 1, 0); draw(); e.preventDefault(); }
      else if(e.key === "Enter"){ e.preventDefault(); if(shown[hi] && picked !== shown[hi]) pick(shown[hi]); else if(picked) box.dispatchEvent(new CustomEvent("pk-confirm", {bubbles: true})); }
      else if(e.key === "Escape"){ inp.value = ""; draw(); }
    });
    ul.addEventListener("mousedown", e => e.preventDefault());   // 押した瞬間に入力欄のフォーカスが外れないように
    ul.addEventListener("click", e => { const li = e.target.closest("li[data-i]"); if(li) pick(shown[+li.dataset.i]); });
    draw();
    return {focus: () => inp.focus(), value: () => picked};
  }

  /* ---------- データ ---------- */
  async function load(){
    if(!ROM) ROM = (await cfetch("exam/rom_table.json")).rows;
    if(!MMT) MMT = await cfetch("exam/mmt_figures.json");
  }
  const deg = r => r.参考可動域 === 0 ? "0°" : `0〜${r.参考可動域}°`;
  const romName = r => `${r.部位} ${r.運動方向}`;
  function romItems(){
    const items = [];
    for(const r of ROM){
      const can = {参考可動域: r.参考可動域 !== null, 基本軸: !!r.基本軸, 移動軸: !!r.移動軸,
                   逆: r.参考可動域 !== null && !!r.基本軸 && !!r.移動軸};
      const asks = ROM_ASKS.filter(a => can[a]);
      if(asks.length) items.push({type: "rom", row: r, ask: asks[Math.floor(Math.random() * asks.length)]});
    }
    return shuffle(items).slice(0, 20);
  }
  function romOptions(ask){
    if(ask === "参考可動域"){
      const vals = [...new Set(ROM.filter(r => r.参考可動域 !== null).map(r => r.参考可動域))].sort((a, b) => a - b);
      return vals.map(v => ({label: v === 0 ? "0°" : `0〜${v}°`, yomi: String(v), v}));
    }
    if(ask === "逆"){
      const seen = new Map();
      ROM.filter(r => r.基本軸 && r.移動軸 && r.参考可動域 !== null).forEach(r => {
        const label = romName(r);
        if(!seen.has(label)) seen.set(label, {label, yomi: `${r.読み.部位} ${r.読み.運動方向}`, row: r});
      });
      return [...seen.values()];
    }
    // 基本軸・移動軸は両方の列の言葉を候補にする（上腕骨のように両方に出る語もある）
    const axes = [...new Set(ROM.map(r => r[ask]).concat(ROM.map(r => r[ask === "基本軸" ? "移動軸" : "基本軸"])).filter(Boolean))];
    return axes.map(a => ({label: a, yomi: (romYomi[a] || "")}));
  }
  let romYomi = {};

  /* ---------- ドリルの開始と1問ずつの表示 ---------- */
  async function start(kind){
    try{ await load(); }catch(e){ alert("ドリルのデータを読み込めませんでした: " + e.message); return; }
    if(!Object.keys(romYomi).length){ try{ romYomi = (await cfetch("exam/rom_table.json")).読み || {}; }catch(e){} }
    let list;
    if(kind === "rom") list = romItems();
    else if(kind === "mmtok") list = shuffle(MMT.cards.filter(c => c.ok)).map(c => ({type: "mmtok", card: c}));
    else list = shuffle(MMT.cards.filter(c => !c.ok)).map(c => ({type: "mmtng", card: c}));
    session = null; wsess = null;
    ds = {kind, list, idx: 0, results: []};
    render();
  }
  const TITLE = {rom: "ROM 全範囲ドリル", mmtok: "MMT 正しい図", mmtng: "MMT 間違い探し"};
  const touchMuscle = c => c.qid === "50-pm-002" || c.qid === "54-pm-001";   // 選択肢が筋の名前の問題
  function figHtml(c){
    return `<img class="qimg" src="${curl(c.img)}" alt="MMT の図">${c.legend ? `<img class="qimg" style="max-width:320px" src="${curl(c.legend)}" alt="矢印の意味">` : ""}`;
  }
  const src = c => { const [kai, ku, n] = c.qid.split("-"); return `第${kai}回 ${ku === "am" ? "午前" : "午後"} 問${+n % 100 || 100} の図${c.num}`; };

  function render(){
    const it = ds.list[ds.idx], n = ds.list.length;
    let head = "", body = "", ph = "入力すると候補が出ます";
    if(it.type === "rom"){
      const r = it.row;
      head = `<span class="tag">${esc(r.区分)}</span>`;
      if(it.ask === "逆"){
        body = `<p class="qtext">基本軸が「${esc(r.基本軸)}」、移動軸が「${esc(r.移動軸)}」、参考可動域が ${esc(deg(r))} の運動はどれ？</p>`;
        ph = "部位や運動の名前を入力（例：かた がいてん）";
      }else{
        body = `<p class="qtext"><b>${esc(romName(r))}</b> の<b>${esc(it.ask)}</b>は？</p>`;
        ph = it.ask === "参考可動域" ? "角度の数字を入力（例：180）" : "軸の言葉を入力（例：けんぽう、上腕）";
      }
    }else if(it.type === "mmtok"){
      const c = it.card;
      head = `<span class="pill">${esc(c.grade)}</span><span class="pill">${esc(c.point)}</span>`;
      body = `<p class="qtext">${touchMuscle(c) ? "この図は<b>何の筋</b>の触診・検査？" : "この図は<b>何の検査</b>？"}（正しい図）</p>${figHtml(c)}`;
      ph = touchMuscle(c) ? "筋の名前を入力（例：ぜんきょ）" : "検査の名前を入力（例：けんこうこつ）";
    }else{
      const c = it.card;
      head = `<span class="tag j">⚠ 誤りの図</span><span class="pill">${esc(c.grade)}</span><span class="pill">${esc(c.point)}</span>`;
      body = `<div class="verdict ng" style="margin-top:0">⚠ これは誤りの図です（お手本にしない）<span>${esc(c.label)}</span></div>
        <p class="qtext">この図は<b>どこが違う</b>？</p>${figHtml(c)}`;
      ph = "違うところを選ぶ（入力でも絞り込めます）";
    }
    app.innerHTML = `<div class="card">
      <div class="qmeta"><span class="count">${esc(TITLE[ds.kind])} ${ds.idx + 1} / ${n}</span>${head}</div>
      ${body}
      <div id="dkPick" style="margin-top:12px">${pickerHtml(ph)}</div>
      <div id="dkAns"></div>
      <div class="actions sticky">
        <button class="btn primary big" id="dkGo" disabled>確定</button>
        <span class="spacer"></span><button class="btn ghost small" onclick="DRILL.finish()">終了</button>
      </div></div>`;
    window.scrollTo(0, 0);
    const opts = it.type === "rom" ? romOptions(it.ask)
      : it.type === "mmtok" ? Object.keys(MMT_NAMES).concat(MMT.cards.filter(c => !Object.keys(MMT_NAMES).some(k => sameName(k, c.label)) && !/として$/.test(c.label)).map(c => c.label))
          .filter((v, i, a) => a.indexOf(v) === i).map(l => ({label: l, yomi: MMT_NAMES[l] || ""}))
      : (MMT.wrong_kinds || Object.keys(MMT_WRONG_YOMI)).map(l => ({label: l, yomi: MMT_WRONG_YOMI[l] || ""}));
    const go = document.getElementById("dkGo"), box = document.querySelector("#dkPick .pk");
    const pk = pickerInit(box, opts, o => { go.disabled = !o; });
    go.onclick = () => answer(pk.value());
    box.addEventListener("pk-confirm", () => { if(pk.value()) answer(pk.value()); });
  }

  function answer(o){
    if(!o) return;
    const it = ds.list[ds.idx];
    let ok = null, right = "", facts = "";
    if(it.type === "rom"){
      const r = it.row;
      if(it.ask === "参考可動域"){ ok = o.v === r.参考可動域; right = deg(r); }
      else if(it.ask === "逆"){   // 軸と角度が同じ運動はどれを選んでも正解（例：肩甲帯の屈曲と伸展）
        ok = ROM.some(x => romName(x) === o.label && x.基本軸 === r.基本軸 && x.移動軸 === r.移動軸 && x.参考可動域 === r.参考可動域);
        right = romName(r);
      }else{ ok = o.label === r[it.ask]; right = r[it.ask]; }
      facts = `<div class="why"><b>${esc(romName(r))}</b>（${esc(r.英語)}）<br>参考可動域 ${esc(r.参考可動域 === null ? "（距離で表示）" : deg(r))}
        ／ 基本軸 ${esc(r.基本軸 || "—")} ／ 移動軸 ${esc(r.移動軸 || "—")}${r.注意 ? `<br>📏 ${esc(r.注意)}` : ""}</div>`;
    }else if(it.type === "mmtok"){
      const c = it.card;
      ok = sameName(o.label, c.label); right = c.label;
      facts = `<div class="why">${esc(src(c))}（正しい図）・${esc(c.grade)}・${esc(c.point)}</div>`;
    }else{
      const c = it.card;
      if(c.wrong_kind){ ok = o.label === c.wrong_kind || (c.wrong_also || []).includes(o.label); right = c.wrong_kind; }
      facts = `<div class="why">${c.reason && !/判断保留/.test(c.reason) ? `誤り理由：${esc(c.reason)}` : "この図の誤りの理由は、データでまだ確認できていません（正答ではない図であることだけ確か）。"}<br>${esc(src(c))}</div>`;
    }
    if(ok !== null){
      const key = it.type === "rom" ? `rom:${it.row.id}:${it.ask}` : `mmt:${it.card.id}`;
      (S.drill[key] = S.drill[key] || []).push({t: Date.now(), ok: ok ? 1 : 0});
      save(S);
    }
    ds.results.push({it, ok, picked: o.label, right});
    document.querySelector("#dkPick .pk-in").disabled = true;
    document.querySelector("#dkPick .pk-list").innerHTML = "";
    document.getElementById("dkAns").innerHTML = `<div class="verdict ${ok === null ? "" : ok ? "ok" : "ng"}">${ok === null ? "― 採点なし" : ok ? "◯ 正解" : "✖ 不正解"}
      <span>${ok !== false ? "" : `あなた：${esc(o.label)}${right ? ` ／ 正しくは：${esc(right)}` : ""}`}</span></div>${facts}`;
    const go = document.getElementById("dkGo");
    go.disabled = false; go.textContent = ds.idx + 1 < ds.list.length ? "次へ →" : "結果を見る";
    go.onclick = () => { if(ds.idx + 1 < ds.list.length){ ds.idx++; render(); } else finish(); };
    go.focus();
  }

  function finish(){
    if(!ds) return home();
    const res = ds.results.filter(r => r.ok !== null), okN = res.filter(r => r.ok).length;
    const wrong = ds.results.filter(r => r.ok === false).map(r => {
      const it = r.it;
      const what = it.type === "rom" ? `${romName(it.row)} の${it.ask === "逆" ? "運動" : it.ask}` : it.type === "mmtok" ? `図：${src(it.card)}` : `誤りの図：${it.card.label}`;
      return `<tr><td>${esc(what)}</td><td>${esc(r.picked)}</td><td><b>${esc(r.right)}</b></td></tr>`;
    }).join("");
    const kind = ds.kind;
    app.innerHTML = `<div class="card">
      <h2>${esc(TITLE[kind])}の結果</h2>
      <p style="font-size:18px"><b>${okN}</b> / ${res.length} 問正解${res.length ? `（${Math.round(100 * okN / res.length)}%）` : ""}</p>
      ${wrong ? `<h3>間違えたところ</h3><table><tr><th>問題</th><th>あなた</th><th>正しくは</th></tr>${wrong}</table>` : ""}
      <div style="margin-top:12px"><button class="btn primary" onclick="home()">ホームへ</button>
        <button class="btn" onclick="DRILL.start('${kind}')">もう一度</button></div></div>`;
    ds = null;
    window.scrollTo(0, 0);
  }

  // 候補リストの見た目（ほかの部品と同じ色の変数を使う）
  const css = document.createElement("style");
  css.textContent = `.pk{position:relative}.pk-in{width:100%;box-sizing:border-box;min-height:48px;font-size:17px;padding:10px 14px;border:1.5px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink)}
  .pk-in:focus{outline:none;border-color:var(--accent)}.pk-list{list-style:none;margin:6px 0 0;padding:0;border-radius:10px;overflow:hidden}
  .pk-list li{padding:11px 14px;border:1px solid var(--line);border-top:0;background:var(--card);cursor:pointer;font-size:15.5px;line-height:1.6}
  .pk-list li:first-child{border-top:1px solid var(--line);border-radius:10px 10px 0 0}.pk-list li:last-child{border-radius:0 0 10px 10px}
  .pk-list li:only-child{border-radius:10px}.pk-list li.hi{background:var(--card2)}.pk-list li.sel{background:var(--accent2);font-weight:700}
  .pk-list li.none{cursor:default;color:var(--sub);font-size:13.5px}`;
  document.head.appendChild(css);

  return {start, finish, load, reset: () => { ds = null; }, active: () => !!ds, norm};
})();

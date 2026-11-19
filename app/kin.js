// 起始・停止カード: 筋名を見て起始・停止を思い出し、裏返して自己採点する。終わりなく次のカードが出る
//  - データ: 基本辞書（教科書データの 辞書_kotoba_…json、2026-11-18 版以降）の ami（語の網）にある、起始と停止がそろった筋。
//    公開サイトには置かないので、基本辞書を取り込んでいない端末では案内だけを出す
//  - 記録: S.drill["kin:<筋名>"] = [{t, ok}]（ok は 0 まだ・1 あいまい・2 覚えた）。ROM・MMT ドリルと同じ欄なので同期される
//  - 出す順: その回の中では「まだ」は3枚後、「あいまい」は8枚後にもう一度。覚えた筋は一巡の最後へ。
//    一巡の順は、最後の採点が「まだ」→「あいまい」→ 未学習（国試の出題数が多い筋から）→「覚えた」（古い順）
"use strict";
window.KIN = (() => {
  let ks = null;   // {queue:[筋名], cur, back, n:{ok, mid, ng}, seen}
  const KEY = w => "kin:" + w;
  const GAP = {0: 3, 1: 8};

  function data(){ return window.TEXTBOOK && TEXTBOOK.ami ? TEXTBOOK.ami() : null; }
  function muscles(){
    const a = data(); if(!a || !a.語) return [];
    return Object.keys(a.語).filter(w => { const t = a.語[w]; return (t.起始 || []).length && (t.停止 || []).length; });
  }
  const hist = w => (S.drill || {})[KEY(w)] || [];
  const last = w => { const h = hist(w); return h.length ? h[h.length - 1] : null; };
  const freq = w => (typeof GLOSS !== "undefined" && GLOSS[w] && GLOSS[w].出題数) || 0;

  // 一巡の順番
  function deck(){
    const rank = w => { const l = last(w); return !l ? 2 : l.ok === 0 ? 0 : l.ok === 1 ? 1 : 3; };
    return muscles().map(w => [rank(w), rank(w) === 2 ? -freq(w) : (last(w) || {t: 0}).t, Math.random(), w])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]).map(x => x[3]);
  }
  function counts(){
    const c = {all: 0, ok: 0, mid: 0, ng: 0, fresh: 0};
    muscles().forEach(w => { c.all++; const l = last(w); if(!l) c.fresh++; else if(l.ok === 2) c.ok++; else if(l.ok === 1) c.mid++; else c.ng++; });
    return c;
  }

  // ホームのカード
  function tile(){
    const c = counts();
    const body = c.all
      ? `<p>筋 ${c.all}個。筋名を見て起始・停止を思い出し、裏返して自己採点。終わりなく次の筋が出ます（「まだ」の筋ほど早くまた出ます）。</p>
        <div class="grid" style="grid-template-columns:repeat(4,1fr);gap:8px">
          <div class="stat">覚えた<b>${c.ok}</b></div><div class="stat">あいまい<b>${c.mid}</b></div><div class="stat">まだ<b>${c.ng}</b></div><div class="stat">未学習<b>${c.fresh}</b></div></div>
        <div class="acts"><button class="btn primary" onclick="KIN.start()">はじめる</button></div>`
      : `<p>筋の起始・停止を、筋名からひたすら答えるカード。</p>
        <p class="muted">${window.TEXTBOOK && TEXTBOOK.hasKotoba && TEXTBOOK.hasKotoba()
          ? "取り込んである基本辞書に起始・停止のデータがありません。新しい基本辞書（11/18 版以降）を取り込むと使えます。"
          : "基本辞書（教科書データの 辞書_kotoba_…json）を取り込むと使えます（ホームの「教科書データ」から）。"}</p>`;
    return `<div class="tile c4" id="kinTile"><div class="top"><span class="ic">💪</span><h3>起始・停止カード</h3></div>${body}</div>`;
  }
  function refreshTile(){ const el = document.getElementById("kinTile"); if(el) el.outerHTML = tile(); }

  function start(){
    const q = deck(); if(!q.length) return;
    session = null; wsess = null;
    ks = {queue: q, back: false, n: {ok: 0, mid: 0, ng: 0}};
    render();
  }
  // 同じ筋の重複した書き方（「小結節稜」と「上腕骨の小結節稜」など）は長いほうだけ出す
  function sites(list){
    const txt = list.map(x => x[0]);
    const keep = list.filter(([t], i) => !txt.some((u, j) => j !== i && u !== t && u.includes(t)) && txt.indexOf(t) === i);
    const byHead = {};
    keep.forEach(([t, , h]) => (byHead[h || ""] = byHead[h || ""] || []).push(t));
    return Object.entries(byHead).map(([h, ts]) => `<div class="kin-site">${h ? `<span class="kin-hd">${esc(h)}</span>` : ""}${ts.map(esc).join("、")}</div>`).join("");
  }
  function render(){
    const w = ks.queue[0], t = data().語[w], l = last(w), g = typeof GLOSS !== "undefined" ? GLOSS[w] : null;
    const tot = ks.n.ok + ks.n.mid + ks.n.ng;
    const state = !l ? "はじめて" : ["前回 まだ", "前回 あいまい", "前回 覚えた"][l.ok];
    const nerve = (t.支配神経 || []).map(x => x[0]).filter((x, i, a) => a.indexOf(x) === i);
    const back = `<div class="fw">${esc(w)}</div>${g && g.読み ? `<div class="fr">${esc(g.読み)}</div>` : ""}
      <div class="kin-ans">
        <div class="kin-row"><span class="kin-lab">起始</span><div>${sites(t.起始)}</div></div>
        <div class="kin-row"><span class="kin-lab">停止</span><div>${sites(t.停止)}</div></div>
        ${nerve.length ? `<div class="kin-row kin-sub"><span class="kin-lab">支配神経</span><div>${nerve.map(esc).join("、")}</div></div>` : ""}
      </div>`;
    app.innerHTML = `<div class="card flash-card">
      <div class="qmeta"><span class="count">💪 起始・停止カード ${tot + 1}枚目</span><span>${state}</span>
        <span class="muted" style="margin:0">覚えた ${ks.n.ok}・あいまい ${ks.n.mid}・まだ ${ks.n.ng}</span></div>
      <div class="flash" ${ks.back ? "" : `onclick="KIN.flip()" style="cursor:pointer"`}>
        ${ks.back ? back : `<div class="fw">${esc(w)}</div>${g && g.読み ? `<div class="fr">${esc(g.読み)}</div>` : ""}
          <div class="fs">起始と停止は？　タップ（またはスペース）で裏返す</div>`}
      </div>
      <div class="flash-controls">${ks.back ? `<div class="grade">
          <button class="btn ngb" onclick="KIN.grade(0)">まだ [1]</button>
          <button class="btn" onclick="KIN.grade(1)">あいまい [2]</button>
          <button class="btn okb" onclick="KIN.grade(2)">覚えた [3]</button></div>`
        : `<button class="btn primary" onclick="KIN.flip()">裏を見る</button>`}
      <div style="margin-top:10px"><button class="btn small" onclick="KIN.end()">ここでやめる</button></div></div>
    </div>`;
    if(!ks.back) window.scrollTo(0, 0);
  }
  function flip(){ if(!ks) return; ks.back = true; render(); }
  function grade(k){
    if(!ks || !ks.back) return;
    const w = ks.queue.shift();
    (S.drill[KEY(w)] = S.drill[KEY(w)] || []).push({t: Date.now(), ok: k});
    save(S);
    ks.n[["ng", "mid", "ok"][k]]++;
    if(k in GAP) ks.queue.splice(Math.min(GAP[k], ks.queue.length), 0, w);   // まだ・あいまいは数枚後にもう一度
    if(!ks.queue.length) ks.queue = deck();                                  // 一巡したら、記録から並べ直して続ける
    ks.back = false;
    render();
  }
  function end(){
    if(!ks){ home(); return; }
    const n = ks.n, tot = n.ok + n.mid + n.ng;
    ks = null;
    app.innerHTML = `<div class="card"><h2>💪 おつかれさまでした</h2>
      <div class="grid">
        <div class="stat">答えた <b>${tot}</b>枚</div>
        <div class="stat"><span class="ok">覚えた</span> <b>${n.ok}</b></div>
        <div class="stat">あいまい <b>${n.mid}</b></div>
        <div class="stat"><span class="ng">まだ</span> <b>${n.ng}</b></div></div>
      <p class="muted">次にはじめるときは、「まだ」「あいまい」だった筋から出ます。</p>
      <button class="btn primary" onclick="KIN.start()">続ける</button> <button class="btn" onclick="home()">ホームへ</button></div>`;
  }
  document.addEventListener("keydown", e => {   // カード中: スペース/Enter=裏返す、1/2/3=採点
    if(!ks || (e.target.closest && e.target.closest("input,textarea,select,button"))) return;
    if(!ks.back && (e.key === " " || e.key === "Enter")){ e.preventDefault(); flip(); }
    else if(ks.back && ["1", "2", "3"].includes(e.key)) grade(+e.key - 1);
  });
  return {tile, refreshTile, start, flip, grade, end, reset: () => { ks = null; }, active: () => !!ks, muscles, counts};
})();

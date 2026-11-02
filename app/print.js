// 印刷・PDF（選んだ問題を紙で解く）
//  - 入り口: 「条件を選んで解く」の 🖨 ボタン（その条件の問題）と、結果画面の「間違えた問題を印刷」
//  - 同じタブに印刷用の画面を出す（PWA では新しい窓を開けない）。上の操作バーは印刷されない
//  - 問題の切り抜き画像には問題文・図・選択肢がすべて入っているので、画像がある問題は画像だけを載せ、文字の問題文と選択肢は重ねない
//  - 答えを付ける: 最後のページ（改ページ）に正答の一覧。誤り理由も付けると、正答でない選択肢の理由を並べる
//  - PDF にするときは、印刷の画面の「送信先」で「PDF に保存」を選ぶ（Android は 共有 → 印刷 → PDF として保存）
"use strict";
window.PRINT = (() => {
  let pv = null;   // 表示中の印刷画面 {title, list, answers, reasons}
  const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));

  function open(list, title){
    if(!list || !list.length) return;
    pv = {title, list, answers: true, reasons: false};
    render();
    window.scrollTo(0, 0);
  }
  function toggle(key){ if(pv){ pv[key] = !pv[key]; render(); } }

  // 1問ぶん。画像（切り抜き）があれば画像だけ、無ければ問題文＋別冊の図＋□付きの選択肢
  function qHtml(q, n){
    const multi = q.選択数 >= 2;
    const clip = q.画像?.切り抜き, extra = q.画像?.別冊 || [];
    const meta = [`第${q.回}回 ${q.区分} 問${q.問題番号}`, esc(q.科目), isJitsuchi(q) ? "実地(3点)" : "", multi ? `${q.選択数}つ選べ` : ""].filter(Boolean).join("・");
    const boxes = q.選択肢.map((c, i) => `<span class="pv-box">□</span>${i + 1}`).join("　");
    const body = clip
      ? `<img class="pv-img" src="${curl(clip)}" alt="問題">${extra.map(p => `<img class="pv-img pv-bessatsu" src="${curl(p)}" alt="別冊">`).join("")}
         <div class="pv-mark">解答：${boxes}</div>`
      : `<p class="pv-text">${esc(q.問題文)}</p>${extra.map(p => `<img class="pv-img pv-bessatsu" src="${curl(p)}" alt="別冊">`).join("")}
         <ol class="pv-choices">${q.選択肢.map(c => `<li><span class="pv-box">□</span>${esc(c)}</li>`).join("")}</ol>`;
    return `<section class="pv-q"><div class="pv-head"><b>${n}.</b> <span>${meta}</span></div>${body}</section>`;
  }
  function keyHtml(){
    const grid = pv.list.map((q, i) => `<div><b>${i + 1}</b>　${q.正答.join("・")}</div>`).join("");
    const reasons = !pv.reasons ? "" : pv.list.map((q, i) => {
      const e = typeof EXPL !== "undefined" ? EXPL[q.id] : null, c = (e && e.c) || {};
      const rows = Object.keys(c).sort((a, b) => a - b).map(num => `<li>${num}. ${esc(q.選択肢[num - 1] || "")}：${esc(c[num])}</li>`).join("");
      return rows ? `<div class="pv-why"><b>${i + 1}.</b>（正答 ${q.正答.join("・")}）<ul>${rows}</ul></div>` : "";
    }).join("");
    return `<section class="pv-key"><h2>解答${pv.reasons ? "と誤り理由" : ""}</h2><div class="pv-grid">${grid}</div>${reasons}</section>`;
  }
  function render(){
    css();
    const today = new Date().toLocaleDateString("ja-JP", {year: "numeric", month: "long", day: "numeric"});
    app.innerHTML = `
    <div class="card pv-bar">
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <button class="btn primary" onclick="window.print()">🖨 印刷・PDFに保存</button>
        <label class="pill" style="cursor:pointer"><input type="checkbox" ${pv.answers ? "checked" : ""} onchange="PRINT.toggle('answers')"> 答えを付ける</label>
        <label class="pill" style="cursor:pointer"><input type="checkbox" ${pv.reasons ? "checked" : ""} ${pv.answers ? "" : "disabled"} onchange="PRINT.toggle('reasons')"> 誤り理由を付ける</label>
        <span style="margin-left:auto"><button class="btn" onclick="home()">戻る</button></span>
      </div>
      <div class="muted" style="margin:8px 0 0">${pv.list.length}問。PDF にするときは、印刷の画面の「送信先」で「PDF に保存」を選びます（Android は 共有 → 印刷 → PDF として保存）。答えは最後のページにまとめて出ます。</div>
    </div>
    <div class="pv">
      <div class="pv-title"><b>${esc(pv.title)}</b>　${pv.list.length}問　${today}<span class="pv-name">名前＿＿＿＿＿＿＿＿　得点＿＿＿／${pv.list.length}</span></div>
      ${pv.list.map((q, i) => qHtml(q, i + 1)).join("")}
      ${pv.answers ? keyHtml() : ""}
    </div>`;
  }

  // 画面でも紙に近い見た目にし、印刷では操作バー・上の帯・フッター・用語の吹き出しを消して白黒にする
  function css(){
    if(document.getElementById("pvCss")) return;
    const print = p => `
      ${p}.appbar,${p}footer,${p}.pv-bar,${p}#termBox{display:none !important}
      ${p}body,${p}main,${p}#app{background:#fff !important;color:#000 !important;margin:0 !important;padding:0 !important;max-width:none !important}
      ${p}.pv{border:0 !important;box-shadow:none !important;padding:0 !important;margin:0 !important;font-size:10.5pt}
      ${p}.pv *{color:#000 !important;background:transparent !important}
      ${p}.pv-img{max-height:200mm}
      ${p}.pv-bessatsu{max-height:150mm}`;
    const s = document.createElement("style");
    s.id = "pvCss";
    s.textContent = `
      .pv{background:#fff;color:#111;border:1px solid var(--line);border-radius:8px;padding:20px 22px;margin:14px 0;font-size:14px;line-height:1.7}
      .pv-title{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;border-bottom:2px solid #333;padding-bottom:6px;margin-bottom:12px}
      .pv-name{margin-left:auto}
      .pv-q{break-inside:avoid;page-break-inside:avoid;padding:10px 0 12px;border-bottom:1px dashed #bbb}
      .pv-head{font-size:.92em;margin-bottom:6px}.pv-head b{font-size:1.15em;margin-right:4px}
      .pv-text{white-space:pre-wrap;margin:4px 0 8px}
      .pv-img{display:block;max-width:100%;max-height:80vh;height:auto;margin:4px auto}
      .pv-choices{list-style:decimal;margin:4px 0 0;padding-left:2.2em}.pv-choices li{margin:2px 0}
      .pv-box{font-size:1.1em;margin-right:4px}
      .pv-mark{margin-top:4px;font-size:.95em}
      .pv-key{break-before:page;page-break-before:always;padding-top:12px}
      .pv-key h2{font-size:1.2em;margin:0 0 8px}
      .pv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(5.5em,1fr));gap:2px 10px;margin-bottom:12px}
      .pv-why{break-inside:avoid;margin:6px 0;font-size:.92em}.pv-why ul{margin:2px 0 0;padding-left:1.4em}
      @page{size:A4;margin:12mm}
      @media print{${print("")}}
      ${print(":root.pv-preview ")}`;   // pv-preview: 印刷の見た目を画面で確かめる用
    document.head.appendChild(s);
  }
  return {open, toggle, active: () => !!pv, reset: () => { pv = null; }};
})();

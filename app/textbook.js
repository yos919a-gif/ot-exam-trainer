// 教科書データ（辞書データ。各自が取り込む。公開サイトには入っていない）
//  - 取り込み: 1冊ずつのファイル（tools/bundle_textbook.py が作る 辞書_<id>_<書名>.json）を、まとめて選んで取り込む。
//    本を足すときはファイルを足して取り込み、外すときは一覧から削除する。以前の全冊入りのファイルも本ごとに分けて取り込める
//  - 保存: 端末の IndexedDB に本ごと。Google ログインしていれば Drive のアプリ専用領域にも本ごと（ot-tb-<id>.json）に置き、
//    ほかの端末はそこから読む
//  - 使い道: 用語の吹き出しの「教科書では」と、総合索引のページ（sakuin.html）
//  - 基本辞書（id "kotoba"）: 語のつながり（kotoba.html）の説明の文。取り込み・同期は本と同じだが、本の一覧・総合索引には出さない
//  - 本の選択: チェックボックスで一時的に外せる（外した本は S.pref.tbOff。学習記録と一緒に同期される）
"use strict";
window.TEXTBOOK = (() => {
  const DB = "ot-textbook", STORE = "kv", PREFIX = "book:", DRIVE_PREFIX = "ot-tb-";
  let bookMap = {};   // {本id: 1冊のデータ {kind, version, id, name, terms, entries, index}}
  let data = null;    // 全冊をまとめたもの {version, entries:{項目id:{w, n, r:[[本id, p, rel, 相手, 根拠]]}}, index:{表記:[項目id]}, sakuin:{books, terms}}

  function idb(mode, fn){
    return new Promise((ok, ng) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onerror = () => ng(req.error);
      req.onsuccess = () => {
        const tx = req.result.transaction(STORE, mode), st = tx.objectStore(STORE);
        const r = fn(st);
        tx.oncomplete = () => ok(r && r.result);
        tx.onerror = () => ng(tx.error);
      };
    });
  }
  const idbPut = (key, v) => idb("readwrite", st => st.put(v, key));
  const idbDel = key => idb("readwrite", st => st.delete(key));
  const idbBooks = () => idb("readonly", st => st.getAll(IDBKeyRange.bound(PREFIX, PREFIX + "￿")));
  const isBook = j => j && j.kind === "ot-textbook-book" && j.id && j.terms && j.entries && j.index;
  const isOldBundle = j => j && j.kind === "ot-textbook-data" && j.entries && j.index;
  // 本の名前の見せ方（以前の版の出どころの名前は、スキャンの画質の注記を外し、誤記を直す）
  const bookName = b => String(b).replace(/[\s　]*普通画質$/, "").replace("作業療法評価額", "作業療法評価学").replace(/　/g, " ");

  // 以前の全冊入りのファイルを本ごとに分ける（総合索引の入っていない古いものは、説明だけを出どころの名前ごとに）
  function splitBundle(j){
    const out = {}, get = (id, name) => out[id] || (out[id] = {kind: "ot-textbook-book", version: j.version || "", id, name, terms: {}, entries: {}, index: {}});
    if(j.sakuin) Object.entries(j.sakuin.books).forEach(([id, name]) => get(id, name));
    if(j.sakuin) Object.entries(j.sakuin.terms).forEach(([w, t]) => t.e.forEach(([id, ...rest]) => {
      const x = get(id, j.sakuin.books[id] || id).terms;
      (x[w] = x[w] || {r: t.r, n: t.n, al: t.al, e: []}).e.push(rest);
    }));
    Object.entries(j.entries).forEach(([eid, e]) => e.r.forEach(([src, ...rest]) => {
      const id = (j.srcBook && j.srcBook[src]) || src, b = get(id, (j.sakuin && j.sakuin.books[id]) || bookName(src));
      (b.entries[eid] = b.entries[eid] || {w: e.w, n: e.n, r: []}).r.push(rest);
    }));
    Object.values(out).forEach(b => Object.entries(j.index).forEach(([k, ids]) => {
      const v = ids.filter(i => b.entries[i]); if(v.length) b.index[k] = v;
    }));
    return Object.values(out);
  }
  // 取り込んだ本をまとめ直す（本を足したり消したりするたびに）
  function rebuild(){
    const ids = Object.keys(bookMap).filter(id => id !== "kotoba");   // 基本辞書（語のつながりの文）は本ではない
    if(!ids.length){ data = null; return; }
    const entries = {}, index = {}, terms = {}, books = {};
    let version = "";
    ids.forEach(id => {
      const b = bookMap[id];
      books[id] = b.name; version = version || b.version;
      Object.entries(b.entries).forEach(([eid, e]) => {
        const t = entries[eid] || (entries[eid] = {w: e.w, n: e.n, r: []});
        e.r.forEach(r => t.r.push([id, ...r]));
      });
      Object.entries(b.index).forEach(([k, v]) => { const a = index[k] || (index[k] = []); v.forEach(i => { if(!a.includes(i)) a.push(i); }); });
      Object.entries(b.terms).forEach(([w, t]) => {
        const x = terms[w] || (terms[w] = {r: t.r, n: t.n, al: t.al, e: []});
        t.e.forEach(e => x.e.push([id, ...e]));
      });
    });
    data = {version, entries, index, sakuin: {books, terms}};
  }

  async function load(){
    try{ ((await idbBooks()) || []).forEach(b => { if(isBook(b)) bookMap[b.id] = b; }); }catch(e){ console.warn("教科書データ（端末）", e); }
    // 以前の全冊入りのデータが端末に残っていれば、本ごとに分けて入れ直す
    try{
      const old = await idb("readonly", st => st.get("bundle"));
      if(isOldBundle(old)){
        for(const b of splitBundle(old)){ bookMap[b.id] = b; await idbPut(PREFIX + b.id, b); }
        await idbDel("bundle");
      }
    }catch(e){ console.warn("教科書データ（以前の版）", e); }
    // ログインしていれば、ほかの端末で取り込んだ本を Drive から
    try{
      if(window.SYNC && SYNC.signedIn()){
        for(const name of await SYNC.files.list(DRIVE_PREFIX)){
          const id = name.slice(DRIVE_PREFIX.length).replace(/\.json$/, "");
          if(bookMap[id]) continue;
          const b = await SYNC.files.get(name);
          if(isBook(b)){ bookMap[b.id] = b; await idbPut(PREFIX + b.id, b); }
        }
      }
    }catch(e){ console.warn("教科書データ（Drive）", e); }
    rebuild();
    return !!data;
  }
  // 1ファイル分を取り込む（1冊のファイルか、以前の全冊入りのファイル）。取り込んだ本の名前を返す
  async function importText(text){
    let j;
    try{ j = JSON.parse(text); }catch(e){ throw new Error("JSON として読めません"); }
    const list = isBook(j) ? [j] : isOldBundle(j) ? splitBundle(j) : null;
    if(!list) throw new Error("OT国試トレーナーの教科書データではありません");
    for(const b of list){
      bookMap[b.id] = b;
      await idbPut(PREFIX + b.id, b);
      try{ if(window.SYNC) await SYNC.files.put(DRIVE_PREFIX + b.id + ".json", b); }catch(e){ console.warn("Drive に保存できませんでした", b.id, e); }
    }
    rebuild();
    return list.map(b => b.name);
  }
  async function importFiles(files){
    const names = [], errors = [];
    for(const f of files){
      try{ names.push(...await importText(await f.text())); }catch(e){ errors.push(`${f.name}: ${e.message}`); }
    }
    return {names, errors};
  }
  async function removeBook(id){
    delete bookMap[id];
    await idbDel(PREFIX + id);
    try{ if(window.SYNC) await SYNC.files.remove(DRIVE_PREFIX + id + ".json"); }catch(e){}
    rebuild();
  }
  async function remove(){ for(const id of Object.keys(bookMap)) await removeBook(id); }
  function info(){
    if(!data) return null;
    const ids = Object.keys(data.entries);
    return {version: data.version || "", books: Object.values(bookMap).filter(b => b.id !== "kotoba").length, words: ids.length, withRel: ids.filter(i => data.entries[i].r.length).length};
  }
  // 語（用語集の見出しや別名）から教科書の項目を探す。表記ゆれは空白の有無まで吸収
  function lookup(word){
    if(!data || !word) return null;
    const ids = data.index[word] || data.index[String(word).replace(/\s+/g, "")];
    if(!ids || !ids.length) return null;
    return data.entries[ids[0]] || null;
  }
  // 外した本。ホーム（index.html の let S）ではそこから、総合索引など S の無いページでは保存済みの学習記録から読む
  const offSet = () => {
    if(typeof S !== "undefined") return new Set((S.pref && S.pref.tbOff) || []);
    try{ return new Set(((JSON.parse(localStorage.getItem("ot-exam-progress-v1")) || {}).pref || {}).tbOff || []); }catch(e){ return new Set(); }
  };
  // 取り込んだ本（総合索引の語数・説明の数つき、多い順）
  function books(){
    const off = offSet();
    return Object.values(bookMap).filter(b => b.id !== "kotoba").map(b => ({key: b.id, name: b.name, words: Object.keys(b.terms).length,
      rels: Object.values(b.entries).reduce((n, e) => n + e.r.length, 0), on: !off.has(b.id)}))
      .sort((a, b) => (b.words + b.rels) - (a.words + a.rels));
  }
  function setBook(key, on){
    const off = offSet();
    if(on) off.delete(key); else off.add(key);
    S.pref.tbOff = [...off]; save(S);
  }
  function setAll(on){ S.pref.tbOff = on ? [] : books().map(b => b.key); save(S); }
  // 用語の吹き出しに足す HTML。選んだ本の関係だけ、最大 max 件
  function termHtml(word, max = 5){
    const e0 = lookup(word);
    if(!e0) return "";
    const off = offSet();
    const e = Object.assign({}, e0, {r: e0.r.filter(r => !off.has(r[0]))});
    if(!e.r.length) return "";
    const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
    const rows = e.r.slice(0, max).map(([id, p, rel, other, quote]) =>
      `<li><b>${esc(rel)}</b>：${esc(other)}${quote ? `<div class="tbq">「${esc(quote)}」</div>` : ""}<div class="tbs">${esc(data.sakuin.books[id] || bookName(id))}${p ? ` p.${esc(p)}` : ""}</div></li>`).join("");
    const more = e.r.length > max ? `<div class="st">ほか ${e.r.length - max}件</div>` : "";
    return `<div class="tb"><div class="st">📚 教科書 ${e.n}冊に出る語</div><ul>${rows}</ul>${more}</div>`;
  }
  // ホーム以外の画面で教科書データが無いとき: Google にログイン済みで期限（約1時間）が切れていれば、
  // ほかの端末で取り込んだ本を Drive から読むためのボタンを返す（ログインの窓はボタンを押したときだけ開ける）
  function loginButton(){
    if(!window.SYNC || !SYNC.available() || !SYNC.signedIn() || !SYNC.status().needLogin) return null;
    const b = document.createElement("button");
    b.textContent = "☁ Google にログインして、ほかの端末で取り込んだデータを読み込む";
    b.style.cssText = "display:block;margin-top:12px;padding:10px 14px;border-radius:10px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit;cursor:pointer";
    b.onclick = () => SYNC.signIn().then(() => location.reload()).catch(e => { b.textContent = "ログインできませんでした: " + e.message; });
    return b;
  }
  return {load, loginButton, importText, importFiles, removeBook, remove, info, lookup, termHtml, books, setBook, setAll, has: () => !!data,
          sakuin: () => (data && data.sakuin) || null, offIds: () => offSet(),
          // 基本辞書（語のつながり kotoba.html の説明の文。本ごとの {meta, terms}）
          hasKotoba: () => !!(bookMap.kotoba && bookMap.kotoba.kotoba),
          kotoba: id => { const b = bookMap.kotoba; return b && b.kotoba ? (b.kotoba[id] || null) : null; },
          // つながりと索引ページ（kotoba.html の土台。公開サイトには置かない）
          kotobaLinks: id => { const b = bookMap.kotoba; return b && b.links ? (b.links[id] || null) : null; },
          // 語の網（ami.html。親・流れ・つながり。基本辞書の ami キー。公開サイトには置かない）
          ami: () => { const b = bookMap.kotoba; return b && b.ami ? b.ami : null; },
          // 用語集の教科書ページ（公開サイトには置かない）を、取り込んだ人の用語集にだけ重ねる
          applyGlossSrc: g => { const b = bookMap.kotoba; if(b && b.glossSrc) Object.entries(b.glossSrc).forEach(([w, s]) => { if(g[w]) g[w].出典 = s; }); }};
})();

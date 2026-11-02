// 教科書データ（辞書データ。各自が取り込む。公開サイトには入っていない）
//  - 取り込み: 1冊ずつのファイル（tools/bundle_textbook.py が作る 辞書_<id>_<書名>.txt）を、まとめて選んで取り込む。
//    .txt は | 区切りの表（1行目 #OT国試トレーナー 教科書データ v1、#キー=値 のメタ行、見出し行、索引の行・説明の行）で、
//    読むときに下の1冊のデータ（JSON と同じ形）に戻す。以前の 辞書_<id>_<書名>.json も、全冊入りのファイル（本ごとに分ける）も取り込める。
//    本を足すときはファイルを足して取り込み、外すときは一覧から削除する
//  - 保存: 端末の IndexedDB に本ごと。Google ログインしていれば Drive のアプリ専用領域にも本ごと（ot-tb-<id>.json）に置き、
//    ほかの端末はそこから読む
//  - 使い道: 用語の吹き出しの「教科書では」と、総合索引のページ（sakuin.html）
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
  // | 区切りのテキスト（新しい形式）を1冊のデータに戻す。列は見出し行の列名で探す
  const TXT_SIG = "#OT国試トレーナー 教科書データ";
  const isTxt = text => (String(text).replace(/^\uFEFF/, "").split(/\r\n|\r|\n/).find(l => l.trim()) || "").startsWith(TXT_SIG);
  function parseText(text){
    const lines = String(text).replace(/^\uFEFF/, "").split(/\r\n|\r|\n/).filter(l => l.trim());
    if(!lines.length || !lines[0].startsWith(TXT_SIG)) throw new Error("1行目が「#OT国試トレーナー 教科書データ」ではありません");
    const meta = {};
    let i = 1;
    for(; i < lines.length && lines[i].startsWith("#"); i++){
      const m = lines[i].slice(1).match(/^([^=]*)=(.*)$/); if(m) meta[m[1].trim()] = m[2];
    }
    const head = (lines[i] || "").split("|").map(c => c.trim());
    if(!head.includes("行の種類") || !head.includes("単語名")) throw new Error("教科書データ（.txt）の見出し行がありません");
    if(!meta.id) throw new Error("教科書データ（.txt）に本の id（#id=）がありません");
    const col = {}; head.forEach((c, k) => { if(!(c in col)) col[c] = k; });
    const int = v => parseInt(v, 10) || 0;
    const page = v => /^\d+$/.test(v) ? Number(v) : v;
    const split = v => v.split("；").filter(Boolean);
    const terms = {}, entries = {}, index = {};
    let prev = null;   // 直前の索引の行 {w, d, b, e}
    for(const line of lines.slice(i + 1)){
      const cells = line.split("|"), g = name => col[name] == null ? "" : (cells[col[name]] ?? "");
      const kind = g("行の種類").trim(), w = g("単語名");
      if(kind === "索引"){
        const t = terms[w] || (terms[w] = {r: g("かな"), n: int(g("国試出題数")), al: split(g("別表記")), e: []});
        const d = g("説明"), b = g("本文") === "本文", p = g("ページ");
        let e;
        if(prev && prev.w === w && prev.d === d && prev.b === b) e = prev.e;
        else{ e = b ? [d, [], "b"] : [d, []]; t.e.push(e); }
        if(p !== "") e[1].push(page(p));
        prev = {w, d, b, e};
        continue;
      }
      prev = null;
      if(kind !== "説明") continue;
      const eid = g("項目id");
      if(!eid) continue;
      const x = entries[eid] || (entries[eid] = {w, n: int(g("出現冊数")), r: []});
      const p = g("ページ");
      if(["ページ", "説明", "出現文脈", "関係", "相手"].some(c => g(c) !== "")) x.r.push([p === "" ? null : page(p), g("関係"), g("相手"), g("出現文脈")]);
      split(g("引く表記")).forEach(k => { const a = index[k] || (index[k] = []); if(!a.includes(eid)) a.push(eid); });
    }
    return {kind: "ot-textbook-book", version: meta.version || "", id: meta.id, name: meta.name || meta.id, 説明: meta.説明 || "", terms, entries, index};
  }
  // 取り込んだ本をまとめ直す（本を足したり消したりするたびに）
  function rebuild(){
    const ids = Object.keys(bookMap);
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
  // 1ファイル分を取り込む（1冊の .txt か、以前の 1冊の .json・全冊入りのファイル）。取り込んだ本の名前を返す
  async function importText(text){
    let j;
    if(isTxt(text)) j = parseText(text);
    else try{ j = JSON.parse(String(text).replace(/^\uFEFF/, "")); }catch(e){ throw new Error("教科書データ（.txt）としても JSON としても読めません"); }
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
    return {version: data.version || "", books: Object.keys(bookMap).length, words: ids.length, withRel: ids.filter(i => data.entries[i].r.length).length};
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
    return Object.values(bookMap).map(b => ({key: b.id, name: b.name, words: Object.keys(b.terms).length,
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
  return {load, importText, importFiles, parseText, removeBook, remove, info, lookup, termHtml, books, setBook, setAll, has: () => !!data,
          sakuin: () => (data && data.sakuin) || null, offIds: () => offSet()};
})();

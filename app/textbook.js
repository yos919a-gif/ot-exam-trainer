// 教科書データ（各自が取り込む。公開サイトには入っていない）
//  - 取り込み: 「教科書データを取り込む」で ot-textbook-data.json（tools/bundle_textbook.py が作る）を選ぶ
//  - 保存: 端末の IndexedDB。Google ログインしていれば Drive のアプリ専用領域にも置き、ほかの端末はそこから読む
//  - 使い道: 用語をタップしたときに「教科書では」（本・ページ・関係・根拠の文）を出す
//  - 本の選択: 出す本をチェックボックスで選べる（外した本は S.pref.tbOff。学習記録と一緒に同期される）
"use strict";
window.TEXTBOOK = (() => {
  const DB = "ot-textbook", STORE = "kv", KEY = "bundle", DRIVE_FILE = "ot-textbook-data.json";
  let data = null;   // {kind, version, entries:{id:{w, n, r:[[本, p, rel, 相手, 根拠]]}}, index:{表記:[id]}}

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
  const valid = j => j && j.kind === "ot-textbook-data" && j.entries && j.index;

  async function load(){
    try{ const j = await idb("readonly", st => st.get(KEY)); if(valid(j)){ data = j; return true; } }catch(e){ console.warn("教科書データ（端末）", e); }
    // この端末に無ければ、ログインしていれば Drive から
    try{
      if(window.SYNC){
        const j = await SYNC.files.get(DRIVE_FILE);
        if(valid(j)){ data = j; await idb("readwrite", st => st.put(j, KEY)); return true; }
      }
    }catch(e){ console.warn("教科書データ（Drive）", e); }
    return false;
  }
  async function importText(text){
    let j;
    try{ j = JSON.parse(text); }catch(e){ throw new Error("JSON として読めません"); }
    if(!valid(j)) throw new Error("OT国試トレーナーの教科書データではありません");
    data = j;
    await idb("readwrite", st => st.put(j, KEY));
    try{ if(window.SYNC) await SYNC.files.put(DRIVE_FILE, text); }catch(e){ console.warn("Drive に保存できませんでした", e); }
    return info();
  }
  async function remove(){
    data = null;
    await idb("readwrite", st => st.delete(KEY));
    try{ if(window.SYNC) await SYNC.files.remove(DRIVE_FILE); }catch(e){}
  }
  function info(){
    if(!data) return null;
    const ids = Object.keys(data.entries);
    return {version: data.version || "", words: ids.length, withRel: ids.filter(i => data.entries[i].r.length).length};
  }
  // 語（用語集の見出しや別名）から教科書の項目を探す。表記ゆれは空白の有無まで吸収
  function lookup(word){
    if(!data || !word) return null;
    const ids = data.index[word] || data.index[String(word).replace(/\s+/g, "")];
    if(!ids || !ids.length) return null;
    return data.entries[ids[0]] || null;
  }
  // 本の名前の見せ方（スキャンの画質の注記を外し、誤記を直す）。選ぶときの鍵は元の名前のまま
  const bookName = b => String(b).replace(/[\s　]*普通画質$/, "").replace("作業療法評価額", "作業療法評価学").replace(/　/g, " ");
  const offSet = () => new Set((typeof S !== "undefined" && S.pref && S.pref.tbOff) || []);   // S は index.html の let（window には載らない）
  // 取り込んだデータに入っている本と、それぞれの説明の数（多い順）
  function books(){
    if(!data) return [];
    const n = {};
    Object.values(data.entries).forEach(e => e.r.forEach(r => { n[r[0]] = (n[r[0]] || 0) + 1; }));
    const off = offSet();
    return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({key, name: bookName(key), count, on: !off.has(key)}));
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
    const rows = e.r.slice(0, max).map(([book, p, rel, other, quote]) =>
      `<li><b>${esc(rel)}</b>：${esc(other)}${quote ? `<div class="tbq">「${esc(quote)}」</div>` : ""}<div class="tbs">${esc(bookName(book))}${p ? ` p.${esc(p)}` : ""}</div></li>`).join("");
    const more = e.r.length > max ? `<div class="st">ほか ${e.r.length - max}件</div>` : "";
    return `<div class="tb"><div class="st">📚 教科書 ${e.n}冊に出る語</div><ul>${rows}</ul>${more}</div>`;
  }
  return {load, importText, remove, info, lookup, termHtml, books, setBook, setAll, has: () => !!data};
})();

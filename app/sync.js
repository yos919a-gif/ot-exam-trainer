// 学習記録を Google Drive で端末間同期する
//  - ログイン: Google Identity Services のアクセストークン（scope は drive.appdata だけ）。クライアントIDは config.js
//  - 置き場所: Drive のアプリ専用領域（appDataFolder）の ot-exam-progress.json。Drive の一覧には出ず、このアプリしか読めない
//  - 合わせ方: 両方の記録をマージする。回答履歴は和集合、しおり・メモ・復習予定は新しい方、消したものは墓標（del）で消したまま、
//    「リセット」はそれより前の記録をすべて捨てる
//  - いつ: 起動時、保存の5秒後、画面に戻ったとき、オンラインに復帰したとき
"use strict";
window.SYNC = (() => {   // window に置く（index.html は window.SYNC の有無で同期の有無を見分ける）
  const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
  const FILE = "ot-exam-progress.json";
  const KEY = "ot-sync-v1";
  const API = "https://www.googleapis.com";
  let st = {};
  try{ st = JSON.parse(localStorage.getItem(KEY)) || {}; }catch(e){}
  let io = null, timer = null, busy = false, applying = false, lastErr = "";
  const persist = () => { try{ localStorage.setItem(KEY, JSON.stringify(st)); }catch(e){} };
  const clientId = () => (window.OT_CONFIG || {}).googleClientId || "";
  const available = () => !!clientId() && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname));
  const signedIn = () => !!st.on;
  const hasToken = () => !!(st.token && st.exp && Date.now() < st.exp - 60000);

  /* ---------- Google ログイン ---------- */
  function loadGis(){
    if(window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    return new Promise((ok, ng) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = () => ok(); s.onerror = () => ng(new Error("Google のログイン部品を読み込めません（オフライン？）"));
      document.head.appendChild(s);
    });
  }
  async function getToken(interactive){
    if(hasToken()) return st.token;
    await loadGis();
    return new Promise((ok, ng) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: clientId(), scope: SCOPE,
        callback: r => {
          if(r && r.access_token){ st.token = r.access_token; st.exp = Date.now() + (+r.expires_in || 3600) * 1000; persist(); ok(st.token); }
          else ng(new Error((r && r.error) || "token"));
        },
        error_callback: e => ng(new Error((e && e.type) || "popup")),
      });
      tc.requestAccessToken({prompt: interactive ? "consent" : ""});
    });
  }
  async function call(url, opts = {}){
    const token = await getToken(false);
    const r = await fetch(url, Object.assign({}, opts, {headers: Object.assign({Authorization: "Bearer " + token}, opts.headers || {})}));
    if(r.status === 401 || r.status === 403){ st.token = null; st.exp = 0; persist(); throw new Error("ログインし直してください（" + r.status + "）"); }
    if(!r.ok) throw new Error("Drive " + r.status);
    return r;
  }

  /* ---------- Drive のファイル ---------- */
  async function findFile(){
    if(st.fileId) return st.fileId;
    const q = encodeURIComponent(`name='${FILE}' and trashed=false`);
    const j = await (await call(`${API}/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`)).json();
    st.fileId = (j.files && j.files[0]) ? j.files[0].id : null; persist();
    return st.fileId;
  }
  async function download(){
    const id = await findFile();
    if(!id) return null;
    try{ return await (await call(`${API}/drive/v3/files/${id}?alt=media`)).json(); }
    catch(e){ if(/404/.test(String(e.message))){ st.fileId = null; persist(); return null; } throw e; }
  }
  async function upload(data){
    const body = JSON.stringify(data);
    const id = await findFile();
    if(id){
      await call(`${API}/upload/drive/v3/files/${id}?uploadType=media`, {method: "PATCH", headers: {"Content-Type": "application/json"}, body});
      return;
    }
    const b = "otx" + Date.now();
    const meta = JSON.stringify({name: FILE, parents: ["appDataFolder"], mimeType: "application/json"});
    const mp = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
    const j = await (await call(`${API}/upload/drive/v3/files?uploadType=multipart&fields=id`,
      {method: "POST", headers: {"Content-Type": `multipart/related; boundary=${b}`}, body: mp})).json();
    st.fileId = j.id; persist();
  }

  /* ---------- マージ ---------- */
  const keys = (x, y) => new Set([...Object.keys(x || {}), ...Object.keys(y || {})]);
  const newer = (x, y, k = "t") => (!x ? y : !y ? x : ((y[k] || 0) > (x[k] || 0) ? y : x));
  function merge(a, b){
    a = a || {}; b = b || {};
    const reset = Math.max(a.resetAt || 0, b.resetAt || 0);
    const del = {};
    for(const kind of ["marks", "notes", "srs", "wsrs"]){
      const da = (a.del || {})[kind] || {}, db = (b.del || {})[kind] || {};
      del[kind] = {};
      for(const k of keys(da, db)) del[kind][k] = Math.max(da[k] || 0, db[k] || 0);
    }
    const out = {attempts: {}, explain: {}, marks: {}, notes: {}, srs: {}, wsrs: {}, sessions: [], pref: {},
                 srsInit: Math.max(a.srsInit || 0, b.srsInit || 0), del, resetAt: reset,
                 _updated: Math.max(a._updated || 0, b._updated || 0)};
    for(const id of keys(a.attempts, b.attempts)){
      const m = new Map();
      [...((a.attempts || {})[id] || []), ...((b.attempts || {})[id] || [])].forEach(x => { if(x.t >= reset) m.set(`${x.t}|${x.m || ""}`, x); });
      const arr = [...m.values()].sort((x, y) => x.t - y.t);
      if(arr.length) out.attempts[id] = arr;
    }
    for(const id of keys(a.explain, b.explain)){ const v = newer((a.explain || {})[id], (b.explain || {})[id]); if(v && (v.t || 0) >= reset) out.explain[id] = v; }
    for(const id of keys(a.notes, b.notes)){ const v = newer((a.notes || {})[id], (b.notes || {})[id]); if(v && (v.t || 0) >= reset && (v.t || 0) > (del.notes[id] || 0)) out.notes[id] = v; }
    for(const id of keys(a.marks, b.marks)){ const t = Math.max((a.marks || {})[id] || 0, (b.marks || {})[id] || 0); if(t >= reset && t > (del.marks[id] || 0)) out.marks[id] = t; }
    for(const kind of ["srs", "wsrs"]){
      for(const id of keys(a[kind], b[kind])){
        const x = (a[kind] || {})[id], y = (b[kind] || {})[id];
        const v = !x ? y : !y ? x : ((y.u || y.due || 0) > (x.u || x.due || 0) ? y : x);   // 古い記録に u が無ければ due で比べる
        const stamp = v.u || 0;
        if(reset && stamp < reset) continue;
        if(del[kind][id] && stamp <= del[kind][id]) continue;
        out[kind][id] = v;
      }
    }
    const sm = new Map();
    [...(a.sessions || []), ...(b.sessions || [])].forEach(s => { if(s.t >= reset) sm.set(`${s.t}|${s.m}`, s); });
    out.sessions = [...sm.values()].sort((x, y) => x.t - y.t);
    out.pref = ((b._updated || 0) > (a._updated || 0) ? b.pref : a.pref) || {};
    return out;
  }
  // 比べるときはキーの順番をそろえる
  const canon = v => Array.isArray(v) ? "[" + v.map(canon).join(",") + "]"
    : (v && typeof v === "object") ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}"
    : JSON.stringify(v);
  const strip = s => { const c = Object.assign({}, s); delete c._updated; return c; };   // _updated の違いだけなら「同じ」

  /* ---------- 同期 ---------- */
  async function syncNow(reason){
    if(!io || !signedIn() || busy || !navigator.onLine) return false;
    busy = true; lastErr = "";
    try{
      const local = io.get();
      const remote = await download();
      const merged = merge(local, remote);
      const changedLocal = canon(strip(merged)) !== canon(strip(local));
      if(changedLocal){ applying = true; try{ io.put(merged); } finally{ applying = false; } }
      if(!remote || canon(merged) !== canon(remote)) await upload(merged);
      st.lastSync = Date.now(); persist();
      if(changedLocal && io.onMerged) io.onMerged();
      return true;
    }catch(e){ lastErr = String(e.message || e); console.warn("同期失敗", reason, e); return false; }
    finally{ busy = false; }
  }
  function schedule(){
    if(applying || !signedIn()) return;
    clearTimeout(timer);
    timer = setTimeout(() => syncNow("save"), 5000);
  }
  function init(adapter){   // adapter: {get(), put(s), onMerged()}
    io = adapter;
    if(!available()) return;
    document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") syncNow("visible"); });
    window.addEventListener("online", () => syncNow("online"));
    window.addEventListener("pagehide", () => { if(timer){ clearTimeout(timer); timer = null; syncNow("pagehide"); } });
    if(signedIn()) syncNow("start");
  }
  async function signIn(){
    if(!available()) throw new Error("同期の設定（config.js の googleClientId）がありません");
    await getToken(true);
    st.on = true; persist();
    const ok = await syncNow("login");
    if(!ok && lastErr) throw new Error(lastErr);
    return ok;
  }
  async function signOut(){
    try{ if(st.token && window.google) google.accounts.oauth2.revoke(st.token, () => {}); }catch(e){}
    st = {}; persist();
  }
  const lastSyncText = () => st.lastSync ? new Date(st.lastSync).toLocaleString("ja-JP", {month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"}) : "まだ";
  const status = () => ({busy, lastErr, lastSync: st.lastSync || 0, on: signedIn()});
  return {available, signedIn, signIn, signOut, syncNow, schedule, init, lastSyncText, status, merge};
})();

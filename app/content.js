// アプリが読むデータは content/（tools/publish_content.py が作業場 data/ から出版する）。
// manifest.json の版（またはファイルごとの sha1）を付けて読むので、出版し直せばブラウザのキャッシュに古いデータが残らない。
"use strict";
const CONTENT = "../content";
let MANIFEST = null;
async function loadManifest(){
  if(!MANIFEST){
    try{ MANIFEST = await fetch(`${CONTENT}/manifest.json`, {cache:"no-cache"}).then(r=>r.json()); }
    catch(e){ MANIFEST = {version: String(Date.now()), files: {}}; console.warn("manifest.json なし", e); }
  }
  return MANIFEST;
}
// ファイルごとの sha1 があればそれを付ける（版を上げずに1ファイルだけ差し替えても、端末の古い保存を使わない）
function curl(path){
  const f = MANIFEST && MANIFEST.files && MANIFEST.files[path];
  return `${CONTENT}/${path}?v=${f && f.sha1 ? f.sha1 : (MANIFEST ? MANIFEST.version : "")}`;
}
async function cfetch(path){
  await loadManifest();
  const r = await fetch(curl(path));
  if(!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

// 圏外でも使えるように、図以外のデータを Service Worker に先に保存してもらう（content/manifest.json の一覧）
function precacheContent(){
  if(!("serviceWorker" in navigator) || !MANIFEST || !MANIFEST.files) return;
  const urls = Object.keys(MANIFEST.files).filter(p=>!p.startsWith("images/") && !p.startsWith("dictionary/"))   // 辞書はアプリが使わない（公開版には入れない）.map(p=>new URL(curl(p), location.href).href);
  urls.push(new URL(`${CONTENT}/manifest.json`, location.href).href);
  navigator.serviceWorker.ready.then(reg=>{ if(reg.active) reg.active.postMessage({type:"precache", urls, version: MANIFEST.version}); }).catch(()=>{});
}

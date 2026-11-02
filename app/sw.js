// Service Worker: 圏外でも動くように、画面とデータを端末に保存する
//  - 画面（HTML/CSS/JS）: ネット優先。つながらなければ保存済みのものを出す
//  - content/ のデータ: 保存済み優先（URL に ?v=版 が付くので、新しい版は別物として取りに行く）
//  - 図（content/images/）: 開いた問題のものから順に保存される
//  - /api/（serve.py の学習記録）と Google など外部は触らない
"use strict";
const SHELL_CACHE = "ot-shell-v1";
const DATA_CACHE = "ot-data-v1";
const SHELL = ["./", "./index.html", "./appbar.css", "./content.js", "./config.js", "./sync.js",
  "./graph.html", "./sakuin.html", "./dendrogram.html", "./lib/d3.v7.8.5.min.js",
  "./icon.png", "./icon-192.png", "./icon-512.png", "./manifest.webmanifest"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== SHELL_CACHE && k !== DATA_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// 画面側から「このデータを先に保存して」と頼まれる（content/manifest.json の一覧。図は除く）
self.addEventListener("message", e => {
  const m = e.data || {};
  if(m.type === "precache" && Array.isArray(m.urls)) e.waitUntil(precache(m.urls, m.version));
});
async function precache(urls, version){
  const c = await caches.open(DATA_CACHE);
  if(version){   // 古い版のデータを消す
    for(const req of await c.keys()){
      const v = new URL(req.url).searchParams.get("v");
      if(v && v !== version) await c.delete(req);
    }
  }
  for(const u of urls){
    try{ if(!(await c.match(u))){ const r = await fetch(u); if(r.ok) await c.put(u, r); } }catch(e){}
  }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);
  if(url.origin !== location.origin) return;
  if(url.pathname.includes("/api/")) return;
  if(url.pathname.includes("/content/")){
    e.respondWith(url.pathname.endsWith("/manifest.json") ? networkFirst(req, DATA_CACHE) : cacheFirst(req, DATA_CACHE));
    return;
  }
  e.respondWith(networkFirst(req, SHELL_CACHE));
});
async function cacheFirst(req, name){
  const c = await caches.open(name);
  const hit = await c.match(req);
  if(hit) return hit;
  const r = await fetch(req);
  if(r.ok) c.put(req, r.clone());
  return r;
}
async function networkFirst(req, name){
  const c = await caches.open(name);
  try{
    const r = await fetch(req);
    if(r.ok) c.put(req, r.clone());
    return r;
  }catch(e){
    const hit = await c.match(req, {ignoreSearch: true});
    if(hit) return hit;
    throw e;
  }
}

// STRIKE ZONE LIVE — service worker (v3: 2台連動モード対応版)
// アプリ本体をキャッシュし、電波の弱い球場でも起動できるようにする。
// MediaPipeのモデル/WASMは初回読み込み時に取得されるため、以降オフラインでも自動認識が使える。
// 2台連動(WebRTC)はSTUNサーバーへの到達性が初回接続時に必要。

const CACHE_VERSION = "strikezone-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isRuntimeCacheableCrossOrigin(url) {
  return (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com" ||
    url.hostname === "cdn.jsdelivr.net" ||        // MediaPipe tasks-vision JS/WASM
    url.hostname === "storage.googleapis.com"      // MediaPipe pose model (.task)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Cross-origin assets (fonts, MediaPipe wasm/model): stale-while-revalidate
  // so first load needs network, later loads work offline.
  if (isRuntimeCacheableCrossOrigin(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then((cache) =>
        cache.match(req).then((cached) => {
          const fetchPromise = fetch(req, { mode: "cors" }).then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // App shell (same-origin): cache-first, network fallback, offline navigation fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        }).catch(() => {
          if (req.mode === "navigate") return caches.match("./index.html");
        });
      })
    );
  }
});

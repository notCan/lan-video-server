const CACHE_NAME = "video-lan-v2";

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll([
        "/",
        "/index.html",
        "/styles.css",
        "/app.js"
      ])
    )
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", e => {
  if (e.request.url.includes("/video")) return;

  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});

const CACHE_NAME = "video-lan-v1";

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll([
        "/",
        "/index.html"
      ])
    )
  );
});

self.addEventListener("fetch", e => {
  if (e.request.url.includes("/video")) return;

  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});

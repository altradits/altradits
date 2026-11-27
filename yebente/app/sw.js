// Ye₿ente service worker: the wallet shell opens with no internet.
// Cache-first for the app shell (start page, manifest, icons, the brand
// font); built assets join the cache on first use. API answers are never
// cached: money screens always read live, and the app shows its own offline
// state. Google Fonts stay network-only and fall back to system fonts
// offline. Scope is /yebente. Bump CACHE when any cached file changes.
const CACHE = "yebente-v4";
const SHELL = [
  "/yebente/",
  "/yebente/manifest.webmanifest",
  "/yebente/icons/icon-192.png",
  "/yebente/icons/icon-512.png",
  "/yebente/fonts/BananaYeti-Extrabold.ttf",
];
self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (ev) => {
  const u = new URL(ev.request.url);
  if (ev.request.method !== "GET" || u.origin !== self.location.origin) return; // same-site reads only
  if (u.pathname.startsWith("/api/")) return; // live data is never cached
  ev.respondWith(
    caches.match(ev.request).then(
      (hit) => hit || fetch(ev.request)
        .then((res) => {
          if (res.ok && u.pathname.startsWith("/yebente/")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(ev.request, copy));
          }
          return res;
        })
        .catch(() => caches.match("/yebente/")),
    ),
  );
});

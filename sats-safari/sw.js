// Sats Safari service worker: the game plays with no internet. Cache-first
// for the game shell; anything else under /sats-safari/ is fetched live and
// kept for next time. Scope is /sats-safari, so the rest of the site is
// untouched. Fonts come from /assets (outside this scope): with no internet
// the game falls back to the device's own fonts.
// Bump CACHE when any cached file changes.
const CACHE = "sats-safari-v2";
const SHELL = [
  "/sats-safari/",
  "/sats-safari/index.html",
  "/sats-safari/style.css",
  "/sats-safari/app.js",
  "/sats-safari/i18n.js",
  "/sats-safari/progress.js",
  "/sats-safari/sound.js",
  "/sats-safari/sats.js",
  "/sats-safari/level1.js",
  "/sats-safari/level2.js",
  "/sats-safari/level3.js",
  "/sats-safari/i18n/en.json",
  "/sats-safari/i18n/sw.json",
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
  if (ev.request.method !== "GET" || u.origin !== self.location.origin) return; // same-site reads only, beacons pass through
  ev.respondWith(
    caches.match(ev.request).then(
      (hit) => hit || fetch(ev.request)
        .then((res) => {
          if (res.ok && u.pathname.startsWith("/sats-safari/")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(ev.request, copy));
          }
          return res;
        })
        .catch(() => caches.match("/sats-safari/")),
    ),
  );
});

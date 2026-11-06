// kTown service worker: the merchant app works with no internet and no SIM.
// Cache-first for the app shell (page, code, QR encoder, fonts, icons, the
// header logo); API calls always go to the network, and the app falls back
// to its saved account and history. Scope is /ktown, so the pay pages are
// untouched. Bump CACHE when any cached file changes.
const CACHE = "ktown-v6";
const SHELL = [
  "/ktown",
  "/ktown/index.html",
  "/ktown/terms.html",
  "/ktown/style.css",
  "/ktown/app.js",
  "/ktown/qrcode-generator-1.4.4.js",
  "/ktown/manifest.webmanifest",
  "/ktown/icons/icon-192.png",
  "/ktown/icons/icon-512.png",
  "/assets/logo.png",
  "/assets/figtree-latin.woff2",
  "/assets/figtree-latin-ext.woff2",
  "/assets/bricolage-grotesque-latin.woff2",
  "/assets/bricolage-grotesque-latin-ext.woff2",
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
          if (res.ok && (u.pathname.startsWith("/ktown/") || u.pathname.startsWith("/assets/"))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(ev.request, copy));
          }
          return res;
        })
        .catch(() => caches.match("/ktown/index.html")),
    ),
  );
});

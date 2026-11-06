// Address Check service worker: the tool works with no internet. Cache-first
// for the tool shell; anything else under /address-check/ is fetched live and
// kept for next time. Scope is /address-check, so the rest of the site is
// untouched. The page carries no outside assets, so offline it looks the same.
// Bump CACHE when any cached file changes.
const CACHE = "address-check-v1";
const SHELL = [
  "/address-check/",
  "/address-check/index.html",
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
          if (res.ok && u.pathname.startsWith("/address-check/")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(ev.request, copy));
          }
          return res;
        })
        .catch(() => caches.match("/address-check/")),
    ),
  );
});

// Opcode Circuit service worker: the game runs with no internet after load.
// Cache first for the app shell. Same origin reads only. Scope is the game
// path, since this file is registered from ./sw.js. Bump CACHE on change.
const CACHE = "opcode-circuit-v1";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./game.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./engine/store.js",
  "./engine/score.js",
  "./engine/achieve.js",
  "./sim/primitives.js",
  "./sim/interpreter.js",
  "./sim/vectors.js",
  "./sim/toychain.js",
  "./sim/lightning.js",
  "./content/chapters.js",
  "./content/puzzles1.js",
  "./content/puzzles2.js",
  "./content/views.js",
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
  if (ev.request.method !== "GET" || u.origin !== self.location.origin) return;
  if (u.pathname.startsWith("/api/")) return; // live data is never cached
  ev.respondWith(
    caches.match(ev.request).then(
      (hit) => hit || fetch(ev.request)
        .then((res) => {
          if (res.ok && u.pathname.startsWith("/opcode-circuit/")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(ev.request, copy));
          }
          return res;
        })
        .catch(() => caches.match("./index.html")),
    ),
  );
});

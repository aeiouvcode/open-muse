/* Open Muse service worker - offline app shell.
   Precaches the shell (HTML, CSS, JS, icons) so the app boots with no
   network. Model calls, tool fetches and engine downloads are never cached
   here: anything cross-origin passes straight through untouched, and the
   engine keeps its own weights cache. VERSION travels with the app cache-bust
   (index.html ?v=) - bump both together on every deploy. */
const VERSION = "202609250100";
const CACHE = "openmuse-shell-" + VERSION;
const SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=" + VERSION,
  "./app.js?v=" + VERSION,
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("openmuse-shell-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", e => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return; // provider calls, tools, engine downloads: straight to network
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then(r => { const c = r.clone(); caches.open(CACHE).then(cc => cc.put("./", c)); return r; })
        .catch(() => caches.match("./"))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: false })
      .then(hit => hit || fetch(e.request).then(r => {
        if (r.ok && SHELL.some(s => u.pathname === new URL(s, location.href).pathname)) {
          const c = r.clone(); caches.open(CACHE).then(cc => cc.put(e.request, c));
        }
        return r;
      }))
  );
});

// Pensieve phone service worker — makes the installed PWA open offline.
//
// Generated at build time by phone/vite.swPlugin.ts: __PRECACHE__ becomes the full
// list of built files and __VERSION__ a hash of them, so every deploy produces a
// byte-different sw.js → the browser installs the new worker and drops the old cache.
//
// Strategy (deliberately tiny — the whole app is one JS + one CSS bundle):
//   • install  — cache every built file up front, so the first offline launch works
//                even for files this session never requested.
//   • navigate — network first (fresh deploys still arrive the moment you're online),
//                falling back to the cached app shell after a short timeout / offline.
//   • assets   — cache first (hashed filenames are immutable).
//   • anything cross-origin (OneDrive / Microsoft login) is never touched.

const VERSION = "__VERSION__";
const CACHE = `pensieve-shell-${VERSION}`;
const PRECACHE = __PRECACHE__;
const SHELL = "/"; // Cloudflare Pages 308s /index.html → /, so cache the shell under "/"
const NAV_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("pensieve-shell-") && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function networkWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), NAV_TIMEOUT_MS);
    fetch(request).then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Every in-app route (incl. /auth/callback) is the same SPA shell.
    event.respondWith(
      networkWithTimeout(request).catch(async () => {
        const cached = await caches.match(SHELL, { cacheName: CACHE });
        return cached || Response.error();
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { cacheName: CACHE, ignoreSearch: true }).then((cached) => cached || fetch(request)),
  );
});

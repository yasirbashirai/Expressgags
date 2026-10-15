/*
 * Express Bags driver app service worker (scope /driver — covers /driver and /driver/*).
 * Caches only the app shell (driver pages, Next static assets, brand icons) so the app opens in a dead
 * zone. API responses are NEVER cached here (personal job data lives in the page's own short-lived cache
 * and is cleared on sign-out). Network-first for pages, cache-first for hashed static assets.
 */
const VERSION = "eb-driver-v1";
const SHELL = ["/driver", "/driver/login", "/brand/express-bags-logo-reversed.png", "/brand/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("eb-driver-") && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API lives on another origin: never touched

  // Hashed build assets and brand images: cache-first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Driver pages: network-first, fall back to the cached shell (job pages fall back to /driver)
  if (url.pathname.startsWith("/driver")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && req.mode === "navigate") caches.open(VERSION).then((c) => c.put(req, res.clone()));
          return res;
        })
        // Only full page loads fall back to the shell; client-side (RSC) requests must fail normally
        .catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("/driver") : Response.error()))),
    );
  }
});

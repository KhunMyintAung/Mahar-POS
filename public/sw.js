const CACHE = "mahar-pos-v8";
// The app's screens and the shop's data, kept so the till opens without the internet. They
// are emptied on sign-out (see src/lib/netMode.ts).
const PAGES = "mahar-pages";
const DATA = "mahar-data";
const STATIC = [
  "/offline.html",
  "/mahar-icon-192.png",
  "/mahar-icon-512.png",
  "/mahar-icon-maskable-512.png",
  "/manifest.webmanifest",
];
// The reads the till needs to ring up a sale: who is signed in, items, phones on the shelf,
// wallets, customers and settings.
const DATA_PATHS = [
  "/api/v1/auth/me",
  "/api/v1/items",
  "/api/v1/serials",
  "/api/v1/wallets",
  "/api/v1/customers",
  "/api/v1/settings",
  "/api/v1/branches",
  "/api/v1/categories",
  "/api/v1/item-meta",
];
// Screens never kept: signing in and out, and the admin's.
const NO_PAGE = ["/login", "/register", "/logout", "/admin", "/auth", "/forgot-password", "/reset-password"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keep = [CACHE, PAGES, DATA];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => !keep.includes(key)).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

/** The till's connection mode, which the page tells the worker (it cannot read the page's
 *  storage): kept in the data cache, so it is forgotten on sign-out like the data. */
const MODE_KEY = "/__mahar-net-mode";
async function tillMode() {
  try {
    const r = await caches.match(MODE_KEY, { cacheName: DATA });
    const m = r ? await r.text() : "online";
    return m === "sync" || m === "offline" ? m : "online";
  } catch {
    return "online";
  }
}
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "net-mode") return;
  const mode = data.mode === "sync" || data.mode === "offline" ? data.mode : "online";
  event.waitUntil(caches.open(DATA).then((cache) => cache.put(MODE_KEY, new Response(mode))));
});

function keep(request, response, cacheName) {
  if (!response.ok) return;
  const clone = response.clone();
  caches.open(cacheName).then((cache) => cache.put(request, clone)).catch(() => {});
}

/** The network first; what it returns is kept, and the kept copy answers when it fails or,
 *  on a weak connection, takes longer than waitMs (the network's answer is still kept). */
async function networkFirst(request, cacheName, waitMs) {
  const network = fetch(request).then((response) => { keep(request, response, cacheName); return response; });
  network.catch(() => {});
  const cachedLater = () => caches.match(request, { cacheName });
  if (!waitMs) {
    try { return await network; } catch (error) { const c = await cachedLater(); if (c) return c; throw error; }
  }
  const slow = new Promise((resolve) => setTimeout(() => resolve("slow"), waitMs));
  try {
    const first = await Promise.race([network, slow]);
    if (first !== "slow") return first;
    const cached = await cachedLater();
    return cached || (await network);
  } catch (error) {
    const cached = await cachedLater();
    if (cached) return cached;
    throw error;
  }
}

/** The kept copy at once (offline mode), refreshed from the network behind it when there is
 *  one; the network only when nothing is kept yet. */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request, { cacheName });
  const network = fetch(request).then((response) => { keep(request, response, cacheName); return response; });
  if (cached) { network.catch(() => {}); return cached; }
  return network;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    // Only a read the page marked (the till is not set to online only) and only the reads
    // the till needs.
    const how = request.headers.get("x-mahar-offline");
    if (how !== "1" && how !== "cache") return;
    if (!DATA_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) return;
    event.respondWith(how === "cache" ? cacheFirst(request, DATA) : networkFirst(request, DATA, 6000));
    return;
  }

  if (request.mode === "navigate") {
    const keepPage = !NO_PAGE.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"));
    event.respondWith((async () => {
      // Online only: the screen comes from the network, and without it the offline notice.
      // Sync later: the network, or the kept screen when it fails or is too slow.
      // Offline: the kept screen at once.
      const mode = keepPage ? await tillMode() : "online";
      const network = fetch(request).then((response) => {
        if (response.ok && keepPage && response.type === "basic" && !response.redirected) {
          const clone = response.clone();
          caches.open(PAGES).then((cache) => cache.put(url.pathname, clone)).catch(() => {});
        }
        return response;
      });
      network.catch(() => {});
      const kept = () => (mode === "online" ? Promise.resolve(undefined) : caches.match(url.pathname, { cacheName: PAGES }));
      const notice = async () => (await caches.match("/offline.html")) || Response.error();
      if (mode === "offline") return (await kept()) || network.catch(notice);
      if (mode === "sync") {
        const slow = new Promise((resolve) => setTimeout(() => resolve("slow"), 6000));
        try {
          const first = await Promise.race([network, slow]);
          if (first !== "slow") return first;
          return (await kept()) || (await network);
        } catch {
          return (await kept()) || notice();
        }
      }
      return network.catch(notice);
    })());
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (
            response.ok &&
            (url.pathname.startsWith("/_next/static/") || STATIC.includes(url.pathname))
          ) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
    )
  );
});

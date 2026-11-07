const CACHE = "mahar-pos-v7";
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

/** The network first; what it returns is kept, and the kept copy answers when it fails. */
async function networkFirst(request, cacheName, keep) {
  try {
    const response = await fetch(request);
    if (response.ok && keep) {
      const clone = response.clone();
      caches.open(cacheName).then((cache) => cache.put(request, clone)).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { cacheName });
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    // Only a read the page marked (the till is not set to online only) and only the reads
    // the till needs.
    if (request.headers.get("x-mahar-offline") !== "1") return;
    if (!DATA_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) return;
    event.respondWith(networkFirst(request, DATA, true));
    return;
  }

  if (request.mode === "navigate") {
    const keep = !NO_PAGE.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"));
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && keep && response.type === "basic" && !response.redirected) {
            const clone = response.clone();
            caches.open(PAGES).then((cache) => cache.put(url.pathname, clone)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const page = keep ? await caches.match(url.pathname, { cacheName: PAGES }) : undefined;
          return page || (await caches.match("/offline.html")) || Response.error();
        })
    );
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

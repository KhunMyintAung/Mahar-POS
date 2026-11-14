// Mahar POS — © maharpos.shop. This service worker is part of a build licensed to its shop.
// Origin signature (do not change): MAHARPOS-ORIGIN::maharpos.shop::a1b9f4c2-e7d8-4a6f-9c31-0f2d6e8b5a74
const CACHE = "mahar-pos-v10";
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
// The reads the till needs to ring up a sale (who is signed in, items, phones on the shelf,
// wallets, customers and settings), and those of the Repairs and Items screens.
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
  "/api/v1/repairs",
  "/api/v1/stock",
];
// The screens kept for use without the internet (src/lib/netMode.ts OFFLINE_PAGES).
const KEPT_PAGES = ["/pos", "/repairs", "/items"];
// Screens that never go to the till offline: signing in and out, and the admin's.
const NO_PAGE = ["/login", "/register", "/logout", "/admin", "/auth", "/forgot-password", "/reset-password"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // mahar-device holds a device shop's screens and engine: kept across app versions.
  const keep = [CACHE, PAGES, DATA, "mahar-device"];
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

// ---- "This device only" shops ------------------------------------------------------------
// The shop's books are in the browser (the device engine), so every screen opens from the
// device, with or without the internet: the screens (HTML and the router's RSC data) and the
// engine's files are kept in DEVICE when the shop is set up (src/lib/device.ts).
const DEVICE = "mahar-device";
const DEVICE_KEY = "/__mahar-device";
// Screens with an id in the address are kept once, with this in place of the id.
const DEVICE_ID = "__device__";
const DEVICE_DYNAMIC = [/^\/customers\/([^/]+)$/, /^\/wallets\/([^/]+)$/];

async function isDevice() {
  try {
    return Boolean(await caches.match(DEVICE_KEY, { cacheName: DEVICE }));
  } catch {
    return false;
  }
}
self.addEventListener("message", (event) => {
  const data = event.data;
  if (data && data.type === "device") {
    event.waitUntil(caches.open(DEVICE).then((cache) => cache.put(DEVICE_KEY, new Response("1"))));
  }
});

/** The kept screen for a path, and the id to put back in it for a screen with an id. */
function deviceKey(pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  for (const re of DEVICE_DYNAMIC) {
    const m = path.match(re);
    if (m) return { key: path.slice(0, path.length - m[1].length) + DEVICE_ID, id: m[1] };
  }
  return { key: path, id: null };
}

async function fromDevice(key, id) {
  const cached = await caches.match(key, { cacheName: DEVICE });
  if (!cached || !id) return cached;
  const text = (await cached.text()).split(DEVICE_ID).join(encodeURIComponent(id));
  return new Response(text, { status: cached.status, headers: cached.headers });
}

async function deviceFetch(event, request, url) {
  // The router asks for a screen's data (RSC) when moving between screens.
  if (request.headers.get("rsc") === "1") {
    // Prefetches ask for parts of a screen the device does not keep; the router manages without.
    if (request.headers.get("next-router-prefetch")) return new Response(null, { status: 204 });
    const { key, id } = deviceKey(url.pathname);
    const kept = await fromDevice("/__rsc" + key, id);
    return kept || fetch(request);
  }
  if (request.mode === "navigate") {
    if (url.pathname.startsWith("/api/")) return fetch(request);
    const { key, id } = deviceKey(url.pathname);
    const kept = await fromDevice(key, id);
    if (kept) return kept;
    try {
      return await fetch(request);
    } catch {
      // Not a kept screen (the app opens at /full-app or /play-app): the dashboard.
      if (url.pathname !== "/" && (await caches.match("/", { cacheName: DEVICE }))) return Response.redirect("/" + startMark(url), 302);
      return (await caches.match("/offline.html")) || Response.error();
    }
  }
  // Which version is current is always asked of the server.
  if (url.pathname === "/device/manifest.json") return fetch(request);
  // The engine and the built files: the kept copy, else the network (and keep it).
  const cached = (await caches.match(request)) || (url.pathname.startsWith("/device/") ? await caches.match(request, { ignoreSearch: true, cacheName: DEVICE }) : undefined);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && (url.pathname.startsWith("/device/") || url.pathname.startsWith("/_next/static/"))) {
    const clone = response.clone();
    caches.open(DEVICE).then((cache) => cache.put(request, clone)).catch(() => {});
  }
  return response;
}

/** The installed apps' start addresses carry on, without the internet too, that the window is
 *  the app (src/lib/installedApp.ts), as the server's redirect does. */
function startMark(url) {
  if (url.pathname === "/full-app") return "?from=pwa";
  if (url.pathname === "/play-app") return "?from=app";
  return "";
}

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

/** The answer for a shop with an account: null lets the request go to the network as is. */
function accountResponse(request, url) {
  if (url.pathname.startsWith("/api/")) {
    // Only a read the page marked (the till is not set to online only) and only the reads
    // the till needs.
    const how = request.headers.get("x-mahar-offline");
    if (how !== "1" && how !== "cache") return null;
    if (!DATA_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) return null;
    return how === "cache" ? cacheFirst(request, DATA) : networkFirst(request, DATA, 6000);
  }

  if (request.mode === "navigate") {
    const keepPage = !NO_PAGE.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"));
    return (async () => {
      // Only the till, Repairs and Items are kept: the other screens need the internet.
      // Online only: the screen comes from the network, and without it the offline notice.
      // Sync later: the network, or the kept till when it fails or is too slow.
      // Offline: the kept till at once.
      const mode = keepPage ? await tillMode() : "online";
      const network = fetch(request).then((response) => {
        if (response.ok && KEPT_PAGES.includes(url.pathname) && response.type === "basic" && !response.redirected) {
          const clone = response.clone();
          caches.open(PAGES).then((cache) => cache.put(url.pathname, clone)).catch(() => {});
        }
        return response;
      });
      network.catch(() => {});
      const kept = () => (mode === "online" || !KEPT_PAGES.includes(url.pathname) ? Promise.resolve(undefined) : caches.match(url.pathname, { cacheName: PAGES }));
      // Without the internet, a screen never kept (the app opens at /full-app or /play-app,
      // then the dashboard) goes to the kept till, the one screen that works offline.
      const notice = async () => {
        if (mode !== "online" && url.pathname !== "/pos" && (await caches.match("/pos", { cacheName: PAGES }))) {
          return Response.redirect("/pos" + startMark(url), 302);
        }
        return (await caches.match("/offline.html")) || Response.error();
      };
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
    })();
  }

  return (
    // Only the built files kept here: never a device shop's kept screens (mahar-device).
    caches.match(request, { cacheName: CACHE }).then(
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
}

// Whether this browser holds a "This device only" shop; known after the first look.
let deviceMode;
isDevice().then((v) => { if (deviceMode === undefined) deviceMode = v; });
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "device") deviceMode = true;
  // The shop moved to an online account: screens come from the server again.
  if (event.data && event.data.type === "device-off") {
    deviceMode = false;
    event.waitUntil(caches.delete(DEVICE));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Keeping the app on the device asks the server itself (src/lib/device.ts).
  if (request.headers.get("x-mahar-fresh")) return;
  if (deviceMode === false) {
    const r = accountResponse(request, url);
    if (r) event.respondWith(r);
    return;
  }
  event.respondWith((async () => {
    if (deviceMode === undefined) deviceMode = await isDevice();
    if (deviceMode) return deviceFetch(event, request, url);
    return (await accountResponse(request, url)) || fetch(request);
  })());
});

// ---- System pop-ups (Web Push) -----------------------------------------------------------
// The shop's notices, sent by the server (src/lib/pushSend.ts) to the devices that turned
// them on in Settings → Account. Shown even with the app's tab closed.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const url = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/";
  event.waitUntil(
    self.registration.showNotification(data.title || "Mahar POS", {
      body: data.body || "",
      icon: "/mahar-icon-192.png",
      data: { url },
    })
  );
});

// A pop-up pressed: the app's window when one is open (moved to that screen), else a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (win) {
      await win.focus();
      if ("navigate" in win && win.url !== url) await win.navigate(url).catch(() => {});
      return;
    }
    await self.clients.openWindow(url);
  })());
});

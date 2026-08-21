/* ScoutComp service worker — app shell, asset caching, and Web Push. */
const STATIC_CACHE = "scoutcomp-static-v3";
const SHELL_CACHE = "scoutcomp-shell-v3";
const APP_SHELL = ["/", "/manifest.webmanifest", "/pwa-192.png", "/pwa-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => Promise.all(APP_SHELL.map((url) => cache.add(new Request(url, { cache: "reload" })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("scoutcomp-") && ![STATIC_CACHE, SHELL_CACHE].includes(key))
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_ASSETS" || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls
    .map((value) => new URL(value, self.location.origin))
    .filter((url) => url.origin === self.location.origin && !url.pathname.startsWith("/api/"))
    .map((url) => url.href);
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => Promise.all(urls.map((url) => cache.add(url).catch(() => undefined)))));
});

/* ---------- Web Push ---------- */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch (_) {
    // ignore malformed payload
  }

  const title = (payload && payload.title) || "ScoutComp";
  const options = {
    body: (payload && payload.body) || "",
    icon: "/pwa-192.png",
    badge: "/pwa-192.png",
    data: payload || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let target = "/";

  if (data.url) {
    try {
      const parsed = new URL(data.url, self.location.origin);
      // only same-origin URLs
      if (parsed.origin === self.location.origin) {
        target = parsed.pathname + parsed.search + parsed.hash;
      }
    } catch (_) {
      // fall through to /
    }
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            if ("navigate" in client) {
              return client.navigate(target).then((navigated) => (
                navigated ? navigated.focus() : self.clients.openWindow(target)
              ));
            }
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      })
  );
});

/* ---------- Fetch ---------- */

const networkFirst = async (request, fallback) => {
  try {
    const response = await fetch(request);
    if (response?.ok) {
      const cache = await caches.open(request.mode === "navigate" ? SHELL_CACHE : STATIC_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (fallback ? await caches.match(fallback) : undefined) || Response.error();
  }
};

const cacheFirst = async (request) => {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response?.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
};

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/"));
    return;
  }

  // Vite filenames contain a content hash and are immutable. Cache-first
  // avoids a network round-trip without risking a stale application shell.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (["script", "style", "image", "font"].includes(request.destination)) {
    event.respondWith(networkFirst(request));
  }
});

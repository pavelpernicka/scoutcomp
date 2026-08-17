/* ScoutComp app shell. API responses are intentionally never cached here:
   they are authenticated, user-specific and must remain fresh. */
const STATIC_CACHE = "scoutcomp-static-v1";
const SHELL_CACHE = "scoutcomp-shell-v1";
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

const networkFirst = async (request, fallback) => {
  try {
    const response = await fetch(request);
    if (response?.ok) {
      const cache = await caches.open(request.mode === "navigate" ? SHELL_CACHE : STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (fallback ? await caches.match(fallback) : undefined) || Response.error();
  }
};

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/"));
    return;
  }

  if (["script", "style", "image", "font"].includes(request.destination)) {
    event.respondWith(networkFirst(request));
  }
});

/* ScoutComp service worker — app shell, asset caching, and Web Push. */
const STATIC_CACHE = "scoutcomp-static-v5";
const SHELL_CACHE = "scoutcomp-shell-v5";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/apple-touch-icon-180.png",
  "/pwa-192.png",
  "/pwa-512.png",
  "/pwa-1024.png",
  "/pwa-maskable-512.png",
  "/pwa-maskable-1024.png",
];

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

const notificationText = (value, limit) => String(value || "")
  .replace(/[\u0000-\u001f\u007f]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, limit);

const sameOriginTarget = (value) => {
  try {
    const parsed = new URL(value || "/", self.location.origin);
    if (parsed.origin === self.location.origin) {
      return parsed.pathname + parsed.search + parsed.hash;
    }
  } catch (_) {
    // ignored: callers fall back to the application root
  }
  return null;
};

const notificationImage = (value) => {
  if (!value) return null;
  try {
    const parsed = new URL(value, self.location.origin);
    const isLocalDevelopment = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (parsed.protocol === "https:" || (parsed.protocol === "http:" && isLocalDevelopment)) {
      return parsed.href;
    }
  } catch (_) {
    // malformed rich media is omitted
  }
  return null;
};

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch (_) {
    // ignore malformed payload
  }

  const title = notificationText(payload && payload.title, 100) || "ScoutComp";
  const body = notificationText(payload && payload.body, 240);
  const target = sameOriginTarget(payload && payload.url) || "/";
  const actionUrls = {};
  const rawActions = Array.isArray(payload && payload.actions) ? payload.actions : [];
  const supportedActionCount = Number.isFinite(self.Notification?.maxActions)
    ? Math.max(0, Math.min(2, self.Notification.maxActions))
    : 2;
  const actions = rawActions.slice(0, supportedActionCount).flatMap((item) => {
    const action = notificationText(item && item.action, 32);
    const actionTitle = notificationText(item && item.title, 32);
    const actionTarget = sameOriginTarget(item && item.url);
    if (!/^[a-z0-9_-]+$/.test(action) || !actionTitle || !actionTarget) return [];
    actionUrls[action] = actionTarget;
    return [{ action, title: actionTitle }];
  });

  const options = {
    body,
    icon: "/pwa-512.png",
    badge: "/pwa-192.png",
    data: { url: target, actionUrls },
  };
  const image = notificationImage(payload && payload.image);
  if (image) options.image = image;
  if (actions.length) options.actions = actions;
  const tag = notificationText(payload && payload.tag, 80);
  if (tag) {
    options.tag = tag;
    options.renotify = true;
  }
  if (Number.isFinite(payload && payload.timestamp) && payload.timestamp >= 0) {
    options.timestamp = payload.timestamp;
  }
  const lang = notificationText(payload && payload.lang, 12);
  if (lang) options.lang = lang;

  event.waitUntil(
    self.registration.showNotification(title, options).catch(() => (
      self.registration.showNotification(title, {
        body,
        icon: "/pwa-512.png",
        badge: "/pwa-192.png",
        data: { url: target, actionUrls: {} },
      })
    ))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const actionTarget = event.action && data.actionUrls && data.actionUrls[event.action];
  const target = sameOriginTarget(actionTarget || data.url) || "/";

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

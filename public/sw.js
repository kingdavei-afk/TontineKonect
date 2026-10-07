const CACHE = "tontine-konect-static-v1";

// On ne met en cache QUE les assets statiques (JS/CSS/images/fonts).
// Les pages HTML/RSC dépendent de la session : jamais de cache, jamais de
// fallback vers une page déjà en cache (risque d'afficher les données d'un autre).
const STATIC_TYPES = ["style", "script", "image", "font"];
const STATIC_PATHS = ["/_next/static", "/icon.svg", "/manifest.webmanifest"];

function isStatic(req) {
  if (req.destination && STATIC_TYPES.includes(req.destination)) return true;
  return STATIC_PATHS.some((p) => new URL(req.url).pathname.startsWith(p));
}

self.addEventListener("install", () => self.skipWaiting());

/* ---------- Notifications push ---------- */

self.addEventListener("push", (event) => {
  let data = { title: "Tontine Konect", body: "", url: "/tontines" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text() || "";
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: "tontine-reminder",
      renotify: true,
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/tontines";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ("focus" in client) {
            if ("navigate" in client) client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  if (!isStatic(req)) {
    // Réseau uniquement pour les pages : toujours la version fraîche et la bonne session.
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    })
  );
});

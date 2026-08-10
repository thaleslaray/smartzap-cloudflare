const CACHE = "smartzap-shell-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["/", "/manifest.webmanifest"])),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    event.request.mode !== "navigate" ||
    url.origin !== self.location.origin
  ) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put("/", response.clone()).catch(() => undefined);
      }
      return response;
    } catch {
      return (await caches.match("/")) || Response.error();
    }
  })());
});

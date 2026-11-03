// CutKit no longer uses a service worker. Devices that installed the old one fetch this file on their next
// visit; it deletes the old caches, removes itself and reloads open pages so they get the current app.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) await caches.delete(k);
      await self.registration.unregister();
      for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url);
    })(),
  );
});

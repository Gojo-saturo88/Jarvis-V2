"use strict";

const CACHE_NAME = "jarvis-2-shell-v4";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./assets/icon.svg",
  "./assets/icon-192.png"
];

/* Install: cache the app shell. */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

/* Activate: remove older JARVIS caches. */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith("jarvis-2-") && key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  /* Pages: network first, cached shell when offline. */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () =>
          (await caches.match(request)) ||
          (await caches.match("./index.html")) ||
          new Response("JARVIS is offline. Connect to the internet and reload the app.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          })
        )
    );
    return;
  }

  /* Assets: serve the cached copy instantly and refresh it in the background,
     so app.js and style.css updates reach users without a manual cache bump. */
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(request).then(cached => {
        const refresh = fetch(request)
          .then(response => {
            if (response && response.ok && response.type === "basic") cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || refresh;
      })
    )
  );
});

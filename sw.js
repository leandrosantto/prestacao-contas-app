// Service worker — deixa o app funcionar offline.
const VERSION = "pc-v3.0.0";
const SHELL = [
  "./", "./index.html", "./extract.js", "./cover.js", "./app.js",
  "./manifest.json", "./logo.png", "./icon-192.png", "./icon-512.png", "./icon-180.png",
  "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
  "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isCode = sameOrigin && /\.(html|js|json)$/.test(url.pathname) || req.mode === "navigate";

  if (isCode) {
    // código do app: rede primeiro (pega atualizações), cai pro cache se offline
    e.respondWith(
      fetch(req).then(r => { caches.open(VERSION).then(c => c.put(req, r.clone())); return r; })
                .catch(() => caches.match(req).then(m => m || caches.match("./index.html")))
    );
  } else {
    // libs pesadas (OCR/wasm/idioma), imagens: cache primeiro (rápido e offline)
    e.respondWith(
      caches.match(req).then(m => m || fetch(req).then(r => {
        if (r && (r.ok || r.type === "opaque")) caches.open(VERSION).then(c => c.put(req, r.clone()));
        return r;
      }))
    );
  }
});

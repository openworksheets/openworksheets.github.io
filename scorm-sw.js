// Service Worker de OpenWorksheets: sirve los recursos de los paquetes SCORM.
//
// Los paquetes SCORM referencian sus archivos con rutas relativas (y muchos
// SCO cargan recursos dinámicamente por JS), así que no basta con blob: URLs.
// La página descomprime el paquete y guarda cada archivo en la Cache API bajo
// claves «<scope>/scorm-run/<token>/<ruta-interna>». Este worker intercepta las
// peticiones del iframe del SCO y las responde desde esa caché.

const CACHE = 'openworksheets-scorm';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.includes('/scorm-run/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(event.request, { ignoreSearch: true });
    if (hit) return hit;
    return new Response('SCORM resource not found: ' + url.pathname, {
      status: 404, headers: { 'Content-Type': 'text/plain' }
    });
  })());
});

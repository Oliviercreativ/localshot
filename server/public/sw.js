// Service worker de l'application LocalShot (PWA) : met en cache l'interface, jamais les captures ni l'API.
const CACHE = 'localshot-shell-v1';
const SHELL = ['/assets/app.css', '/assets/player.css', '/assets/common.js', '/assets/gallery.js', '/assets/viewer.js', '/assets/player.js',
  '/assets/linkopts.js', '/assets/transcript.js', '/assets/comments.js', '/assets/e2e.js', '/assets/pwa.js', '/assets/i18n.js', '/assets/icon.png', '/assets/icon-192.png'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // « Partager vers LocalShot » : les fichiers sont mis de côté, puis la galerie les envoie au serveur.
  if (e.request.method === 'POST' && url.pathname === '/share-target') {
    // Un vrai partage système n'a pas de page d'origine ; un formulaire d'un autre site, si.
    const ref = e.request.referrer;
    if (ref && ref !== 'about:client' && new URL(ref).origin !== location.origin) {
      e.respondWith(Response.redirect('/', 303));
      return;
    }
    e.respondWith((async () => {
      const fd = await e.request.formData();
      const box = await caches.open('localshot-share');
      let i = 0;
      for (const f of fd.getAll('file')) {
        if (f instanceof File) await box.put(`/shared/${Date.now()}-${i++}`, new Response(f, { headers: { 'Content-Type': f.type, 'X-Name': encodeURIComponent(f.name) } }));
      }
      return Response.redirect('/?partage=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Interface : le réseau d'abord (mises à jour immédiates), le cache si le serveur est injoignable.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request)));
    return;
  }
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>LocalShot</title>'
      + '<body style="font-family:system-ui;text-align:center;padding:60px;color:#334155"><h1>Serveur injoignable</h1>'
      + '<p>Vérifiez votre connexion (et Tailscale si votre serveur est privé), puis rechargez.</p></body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
  }
});

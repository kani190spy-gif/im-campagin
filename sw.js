// Network-first for the app shell so updates arrive right away; cache is the offline fallback.
const CACHE = 'imc-v63';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './map.json', './map.jpg', './story.json', './battle.js', './election.js', './command.js', './profile.js', './rewards.js', './elec/us.json', './art/map_farmland.webp', './art/u_tank_light.webp'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // never touch GitHub API or Anki
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});

self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(cs => { for(const c of cs){ if('focus' in c) return c.focus(); } if(self.clients.openWindow) return self.clients.openWindow('./'); })); });

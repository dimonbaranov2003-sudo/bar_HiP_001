/* ХиП Бар: офлайн-кэш. Страницы, скрипты и данные берутся из сети (чтобы новые файлы подхватывались сразу),
   а при отсутствии сети — из кэша. Картинки и шрифты — из кэша, обновляются в фоне. */
var V = 'hip-v1';
var CORE = ['./', 'index.html', 'chai.html', 'bar.html', 'banquet.html', 'inventory.html', 'inventory-bar.html', 'stock.html', 'clean.html',
  'core.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'bg-autumn.jpg', 'bg-bar.jpg', 'bg-chai.jpg', 'bg-banquet-dark.jpg',
  'logo-banquet-wide-light.png', 'logo-banquet-wide.png', 'logo-bar-wide-light.png', 'logo-bar-wide.png', 'logo-chai-wide.png', 'logo-hacho-puri-light.png',
  'sig-wish-dark.png', 'sig-wish-tea.png', 'wide_check_dark.png'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(V).then(function(c){
    return Promise.all(CORE.map(function(u){ return c.add(new Request(u, {cache:'reload'})).catch(function(){}); }));
  }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k !== V; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

function put(req, res){
  if(res && res.ok){ var copy = res.clone(); caches.open(V).then(function(c){ c.put(req, copy); }); }
  return res;
}
function networkFirst(req){
  return fetch(req, {cache:'no-cache'}).then(function(res){ return put(req, res); }).catch(function(){
    return caches.match(req, {ignoreSearch:true}).then(function(r){ return r || caches.match('index.html'); });
  });
}
function staleWhileRevalidate(req){
  return caches.match(req).then(function(hit){
    var net = fetch(req).then(function(res){ return put(req, res); }).catch(function(){ return hit; });
    return hit || net;
  });
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var u = new URL(req.url);
  var same = u.origin === self.location.origin;
  var font = u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
  if(!same && !font) return;                       // api.github.com и всё прочее — напрямую
  if(font){ e.respondWith(staleWhileRevalidate(req)); return; }
  if(/\.(png|jpe?g|webp|svg|ico|woff2?)$/i.test(u.pathname)){ e.respondWith(staleWhileRevalidate(req)); return; }
  e.respondWith(networkFirst(req));                // html, js, json, xlsx
});

const CACHE_NAME = 'gruposwhats-v3';
const BASE = '/GRUPOWHATSS/';
const urlsToCache = [
  BASE,
  BASE + 'index.html',
  BASE + 'styles.css',
  BASE + 'script.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Ignora requisições para Firebase e APIs externas para não quebrar o cache
  if (event.request.url.includes('googleapis.com') || event.request.url.includes('ipapi.co') || event.request.url.includes('promisse.com.br')) {
    return;
  }
  
  // Estratégia Network First (Tenta pegar da rede, se falhar pega do cache)
  event.respondWith(
    fetch(event.request).then(response => {
      // Se a resposta for válida, atualiza o cache e retorna
      if (response && response.status === 200 && response.type === 'basic') {
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
      }
      return response;
    }).catch(() => {
      // Se a rede falhar, busca no cache
      return caches.match(event.request);
    })
  );
});

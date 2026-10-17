/* Service Worker: guarda TODOS os ficheiros da app na primeira visita
   e serve-os da cache quando não há internet.
   Todos os caminhos são relativos → funcionam num subcaminho (GitHub Pages). */

const CACHE = 'carteira-v5';

const FICHEIROS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './icons/apple-touch-icon-152.png',
  './icons/apple-touch-icon-120.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

/* Instalação: descarrega tudo para a cache */
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FICHEIROS))
      .then(() => self.skipWaiting())
  );
});

/* Activação: apaga caches de versões antigas */
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(
        chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

/* Pedidos: primeiro a cache, depois a rede (e guarda o que a rede devolver) */
self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  if (new URL(pedido.url).origin !== self.location.origin) return;

  evento.respondWith(
    caches.match(pedido, { ignoreSearch: true }).then((guardado) => {
      if (guardado) return guardado;

      return fetch(pedido).then((resposta) => {
        if (resposta.ok) {
          const copia = resposta.clone();
          caches.open(CACHE).then((cache) => cache.put(pedido, copia));
        }
        return resposta;
      }).catch(() => {
        /* Sem internet: para navegações devolve a app, senão a cache do ficheiro */
        if (pedido.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return caches.match(pedido, { ignoreSearch: true });
      });
    })
  );
});

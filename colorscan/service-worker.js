/* ==========================================================================
 * ColorScan Auto — service worker
 * --------------------------------------------------------------------------
 * Estratégia de cache:
 *   • Instalação: pré-cacheia TODO o app shell + banco de cores + cartão de
 *     referência (o app inteiro funciona offline após a primeira visita).
 *   • Navegação/estáticos: cache-first (o app nunca depende de rede).
 *   • Atualização: trocar VERSAO invalida o cache antigo na ativação.
 * Nenhuma requisição sai para domínios externos — não há CDN nem APIs.
 * ========================================================================== */

const VERSAO = 'colorscan-v1';

const ARQUIVOS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './database/colors.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/reference-card.pdf'
];

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(VERSAO).then(cache => cache.addAll(ARQUIVOS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(chaves => Promise.all(
        chaves.filter(c => c !== VERSAO).map(c => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', evento => {
  // Só tratamos GET da mesma origem; qualquer outra coisa segue direto.
  const url = new URL(evento.request.url);
  if (evento.request.method !== 'GET' || url.origin !== self.location.origin) return;

  evento.respondWith(
    caches.match(evento.request, { ignoreSearch: true }).then(emCache => {
      if (emCache) return emCache;
      // Não estava no pré-cache (ex.: nova versão de um arquivo): busca na
      // rede e guarda para a próxima vez.
      return fetch(evento.request).then(resposta => {
        if (resposta.ok) {
          const copia = resposta.clone();
          caches.open(VERSAO).then(cache => cache.put(evento.request, copia));
        }
        return resposta;
      }).catch(() =>
        // Offline e fora do cache: para navegação, devolve o shell.
        evento.request.mode === 'navigate' ? caches.match('./index.html') : undefined
      );
    })
  );
});

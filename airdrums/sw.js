/* ==========================================================================
   AIRDRUMS AI — SERVICE WORKER
   --------------------------------------------------------------------------
   Único arquivo companheiro do index.html, e por imposição dos navegadores:
   um service worker precisa ser um .js servido pelo mesmo domínio — não pode
   viver dentro do HTML. Ele existe só para o modo offline.

   Estratégia:
     · Documento (navegação): rede primeiro, cache como rede de segurança.
       Assim uma versão nova do app chega assim que houver internet.
     · Recursos do MediaPipe (CDN): cache primeiro. São imutáveis (versão
       fixada na URL) e é o que garante o funcionamento sem internet.
     · Nada é enviado para lugar nenhum: o worker só lê e grava no cache local.
   ========================================================================== */

const CACHE = 'airdrums-v1';

/* Arquivos do próprio app. */
const CASCA = [
  './',
  './index.html',
  './sw.js'
];

/* Origens externas cacheadas sob demanda (modelo e runtime do MediaPipe). */
const EXTERNOS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/',
  'https://storage.googleapis.com/mediapipe-models/'
];

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CASCA))
      .catch(() => {})            // um recurso ausente não pode abortar a instalação
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(chaves => Promise.all(chaves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* --------------------------------------------------------------------------
   Manifesto e ícone sintetizados.

   O aplicativo é um arquivo só; para instalar, porém, o navegador precisa
   buscar um manifesto e um ícone por URL. Como o service worker já é
   obrigatório para o modo offline, ele também responde por esses dois
   endereços — sem que nenhum arquivo extra exista no disco.
   -------------------------------------------------------------------------- */

const ICONE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#35E0C8"/><stop offset="1" stop-color="#2A7BF6"/></linearGradient></defs>
<rect width="512" height="512" fill="#07080c"/>
<g transform="translate(256 256) scale(.8) translate(-256 -256)">
<rect x="16" y="16" width="480" height="480" rx="112" fill="#0b0d14" stroke="url(#g1)" stroke-width="10"/>
<ellipse cx="256" cy="330" rx="128" ry="46" fill="none" stroke="url(#g1)" stroke-width="14"/>
<path d="M128 330v56c0 25 57 46 128 46s128-21 128-46v-56" fill="none" stroke="url(#g1)" stroke-width="14" stroke-linecap="round"/>
<ellipse cx="136" cy="196" rx="86" ry="20" fill="none" stroke="#EDEFF5" stroke-width="12"/>
<ellipse cx="376" cy="160" rx="72" ry="17" fill="none" stroke="#EDEFF5" stroke-width="12"/>
<path d="M136 196v40M376 160v40" stroke="#EDEFF5" stroke-width="10" stroke-linecap="round" opacity=".6"/>
<circle cx="256" cy="118" r="16" fill="#35E0C8"/>
<path d="M198 118a58 58 0 0 1 116 0M170 118a86 86 0 0 1 172 0" fill="none" stroke="#35E0C8" stroke-width="10" stroke-linecap="round" opacity=".65"/>
</g></svg>`;

const MANIFESTO = {
  name: 'AirDrums AI',
  short_name: 'AirDrums',
  description: 'Bateria virtual tocada no ar pela câmera. Processamento 100% local.',
  lang: 'pt-BR', dir: 'ltr',
  start_url: './', scope: './', id: './',
  display: 'fullscreen',
  display_override: ['fullscreen', 'standalone'],
  orientation: 'any',
  background_color: '#07080c',
  theme_color: '#07080c',
  categories: ['music', 'entertainment', 'education'],
  icons: [
    { src: './icone.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    { src: './icone.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
  ]
};

/** Resposta sintética para os endereços virtuais do PWA, ou null. */
function respostaSintetica(caminho){
  if(caminho.endsWith('/manifest.json')){
    return new Response(JSON.stringify(MANIFESTO), {
      headers:{ 'Content-Type':'application/manifest+json', 'Cache-Control':'no-cache' }
    });
  }
  if(caminho.endsWith('/icone.svg')){
    return new Response(ICONE_SVG, {
      headers:{ 'Content-Type':'image/svg+xml', 'Cache-Control':'max-age=604800' }
    });
  }
  return null;
}

self.addEventListener('fetch', evento => {
  const req = evento.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  const externo = EXTERNOS.some(p => req.url.startsWith(p));

  /* --- Endereços virtuais (manifesto e ícone) --------------------------- */
  if(url.origin === self.location.origin){
    const sintetica = respostaSintetica(url.pathname);
    if(sintetica){ evento.respondWith(sintetica); return; }
  }

  /* --- Navegação: rede primeiro, cache depois --------------------------- */
  if(req.mode === 'navigate'){
    evento.respondWith(
      fetch(req)
        .then(res => {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copia)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  /* --- MediaPipe e mesma origem: cache primeiro ------------------------- */
  if(externo || url.origin === self.location.origin){
    evento.respondWith(
      caches.match(req).then(cacheado => {
        if(cacheado) return cacheado;
        return fetch(req).then(res => {
          // Só guardamos respostas utilizáveis (status 200, não opacas).
          if(res && res.status === 200 && res.type !== 'opaque'){
            const copia = res.clone();
            caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
          }
          return res;
        });
      })
    );
  }
});

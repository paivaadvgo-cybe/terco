/* Service worker do Santo Terço.
   Estratégia: cache primeiro. Depois do primeiro carregamento, o aplicativo
   funciona 100% sem internet. Nada é enviado para servidor nenhum. */

/* Mudar este nome a cada versão publicada: é o que faz o aparelho de quem já
   instalou buscar o arquivo novo em vez de servir o antigo do cache. */
const CACHE = "santo-terco-v2";

const RECURSOS = [
  "./",
  "./index.html",
  "./manifest.json",
  /* Fase 4: pequeno e opcional. Se não existir, o cache o ignora sem
     reclamar, e o aplicativo continua completo sem ele. O modelo de
     reconhecimento NÃO entra aqui: ele só é baixado com consentimento. */
  "./escuta-local.js",
  "./icones/icone-192.png",
  "./icones/icone-512.png",
  "./icones/icone-mascara-512.png"
];

self.addEventListener("install", function(evento){
  evento.waitUntil(
    caches.open(CACHE).then(function(cache){
      // addAll falha inteiro se um único recurso faltar; guardamos um a um
      // para que a ausência de um ícone nunca impeça o aplicativo de rezar.
      return Promise.all(RECURSOS.map(function(recurso){
        return cache.add(recurso).catch(function(){ return null; });
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(evento){
  evento.waitUntil(
    caches.keys().then(function(chaves){
      return Promise.all(chaves.map(function(chave){
        if (chave !== CACHE) return caches.delete(chave);
        return null;
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(evento){
  const requisicao = evento.request;
  if (requisicao.method !== "GET") return;

  const url = new URL(requisicao.url);
  if (url.origin !== self.location.origin) return;   // nada de terceiros

  evento.respondWith(
    caches.match(requisicao).then(function(guardado){
      if (guardado) return guardado;
      return fetch(requisicao).then(function(resposta){
        if (resposta && resposta.status === 200 && resposta.type === "basic"){
          const copia = resposta.clone();
          caches.open(CACHE).then(function(cache){ cache.put(requisicao, copia); });
        }
        return resposta;
      }).catch(function(){
        // Offline e sem cópia: devolve o aplicativo, que é autossuficiente.
        return caches.match("./index.html");
      });
    })
  );
});

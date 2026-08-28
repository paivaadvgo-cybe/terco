/**
 * Service worker do simulador.
 *
 * Existe por duas razões, nesta ordem: o simulador precisa funcionar sem
 * internet, e um service worker é o único jeito de um site fazer isso; e sem
 * ele o navegador não oferece a instalação na tela inicial.
 *
 * O escopo é `/simulador/`. O site hospeda outros aplicativos, com caches
 * próprios, e este worker não toca em nada fora do seu diretório — nem nas
 * requisições, nem na hora de limpar caches antigos.
 *
 * **Sobre a atualização.** Ele não chama `skipWaiting` sozinho. O aplicativo é
 * feito de trinta e sete módulos que se importam entre si; assumir o controle
 * no meio de uma sessão serviria módulos novos a uma página que já carregou os
 * antigos, e a incompatibilidade apareceria como um erro sem sentido no meio
 * de uma simulação. Em vez disso o worker espera, a página avisa que há versão
 * nova, e quem estiver usando decide quando recarregar.
 */

const VERSAO = 'simulador-goiasfomento-v1';
const BASE = new URL('./', self.location).pathname;

/**
 * A casca inteira do aplicativo.
 *
 * A lista é escrita à mão porque não há etapa de compilação que a gere — e é
 * conferida por teste contra os arquivos em disco, justamente porque
 * esquecer um módulo aqui não quebra nada online e quebra tudo offline, que é
 * o pior lugar para descobrir.
 */
const CASCA = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './icones/icone-192.png',
  './icones/icone-512.png',
  './icones/icone-mascara-512.png',
  './js/app.js',
  './js/data/parametros.js',
  './js/data/parametros-vigentes.js',
  './js/encargos/fampe.js',
  './js/encargos/fgi.js',
  './js/encargos/garantias.js',
  './js/encargos/iof.js',
  './js/encargos/tac.js',
  './js/engine/arredondamento.js',
  './js/engine/calendario.js',
  './js/engine/cronograma.js',
  './js/engine/erros.js',
  './js/engine/juros.js',
  './js/engine/price.js',
  './js/engine/sac.js',
  './js/engine/tir.js',
  './js/indexadores/indexadores.js',
  './js/indexadores/inpc.js',
  './js/indexadores/selic.js',
  './js/indexadores/tr.js',
  './js/produtos/fco.js',
  './js/produtos/finep.js',
  './js/produtos/fungetur.js',
  './js/produtos/giro.js',
  './js/produtos/investimento.js',
  './js/produtos/microcredito.js',
  './js/produtos/produtos.js',
  './js/produtos/rural.js',
  './js/produtos/transportes.js',
  './js/storage/simulacoes.js',
  './js/ui/comparador.js',
  './js/ui/cronograma.js',
  './js/ui/csv.js',
  './js/ui/formatar.js',
  './js/ui/formulario.js',
  './js/ui/relatorio.js',
  './js/ui/resultado.js',
];

self.addEventListener('install', (evento) => {
  // Sem `catch` por recurso: se um módulo da casca não baixar, a instalação
  // deve falhar. Um cache pela metade é pior que cache nenhum — o aplicativo
  // abriria offline e quebraria na primeira importação que faltasse.
  evento.waitUntil(caches.open(VERSAO).then((cache) => cache.addAll(CASCA)));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      // Só os caches deste aplicativo. `caches.keys()` enxerga o domínio
      // inteiro, e os outros aplicativos publicados aqui têm os seus.
      .then((chaves) => Promise.all(chaves
        .filter((c) => c.startsWith('simulador-goiasfomento-') && c !== VERSAO)
        .map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

/** A página pede o controle quando quem está usando aceitou atualizar. */
self.addEventListener('message', (evento) => {
  if (evento.data === 'assumir-controle') self.skipWaiting();
});

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== 'GET') return;

  const url = new URL(requisicao.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  // Navegação: rede primeiro, para que uma versão nova chegue assim que
  // houver internet; o cache é a rede de segurança.
  if (requisicao.mode === 'navigate') {
    evento.respondWith(
      fetch(requisicao)
        .then((resposta) => {
          const copia = resposta.clone();
          caches.open(VERSAO).then((c) => c.put(BASE + 'index.html', copia)).catch(() => {});
          return resposta;
        })
        .catch(() => caches.match(BASE + 'index.html').then((r) => r || caches.match(BASE))),
    );
    return;
  }

  // Módulos, estilo e ícones: cache primeiro. São exatamente o que precisa
  // estar disponível sem rede, e mudam só quando a versão do cache muda.
  evento.respondWith(
    caches.match(requisicao).then((cacheado) => cacheado || fetch(requisicao).then((resposta) => {
      if (resposta && resposta.status === 200 && resposta.type === 'basic') {
        const copia = resposta.clone();
        caches.open(VERSAO).then((c) => c.put(requisicao, copia)).catch(() => {});
      }
      return resposta;
    })),
  );
});

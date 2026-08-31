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

/*
 * Nome do cache. É o resumo do conteúdo da casca, gerado por
 * `ferramentas/versionar_casca.mjs`, e não um número escolhido à mão.
 *
 * Os arquivos abaixo são servidos cache primeiro: enquanto este nome não muda,
 * o navegador continua entregando o que guardou, e uma versão publicada não
 * chega a quem já visitou o site. Depender de alguém lembrar de trocar um
 * `v1` por `v2` já falhou — duas entregas seguidas mudaram estilos e módulos
 * mantendo `v1`, e quem tinha o simulador aberto continuou vendo a tela
 * antiga. Nada quebrava; a tela simplesmente não mudava. Agora qualquer
 * arquivo alterado muda este nome, e o teste em `tests/pwa.test.js` acusa a
 * diferença antes de a publicação sair.
 */
const VERSAO = 'simulador-goiasfomento-e6d8a42ccd53';
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

/** Os endereços da casca, resolvidos uma vez. */
const ENDERECOS_DA_CASCA = new Set(CASCA.map((c) => new URL(c, self.location).pathname));

/** Este caminho é um arquivo da casca? */
function daCasca(caminho) {
  return ENDERECOS_DA_CASCA.has(caminho);
}

self.addEventListener('install', (evento) => {
  // `cache: 'reload'` obriga cada arquivo a vir da rede.
  //
  // Sem isso a instalação é atendida pelo cache HTTP do navegador, e o cache
  // novo nasce cheio dos arquivos velhos — que o worker então passa a servir
  // para sempre, porque daqui em diante ele responde do próprio cache. É o
  // pior formato de defeito: nada quebra, nada avisa, e a versão publicada
  // simplesmente não chega. O GitHub Pages serve com dez minutos de validade,
  // de modo que republicar e atualizar dentro desse intervalo bastava para
  // congelar a versão antiga no aparelho de quem atualizou.
  //
  // Sem `catch` por recurso: se um módulo da casca não baixar, a instalação
  // deve falhar. Um cache pela metade é pior que cache nenhum — o aplicativo
  // abriria offline e quebraria na primeira importação que faltasse.
  evento.waitUntil(caches.open(VERSAO).then(
    (cache) => cache.addAll(CASCA.map((caminho) => new Request(caminho, { cache: 'reload' }))),
  ));
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

  // Só a casca é guardada, e só ela é servida do cache.
  //
  // Guardar tudo que passasse por aqui parecia generoso e era armadilha: o
  // painel de administração fica de fora da casca de propósito, e portanto
  // fora do resumo que dá nome ao cache. Guardado assim mesmo, ele seria
  // servido do cache para sempre, e uma correção no painel nunca chegaria a
  // quem já o tivesse aberto — sem nada mudar de nome para forçar a troca.
  // O que não é da casca vai para a rede, como qualquer página comum.
  if (!daCasca(url.pathname)) return;

  // Cache primeiro: é exatamente o que precisa estar disponível sem rede, e
  // muda quando a versão do cache muda — isto é, sempre que qualquer arquivo
  // da casca mudar.
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

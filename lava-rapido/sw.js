/**
 * Service worker do Lava-Rápido Lite.
 *
 * Existe por duas razões, nesta ordem: o aplicativo precisa abrir sem internet
 * — é usado na calçada, com o sinal que houver —, e sem um service worker o
 * navegador não oferece a instalação na tela inicial.
 *
 * O escopo é `/lava-rapido/`. O mesmo domínio hospeda outros aplicativos, com
 * caches próprios; este worker não toca em nada fora do seu diretório, nem nas
 * requisições, nem na hora de limpar caches antigos.
 *
 * **Sobre a atualização.** Ele não chama `skipWaiting` sozinho. O aplicativo é
 * feito de dezenas de módulos que se importam entre si; assumir o controle no
 * meio de uma sessão serviria módulos novos a uma página que já carregou os
 * antigos, e a incompatibilidade apareceria como erro sem sentido no meio de um
 * atendimento. Em vez disso o worker espera, a página avisa que há versão nova,
 * e quem estiver usando decide quando recarregar.
 *
 * **Nada de dado passa por aqui.** Lavagens, valores e fotos vivem no IndexedDB,
 * que o worker não toca. Ele guarda apenas os arquivos do aplicativo.
 */

/*
 * Nome do cache: o resumo do conteúdo da casca, gerado por
 * `ferramentas/versionar_casca.mjs`, e não um número escolhido à mão.
 *
 * Os arquivos da casca são servidos cache primeiro. Enquanto este nome não
 * muda, o navegador continua entregando o que guardou — e uma versão publicada
 * não chega a quem já abriu o aplicativo. Depender de alguém lembrar de trocar
 * `v1` por `v2` é o tipo de disciplina que falha em silêncio: nada quebra, a
 * tela simplesmente não muda. Com o resumo, qualquer arquivo alterado muda o
 * nome do cache, e o teste em `tests/pwa.test.js` acusa a diferença antes da
 * publicação sair.
 */
const VERSAO = 'lava-rapido-lite-791e4afa9724';
const BASE = new URL('./', self.location).pathname;

/**
 * A casca inteira do aplicativo.
 *
 * Escrita à mão porque não há compilação que a gere, e conferida por teste
 * contra os arquivos em disco — esquecer um módulo aqui não quebra nada com
 * internet e quebra tudo sem ela, que é o pior lugar para descobrir.
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
  './js/armazenamento/esquema.js',
  './js/armazenamento/indexeddb.js',
  './js/armazenamento/memoria.js',
  './js/armazenamento/pin.js',
  './js/armazenamento/storage.js',
  './js/dominio/caixa.js',
  './js/dominio/datas.js',
  './js/dominio/demonstracao.js',
  './js/dominio/lavagem.js',
  './js/dominio/placa.js',
  './js/dominio/precos.js',
  './js/dominio/servicos.js',
  './js/dominio/veiculos.js',
  './js/servicos/consulta-veiculo.js',
  './js/servicos/foto.js',
  './js/servicos/reconhecimento-placa.js',
  './js/ui/avisos.js',
  './js/ui/csv.js',
  './js/ui/detalhe-lavagem.js',
  './js/ui/elementos.js',
  './js/ui/formatar.js',
  './js/ui/lavagem-cartao.js',
  './js/ui/navegacao.js',
  './js/ui/receber.js',
  './js/ui/telas/caixa.js',
  './js/ui/telas/configuracoes.js',
  './js/ui/telas/despesas.js',
  './js/ui/telas/fechamento.js',
  './js/ui/telas/inicio.js',
  './js/ui/telas/lavagens.js',
  './js/ui/telas/nova-lavagem.js',
  './js/ui/telas/pendentes.js',
  './js/ui/telas/relatorios.js',
];

/** Os endereços da casca, resolvidos uma vez. */
const ENDERECOS_DA_CASCA = new Set(CASCA.map((c) => new URL(c, self.location).pathname));

const daCasca = (caminho) => ENDERECOS_DA_CASCA.has(caminho);

self.addEventListener('install', (evento) => {
  // `cache: 'reload'` obriga cada arquivo a vir da rede.
  //
  // Sem isso a instalação é atendida pelo cache HTTP do navegador, e o cache
  // novo nasce cheio dos arquivos velhos — que o worker passa a servir para
  // sempre. Nada quebra, nada avisa, e a versão publicada não chega.
  //
  // Sem `catch` por recurso: se um módulo não baixar, a instalação deve falhar.
  // Cache pela metade é pior que cache nenhum — o aplicativo abriria sem
  // internet e quebraria na primeira importação que faltasse.
  evento.waitUntil(caches.open(VERSAO).then(
    (cache) => cache.addAll(CASCA.map((caminho) => new Request(caminho, { cache: 'reload' }))),
  ));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      // Só os caches deste aplicativo: o domínio hospeda outros, com os seus.
      .then((chaves) => Promise.all(chaves
        .filter((c) => c.startsWith('lava-rapido-lite-') && c !== VERSAO)
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

  // Navegação: rede primeiro, para que uma versão nova chegue assim que houver
  // internet; o cache é a rede de segurança, e é ele que faz o aplicativo abrir
  // no meio da rua sem sinal.
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

  // O que não é da casca vai para a rede, sem passar pelo cache: guardar tudo
  // que passasse por aqui congelaria arquivos que não têm versão no nome.
  if (!daCasca(url.pathname)) return;

  // Cache primeiro: é exatamente o que precisa existir sem rede, e muda de nome
  // sempre que qualquer arquivo da casca muda.
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

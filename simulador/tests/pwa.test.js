/**
 * Testes do PWA.
 *
 * O que se verifica aqui não é o comportamento do navegador — é a coerência
 * entre três arquivos que ninguém compila e que, por isso, saem de sincronia
 * em silêncio: a lista de arquivos do service worker, os arquivos que existem
 * em disco, e os ícones que o manifesto promete.
 *
 * O erro que este arquivo existe para impedir é sempre o mesmo: acrescenta-se
 * um módulo, esquece-se de listá-lo na casca, e nada acontece — online tudo
 * funciona, porque o navegador busca o que falta. A falha só aparece sem
 * internet, que é o pior lugar possível para descobri-la.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { versaoDeclarada, versaoEsperada, FORA_DO_RESUMO, cascaDe, resumoDaCasca } from '../ferramentas/versionar_casca.mjs';

const raiz = new URL('..', import.meta.url).pathname;
const ler = (relativo) => fs.readFileSync(path.join(raiz, relativo), 'utf8');

/** Diretórios que não vão para o navegador. */
const FORA_DO_APLICATIVO = ['tests', 'documentacao', 'dados', 'ferramentas', 'referencia', 'node_modules'];
/** Arquivos servidos, mas nunca cacheados por si mesmos. */
const NAO_CACHEAVEIS = ['sw.js', 'package.json'];

/**
 * O painel de administração fica de fora da casca de propósito.
 *
 * Ele é usado por uma pessoa, algumas vezes por ano, e sempre com internet —
 * publicar exige rede. Guardá-lo faria todo visitante do simulador baixar uma
 * página que nunca vai abrir. A lista é explícita, e o teste seguinte exige
 * que cada arquivo dela exista: assim a exceção não vira o lugar onde módulos
 * esquecidos se escondem.
 */
const FORA_DA_CASCA = [
  './admin.html',
  './js/admin/esquema.js',
  './js/admin/validar.js',
  './js/admin/diferenca.js',
  './js/admin/serializar.js',
  './js/admin/acesso.js',
  './js/admin/painel.js',
  './css/admin.css',
];

function arquivosDoAplicativo(diretorio = '', encontrados = []) {
  for (const entrada of fs.readdirSync(path.join(raiz, diretorio), { withFileTypes: true })) {
    const relativo = path.posix.join(diretorio, entrada.name);
    if (entrada.isDirectory()) {
      if (!FORA_DO_APLICATIVO.includes(entrada.name)) arquivosDoAplicativo(relativo, encontrados);
    } else if (/\.(js|css|png|json|html)$/.test(entrada.name) && !NAO_CACHEAVEIS.includes(entrada.name)) {
      encontrados.push(`./${relativo}`);
    }
  }
  return encontrados;
}

function cascaDoServiceWorker() {
  const sw = ler('sw.js');
  const bloco = sw.slice(sw.indexOf('const CASCA = ['), sw.indexOf('];', sw.indexOf('const CASCA = [')));
  return [...bloco.matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);
}

test('a casca do service worker cobre todos os arquivos do aplicativo', () => {
  const casca = cascaDoServiceWorker();
  const emDisco = arquivosDoAplicativo();

  const ausentes = emDisco.filter((a) => !casca.includes(a) && !FORA_DA_CASCA.includes(a));
  assert.deepEqual(ausentes, [],
    'estes arquivos existem mas não seriam guardados para uso sem internet');

  // E o contrário: uma entrada que aponta para um arquivo inexistente faz a
  // instalação inteira do worker falhar, porque `addAll` é tudo ou nada.
  const fantasmas = casca
    .filter((a) => a !== './')
    .filter((a) => !fs.existsSync(path.join(raiz, a)));
  assert.deepEqual(fantasmas, [], 'a casca lista arquivos que não existem');
});

test('o que ficou de fora da casca existe, e não é o aplicativo se escondendo', () => {
  for (const arquivo of FORA_DA_CASCA) {
    assert.ok(fs.existsSync(path.join(raiz, arquivo)),
      `${arquivo} está dispensado da casca mas não existe; ou foi removido, ou a lista mente`);
  }
  // E o inverso: nada da lista pode estar na casca, ou a dispensa seria falsa.
  const casca = cascaDoServiceWorker();
  const contradicoes = FORA_DA_CASCA.filter((a) => casca.includes(a));
  assert.deepEqual(contradicoes, [], 'listados como dispensados e mesmo assim guardados');
});

test('a casca inclui a raiz e o documento, que são endereços distintos', () => {
  const casca = cascaDoServiceWorker();
  // Abrir `/simulador/` e `/simulador/index.html` são requisições diferentes;
  // guardar só uma delas deixa a outra sem resposta offline.
  assert.ok(casca.includes('./'), 'falta a raiz do diretório');
  assert.ok(casca.includes('./index.html'), 'falta o documento');
  assert.ok(casca.includes('./manifest.json'), 'falta o manifesto');
});

test('o service worker não assume o controle sozinho', () => {
  const sw = ler('sw.js');
  // `skipWaiting` só pode acontecer a pedido da página. Chamá-lo na instalação
  // serviria módulos novos a uma sessão que já carregou os antigos.
  const naInstalacao = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
  assert.ok(!naInstalacao.includes('skipWaiting'), 'skipWaiting não pode estar na instalação');
  assert.ok(sw.includes("evento.data === 'assumir-controle'"), 'falta o pedido vindo da página');
});

test('o service worker só limpa os caches deste aplicativo', () => {
  // O mesmo domínio hospeda outros aplicativos, com caches próprios. Apagar
  // tudo derrubaria o modo offline deles.
  const sw = ler('sw.js');
  assert.ok(sw.includes("startsWith('simulador-goiasfomento-')"),
    'a limpeza precisa filtrar pelo prefixo deste aplicativo');
});

test('o service worker ignora o que está fora do seu diretório', () => {
  const sw = ler('sw.js');
  assert.ok(sw.includes('url.origin !== self.location.origin'), 'falta a guarda de origem');
  assert.ok(sw.includes('!url.pathname.startsWith(BASE)'), 'falta a guarda de caminho');
});

test('o manifesto tem o que os navegadores exigem para instalar', () => {
  const manifesto = JSON.parse(ler('manifest.json'));
  for (const campo of ['name', 'short_name', 'start_url', 'scope', 'display', 'icons']) {
    assert.ok(manifesto[campo], `falta ${campo}`);
  }
  assert.ok(manifesto.short_name.length <= 12, 'o nome curto é o que cabe sob o ícone');
  assert.equal(manifesto.lang, 'pt-BR');
  assert.ok(['standalone', 'fullscreen', 'minimal-ui'].includes(manifesto.display),
    'para instalar, o display não pode ser browser');
});

test('os ícones prometidos existem, e há um mascarável', () => {
  const manifesto = JSON.parse(ler('manifest.json'));
  const tamanhos = new Set();
  for (const icone of manifesto.icons) {
    const arquivo = path.join(raiz, icone.src);
    assert.ok(fs.existsSync(arquivo), `o manifesto promete ${icone.src}, que não existe`);
    assert.ok(fs.statSync(arquivo).size > 500, `${icone.src} está pequeno demais para ser um ícone`);
    tamanhos.add(icone.sizes);
  }
  // 192 para a tela inicial, 512 para a tela de abertura e as lojas.
  assert.ok(tamanhos.has('192x192') && tamanhos.has('512x512'));
  assert.ok(manifesto.icons.some((i) => i.purpose === 'maskable'),
    'sem um ícone mascarável o Android recorta o desenho em cima do conteúdo');
});

test('a página aponta para o manifesto e para o ícone do iPhone', () => {
  const html = ler('index.html');
  assert.match(html, /<link rel="manifest" href="manifest\.json">/);
  // O iOS ignora o manifesto para o ícone da tela inicial.
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /name="theme-color"/);
});

test('a versão do cache acompanha o conteúdo da casca', () => {
  // O defeito que este teste existe para impedir já aconteceu: duas entregas
  // seguidas mudaram estilos e módulos mantendo `simulador-goiasfomento-v1`.
  // Como os módulos são servidos cache primeiro, quem já tinha visitado o site
  // continuou recebendo os arquivos velhos — o `index.html` atualizava, e todo
  // o resto não. Nada quebrava; a tela simplesmente não mudava, e não havia
  // erro nenhum apontando para a causa.
  const texto = ler('sw.js');
  assert.equal(versaoDeclarada(texto), versaoEsperada(raiz, texto),
    'algum arquivo da casca mudou sem a versão do cache mudar junto. '
    + 'Rode `node ferramentas/versionar_casca.mjs --gravar`.');
});

test('a instalação busca a casca da rede, e não do cache do navegador', () => {
  // Defeito real, e do tipo que não avisa: `cache.addAll` faz busca comum, que
  // o cache HTTP do navegador atende. O cache novo nascia cheio dos arquivos
  // velhos, e o worker passava a servi-los para sempre — nada quebrava, e a
  // versão publicada simplesmente não chegava. Medido num navegador: com a
  // busca comum, o CSS guardado sob o nome novo continuava sendo o antigo.
  const sw = ler('sw.js');
  const instalacao = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
  // Sem os comentários: a primeira versão deste teste passava porque casava
  // com o próprio comentário que explica a correção, e continuava verde depois
  // de eu desfazer a correção no código.
  const codigo = instalacao.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.match(codigo, /addAll\([\s\S]*?new Request\([\s\S]*?cache:\s*'reload'/,
    'a instalação precisa buscar cada arquivo da rede, ignorando o cache HTTP');
});

test('o worker só guarda e serve o que está na casca', () => {
  // O painel de administração fica fora da casca de propósito, e portanto fora
  // do resumo que dá nome ao cache. Guardá-lo assim mesmo o congelaria: seria
  // servido do cache para sempre, sem nada mudar de nome para forçar a troca.
  const sw = ler('sw.js');
  assert.match(sw, /if \(!daCasca\(url\.pathname\)\) return;/,
    'o que não é da casca precisa ir para a rede, sem passar pelo cache');
  assert.match(sw, /const ENDERECOS_DA_CASCA = new Set\(/);
});

test('o conjunto de parâmetros é guardado, mas não entra no resumo da versão', () => {
  // Quem administra publica taxas, produtos e a senha do painel pelo próprio
  // simulador, e o painel gera os dois arquivos de parâmetro — não o `sw.js`.
  // Se o arquivo entrasse no resumo, toda publicação exigiria um `sw.js` novo
  // que ninguém geraria: o worker não se atualizaria e a versão publicada
  // ficaria presa no cache. Medido num navegador antes da correção: publicar o
  // parâmetro não mudava nada na tela.
  const sw = ler('sw.js');
  const casca = cascaDe(sw);
  const arquivo = './js/data/parametros-vigentes.js';

  assert.ok(casca.includes(arquivo), 'precisa estar guardado, ou o aplicativo não abre sem internet');
  assert.ok(FORA_DO_RESUMO.includes(arquivo), 'não pode entrar no resumo que dá nome ao cache');

  // E de fato: alterá-lo não muda a versão exigida.
  const caminho = path.join(raiz, 'js/data/parametros-vigentes.js');
  const original = fs.readFileSync(caminho, 'utf8');
  try {
    fs.writeFileSync(caminho, `${original}\n// alteração de teste\n`, 'utf8');
    assert.equal(resumoDaCasca(raiz, casca), resumoDaCasca(raiz, casca));
    assert.equal(versaoDeclarada(sw), versaoEsperada(raiz, sw),
      'publicar um parâmetro não pode exigir um sw.js novo');
  } finally {
    fs.writeFileSync(caminho, original, 'utf8');
  }
});

test('o conjunto de parâmetros é servido rede primeiro, e sem o cache do navegador', () => {
  const sw = ler('sw.js');
  const trecho = sw.slice(sw.indexOf("parametros-vigentes.js'"), sw.indexOf('Só a casca é guardada'));
  const codigo = trecho.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  assert.match(codigo, /fetch\(new Request\([\s\S]*?cache:\s*'reload'/,
    'um fetch comum é atendido pelo cache HTTP: o worker guardaria o arquivo novo '
    + 'e a página continuaria usando o velho');
  assert.match(codigo, /catch\([\s\S]*?caches\.match/,
    'sem internet precisa cair no que ficou guardado, ou o aplicativo não abre offline');
});

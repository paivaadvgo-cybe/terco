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

const raiz = new URL('..', import.meta.url).pathname;
const ler = (relativo) => fs.readFileSync(path.join(raiz, relativo), 'utf8');

/** Diretórios que não vão para o navegador. */
const FORA_DO_APLICATIVO = ['tests', 'documentacao', 'dados', 'ferramentas', 'referencia', 'node_modules'];
/** Arquivos servidos, mas nunca cacheados por si mesmos. */
const NAO_CACHEAVEIS = ['sw.js', 'package.json'];

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

  const ausentes = emDisco.filter((a) => !casca.includes(a));
  assert.deepEqual(ausentes, [],
    'estes arquivos existem mas não seriam guardados para uso sem internet');

  // E o contrário: uma entrada que aponta para um arquivo inexistente faz a
  // instalação inteira do worker falhar, porque `addAll` é tudo ou nada.
  const fantasmas = casca
    .filter((a) => a !== './')
    .filter((a) => !fs.existsSync(path.join(raiz, a)));
  assert.deepEqual(fantasmas, [], 'a casca lista arquivos que não existem');
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

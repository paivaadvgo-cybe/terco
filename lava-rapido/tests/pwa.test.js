/**
 * Testes do PWA.
 *
 * O que se verifica aqui não é o comportamento do navegador — é a coerência
 * entre arquivos que ninguém compila e que, por isso, saem de sincronia em
 * silêncio: a lista de arquivos do service worker, os arquivos que existem em
 * disco, os ícones que o manifesto promete e a versão do cache.
 *
 * O erro que este arquivo existe para impedir é sempre o mesmo: acrescenta-se
 * um módulo, esquece-se de listá-lo na casca, e nada acontece — com internet o
 * navegador busca o que falta. A falha só aparece sem rede, que é o pior lugar
 * possível para descobri-la, e para este aplicativo é o lugar normal.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { versaoDeclarada, versaoEsperada, cascaDe } from '../ferramentas/versionar_casca.mjs';

const raiz = new URL('..', import.meta.url).pathname;
const ler = (relativo) => fs.readFileSync(path.join(raiz, relativo), 'utf8');

/** Diretórios que não vão para o navegador. */
const FORA_DO_APLICATIVO = ['tests', 'ferramentas', 'node_modules'];
/** Arquivos servidos, mas nunca guardados por si mesmos. */
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

const casca = () => cascaDe(ler('sw.js'));

test('a casca do service worker cobre todos os arquivos do aplicativo', () => {
  const ausentes = arquivosDoAplicativo().filter((a) => !casca().includes(a));
  assert.deepEqual(ausentes, [],
    'estes arquivos existem mas não seriam guardados para uso sem internet');
});

test('a casca não lista arquivo que não existe', () => {
  // `addAll` é tudo ou nada: um caminho errado faz a instalação inteira falhar,
  // e o aplicativo deixa de funcionar sem internet sem nenhum erro visível.
  const fantasmas = casca()
    .filter((a) => a !== './')
    .filter((a) => !fs.existsSync(path.join(raiz, a)));
  assert.deepEqual(fantasmas, [], 'a casca lista arquivos que não existem');
});

test('a casca inclui a raiz, o documento e o manifesto, que são endereços distintos', () => {
  // Abrir `/lava-rapido/` e `/lava-rapido/index.html` são requisições
  // diferentes; guardar só uma deixa a outra sem resposta offline.
  for (const obrigatorio of ['./', './index.html', './manifest.json', './css/app.css']) {
    assert.ok(casca().includes(obrigatorio), `falta ${obrigatorio} na casca`);
  }
});

test('a versão do cache acompanha o conteúdo da casca', () => {
  const texto = ler('sw.js');
  assert.equal(versaoDeclarada(texto), versaoEsperada(raiz, texto),
    'algum arquivo da casca mudou sem a versão do cache mudar junto. '
    + 'Rode `node ferramentas/versionar_casca.mjs --gravar`.');
});

test('a instalação busca a casca da rede, e não do cache do navegador', () => {
  // `cache.addAll` faz busca comum, que o cache HTTP atende: o cache novo
  // nasceria cheio dos arquivos velhos, e o worker passaria a servi-los para
  // sempre. Nada quebra, nada avisa, e a versão publicada não chega.
  const sw = ler('sw.js');
  const instalacao = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
  // Sem os comentários: o teste não pode passar por casar com a explicação da
  // correção em vez de com a correção.
  const codigo = instalacao.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.match(codigo, /addAll\([\s\S]*?new Request\([\s\S]*?cache:\s*'reload'/,
    'a instalação precisa buscar cada arquivo da rede, ignorando o cache HTTP');
});

test('o service worker não assume o controle sozinho', () => {
  const sw = ler('sw.js');
  const naInstalacao = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
  assert.ok(!naInstalacao.includes('skipWaiting'), 'skipWaiting não pode estar na instalação');
  assert.ok(sw.includes("evento.data === 'assumir-controle'"), 'falta o pedido vindo da página');
});

test('o service worker só limpa os caches deste aplicativo', () => {
  // O mesmo domínio hospeda outros aplicativos, com caches próprios. Apagar
  // tudo derrubaria o modo offline deles.
  assert.ok(ler('sw.js').includes("startsWith('lava-rapido-lite-')"),
    'a limpeza precisa filtrar pelo prefixo deste aplicativo');
});

test('o service worker ignora o que está fora do seu diretório', () => {
  const sw = ler('sw.js');
  assert.ok(sw.includes('url.origin !== self.location.origin'), 'falta a guarda de origem');
  assert.ok(sw.includes('!url.pathname.startsWith(BASE)'), 'falta a guarda de caminho');
});

test('o que não é da casca vai para a rede, sem passar pelo cache', () => {
  assert.match(ler('sw.js'), /if \(!daCasca\(url\.pathname\)\) return;/);
});

test('a navegação é rede primeiro, com o cache como reserva', () => {
  // Ao contrário dos módulos: assim uma versão nova chega assim que houver
  // internet, e sem internet o aplicativo abre do mesmo jeito.
  const sw = ler('sw.js');
  const navegacao = sw.slice(sw.indexOf("requisicao.mode === 'navigate'"));
  assert.match(navegacao, /fetch\(requisicao\)[\s\S]*?catch\(\(\) => caches\.match/);
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
  assert.ok(tamanhos.has('192x192') && tamanhos.has('512x512'));
  assert.ok(manifesto.icons.some((i) => i.purpose === 'maskable'),
    'sem ícone mascarável o Android recorta o desenho em cima do conteúdo');
});

test('os atalhos do manifesto apontam para rotas que existem', () => {
  const manifesto = JSON.parse(ler('manifest.json'));
  const rotas = ler('js/app.js');
  for (const atalho of manifesto.shortcuts ?? []) {
    const rota = atalho.url.replace('./#/', '').split('?')[0];
    assert.match(rotas, new RegExp(`\\n  ${rota}:`), `o atalho «${atalho.name}» aponta para a rota ${rota}, que não existe`);
  }
});

test('a página aponta para o manifesto e para o ícone do iPhone', () => {
  const html = ler('index.html');
  assert.match(html, /<link rel="manifest" href="manifest\.json">/);
  // O iOS ignora o manifesto para o ícone da tela inicial.
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /name="theme-color"/);
  assert.match(html, /viewport-fit=cover/, 'sem isso a barra de baixo fica sob o gesto do iPhone');
});

test('todo módulo importado existe em disco', () => {
  // Sem compilação, um caminho errado de importação só aparece quando a tela
  // que o usa é aberta — e pode ser a tela que se abre uma vez por mês.
  const modulos = arquivosDoAplicativo().filter((a) => a.endsWith('.js'));
  for (const modulo of modulos) {
    const texto = ler(modulo);
    for (const [, alvo] of texto.matchAll(/from\s+'(\.[^']+)'/g)) {
      const resolvido = path.resolve(path.dirname(path.join(raiz, modulo)), alvo);
      assert.ok(fs.existsSync(resolvido), `${modulo} importa ${alvo}, que não existe`);
    }
  }
});

test('nenhum módulo do aplicativo escreve HTML com dado do usuário', () => {
  // Modelo de carro e observação são texto digitado. Com `innerHTML`, um `<`
  // digitado por engano deixaria de ser um `<` na tela — e o resto é conhecido.
  for (const modulo of arquivosDoAplicativo().filter((a) => a.endsWith('.js'))) {
    const texto = ler(modulo);
    const usos = [...texto.matchAll(/innerHTML\s*=\s*(.*)/g)].map((m) => m[1].trim());
    for (const uso of usos) {
      assert.ok(uso === "'';", `${modulo} escreve HTML direto: ${uso}`);
    }
  }
});

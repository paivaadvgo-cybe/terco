/**
 * O painel cabe na janela, e a prévia não mente.
 *
 * Duas regras que não vivem em função nenhuma: são acordos entre o modelo, o
 * CSS e a tela, e por isso quebram em silêncio. Num painel de carro, quebrar em
 * silêncio é a pior forma de quebrar — o mostrador continua lá, só que meio
 * centímetro fora da janela, e quem está dirigindo não descobre que existe.
 *
 * O que se testa aqui é a coerência entre arquivos que ninguém compila: o
 * número de colunas do CSS contra o do modelo, e a promessa de cada tela de se
 * prender à janela contra a regra de altura que a cumpre.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { COLUNAS, LINHAS_MAXIMAS, alturaDoPainel, linhasDoEditor, criarItem } from '../js/dominio/painel.js';

const raiz = new URL('..', import.meta.url).pathname;
const ler = (relativo) => fs.readFileSync(path.join(raiz, relativo), 'utf8');

test('a grade do CSS tem o mesmo número de colunas do modelo', () => {
  /*
   * Este é o defeito que o teste existe para impedir, e ele já aconteceu: o CSS
   * dizia quatro colunas enquanto o modelo colocava itens até a oitava. Um
   * mostrador em «x = 6» caía numa coluna implícita, de largura automática, e o
   * painel inteiro saía torto — sem erro, sem aviso, só a impressão de que a
   * disposição salva não era a desenhada.
   */
  const css = ler('css/app.css');
  const declarado = css.match(/grid-template-columns:\s*repeat\(var\(--colunas,\s*(\d+)\)/);
  assert.ok(declarado, 'a grade precisa declarar as colunas por variável, com padrão');
  assert.equal(Number(declarado[1]), COLUNAS,
    'o CSS e o modelo discordam sobre quantas colunas a grade tem');
});

test('o painel se prende à janela', () => {
  const tela = ler('js/ui/telas/painel.js');
  const css = ler('css/app.css');
  assert.match(tela, /classList\.add\('painel-fixo'\)/, 'a tela precisa marcar o corpo');
  assert.match(tela, /classList\.remove\('painel-fixo'\)/, 'e desmarcar ao sair, ou as outras telas param de rolar');
  assert.match(css, /body\.painel-fixo \.conteudo \{[^}]*height: calc\(100dvh/,
    'sem altura fixa, a tela volta a rolar e o mostrador de baixo sai da janela');
});

test('a linha do palco não cresce com o conteúdo', () => {
  // `height: 100%` numa grade de linha implícita `auto` é só uma sugestão: a
  // linha cresce até caber tudo, e o que sobra é cortado sem rolagem.
  const css = ler('css/app.css');
  const palco = css.slice(css.indexOf('\n.palco {'), css.indexOf('.palco.com-camera'));
  assert.match(palco, /grid-template-rows:\s*minmax\(0, 1fr\)/,
    'o palco precisa declarar a linha, senão ela cresce com o conteúdo');
});

test('a câmera fica à esquerda e os instrumentos à direita', () => {
  const tela = ler('js/ui/telas/painel.js');
  const palco = tela.slice(tela.indexOf("const palco = el('div', { classe: 'palco' }"));
  const camera = palco.indexOf('colunaDaCamera');
  const mostradores = palco.indexOf("classe: 'palco-grade'");
  assert.ok(camera >= 0 && mostradores > camera,
    'a coluna da câmera precisa vir antes da dos mostradores — a ordem no HTML é a ordem na tela');
  assert.match(ler('css/app.css'), /\.palco\.com-camera \{ grid-template-columns:/,
    'sem a regra de três colunas, a câmera não ganha lateral nenhuma');
});

test('o editor mostra uma linha vazia, e só uma', () => {
  /*
   * Uma, porque as linhas dividem a altura da janela: com quatro linhas fixas,
   * um painel de três aparecia um quarto menor no editor do que no painel, e a
   * prévia deixava de valer para escolher tamanho.
   */
  const tres = [
    criarItem('0D', 'ponteiro', { x: 0, y: 0, largura: 4, altura: 3 }),
  ];
  assert.equal(alturaDoPainel(tres), 3);
  assert.equal(linhasDoEditor(tres), 4);
});

test('o editor nunca oferece linha além do que o painel comporta', () => {
  const cheio = [criarItem('0D', 'ponteiro', { x: 0, y: 0, largura: 2, altura: LINHAS_MAXIMAS })];
  assert.equal(linhasDoEditor(cheio), LINHAS_MAXIMAS,
    'oferecer a nona linha seria oferecer um lugar que o modelo recusa');
});

test('o painel vazio ainda tem grade onde arrastar', () => {
  assert.equal(alturaDoPainel([]), 0);
  assert.ok(linhasDoEditor([]) >= 3, 'um painel vazio precisa de espaço visível para o primeiro item');
});

test('o arrasto mede a linha pelas linhas já resolvidas', () => {
  // Com `minmax(0, 1fr)`, `grid-auto-rows` devolve o texto da função e
  // `parseFloat` disso não é número: o arrasto media a linha com a largura da
  // coluna e o item pulava células.
  const grade = ler('js/ui/grade.js');
  assert.match(grade, /gridTemplateRows/,
    'a altura da célula precisa vir das linhas resolvidas, não de grid-auto-rows');
});

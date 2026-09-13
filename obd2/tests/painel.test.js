/**
 * O painel personalizado.
 *
 * O que se testa aqui é o que faz um painel montado com carinho sumir sem
 * aviso: um item fora da grade, dois no mesmo lugar, uma escala invertida, uma
 * configuração gravada por uma versão anterior. Nenhum desses casos dá erro na
 * tela — eles só fazem o mostrador não aparecer, e quem montou fica sem saber
 * por quê.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COLUNAS, LIMITE_DE_PAINEIS, criarItem, escalaDe, colide, cabe,
  primeiroLugarVago, mover, redimensionar, alturaDoPainel,
  painelPadrao, painelDeInstrumentos, MODELOS, normalizar, normalizarTodos, converterEscolhaAntiga, chavesDoPainel,
} from '../js/dominio/painel.js';
import { criarDriverEmMemoria } from '../js/armazenamento/memoria.js';
import { criarArmazenamento } from '../js/armazenamento/storage.js';

const abrir = () => criarArmazenamento(criarDriverEmMemoria());

/* ------------------------------------------------------------------ escala */

test('sem escala própria, vale a do PID', () => {
  const item = criarItem('0D', 'ponteiro');
  assert.deepEqual(escalaDe(item), { min: 0, max: 240 });
});

test('a escala do item ganha da do PID', () => {
  // O caso real: um diesel que corta em 4.500 não quer a escala de 0 a 8.000.
  const item = criarItem('0C', 'ponteiro', { min: 500, max: 4500 });
  assert.deepEqual(escalaDe(item), { min: 500, max: 4500 });
});

test('escala invertida não divide por zero', () => {
  // Um máximo menor que o mínimo travaria o ponteiro no começo da escala para
  // qualquer valor — e pareceria um mostrador quebrado, não uma escala errada.
  const item = criarItem('0D', 'ponteiro', { min: 100, max: 50 });
  const escala = escalaDe(item);
  assert.ok(escala.max > escala.min);
});

/* ------------------------------------------------------------------- grade */

test('itens que se sobrepõem são detectados', () => {
  const a = { x: 0, y: 0, largura: 2, altura: 2 };
  assert.equal(colide(a, { x: 1, y: 1, largura: 2, altura: 2 }), true);
  assert.equal(colide(a, { x: 2, y: 0, largura: 2, altura: 2 }), false);
  assert.equal(colide(a, { x: 0, y: 2, largura: 2, altura: 1 }), false);
});

test('não cabe o que passa da borda da grade', () => {
  const item = criarItem('0D', 'mostrador', { x: 0, y: 0, largura: 2, altura: 1 });
  assert.equal(cabe(item, { x: COLUNAS - 1 }, [item]), false);
  assert.equal(cabe(item, { x: COLUNAS - 2 }, [item]), true);
  assert.equal(cabe(item, { x: -1 }, [item]), false);
});

test('o primeiro lugar vago é lido da esquerda para a direita, de cima para baixo', () => {
  const itens = [criarItem('0C', 'mostrador', { x: 0, y: 0, largura: 1, altura: 1 })];
  assert.deepEqual(primeiroLugarVago(itens, 1, 1), { x: 1, y: 0 });
});

test('mover para um lugar livre funciona', () => {
  const itens = [criarItem('0D', 'mostrador', { x: 0, y: 0, largura: 1, altura: 1 })];
  const novos = mover(itens, itens[0].id, { x: 2, y: 1 });
  assert.equal(novos[0].x, 2);
  assert.equal(novos[0].y, 1);
});

test('mover para cima de um item do mesmo tamanho troca os dois de lugar', () => {
  // É a única troca com resultado previsível, e é a que se espera ao arrastar
  // um mostrador para cima do vizinho.
  const a = criarItem('0D', 'mostrador', { x: 0, y: 0, largura: 1, altura: 1 });
  const b = criarItem('0C', 'mostrador', { x: 1, y: 0, largura: 1, altura: 1 });

  const novos = mover([a, b], a.id, { x: 1, y: 0 });
  assert.equal(novos.find((i) => i.id === a.id).x, 1);
  assert.equal(novos.find((i) => i.id === b.id).x, 0);
});

test('mover para cima de um item de outro tamanho é recusado', () => {
  // Empurrar? encolher? empilhar? Nenhuma resposta é óbvia, e inventar uma
  // seria pior que recusar e deixar escolher outro lugar.
  const pequeno = criarItem('0D', 'mostrador', { x: 0, y: 0, largura: 1, altura: 1 });
  const grande = criarItem('0C', 'ponteiro', { x: 1, y: 0, largura: 2, altura: 2 });

  assert.equal(mover([pequeno, grande], pequeno.id, { x: 1, y: 0 }), null);
});

test('mover para fora da grade é recusado', () => {
  const itens = [criarItem('0D', 'mostrador', { x: 0, y: 0, largura: 1, altura: 1 })];
  assert.equal(mover(itens, itens[0].id, { x: COLUNAS, y: 0 }), null);
  assert.equal(mover(itens, itens[0].id, { x: 0, y: -1 }), null);
});

test('redimensionar respeita o tamanho mínimo do tipo', () => {
  // Um ponteiro de 1×1 não tem onde desenhar escala nem número.
  const itens = [criarItem('0C', 'ponteiro', { x: 0, y: 0, largura: 2, altura: 2 })];
  const novos = redimensionar(itens, itens[0].id, { largura: 1, altura: 1 });
  assert.equal(novos[0].largura, 2);
  assert.equal(novos[0].altura, 2);
});

test('redimensionar por cima do vizinho é recusado', () => {
  const a = criarItem('0D', 'mostrador', { x: 0, y: 0, largura: 1, altura: 1 });
  const b = criarItem('0C', 'mostrador', { x: 1, y: 0, largura: 1, altura: 1 });
  assert.equal(redimensionar([a, b], a.id, { largura: 2, altura: 1 }), null);
});

test('a altura do painel é a linha mais baixa ocupada', () => {
  const itens = [
    criarItem('0C', 'ponteiro', { x: 0, y: 0, largura: 2, altura: 2 }),
    criarItem('0D', 'mostrador', { x: 3, y: 4, largura: 1, altura: 1 }),
  ];
  assert.equal(alturaDoPainel(itens), 5);
});

/* ------------------------------------------------------------ normalização */

test('o painel de fábrica é válido e não tem itens sobrepostos', () => {
  const painel = painelPadrao();
  for (const item of painel.itens) {
    assert.ok(cabe(item, {}, painel.itens), `${item.chave} não cabe onde está`);
  }
});

test('item com chave que não existe mais é descartado', () => {
  // Um PID que saiu da tabela desenharia um mostrador vazio para sempre.
  const painel = normalizar({
    nome: 'Teste',
    itens: [
      { chave: 'ZZ', tipo: 'mostrador', x: 0, y: 0, largura: 1, altura: 1 },
      { chave: '0D', tipo: 'mostrador', x: 1, y: 0, largura: 1, altura: 1 },
    ],
  });
  assert.deepEqual(painel.itens.map((i) => i.chave), ['0D']);
});

test('item com largura zero é corrigido, não some', () => {
  const painel = normalizar({ itens: [{ chave: '0D', tipo: 'mostrador', x: 0, y: 0, largura: 0, altura: 0 }] });
  assert.equal(painel.itens.length, 1);
  assert.ok(painel.itens[0].largura >= 1);
  assert.ok(painel.itens[0].altura >= 1);
});

test('itens sobrepostos no banco são separados, e nenhum é perdido', () => {
  const painel = normalizar({
    itens: [
      { chave: '0D', tipo: 'mostrador', x: 0, y: 0, largura: 1, altura: 1 },
      { chave: '0C', tipo: 'mostrador', x: 0, y: 0, largura: 1, altura: 1 },
    ],
  });
  assert.equal(painel.itens.length, 2);
  assert.equal(colide(painel.itens[0], painel.itens[1]), false);
});

test('item fora da grade volta para dentro', () => {
  const painel = normalizar({ itens: [{ chave: '0D', tipo: 'mostrador', x: 99, y: 99, largura: 1, altura: 1 }] });
  assert.ok(painel.itens[0].x < COLUNAS);
});

test('a lista de painéis é cortada em cinco', () => {
  const muitos = Array.from({ length: 9 }, (_, i) => painelPadrao(`P${i}`));
  assert.equal(normalizarTodos(muitos).length, LIMITE_DE_PAINEIS);
});

test('sem painel nenhum, nasce o padrão', () => {
  assert.equal(normalizarTodos([]).length, 1);
  assert.equal(normalizarTodos(null).length, 1);
  assert.ok(normalizarTodos(undefined)[0].itens.length > 0);
});

test('a escolha antiga de PIDs vira um painel montado', () => {
  // Quem já tinha o aplicativo escolheu mostradores numa tela que não existe
  // mais. Abrir a versão nova e achar o painel vazio seria perder isso sem aviso.
  const painel = converterEscolhaAntiga(['0C', '0D', '05', '42']);
  const chaves = chavesDoPainel(painel);

  assert.ok(chaves.includes('05'));
  assert.ok(chaves.includes('42'));
  // Rotação e velocidade continuam sendo os dois ponteiros grandes.
  const ponteiros = painel.itens.filter((i) => i.tipo === 'ponteiro').map((i) => i.chave);
  assert.deepEqual(ponteiros.sort(), ['0C', '0D']);
});

/* ------------------------------------------------------------ armazenamento */

test('a configuração nasce com um painel válido', async () => {
  const armazenamento = await abrir();
  const configuracao = await armazenamento.configuracao();
  assert.ok(Array.isArray(configuracao.paineis));
  assert.ok(configuracao.paineis.length >= 1);
  assert.equal(configuracao.painelAtivo, configuracao.paineis[0].id);
});

test('salvar painéis corta em cinco no banco, e não só na tela', async () => {
  // A tela é uma barreira de conveniência; a regra precisa valer mesmo que a
  // tela mude ou que a configuração chegue de outro lugar.
  const armazenamento = await abrir();
  await armazenamento.salvarPaineis(Array.from({ length: 8 }, (_, i) => painelPadrao(`P${i}`)));
  assert.equal((await armazenamento.configuracao()).paineis.length, LIMITE_DE_PAINEIS);
});

test('trocar de painel ativo não mexe na disposição de nenhum', async () => {
  const armazenamento = await abrir();
  const dois = [painelPadrao('Cidade'), painelPadrao('Estrada')];
  await armazenamento.salvarPaineis(dois, dois[0].id);

  const antes = await armazenamento.configuracao();
  await armazenamento.usarPainel(antes.paineis[1].id);
  const depois = await armazenamento.configuracao();

  assert.equal(depois.painelAtivo, depois.paineis[1].id);
  assert.deepEqual(depois.paineis.map((p) => p.nome), antes.paineis.map((p) => p.nome));
});

test('painel ativo apontando para um painel apagado cai no primeiro', async () => {
  const armazenamento = await abrir();
  await armazenamento.ajustar({ painelAtivo: 'fantasma' });
  const configuracao = await armazenamento.configuracao();
  assert.equal(configuracao.painelAtivo, configuracao.paineis[0].id);
});

test('uma configuração corrompida não derruba o painel', async () => {
  // O pior caso real: o editor interrompido no meio da gravação.
  const armazenamento = await abrir();
  await armazenamento.ajustar({
    paineis: [{ nome: 'Quebrado', itens: [{ chave: '0D', x: 'oi', y: null, largura: -3 }] }],
  });

  const configuracao = await armazenamento.configuracao();
  assert.equal(configuracao.paineis.length, 1);
  assert.equal(configuracao.paineis[0].itens.length, 1);
  assert.ok(configuracao.paineis[0].itens[0].largura >= 1);
});

test('restaurar devolve os painéis de fábrica', async () => {
  const armazenamento = await abrir();
  await armazenamento.salvarPaineis([painelPadrao('Meu'), painelPadrao('Outro'), painelPadrao('Mais')]);
  await armazenamento.restaurarPaineis();

  const configuracao = await armazenamento.configuracao();
  // De fábrica são dois: o quadro de instrumentos, que é o que se usa
  // dirigindo, e o completo, para quem quer tudo na tela.
  assert.deepEqual(configuracao.paineis.map((p) => p.nome), ['Instrumentos', 'Completo']);
  assert.equal(configuracao.painelAtivo, configuracao.paineis[0].id);
});

test('o quadro de instrumentos cabe na tela deitada', async () => {
  // Três linhas é o que a altura de um celular em paisagem comporta; um item na
  // quarta linha ficaria fora da tela no modo em que este painel é usado.
  const painel = painelDeInstrumentos();
  assert.equal(alturaDoPainel(painel.itens), 3);
  for (const item of painel.itens) {
    assert.ok(cabe(item, {}, painel.itens), `${item.chave} não cabe onde está`);
    assert.ok(item.x + item.largura <= COLUNAS);
  }
});

test('o velocímetro do quadro de instrumentos é o maior mostrador', () => {
  // É o único que se olha a cada poucos segundos; no exemplo que motivou este
  // modelo ele ocupa o centro e o resto orbita em volta.
  const painel = painelDeInstrumentos();
  const velocidade = painel.itens.find((i) => i.chave === '0D');
  const maiorArea = Math.max(...painel.itens.map((i) => i.largura * i.altura));
  assert.equal(velocidade.tipo, 'ponteiro');
  assert.equal(velocidade.largura * velocidade.altura, maiorArea);
});

test('todos os modelos produzem painéis válidos', () => {
  for (const modelo of MODELOS) {
    const painel = modelo.montar('Teste');
    assert.ok(painel.id, `${modelo.chave} sem identificador`);
    for (const item of painel.itens) {
      assert.ok(cabe(item, {}, painel.itens), `${modelo.chave}: ${item.chave} não cabe`);
    }
  }
});

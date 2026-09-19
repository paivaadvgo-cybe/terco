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
  COLUNAS, COLUNAS_ANTIGAS, LIMITE_DE_PAINEIS, TIPOS, criarItem, escalaDe, colide, cabe,
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
  // Um ponteiro espremido não tem onde desenhar escala nem número. Afinar a
  // grade deu passos menores, não licença para encolher abaixo do legível.
  const itens = [criarItem('0C', 'ponteiro', { x: 0, y: 0, largura: 4, altura: 4 })];
  const novos = redimensionar(itens, itens[0].id, { largura: 1, altura: 1 });
  assert.equal(novos[0].largura, TIPOS.ponteiro.minimo.largura);
  assert.equal(novos[0].altura, TIPOS.ponteiro.minimo.altura);
});

test('redimensionar por cima do vizinho é recusado', () => {
  const a = criarItem('0D', 'mostrador', { x: 0, y: 0, largura: 2, altura: 2 });
  const b = criarItem('0C', 'mostrador', { x: 2, y: 0, largura: 2, altura: 2 });
  assert.equal(redimensionar([a, b], a.id, { largura: 4, altura: 2 }), null);
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
  // Seis linhas na régua de dezesseis são as três de antes: o que a altura de
  // um celular em paisagem comporta. Passar disso põe um item fora da tela no
  // modo em que este painel é usado.
  const painel = painelDeInstrumentos();
  assert.equal(alturaDoPainel(painel.itens), 6);
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

test('painel gravado na régua antiga é convertido, e não estraga', () => {
  /*
   * O painel de quem já usava o aplicativo foi desenhado em oito colunas. Ele
   * não traz `grade`, e é por essa ausência que se reconhece.
   *
   * O que a conversão tem de preservar não é o número, é o desenho: o item que
   * ocupava um oitavo da largura continua ocupando um oitavo, e dois itens que
   * se encostavam continuam encostados. Dobrar a posição sem dobrar o tamanho
   * abriria um buraco entre cada par; dobrar o tamanho sem a posição os faria
   * cobrir uns aos outros.
   */
  const antigo = {
    id: 'p1',
    nome: 'Antigo',
    itens: [
      { id: 'a', chave: '0C', tipo: 'ponteiro', x: 0, y: 0, largura: 2, altura: 2 },
      { id: 'b', chave: '0D', tipo: 'ponteiro', x: 2, y: 0, largura: 2, altura: 2 },
      { id: 'c', chave: '05', tipo: 'mostrador', x: 7, y: 2, largura: 1, altura: 1 },
    ],
  };

  const posto = normalizar(antigo);
  assert.deepEqual(
    posto.itens.map(({ id, x, y, largura, altura }) => ({ id, x, y, largura, altura })),
    [
      { id: 'a', x: 0, y: 0, largura: 4, altura: 4 },
      { id: 'b', x: 4, y: 0, largura: 4, altura: 4 },
      { id: 'c', x: 14, y: 4, largura: 2, altura: 2 },
    ],
  );

  // Encostados antes, encostados depois: o «b» começa exatamente onde o «a» acaba.
  assert.equal(posto.itens[0].x + posto.itens[0].largura, posto.itens[1].x);
  // E o que ia até a borda continua indo até a borda, sem transbordar.
  assert.equal(posto.itens[2].x + posto.itens[2].largura, COLUNAS);
});

test('a conversão da régua acontece uma vez só', () => {
  /*
   * Sem a régua gravada, reler o painel o converteria de novo a cada abertura —
   * e em três aberturas o mostrador de um oitavo viraria a tela inteira.
   */
  const convertido = normalizar({
    nome: 'Um',
    itens: [{ chave: '0C', tipo: 'ponteiro', x: 2, y: 0, largura: 2, altura: 2 }],
  });
  assert.equal(convertido.grade, COLUNAS, 'o painel precisa dizer em que régua está');

  const relido = normalizar(convertido);
  assert.deepEqual(
    relido.itens.map(({ x, y, largura, altura }) => ({ x, y, largura, altura })),
    convertido.itens.map(({ x, y, largura, altura }) => ({ x, y, largura, altura })),
    'reler um painel já convertido não pode mexer nele',
  );
});

test('a régua antiga é a de oito colunas, e a nova é o dobro dela', () => {
  // Se um dia a grade afinar de novo, é esta conta que diz o que fazer com o
  // que já está gravado — e ela precisa continuar fechando.
  assert.equal(COLUNAS % COLUNAS_ANTIGAS, 0,
    'uma régua que não é múltipla da anterior converte com arredondamento, e o desenho sai torto');
  assert.equal(TIPOS.mostrador.minimo.largura, COLUNAS / COLUNAS_ANTIGAS,
    'o menor mostrador precisa valer exatamente uma coluna da régua antiga');
});

test('todo painel montado pelo aplicativo declara a régua em que foi desenhado', () => {
  /*
   * É a ausência de `grade` que faz `normalizar` reconhecer um painel antigo e
   * dobrá-lo. Um painel de fábrica que esquecesse de declará-la seria dobrado
   * como se fosse de oito colunas — e os itens que transbordassem sumiriam sem
   * aviso nenhum.
   *
   * Aconteceu: o «Voltar ao painel de fábrica» passava por `normalizarTodos` e
   * devolvia 4 dos 7 mostradores do quadro de instrumentos, e 10 dos 14 do
   * completo.
   */
  const montados = [
    ['Instrumentos', painelDeInstrumentos()],
    ['Completo', painelPadrao('Completo')],
    ['Convertido', converterEscolhaAntiga(['05', '42'])],
    ...MODELOS.map((modelo) => [modelo.nome, modelo.montar(modelo.nome)]),
  ];

  for (const [nome, painel] of montados) {
    assert.equal(painel.grade, COLUNAS, `${nome} não declara a régua`);
    assert.equal(normalizar(painel).itens.length, painel.itens.length,
      `${nome} perdeu mostrador ao ser posto em forma`);
  }
});

test('instalação nova guarda os painéis de fábrica, e eles não trocam sozinhos', async () => {
  /*
   * A gravação da data de nascimento do banco criava o registro de
   * configuração. A partir daí a leitura seguinte via «tem registro e não tem
   * painéis», concluía «instalação antiga» e convertia — então a primeira
   * abertura mostrava o quadro de instrumentos e a segunda, um «Padrão» de
   * oito mostradores que ninguém escolheu.
   */
  const armazenamento = await criarArmazenamento(criarDriverEmMemoria());
  const nomes = async () => (await armazenamento.configuracao()).paineis.map((p) => p.nome);

  const primeira = await nomes();
  assert.deepEqual(primeira, ['Instrumentos', 'Completo']);
  assert.deepEqual(await nomes(), primeira, 'a segunda abertura não pode trocar o painel');
  assert.deepEqual(await nomes(), primeira, 'nem a terceira');
});

test('«voltar ao painel de fábrica» devolve os painéis inteiros', async () => {
  const armazenamento = await criarArmazenamento(criarDriverEmMemoria());
  await armazenamento.restaurarPaineis();
  const { paineis } = await armazenamento.configuracao();
  assert.deepEqual(
    paineis.map((p) => [p.nome, p.itens.length]),
    [['Instrumentos', 7], ['Completo', 14]],
  );
});

test('instalação de verdade antiga continua sendo convertida', async () => {
  // O registro sem `paineis`, escrito por uma versão anterior. A escolha de
  // PIDs dela vira layout — perdê-la seria apagar o que a pessoa montou.
  const driver = criarDriverEmMemoria();
  await driver.gravar('configuracao', { id: 'app', painel: ['05', '42'], combustivel: 'gasolina' });
  const armazenamento = await criarArmazenamento(driver);

  const primeira = await armazenamento.configuracao();
  assert.equal(primeira.paineis.length, 1);
  assert.ok(primeira.paineis[0].itens.some((i) => i.chave === '05'),
    'a escolha antiga precisa aparecer no painel convertido');

  const segunda = await armazenamento.configuracao();
  assert.deepEqual(
    segunda.paineis.map((p) => p.itens.length),
    primeira.paineis.map((p) => p.itens.length),
    'a conversão precisa ser estável entre aberturas',
  );
});

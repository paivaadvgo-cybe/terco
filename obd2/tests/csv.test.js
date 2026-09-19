/**
 * A exportação.
 *
 * Três detalhes decidem se a planilha abre certa no Excel brasileiro, e os três
 * falham em silêncio: sem BOM os acentos viram garatuja, com vírgula decimal e
 * vírgula separadora as colunas se embaralham, e um ponto no lugar da vírgula
 * faz a planilha tratar número como texto — as somas dão zero e ninguém entende
 * por quê.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { campoCSV, numeroCSV, montarCSV, colunasDe, amostrasEmCSV, viagemEmCSV , viagensEmCSV, lerCSV, numeroDeCSV, chaveDaColuna, lerViagensDeCSV } from '../js/ui/csv.js';
import { criarAmostra, resumir } from '../js/dominio/viagem.js';

test('o arquivo começa com BOM e separa por ponto e vírgula', () => {
  const csv = montarCSV([['a', 'b'], ['1', '2']]);
  assert.ok(csv.startsWith('﻿'), 'sem BOM o Excel abre em Latin-1');
  assert.ok(csv.includes('a;b'));
  assert.ok(csv.includes('\r\n'));
});

test('número sai com vírgula decimal', () => {
  assert.equal(numeroCSV(1726.5, 1), '1726,5');
  assert.equal(numeroCSV(null), '');
  assert.equal(numeroCSV(undefined), '');
});

test('campo com separador ou aspas é protegido', () => {
  assert.equal(campoCSV('a;b'), '"a;b"');
  assert.equal(campoCSV('diz "oi"'), '"diz ""oi"""');
  assert.equal(campoCSV('simples'), 'simples');
});

test('as colunas são os PIDs que existem nas amostras', () => {
  // Exportar quarenta colunas vazias porque o aplicativo conhece quarenta PIDs
  // é o tipo de planilha que ninguém abre duas vezes.
  const amostras = [
    criarAmostra(1000, { '0C': 900, '0D': 0 }),
    criarAmostra(2000, { '0C': 1200, '0D': 10, '05': 88 }),
  ];
  assert.deepEqual(colunasDe(amostras), ['05', '0C', '0D']);
});

test('cada amostra vira uma linha, com os segundos desde o início', () => {
  const inicio = 1_700_000_000_000;
  const csv = amostrasEmCSV([
    criarAmostra(inicio, { '0D': 0 }),
    criarAmostra(inicio + 2500, { '0D': 42 }),
  ]);
  const linhas = csv.trimEnd().split('\r\n');
  assert.equal(linhas.length, 3);
  assert.match(linhas[0], /Velocidade \(km\/h\)/);
  assert.ok(linhas[2].includes(';2,5;'), `faltou o tempo decorrido: ${linhas[2]}`);
  assert.ok(linhas[2].includes(';42'), `faltou o valor: ${linhas[2]}`);
});

test('a exportação da viagem leva o resumo no topo', () => {
  const inicio = 1_700_000_000_000;
  const amostras = Array.from({ length: 61 }, (_, i) => criarAmostra(inicio + i * 1000, { '0D': 60, 10: 10 }));
  const viagem = {
    id: 'v1', dia: '2026-09-12', inicio, fim: inicio + 60_000, amostras: amostras.length,
    resumo: resumir(amostras),
  };

  const csv = viagemEmCSV(viagem, amostras);
  assert.ok(csv.startsWith('﻿'));
  assert.match(csv, /Distância \(km\);1,00/);
  assert.match(csv, /Consumo médio \(km\/L\);/);
  assert.match(csv, /Origem do consumo;fluxo de ar/);
  // E o movimento vem depois, no mesmo arquivo.
  assert.match(csv, /Hora;Segundos;/);
});

test('viagem sem amostras exporta o resumo, e não quebra', () => {
  const csv = viagemEmCSV({ id: 'v0', dia: '2026-09-12', inicio: 1, fim: 2, resumo: null }, []);
  assert.match(csv, /Sem amostras/);
});

/* --------------------------------------------- todas as viagens num arquivo */

const VIAGENS = [
  {
    id: 'v2',
    dia: '2026-09-16',
    inicio: Date.UTC(2026, 8, 16, 21, 0, 0),
    fim: Date.UTC(2026, 8, 16, 21, 30, 0),
    amostras: 2,
    resumo: { distancia: 12.5, duracao: 1_800_000, velocidadeMaxima: 88, consumoMedio: 11.2 },
  },
  {
    id: 'v1',
    dia: '2026-09-15',
    inicio: Date.UTC(2026, 8, 15, 12, 0, 0),
    fim: Date.UTC(2026, 8, 15, 12, 10, 0),
    amostras: 2,
    resumo: { distancia: 3.1, duracao: 600_000, velocidadeMaxima: 42 },
  },
];

/** A primeira só tem velocidade; a segunda tem velocidade e rotação. */
const AMOSTRAS = new Map([
  ['v1', [
    { t: Date.UTC(2026, 8, 15, 12, 0, 0), v: { '0D': 40 } },
    { t: Date.UTC(2026, 8, 15, 12, 0, 1), v: { '0D': 42 } },
  ]],
  ['v2', [
    { t: Date.UTC(2026, 8, 16, 21, 0, 0), v: { '0D': 80, '0C': 2400 } },
    { t: Date.UTC(2026, 8, 16, 21, 0, 1), v: { '0D': 88, '0C': 2600 } },
  ]],
]);

test('a exportação de todas traz um resumo por viagem, em ordem de tempo', () => {
  const linhas = viagensEmCSV(VIAGENS, AMOSTRAS).split('\r\n');
  const resumo = linhas.slice(1, 3);
  assert.match(resumo[0], /15\/09\/2026/, 'a mais antiga vem primeiro, e não a ordem em que foi passada');
  assert.match(resumo[1], /16\/09\/2026/);
  assert.match(resumo[1], /12,50/, 'a distância da segunda viagem');
});

test('as colunas de PID são a união de todas as viagens', () => {
  /*
   * Uma viagem sem GPS ao lado de outra com GPS, ou um carro que respondeu a
   * rotação e outro que não: sem a união, a segunda tabela empurraria as
   * colunas de uma viagem uma casa para a esquerda a partir da primeira linha
   * da viagem seguinte — e a planilha ficaria errada sem parecer errada.
   */
  const texto = viagensEmCSV(VIAGENS, AMOSTRAS);
  const movimento = texto.slice(texto.indexOf('Viagem;Hora;Segundos'));
  const cabecalho = movimento.split('\r\n')[0];
  assert.match(cabecalho, /Velocidade/);
  assert.match(cabecalho, /Rotação/, 'a rotação só existe numa das viagens, e mesmo assim é coluna');

  const daPrimeira = movimento.split('\r\n').find((l) => l.startsWith('15/09/2026'));
  const campos = daPrimeira.split(';');
  assert.equal(campos.filter((c) => c === '').length >= 1, true,
    'a viagem que não tem rotação traz a célula vazia, e não o valor da outra');
});

/**
 * Só as linhas de amostra.
 *
 * O nome da viagem é o mesmo nas duas tabelas — é ele que liga uma à outra —,
 * então filtrar por ele pegaria o resumo junto. O corte é no cabeçalho da
 * segunda tabela.
 */
function movimentoDe(texto) {
  const inicio = texto.indexOf('Viagem;Hora;Segundos');
  return texto.slice(inicio).split('\r\n').slice(1).filter(Boolean);
}

test('cada linha de amostra diz de qual viagem é', () => {
  const linhas = movimentoDe(viagensEmCSV(VIAGENS, AMOSTRAS));
  assert.equal(linhas.length, 4, 'as quatro amostras das duas viagens');
  assert.equal(linhas.filter((l) => l.startsWith('15/09/2026')).length, 2);
  assert.equal(linhas.filter((l) => l.startsWith('16/09/2026')).length, 2);
});

test('os segundos recomeçam em cada viagem', () => {
  // São segundos desde o início **daquela** viagem, não desde a primeira de
  // todas — senão a segunda começaria em «86.400», que não quer dizer nada.
  const linhas = movimentoDe(viagensEmCSV(VIAGENS, AMOSTRAS));
  const primeiraDaPrimeira = linhas.find((l) => l.startsWith('15/09/2026'));
  const primeiraDaSegunda = linhas.find((l) => l.startsWith('16/09/2026'));
  assert.equal(primeiraDaPrimeira.split(';')[2], '0,0');
  assert.equal(primeiraDaSegunda.split(';')[2], '0,0');
});

test('uma viagem sem amostras não quebra a exportação', () => {
  // Acontece: gravação interrompida antes da primeira leitura.
  const texto = viagensEmCSV(VIAGENS, new Map([['v1', []], ['v2', AMOSTRAS.get('v2')]]));
  assert.match(texto, /15\/09\/2026/, 'ela continua no resumo, com o que se sabe dela');
  assert.equal(movimentoDe(texto).filter((l) => l.startsWith('15/09/2026')).length, 0);
  assert.equal(movimentoDe(texto).length, 2, 'e as amostras da outra continuam lá');
});

test('sem viagem nenhuma, um arquivo que se entende', () => {
  assert.match(viagensEmCSV([], new Map()), /Nenhuma viagem gravada/);
});

test('o arquivo de todas continua abrindo certo no Excel brasileiro', () => {
  const texto = viagensEmCSV(VIAGENS, AMOSTRAS);
  assert.equal(texto.charCodeAt(0), 0xfeff, 'sem o BOM o Excel come os acentos');
  assert.ok(!texto.slice(1).includes('﻿'), 'e um BOM no meio do arquivo vira lixo na planilha');
  assert.match(texto, /12,50/, 'decimal com vírgula');
});

test('duas viagens no mesmo minuto não viram uma só', () => {
  /*
   * Parar e recomeçar a gravação num semáforo produz exatamente isto. Com o
   * rótulo só até o minuto, as duas sairiam com o mesmo nome — e quem filtrasse
   * por ele na planilha somaria dois trajetos achando que soma um.
   */
  const inicio = Date.UTC(2026, 8, 16, 21, 0, 0);
  const proximas = [
    { id: 'a', dia: '2026-09-16', inicio, fim: inicio + 4000, resumo: { distancia: 1 } },
    { id: 'b', dia: '2026-09-16', inicio: inicio + 20000, fim: inicio + 30000, resumo: { distancia: 2 } },
  ];
  const amostras = new Map([
    ['a', [{ t: inicio, v: { '0D': 10 } }]],
    ['b', [{ t: inicio + 20000, v: { '0D': 20 } }]],
  ]);

  const linhas = movimentoDe(viagensEmCSV(proximas, amostras));
  const rotulos = new Set(linhas.map((l) => l.split(';')[0]));
  assert.equal(rotulos.size, 2, 'cada viagem precisa de um rótulo só seu');
});

test('o desempate numerado cobre o mesmo segundo', () => {
  // Toque duplo no «Gravar»: improvável, e é justamente o que não pode sair
  // errado em silêncio.
  const instante = Date.UTC(2026, 8, 16, 21, 0, 0);
  const gemeas = [
    { id: 'a', dia: '2026-09-16', inicio: instante, fim: instante + 1000, resumo: {} },
    { id: 'b', dia: '2026-09-16', inicio: instante, fim: instante + 2000, resumo: {} },
  ];
  const amostras = new Map([
    ['a', [{ t: instante, v: { '0D': 1 } }]],
    ['b', [{ t: instante, v: { '0D': 2 } }]],
  ]);

  const rotulos = movimentoDe(viagensEmCSV(gemeas, amostras)).map((l) => l.split(';')[0]);
  assert.equal(new Set(rotulos).size, 2);
  assert.ok(rotulos.some((r) => r.endsWith('(2)')));
});

/* -------------------------------------------------- a planilha de volta */

test('o analisador respeita campo entre aspas com ponto e vírgula dentro', () => {
  /*
   * `campoCSV` põe aspas em volta de qualquer campo com `;`, aspas ou quebra de
   * linha. Um `split(';')` cortaria esse campo ao meio e deslocaria a linha
   * inteira — e o estrago sai como número na coluna errada, que é pior que erro.
   */
  const linhas = lerCSV('a;"b;c";d\r\n"ele disse ""oi""";2\r\n');
  assert.deepEqual(linhas[0], ['a', 'b;c', 'd']);
  assert.deepEqual(linhas[1], ['ele disse "oi"', '2']);
});

test('o analisador aceita quebra de linha dentro do campo', () => {
  const linhas = lerCSV('a;"duas\nlinhas";c\r\n');
  assert.deepEqual(linhas[0], ['a', 'duas\nlinhas', 'c']);
});

test('número do Excel pt-BR volta a número, e vazio volta a ausência', () => {
  assert.equal(numeroDeCSV('12,50'), 12.5);
  assert.equal(numeroDeCSV('1.234,5'), 1234.5);
  assert.equal(numeroDeCSV(''), null, 'célula vazia é ausência, nunca zero');
  assert.equal(numeroDeCSV('—'), null);
});

test('a chave da coluna vem dos colchetes', () => {
  assert.equal(chaveDaColuna('Rotação (rpm) [0C]'), '0C');
  assert.equal(chaveDaColuna('PID A1 [A1]'), 'A1');
});

test('sem colchetes, a chave ainda se acha pelo nome', () => {
  // Planilha exportada antes de a chave existir. Frágil de propósito: serve
  // para não descartar o arquivo que alguém já tinha.
  assert.equal(chaveDaColuna('Rotação (rpm)'), '0C');
  assert.equal(chaveDaColuna('Coluna que não existe (x)'), null);
});

test('a planilha de todas as viagens volta com o que importa', () => {
  const texto = viagensEmCSV(VIAGENS, AMOSTRAS);
  const { viagens, avisos } = lerViagensDeCSV(texto);

  assert.deepEqual(avisos, [], 'o que este arquivo escreveu, ele tem de saber ler');
  assert.equal(viagens.length, 2);

  const [primeira, segunda] = viagens;
  assert.equal(primeira.dia, '2026-09-15');
  assert.equal(primeira.amostras.length, 2);
  assert.equal(primeira.resumo.distancia, 3.1);
  assert.equal(segunda.resumo.velocidadeMaxima, 88);
  assert.equal(segunda.amostras[1].v['0C'], 2600, 'a rotação volta na chave certa');
  assert.equal(primeira.amostras[0].v['0C'], undefined, 'e não aparece na viagem que não a tinha');
});

test('os instantes das amostras são reconstruídos do início mais os segundos', () => {
  const texto = viagensEmCSV(VIAGENS, AMOSTRAS);
  const { viagens } = lerViagensDeCSV(texto);
  const primeira = viagens[0];
  assert.equal(primeira.amostras[1].t - primeira.amostras[0].t, 1000,
    'um segundo entre as duas, como na origem');
});

test('viagem que atravessa a meia-noite não volta com duração negativa', () => {
  /*
   * O dia registrado é o do começo, e a coluna «Fim» traz só o relógio. Sem
   * somar um dia, uma viagem das 23h50 às 00h10 voltaria terminando vinte e
   * três horas e quarenta minutos antes de começar.
   */
  const inicio = new Date(2026, 8, 16, 23, 50, 0).getTime();
  const madrugada = [{
    id: 'm', dia: '2026-09-16', inicio, fim: inicio + 20 * 60_000, amostras: 1,
    resumo: { distancia: 9 },
  }];
  const amostras = new Map([['m', [{ t: inicio, v: { '0D': 60 } }]]]);

  const { viagens } = lerViagensDeCSV(viagensEmCSV(madrugada, amostras));
  assert.equal(viagens[0].fim - viagens[0].inicio, 20 * 60_000);
});

test('um arquivo que não é do aplicativo é recusado dizendo o que é', () => {
  assert.throws(() => lerViagensDeCSV('nome;idade\r\nana;30\r\n'), /Painel OBD-II/);
});

test('uma coluna desconhecida vira aviso, e o resto do arquivo entra', () => {
  // Um arquivo com meses de viagens boas não se descarta por causa de uma
  // coluna que alguém acrescentou na planilha.
  const texto = viagensEmCSV(VIAGENS, AMOSTRAS)
    .replace('Consumo (L/h)', 'Coluna estranha;Consumo (L/h)');
  const { viagens, avisos } = lerViagensDeCSV(texto);
  assert.ok(avisos.some((a) => /estranha/.test(a)));
  assert.equal(viagens.length, 2, 'as viagens continuam lá');
});

test('a duração sobrevive à ida e à volta em viagens curtas', () => {
  /*
   * Com uma casa decimal em minutos, a resolução é de seis segundos: duas
   * gravações de cinco e de seis segundos voltavam as duas com seis. Apareceu
   * num teste de mudança de aparelho, com viagens curtas de propósito — e uma
   * viagem curta é exatamente o caso de parar e recomeçar num semáforo.
   */
  const inicio = Date.UTC(2026, 8, 16, 21, 0, 0);
  const curtas = [
    { id: 'c1', dia: '2026-09-16', inicio, fim: inicio + 5000, resumo: { duracao: 5000 } },
    { id: 'c2', dia: '2026-09-16', inicio: inicio + 60000, fim: inicio + 66000, resumo: { duracao: 6000 } },
  ];
  /** Uma leitura por segundo, como a gravação de verdade produz. */
  const porSegundo = (de, quantos) => Array.from({ length: quantos + 1 }, (_, i) => ({
    t: de + i * 1000,
    v: { '0D': 10 + i },
  }));
  const comAmostras = new Map([
    ['c1', porSegundo(inicio, 5)],
    ['c2', porSegundo(inicio + 60000, 6)],
  ]);

  const { viagens } = lerViagensDeCSV(viagensEmCSV(curtas, comAmostras));
  assert.equal(viagens[0].resumo.duracao, 5000, 'exata, porque veio das amostras');
  assert.equal(viagens[1].resumo.duracao, 6000);
});

test('sem amostras, a duração vem da coluna e é aproximada', () => {
  // A coluna é o que há, e serve: em minutos com duas casas, o erro é de seis
  // décimos de segundo — invisível numa viagem de verdade.
  const inicio = Date.UTC(2026, 8, 16, 21, 0, 0);
  const so_resumo = [{ id: 's', dia: '2026-09-16', inicio, fim: inicio + 2_700_000, resumo: { duracao: 2_700_000 } }];
  const { viagens } = lerViagensDeCSV(viagensEmCSV(so_resumo, new Map([['s', []]])));
  assert.ok(Math.abs(viagens[0].resumo.duracao - 2_700_000) < 600);
});

test('um buraco na gravação não entra na duração refeita', () => {
  /*
   * Tela apagada, aplicativo em segundo plano: a gravação fica com um buraco, e
   * a duração da viagem não conta esse tempo. A volta usa o mesmo corte, senão
   * uma viagem de dez minutos com meia hora de buraco voltaria como quarenta.
   */
  const inicio = Date.UTC(2026, 8, 16, 21, 0, 0);
  const comBuraco = [{ id: 'b', dia: '2026-09-16', inicio, fim: inicio + 3_600_000, resumo: { duracao: 4000 } }];
  const amostras = new Map([['b', [
    { t: inicio, v: { '0D': 10 } },
    { t: inicio + 2000, v: { '0D': 12 } },
    { t: inicio + 3_600_000, v: { '0D': 14 } },
  ]]]);

  const { viagens } = lerViagensDeCSV(viagensEmCSV(comBuraco, amostras));
  // Dois segundos de viagem mais o buraco limitado a cinco — a mesma conta que
  // a gravação faz, e é a igualdade entre as duas que importa.
  assert.equal(viagens[0].resumo.duracao, 7000);
});

test('as coordenadas vão para a planilha e voltam dela', () => {
  /*
   * Latitude e longitude não ganharam caminho próprio: são leituras como
   * qualquer outra, e é exatamente por isso que atravessam a exportação e a
   * importação sem uma linha de código dedicada. Este teste existe para o dia
   * em que alguém «otimizar» as colunas e as deixar de fora.
   */
  const viagens = [{
    id: 'g1',
    dia: '2026-09-19',
    inicio: Date.UTC(2026, 8, 19, 12, 0, 0),
    fim: Date.UTC(2026, 8, 19, 12, 0, 1),
    amostras: 2,
    resumo: { distancia: 0.1, duracao: 1000, velocidadeMaxima: 39 },
  }];
  const amostras = new Map([['g1', [
    { t: Date.UTC(2026, 8, 19, 12, 0, 0), v: { '0D': 38, LAT: -16.68012, LON: -49.25441 } },
    { t: Date.UTC(2026, 8, 19, 12, 0, 1), v: { '0D': 39, LAT: -16.68002, LON: -49.25451 } },
  ]]]);

  const texto = viagensEmCSV(viagens, amostras);
  assert.match(texto, /Latitude \(°\) \[LAT\]/, 'a coluna precisa levar a chave entre colchetes');
  assert.match(texto, /-16,68012/, 'com vírgula decimal, ou o Excel brasileiro lê como texto');

  const { viagens: volta, avisos } = lerViagensDeCSV(texto);
  assert.deepEqual(avisos, []);
  assert.equal(volta[0].amostras[0].v.LAT, -16.68012);
  assert.equal(volta[0].amostras[0].v.LON, -49.25441);
  assert.equal(volta[0].amostras[1].v.LAT, -16.68002,
    'as cinco casas precisam sobreviver à ida e à volta — a quinta vale um metro');
});

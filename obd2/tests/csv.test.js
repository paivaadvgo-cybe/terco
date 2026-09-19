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

import { campoCSV, numeroCSV, montarCSV, colunasDe, amostrasEmCSV, viagemEmCSV , viagensEmCSV } from '../js/ui/csv.js';
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

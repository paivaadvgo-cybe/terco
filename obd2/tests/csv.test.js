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

import { campoCSV, numeroCSV, montarCSV, colunasDe, amostrasEmCSV, viagemEmCSV } from '../js/ui/csv.js';
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

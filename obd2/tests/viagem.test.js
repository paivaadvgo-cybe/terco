/**
 * Consumo e resumo de viagem.
 *
 * São as contas que ninguém confere olhando a tela: o número aparece, parece
 * razoável, e ninguém tem como saber que está errado. Um consumo 30% otimista
 * por usar a proporção da gasolina num carro a etanol é exatamente esse caso.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  litrosPorHoraDoFluxo, fluxoDeArEstimado, consumoInstantaneo, kmPorLitro, alertas,
} from '../js/dominio/leituras.js';
import { resumir, criarAmostra, serieDe, INTERVALO_MAXIMO } from '../js/dominio/viagem.js';

/* ------------------------------------------------------------------ consumo */

test('fluxo de ar vira litros por hora pela proporção do combustível', () => {
  // 10 g/s de ar, gasolina: 10/14,7 = 0,68 g/s de combustível = 2.449 g/h,
  // sobre 745 g/L = 3,29 L/h.
  assert.equal(litrosPorHoraDoFluxo(10, 'gasolina').toFixed(2), '3.29');
});

test('o mesmo fluxo gasta bem mais etanol que gasolina', () => {
  // A diferença é o motivo de o combustível ser escolhido nos ajustes: num
  // carro flex, o número errado parece plausível.
  const gasolina = litrosPorHoraDoFluxo(10, 'gasolina');
  const etanol = litrosPorHoraDoFluxo(10, 'etanol');
  assert.ok(etanol > gasolina * 1.4, `etanol ${etanol} deveria superar gasolina ${gasolina} em ~50%`);
});

test('fluxo de ar deduzido da pressão do coletor', () => {
  // 2.000 rpm, 1,6 L, coletor a 60 kPa, ar a 30 °C: ordem de grandeza de um
  // motor em carga parcial, entre 5 e 20 g/s.
  const fluxo = fluxoDeArEstimado({ rotacao: 2000, coletor: 60, arAdmitido: 30, cilindrada: 1.6 });
  assert.ok(fluxo > 5 && fluxo < 20, `fora da faixa esperada: ${fluxo}`);
});

test('a ordem das fontes de consumo é a da confiança', () => {
  // O que o carro mede ganha do que o aplicativo deduz, sempre.
  const medido = consumoInstantaneo({ '5E': 6, 10: 30 });
  assert.equal(medido.origem, 'medido');
  assert.equal(medido.litrosPorHora, 6);

  const porFluxo = consumoInstantaneo({ 10: 10 });
  assert.equal(porFluxo.origem, 'fluxo de ar');

  const estimado = consumoInstantaneo({ '0C': 2000, '0B': 60, '0F': 30 }, { cilindrada: 1.6 });
  assert.equal(estimado.origem, 'estimado');
});

test('sem MAF e sem cilindrada, não há consumo — e não um número inventado', () => {
  const nada = consumoInstantaneo({ '0C': 2000, '0B': 60 });
  assert.equal(nada.litrosPorHora, null);
  assert.equal(nada.origem, null);
});

test('parado não tem km/L', () => {
  // A conta daria infinito, e mostrar «∞ km/L» ou um número gigante é pior que
  // mostrar nada.
  assert.equal(kmPorLitro(0, 0.8), null);
  assert.equal(kmPorLitro(60, 0), null);
  assert.equal(kmPorLitro(60, 6), 10);
});

/* ------------------------------------------------------------------ resumo */

/** Amostras a cada segundo, com velocidade constante. */
function viagemConstante(velocidade, segundos, extras = {}) {
  const inicio = 1_700_000_000_000;
  return Array.from({ length: segundos + 1 }, (_, i) => (
    criarAmostra(inicio + i * 1000, { '0D': velocidade, ...extras })
  ));
}

test('60 km/h por uma hora dá 60 km', () => {
  const resumo = resumir(viagemConstante(60, 3600));
  assert.equal(Math.round(resumo.distancia), 60);
  assert.equal(Math.round(resumo.velocidadeMedia), 60);
});

test('velocidade média é distância por tempo, não média das velocidades', () => {
  // Metade do tempo a 80, metade parado: a média das leituras daria 40 km/h, e
  // a média de verdade também — mas só porque os intervalos são iguais. O que o
  // teste trava é a distância, que é o que se mostra.
  const inicio = 1_700_000_000_000;
  const amostras = [
    ...Array.from({ length: 61 }, (_, i) => criarAmostra(inicio + i * 1000, { '0D': 80 })),
    ...Array.from({ length: 60 }, (_, i) => criarAmostra(inicio + 61_000 + i * 1000, { '0D': 0 })),
  ];
  const resumo = resumir(amostras);
  // 60 s a 80 km/h (1,333 km) mais o segundo de transição, contado pela média
  // das duas pontas (40 km/h) — que é como se integra uma amostragem.
  assert.equal(resumo.distancia.toFixed(2), '1.34');
  assert.ok(resumo.tempoParado >= 59_000, `parado por ${resumo.tempoParado} ms`);
});

test('um buraco na gravação não vira distância inventada', () => {
  // Tela apagada por meio minuto a 80 km/h: contar o intervalo cheio inventaria
  // 660 metros que o carro pode não ter andado.
  const inicio = 1_700_000_000_000;
  const amostras = [
    criarAmostra(inicio, { '0D': 80 }),
    criarAmostra(inicio + 30_000, { '0D': 80 }),
  ];
  const resumo = resumir(amostras);
  assert.equal(resumo.duracao, INTERVALO_MAXIMO);
  assert.equal(resumo.buracos, 25_000);
  assert.ok(resumo.distancia < 0.12, `distância inflada: ${resumo.distancia}`);
});

test('guarda os máximos da viagem', () => {
  const inicio = 1_700_000_000_000;
  const amostras = [
    criarAmostra(inicio, { '0D': 40, '0C': 2000, '05': 88 }),
    criarAmostra(inicio + 1000, { '0D': 110, '0C': 4300, '05': 96 }),
    criarAmostra(inicio + 2000, { '0D': 60, '0C': 1800, '05': 92 }),
  ];
  const resumo = resumir(amostras);
  assert.equal(resumo.velocidadeMaxima, 110);
  assert.equal(resumo.rotacaoMaxima, 4300);
  assert.equal(resumo.temperaturaMaxima, 96);
});

test('consumo médio sai da integral, com a origem registrada', () => {
  // 60 km/h com 20 g/s de ar por uma hora: 60 km e 6,58 L, perto de 9 km/L.
  const resumo = resumir(viagemConstante(60, 3600, { 10: 20 }));
  assert.equal(resumo.temConsumo, true);
  assert.equal(resumo.origemDoConsumo, 'fluxo de ar');
  assert.ok(resumo.consumoMedio > 8 && resumo.consumoMedio < 10, `consumo fora do esperado: ${resumo.consumoMedio}`);
});

test('viagem sem amostra devolve a mesma forma, com zeros', () => {
  const resumo = resumir([]);
  assert.equal(resumo.amostras, 0);
  assert.equal(resumo.distancia, 0);
  assert.equal(resumo.consumoMedio, null);
});

test('a série de um PID pula as amostras em que ele faltou', () => {
  const inicio = 1_700_000_000_000;
  const serie = serieDe([
    criarAmostra(inicio, { '0C': 900 }),
    criarAmostra(inicio + 1000, { '0D': 30 }),
    criarAmostra(inicio + 2000, { '0C': 1200 }),
  ], '0C');
  assert.deepEqual(serie.map((p) => p.valor), [900, 1200]);
});

/* ----------------------------------------------------------------- alertas */

test('temperatura alta e alternador fraco viram alerta', () => {
  const quente = alertas({ '05': 112, '0C': 2000 });
  assert.equal(quente[0].nivel, 'perigo');

  const semCarga = alertas({ '42': 12.4, '0C': 2000, '0D': 50 });
  assert.ok(semCarga.some((a) => /alternador/.test(a.texto)));

  assert.deepEqual(alertas({ '05': 92, '42': 14.1, '0C': 2200, '0D': 60 }), []);
});

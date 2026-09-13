/**
 * A pressão do turbo, e os valores derivados em geral.
 *
 * O erro que este arquivo existe para impedir é o de esquecer a subtração: o
 * carro informa a pressão **absoluta** do coletor, que já inclui a atmosfera
 * empurrando. Mostrar o PID 0B cru como «turbo» faria um motor desligado marcar
 * 1 bar de pressão de turbo — número alto, plausível para quem não conferiu, e
 * completamente errado.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DERIVADOS, calcularDerivados, derivadosPossiveis, definicaoDe,
  atmosfericaMedida, ATMOSFERICA_PADRAO,
} from '../js/obd/pids.js';

const turbo = (valores) => calcularDerivados(valores).TURBO;

test('turbo é a pressão do coletor menos a atmosférica, em bar', () => {
  // 201,3 kPa no coletor com 101,3 de atmosfera: 1,00 bar de sopro.
  assert.equal(turbo({ '0B': 201.3, 33: 101.3 }).toFixed(2), '1.00');
  // 151 com 101: meio bar.
  assert.equal(turbo({ '0B': 151.3, 33: 101.3 }).toFixed(2), '0.50');
});

test('motor desligado marca zero, não uma atmosfera', () => {
  // Chave na ignição, motor parado: o coletor está na pressão do ambiente.
  assert.equal(turbo({ '0B': 101, 33: 101 }).toFixed(2), '0.00');
});

test('marcha lenta dá vácuo, e o vácuo é mostrado como negativo', () => {
  // 30 kPa no coletor contra 101 de atmosfera: −0,71 bar. É o que realmente
  // está acontecendo — o pistão aspirando contra a borboleta fechada.
  assert.ok(turbo({ '0B': 30, 33: 101 }) < -0.6);
});

test('sem barômetro, usa a atmosférica padrão', () => {
  // Muito carro não tem o PID 33. Sem ele o turbo ainda é calculável; o que
  // muda é a confiança, e a tela é quem diz isso.
  const semBarometro = turbo({ '0B': 201.3 });
  assert.equal(semBarometro.toFixed(2), '1.00');
  assert.equal(ATMOSFERICA_PADRAO, 101.3);
  assert.equal(atmosfericaMedida({ '0B': 201.3 }), false);
  assert.equal(atmosfericaMedida({ '0B': 201.3, 33: 94 }), true);
});

test('sem a pressão do coletor não há turbo — e não um zero', () => {
  // Zero diria «sem sopro»; ausência diz «não sei». São coisas diferentes, e um
  // mostrador de turbo travado em 0,00 faria desconfiar do turbo, não do app.
  assert.equal('TURBO' in calcularDerivados({ 33: 101 }), false);
  assert.equal('TURBO' in calcularDerivados({}), false);
});

test('o derivado só é oferecido a carro que tem o PID de base', () => {
  assert.deepEqual(derivadosPossiveis(['0C', '0D', '0B']), ['TURBO']);
  assert.deepEqual(derivadosPossiveis(['0C', '0D']), []);
});

test('o derivado se descreve como qualquer PID', () => {
  // É o que permite ponteiro, gráfico e planilha funcionarem sem saber que a
  // origem é uma subtração, e não uma resposta do carro.
  const definicao = definicaoDe('TURBO');
  assert.equal(definicao.unidade, 'bar');
  assert.equal(definicao.casas, 2);
  assert.ok(definicao.min < 0, 'a escala precisa descer abaixo de zero para mostrar vácuo');
  assert.ok(definicao.max > 0);
  assert.deepEqual(DERIVADOS.TURBO.precisa, ['0B']);
});

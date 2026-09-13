/**
 * As contas dos PIDs.
 *
 * Cada uma é verificada contra um valor conhecido da norma SAE J1979, porque
 * uma conta errada aqui não quebra nada: mostra um número plausível. Rotação
 * dividida por 2 em vez de 4 dá 3.600 rpm em marcha lenta — número possível,
 * completamente errado, e ninguém desconfia do aplicativo.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { decodificar, lerInventario, lerStatusDaLuz, conhecidosEntre, definicaoDe } from '../js/obd/pids.js';

test('rotação: (A*256+B)/4', () => {
  assert.equal(decodificar('0C', [0x1a, 0xf8]), 1726);
  assert.equal(decodificar('0C', [0x0c, 0x38]), 782);
});

test('velocidade: A, direto em km/h', () => {
  assert.equal(decodificar('0D', [0x50]), 80);
});

test('temperaturas têm o deslocamento de 40 graus', () => {
  // Sem o −40 não existiria temperatura negativa, e um motor a −5 °C numa manhã
  // fria apareceria como 35 °C.
  assert.equal(decodificar('05', [0x00]), -40);
  assert.equal(decodificar('05', [0x7b]), 83);
  assert.equal(decodificar('0F', [0x46]), 30);
});

test('percentuais são sobre 255, não sobre 100', () => {
  assert.equal(decodificar('11', [0xff]), 100);
  assert.equal(decodificar('04', [0x80]).toFixed(1), '50.2');
});

test('fluxo de ar e tensão têm casas decimais', () => {
  assert.equal(decodificar('10', [0x07, 0xd0]), 20);
  assert.equal(decodificar('42', [0x37, 0x2c]), 14.124);
});

test('avanço de ignição é assinado', () => {
  assert.equal(decodificar('0E', [0x80]), 0);
  assert.equal(decodificar('0E', [0x00]), -64);
});

test('bytes de menos não viram número', () => {
  // Resposta truncada existe, e um `undefined` no meio da conta daria `NaN` —
  // que na tela aparece como número estranho em vez de «sem leitura».
  assert.equal(decodificar('0C', [0x1a]), null);
  assert.equal(decodificar('ZZ', [0x01]), null);
});

test('o inventário lê o bit mais significativo como o primeiro PID', () => {
  // `41 00 BE 1F A8 13`: a norma numera do bit mais alto do primeiro byte para
  // o mais baixo do último. Ler ao contrário inverteria a lista inteira.
  const { suportados, temProximoBloco } = lerInventario('00', [0xbe, 0x1f, 0xa8, 0x13]);
  assert.deepEqual(suportados.slice(0, 5), ['01', '03', '04', '05', '06']);
  assert.ok(suportados.includes('0C'));
  assert.ok(suportados.includes('0D'));
  assert.equal(temProximoBloco, true);
});

test('o último bit anuncia o próximo bloco e não é PID', () => {
  const { suportados, temProximoBloco } = lerInventario('00', [0x00, 0x00, 0x00, 0x01]);
  assert.deepEqual(suportados, []);
  assert.equal(temProximoBloco, true);
});

test('o segundo bloco começa no PID 21', () => {
  const { suportados } = lerInventario('20', [0x80, 0x00, 0x00, 0x00]);
  assert.deepEqual(suportados, ['21']);
});

test('a luz de anomalia vem do bit mais alto, e a contagem dos sete de baixo', () => {
  assert.deepEqual(lerStatusDaLuz([0x83, 0x07, 0xe5, 0x00]), { luzAcesa: true, falhas: 3 });
  assert.deepEqual(lerStatusDaLuz([0x00]), { luzAcesa: false, falhas: 0 });
});

test('só os PIDs conhecidos entram no plano de leitura', () => {
  const conhecidos = conhecidosEntre(['0C', '0D', '9Z', 'A5']);
  assert.deepEqual(conhecidos, ['0C', '0D']);
});

test('todo PID declara unidade, ritmo e a conta', () => {
  for (const pid of ['0C', '0D', '05', '10', '42']) {
    const definicao = definicaoDe(pid);
    assert.ok(definicao.unidade, `${pid} sem unidade`);
    assert.ok(definicao.ritmo, `${pid} sem ritmo`);
    assert.equal(typeof definicao.decodificar, 'function');
  }
});

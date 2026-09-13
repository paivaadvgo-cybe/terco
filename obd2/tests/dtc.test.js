/**
 * Códigos de falha.
 *
 * O caso que este arquivo existe para travar é o do byte de contagem: em CAN o
 * carro manda quantos códigos existem antes de mandá-los, e nos protocolos
 * antigos não manda. Ler o byte errado desloca tudo em oito bits, e um `P0301`
 * — falha de combustão no cilindro 1 — vira `P0103`, que é sensor de fluxo de
 * ar. Dois diagnósticos diferentes, os dois plausíveis.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { codigoDeBytes, codigosDeDados, descrever, generico } from '../js/obd/dtc.js';

test('os dois bits mais altos escolhem a letra', () => {
  assert.equal(codigoDeBytes(0x01, 0x33), 'P0133');
  assert.equal(codigoDeBytes(0x41, 0x33), 'C0133');
  assert.equal(codigoDeBytes(0x81, 0x33), 'B0133');
  assert.equal(codigoDeBytes(0xc1, 0x33), 'U0133');
});

test('o segundo dígito vem dos dois bits seguintes', () => {
  assert.equal(codigoDeBytes(0x11, 0x33), 'P1133');
  assert.equal(codigoDeBytes(0x31, 0x33), 'P3133');
});

test('os três últimos dígitos são hexadecimais', () => {
  // Existe `P01AF`: tratar os nibbles como decimal produziria um código
  // inexistente que nenhum manual encontra.
  assert.equal(codigoDeBytes(0x01, 0xaf), 'P01AF');
});

test('resposta CAN: o primeiro byte é a contagem', () => {
  // `43 02 01 33 01 47` — dois códigos.
  assert.deepEqual(codigosDeDados([0x02, 0x01, 0x33, 0x01, 0x47]), ['P0133', 'P0147']);
});

test('resposta antiga: sem contagem, e completada com zeros', () => {
  // `43 01 33 01 47 00 00` — dois códigos e enchimento.
  assert.deepEqual(codigosDeDados([0x01, 0x33, 0x01, 0x47, 0x00, 0x00]), ['P0133', 'P0147']);
});

test('`0000` é enchimento de quadro, não o código P0000', () => {
  assert.deepEqual(codigosDeDados([0x00, 0x00, 0x00, 0x00]), []);
});

test('sem falha nenhuma, a lista é vazia', () => {
  assert.deepEqual(codigosDeDados([0x00]), []);
  assert.deepEqual(codigosDeDados([]), []);
});

test('o mesmo código não aparece duas vezes', () => {
  // Duas centrais podem relatar a mesma falha; a lista é do carro, não de cada
  // módulo.
  assert.deepEqual(codigosDeDados([0x02, 0x01, 0x33, 0x01, 0x33]), ['P0133']);
});

test('código genérico é o que a norma define', () => {
  assert.equal(generico('P0301'), true);
  assert.equal(generico('P1345'), false);
});

test('descreve o que conhece e admite o que não conhece', () => {
  assert.match(descrever('P0301').texto, /cilindro 1/);
  assert.equal(descrever('P0301').certeza, 'conhecido');

  // Chutar significado de código de fabricante seria pior que calar: quem lê um
  // diagnóstico errado com confiança troca peça boa.
  const fabricante = descrever('P1345');
  assert.equal(fabricante.certeza, 'desconhecido');
  assert.match(fabricante.texto, /fabricante/);
  assert.ok(fabricante.familia);
});

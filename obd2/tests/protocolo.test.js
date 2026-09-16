/**
 * O protocolo do ELM327.
 *
 * As respostas usadas aqui são as que o adaptador realmente devolve, com todas
 * as inconveniências: eco ligado, `SEARCHING...` no meio, espaços que aparecem
 * e somem conforme `ATS`, resposta partida em quadros e resposta de mais de uma
 * central. Um analisador que só entende a resposta limpa funciona na bancada e
 * falha no carro.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  linhasDaResposta, avisoDaLinha, juntarQuadros, bytesDaLinha,
  interpretar, dadosDoServico, comandoDePid, hexa,
} from '../js/obd/protocolo.js';

test('descarta o eco do comando', () => {
  // Com `ATE0` ainda não aplicado, a primeira linha é a pergunta.
  const linhas = linhasDaResposta('010C\r41 0C 1A F8\r\r>', '010C');
  assert.deepEqual(linhas, ['41 0C 1A F8']);
});

test('descarta o eco mesmo com espaçamento diferente', () => {
  const linhas = linhasDaResposta('01 0c\r410C1AF8\r>', '010C');
  assert.deepEqual(linhas, ['410C1AF8']);
});

test('descarta o SEARCHING da primeira consulta', () => {
  const linhas = linhasDaResposta('SEARCHING...\r41 00 BE 3E B8 11\r\r>', '0100');
  assert.deepEqual(linhas, ['41 00 BE 3E B8 11']);
});

test('separa aviso de dado, e grave de não grave', () => {
  assert.equal(avisoDaLinha('NO DATA').grave, false);
  assert.equal(avisoDaLinha('UNABLE TO CONNECT').grave, true);
  /*
   * E diz o que fazer, não só o que houve.
   *
   * É a falha mais comum de uma primeira conexão, e a causa é quase sempre a
   * ignição desligada: o conector OBD tem energia permanente, então o adaptador
   * acende e responde a tudo, mas a linha do carro só acorda com a chave em
   * «ligado». Sem a dica, a mensagem manda procurar defeito num adaptador que
   * está funcionando — aconteceu num teste real.
   */
  assert.match(avisoDaLinha('UNABLE TO CONNECT').texto, /ignição/);
  assert.equal(avisoDaLinha('?').codigo, '?');
  assert.equal(avisoDaLinha('41 0C 1A F8'), null);
});

test('«NO DATA» não é resposta com dado', () => {
  const resposta = interpretar('NO DATA\r\r>', '015C');
  assert.equal(resposta.ok, false);
  assert.equal(resposta.aviso.codigo, 'NO DATA');
  // E não é grave: carro nenhum tem todos os PIDs, e desconectar por isso seria
  // desconectar em todo carro.
  assert.equal(resposta.aviso.grave, false);
});

test('remonta a resposta partida em quadros', () => {
  const partida = ['014', '0:49020131443447', '1:5030305235354231', '2:3233343536'];
  assert.deepEqual(juntarQuadros(partida), ['4902013144344750 30305235354231 3233343536'.replace(/ /g, '')]);
});

test('remonta na ordem dos números, não na de chegada', () => {
  // Os quadros podem chegar fora de ordem; a numeração existe por isso.
  assert.deepEqual(juntarQuadros(['1:BBBB', '0:AAAA']), ['AAAABBBB']);
});

test('bytes de uma linha, com e sem espaço', () => {
  assert.deepEqual(bytesDaLinha('41 0C 1A F8'), [0x41, 0x0c, 0x1a, 0xf8]);
  assert.deepEqual(bytesDaLinha('410C1AF8'), [0x41, 0x0c, 0x1a, 0xf8]);
  assert.deepEqual(bytesDaLinha('BUS INIT'), []);
});

test('confere o serviço e o PID antes de entregar o dado', () => {
  // Resposta de outra consulta, atrasada: aceitá-la mostraria a temperatura do
  // motor no lugar da rotação, e o número pareceria plausível.
  const linhas = ['41 05 5A'];
  assert.equal(dadosDoServico(linhas, 0x01, '0C'), null);
  assert.deepEqual(dadosDoServico(linhas, 0x01, '05'), [0x5a]);
});

test('escolhe a linha certa quando duas centrais respondem', () => {
  const linhas = ['41 0C 0F A0', '41 05 5A'];
  assert.deepEqual(dadosDoServico(linhas, 0x01, '05'), [0x5a]);
});

test('acha o serviço mesmo com cabeçalho de endereço na frente', () => {
  // Com `ATH1` ligado, a linha começa pelo endereço da central.
  assert.deepEqual(dadosDoServico(['7E8 03 41 0C 1A F8'], 0x01, '0C'), [0x1a, 0xf8]);
});

test('o comando pede uma resposta só', () => {
  // O dígito final faz o adaptador devolver assim que a primeira central
  // responde, em vez de esperar o tempo limite inteiro.
  assert.equal(comandoDePid(1, '0C', 1), '010C1');
  assert.equal(comandoDePid(1, '0C', 0), '010C');
  assert.equal(comandoDePid(3, null, 0), '03');
});

test('hexa com o número de dígitos pedido', () => {
  assert.equal(hexa(12), '0C');
  assert.equal(hexa(20, 3), '014');
});

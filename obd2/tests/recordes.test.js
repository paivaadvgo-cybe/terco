/**
 * Os máximos registrados.
 *
 * O defeito que este arquivo trava é o mais fácil de cometer e o mais chato de
 * descobrir: gravar o máximo da sessão por cima do máximo de sempre. Quem
 * conecta o aparelho na garagem para testar, sem andar, teria a máxima de
 * 130 km/h substituída pela de zero — e o número que a pessoa queria guardar
 * some sem nenhum erro aparecer.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { criarDriverEmMemoria } from '../js/armazenamento/memoria.js';
import { criarArmazenamento } from '../js/armazenamento/storage.js';
import { MAXIMOS_ACOMPANHADOS } from '../js/sessao.js';

const abrir = () => criarArmazenamento(criarDriverEmMemoria());

test('o recorde sobe quando o valor é maior', async () => {
  const armazenamento = await abrir();
  await armazenamento.guardarVeiculo({ vin: 'ABC', pids: ['0D'] });

  await armazenamento.registrarRecordes('ABC', { '0D': 88 });
  await armazenamento.registrarRecordes('ABC', { '0D': 132 });

  const veiculo = await armazenamento.veiculo('ABC');
  assert.equal(veiculo.recordes['0D'], 132);
});

test('o recorde nunca desce', async () => {
  const armazenamento = await abrir();
  await armazenamento.guardarVeiculo({ vin: 'ABC', pids: ['0D'] });
  await armazenamento.registrarRecordes('ABC', { '0D': 132 });

  // A sessão da garagem: conectou, não andou, desconectou.
  await armazenamento.registrarRecordes('ABC', { '0D': 0 });

  assert.equal((await armazenamento.veiculo('ABC')).recordes['0D'], 132);
});

test('recordes de grandezas diferentes não se atrapalham', async () => {
  const armazenamento = await abrir();
  await armazenamento.guardarVeiculo({ vin: 'ABC', pids: [] });

  await armazenamento.registrarRecordes('ABC', { '0D': 132, '0C': 5400, TURBO: 1.2 });
  await armazenamento.registrarRecordes('ABC', { '0D': 90, '0C': 6100, TURBO: 0.4 });

  const { recordes } = await armazenamento.veiculo('ABC');
  assert.equal(recordes['0D'], 132);
  assert.equal(recordes['0C'], 6100);
  assert.equal(recordes.TURBO, 1.2);
});

test('valor que não é número não entra', async () => {
  // Um PID sem resposta chega como `null`, e `null > 132` é falso — mas
  // `Number.isFinite` é o que garante que ele não vire o recorde num banco
  // vazio, onde não há o que comparar.
  const armazenamento = await abrir();
  await armazenamento.guardarVeiculo({ vin: 'ABC', pids: [] });
  await armazenamento.registrarRecordes('ABC', { '0D': null, '0C': undefined, TURBO: NaN });

  assert.deepEqual((await armazenamento.veiculo('ABC')).recordes, {});
});

test('registrar recordes de um carro que ainda não existe cria o registro', async () => {
  // Acontece quando o carro não informa chassi: o veículo entra como
  // «desconhecido» e os recordes chegam antes de qualquer outro dado dele.
  const armazenamento = await abrir();
  const veiculo = await armazenamento.registrarRecordes('desconhecido', { '0D': 77 });
  assert.equal(veiculo.recordes['0D'], 77);
});

test('zerar apaga os máximos e mantém o resto do carro', async () => {
  const armazenamento = await abrir();
  await armazenamento.guardarVeiculo({ vin: 'ABC', pids: ['0D'], adaptador: 'ELM327 v1.5' });
  await armazenamento.registrarRecordes('ABC', { '0D': 132 });

  await armazenamento.zerarRecordes('ABC');

  const veiculo = await armazenamento.veiculo('ABC');
  assert.deepEqual(veiculo.recordes, {});
  assert.equal(veiculo.adaptador, 'ELM327 v1.5', 'zerar recorde não pode apagar o que se sabe do carro');
});

test('o que se acompanha inclui a velocidade, que é o pedido central', () => {
  assert.ok(MAXIMOS_ACOMPANHADOS.includes('0D'));
  assert.ok(MAXIMOS_ACOMPANHADOS.includes('TURBO'));
});

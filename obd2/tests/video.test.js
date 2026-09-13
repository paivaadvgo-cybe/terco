/**
 * O vídeo guardado com a viagem.
 *
 * A câmera em si não se testa aqui — ela vive no navegador, e é verificada
 * abrindo o aplicativo. O que se testa é o que sobra depois dela, que é onde
 * dá para perder gravação sem ninguém notar: o trecho precisa guardar a hora em
 * que começou (sem ela não há sincronia com os dados), precisa sair junto com a
 * viagem (senão ocupa dezenas de megabytes sem nenhuma tela que o mostre), e
 * precisa voltar em ordem.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { criarDriverEmMemoria } from '../js/armazenamento/memoria.js';
import { criarArmazenamento } from '../js/armazenamento/storage.js';
import { criarAmostra } from '../js/dominio/viagem.js';
import { DURACAO_DO_TRECHO } from '../js/armazenamento/esquema.js';

const abrir = () => criarArmazenamento(criarDriverEmMemoria());

/** Um `Blob` de mentira, do tamanho pedido. */
const trechoFalso = (bytes) => new Blob([new Uint8Array(bytes)], { type: 'video/webm' });

test('o trecho guarda o instante em que começou e o tamanho', async () => {
  const armazenamento = await abrir();
  const viagem = await armazenamento.comecarViagem();
  const inicio = 1_700_000_000_000;

  const trecho = await armazenamento.guardarTrechoDeVideo(viagem.id, {
    blob: trechoFalso(2048),
    de: inicio,
    ate: inicio + DURACAO_DO_TRECHO,
    tipo: 'video/webm',
  });

  // Sem `de`, não há como dizer que aquele pico de rotação é este pedaço de
  // estrada — que é a razão de o vídeo existir.
  assert.equal(trecho.de, inicio);
  assert.equal(trecho.ate, inicio + DURACAO_DO_TRECHO);
  assert.equal(trecho.bytes, 2048);
  assert.equal(trecho.viagem, viagem.id);
});

test('os trechos voltam em ordem de tempo', async () => {
  const armazenamento = await abrir();
  const viagem = await armazenamento.comecarViagem();
  const inicio = 1_700_000_000_000;

  // Gravados fora de ordem de propósito: a gravação é assíncrona e nada garante
  // a ordem de chegada ao banco.
  for (const passo of [2, 0, 1]) {
    await armazenamento.guardarTrechoDeVideo(viagem.id, {
      blob: trechoFalso(1024),
      de: inicio + passo * DURACAO_DO_TRECHO,
      ate: inicio + (passo + 1) * DURACAO_DO_TRECHO,
    });
  }

  const trechos = await armazenamento.videosDa(viagem.id);
  assert.deepEqual(trechos.map((t) => t.de - inicio), [0, DURACAO_DO_TRECHO, 2 * DURACAO_DO_TRECHO]);
});

test('o vídeo de uma viagem não aparece em outra', async () => {
  const armazenamento = await abrir();
  const primeira = await armazenamento.comecarViagem();
  const segunda = await armazenamento.comecarViagem();

  await armazenamento.guardarTrechoDeVideo(primeira.id, { blob: trechoFalso(512), de: 1, ate: 2 });

  assert.equal((await armazenamento.videosDa(primeira.id)).length, 1);
  assert.deepEqual(await armazenamento.videosDa(segunda.id), []);
});

test('apagar a viagem apaga o vídeo junto', async () => {
  const armazenamento = await abrir();
  const viagem = await armazenamento.comecarViagem();
  await armazenamento.guardarAmostra(viagem.id, criarAmostra(1000, { '0D': 40 }));
  await armazenamento.guardarTrechoDeVideo(viagem.id, { blob: trechoFalso(4096), de: 1000, ate: 2000 });
  await armazenamento.encerrarViagem(viagem.id);

  await armazenamento.apagarViagem(viagem.id);

  // Trecho órfão é o pior tipo de lixo: ocupa megabytes e não há tela que o
  // mostre nem que permita apagá-lo.
  assert.deepEqual(await armazenamento.videosDa(viagem.id), []);
  assert.equal((await armazenamento.ocupacaoDeVideo()).trechos, 0);
});

test('a ocupação soma os trechos de todas as viagens', async () => {
  const armazenamento = await abrir();
  const primeira = await armazenamento.comecarViagem();
  const segunda = await armazenamento.comecarViagem();

  await armazenamento.guardarTrechoDeVideo(primeira.id, { blob: trechoFalso(1000), de: 1, ate: 2 });
  await armazenamento.guardarTrechoDeVideo(segunda.id, { blob: trechoFalso(3000), de: 1, ate: 2 });

  const ocupacao = await armazenamento.ocupacaoDeVideo();
  assert.equal(ocupacao.trechos, 2);
  assert.equal(ocupacao.bytes, 4000);
});

test('apagar tudo leva o vídeo junto', async () => {
  const armazenamento = await abrir();
  const viagem = await armazenamento.comecarViagem();
  await armazenamento.guardarTrechoDeVideo(viagem.id, { blob: trechoFalso(2048), de: 1, ate: 2 });

  await armazenamento.limparTudo();
  assert.equal((await armazenamento.ocupacaoDeVideo()).trechos, 0);
});

/**
 * O armazenamento, contra o driver em memória.
 *
 * O que se testa aqui é o caminho quente do aplicativo: gravar uma amostra por
 * segundo com o carro andando. Ele acumula em memória e descarrega em bloco, e
 * é justamente aí que dá para perder dado sem ninguém perceber — o resumo sai
 * com uma distância menor, e ninguém tem como saber que faltou meio minuto.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { criarDriverEmMemoria } from '../js/armazenamento/memoria.js';
import { criarArmazenamento, CONFIGURACAO_PADRAO } from '../js/armazenamento/storage.js';
import { AMOSTRAS_POR_BLOCO } from '../js/armazenamento/esquema.js';
import { criarAmostra } from '../js/dominio/viagem.js';

const abrir = () => criarArmazenamento(criarDriverEmMemoria());

test('a configuração nasce completa mesmo com o banco vazio', async () => {
  const armazenamento = await abrir();
  const configuracao = await armazenamento.configuracao();
  assert.equal(configuracao.combustivel, CONFIGURACAO_PADRAO.combustivel);
  assert.ok(Array.isArray(configuracao.painel) && configuracao.painel.length > 0);
});

test('ajustar preserva o que não foi mexido', async () => {
  const armazenamento = await abrir();
  await armazenamento.ajustar({ combustivel: 'etanol' });
  await armazenamento.ajustar({ tema: 'escuro' });
  const configuracao = await armazenamento.configuracao();
  assert.equal(configuracao.combustivel, 'etanol');
  assert.equal(configuracao.tema, 'escuro');
});

test('as amostras esperam encher o bloco antes de ir para o banco', async () => {
  const armazenamento = await abrir();
  const viagem = await armazenamento.comecarViagem();

  for (let i = 0; i < AMOSTRAS_POR_BLOCO - 1; i += 1) {
    await armazenamento.guardarAmostra(viagem.id, criarAmostra(1000 + i * 1000, { '0D': 50 }));
  }
  // Uma transação por segundo, com a tela desenhando ponteiros, é gasto por
  // nada: até encher o bloco, nada foi escrito.
  assert.equal((await armazenamento.amostrasDa(viagem.id)).length, 0);

  await armazenamento.guardarAmostra(viagem.id, criarAmostra(1000 + AMOSTRAS_POR_BLOCO * 1000, { '0D': 50 }));
  assert.equal((await armazenamento.amostrasDa(viagem.id)).length, AMOSTRAS_POR_BLOCO);
});

test('encerrar descarrega o que sobrou e calcula o resumo', async () => {
  const armazenamento = await abrir();
  const viagem = await armazenamento.comecarViagem();

  const inicio = 1_700_000_000_000;
  for (let i = 0; i <= 120; i += 1) {
    await armazenamento.guardarAmostra(viagem.id, criarAmostra(inicio + i * 1000, { '0D': 60, '0C': 2000 }));
  }

  const encerrada = await armazenamento.encerrarViagem(viagem.id);
  assert.equal(encerrada.amostras, 121);
  assert.equal(Math.round(encerrada.resumo.distancia * 100), 200); // 2 km em 2 min a 60 km/h
  assert.equal(encerrada.resumo.velocidadeMaxima, 60);
  // Nada ficou preso na memória depois de encerrar.
  assert.equal((await armazenamento.amostrasDa(viagem.id)).length, 121);
});

test('as amostras voltam em ordem, mesmo vindas de blocos diferentes', async () => {
  const armazenamento = await abrir();
  const viagem = await armazenamento.comecarViagem();
  const inicio = 1_700_000_000_000;

  for (let i = 0; i < AMOSTRAS_POR_BLOCO * 2 + 5; i += 1) {
    await armazenamento.guardarAmostra(viagem.id, criarAmostra(inicio + i * 1000, { '0D': i }));
  }
  await armazenamento.encerrarViagem(viagem.id);

  const amostras = await armazenamento.amostrasDa(viagem.id);
  const instantes = amostras.map((a) => a.t);
  assert.deepEqual(instantes, [...instantes].sort((a, b) => a - b));
  assert.equal(amostras[0].v['0D'], 0);
});

test('apagar a viagem apaga as amostras junto', async () => {
  const armazenamento = await abrir();
  const viagem = await armazenamento.comecarViagem();
  for (let i = 0; i < AMOSTRAS_POR_BLOCO + 2; i += 1) {
    await armazenamento.guardarAmostra(viagem.id, criarAmostra(1000 + i * 1000, { '0D': 10 }));
  }
  await armazenamento.encerrarViagem(viagem.id);

  await armazenamento.apagarViagem(viagem.id);
  assert.equal(await armazenamento.viagem(viagem.id), null);
  // Amostras órfãs ocupariam espaço para sempre, sem nenhuma tela que as
  // mostrasse ou permitisse apagar.
  assert.deepEqual(await armazenamento.amostrasDa(viagem.id), []);
});

test('as viagens vêm da mais recente para a mais antiga', async () => {
  const armazenamento = await abrir();
  const primeira = await armazenamento.comecarViagem();
  await new Promise((pronto) => { setTimeout(pronto, 2); });
  const segunda = await armazenamento.comecarViagem();

  const lista = await armazenamento.viagens();
  assert.equal(lista[0].id, segunda.id);
  assert.equal(lista[1].id, primeira.id);
});

test('o carro sem chassi não vira o mesmo registro de outro carro sem chassi', async () => {
  const armazenamento = await abrir();
  const semVin = await armazenamento.guardarVeiculo({ vin: null, pids: ['0C'] });
  const comVin = await armazenamento.guardarVeiculo({ vin: '9BGRD08X04G111111', pids: ['0C', '0D'] });
  assert.equal(semVin.id, 'desconhecido');
  assert.equal(comVin.id, '9BGRD08X04G111111');
  assert.equal((await armazenamento.veiculos()).length, 2);
});

test('apagar tudo não deixa resto', async () => {
  const armazenamento = await abrir();
  const viagem = await armazenamento.comecarViagem();
  await armazenamento.guardarAmostra(viagem.id, criarAmostra(1000, { '0D': 10 }));
  await armazenamento.encerrarViagem(viagem.id);
  await armazenamento.ajustar({ tema: 'escuro' });

  await armazenamento.limparTudo();
  assert.deepEqual(await armazenamento.viagens(), []);
  assert.equal((await armazenamento.configuracao()).tema, CONFIGURACAO_PADRAO.tema);
});

/* ----------------------------------------------------------------- backup */

/**
 * Um aparelho com uma viagem de dois blocos, um carro com recorde e um ajuste
 * fora do padrão — o suficiente para cada coleção do backup ter algo a perder.
 */
async function aparelhoComDados() {
  const armazenamento = await abrir();
  const viagem = await armazenamento.comecarViagem({ veiculo: '9BGRD08X04G111111' });
  for (let i = 0; i < AMOSTRAS_POR_BLOCO + 7; i += 1) {
    await armazenamento.guardarAmostra(viagem.id, criarAmostra(1_700_000_000_000 + i * 1000, { '0D': 40, '0C': 1800 }));
  }
  await armazenamento.encerrarViagem(viagem.id);
  await armazenamento.guardarVeiculo({ vin: '9BGRD08X04G111111', pids: ['0C', '0D'] });
  await armazenamento.registrarRecordes('9BGRD08X04G111111', { '0D': 137 });
  await armazenamento.ajustar({ tema: 'escuro', combustivel: 'etanol' });
  return { armazenamento, viagem };
}

/** O que a tela faz: o objeto vira texto num arquivo e volta de lá. */
const pelaViaDoArquivo = (backup) => JSON.parse(JSON.stringify(backup));

test('o backup vai e volta inteiro, inclusive num aparelho vazio', async () => {
  const { armazenamento: origem, viagem } = await aparelhoComDados();
  const backup = await origem.exportar();

  const destino = await abrir();
  const contagem = await destino.restaurar(pelaViaDoArquivo(backup));
  assert.equal(contagem.viagens, 1);
  assert.equal(contagem.amostras, 2);

  const restaurada = await destino.viagem(viagem.id);
  assert.equal(restaurada.amostras, AMOSTRAS_POR_BLOCO + 7);
  assert.equal(restaurada.resumo.velocidadeMaxima, 40);
  assert.equal((await destino.amostrasDa(viagem.id)).length, AMOSTRAS_POR_BLOCO + 7);
  assert.equal((await destino.veiculo('9BGRD08X04G111111')).recordes['0D'], 137);
  const configuracao = await destino.configuracao();
  assert.equal(configuracao.tema, 'escuro');
  assert.equal(configuracao.combustivel, 'etanol');
});

test('o backup carrega a identidade do aplicativo e deixa o vídeo de fora', async () => {
  const { armazenamento, viagem } = await aparelhoComDados();
  await armazenamento.guardarTrechoDeVideo(viagem.id, {
    blob: new Blob([new Uint8Array(1024)], { type: 'video/webm' }), de: 1, ate: 2,
  });

  const backup = await armazenamento.exportar();
  assert.equal(backup.aplicativo, 'obd2-painel');
  assert.equal(backup.formato, 1);
  assert.ok(!('videos' in backup.colecoes));
  // Sem Blob dentro, o arquivo é texto puro e cabe num compartilhamento.
  assert.equal(JSON.stringify(backup).includes('video/webm'), false);
});

test('exportar durante a gravação inclui o minuto que ainda estava na memória', async () => {
  const armazenamento = await abrir();
  const viagem = await armazenamento.comecarViagem();
  for (let i = 0; i < 5; i += 1) {
    await armazenamento.guardarAmostra(viagem.id, criarAmostra(1000 + i * 1000, { '0D': 30 }));
  }
  // Nada foi para o banco ainda — o bloco não encheu.
  assert.equal((await armazenamento.amostrasDa(viagem.id)).length, 0);

  const backup = await armazenamento.exportar();
  assert.equal(backup.colecoes.amostras.length, 1);
  assert.equal(backup.colecoes.amostras[0].pontos.length, 5);
  assert.equal(backup.colecoes.viagens[0].amostras, 5);
});

test('restaurar substitui o que havia, e não soma', async () => {
  const { armazenamento: origem } = await aparelhoComDados();
  const backup = pelaViaDoArquivo(await origem.exportar());

  const { armazenamento: destino, viagem: antiga } = await aparelhoComDados();
  await destino.ajustar({ tema: 'claro' });
  await destino.restaurar(backup);

  assert.equal((await destino.viagens()).length, 1);
  assert.equal(await destino.viagem(antiga.id), null);
  assert.deepEqual(await destino.amostrasDa(antiga.id), []);
  assert.equal((await destino.configuracao()).tema, 'escuro');
});

test('restaurar apaga o vídeo órfão e guarda o da viagem que continua', async () => {
  const { armazenamento, viagem: fica } = await aparelhoComDados();
  const backup = pelaViaDoArquivo(await armazenamento.exportar());

  const some = await armazenamento.comecarViagem();
  await armazenamento.encerrarViagem(some.id);
  const trecho = { blob: new Blob([new Uint8Array(16)], { type: 'video/webm' }), de: 1, ate: 2 };
  await armazenamento.guardarTrechoDeVideo(fica.id, trecho);
  await armazenamento.guardarTrechoDeVideo(some.id, trecho);

  await armazenamento.restaurar(backup);
  assert.equal((await armazenamento.videosDa(fica.id)).length, 1);
  // Um trecho sem viagem ocuparia dezenas de megabytes sem tela que o mostrasse.
  assert.deepEqual(await armazenamento.videosDa(some.id), []);
});

test('restaurar recusa arquivo de outro aplicativo sem tocar no que existe', async () => {
  const { armazenamento, viagem } = await aparelhoComDados();

  await assert.rejects(() => armazenamento.restaurar({ aplicativo: 'lava-rapido-lite', colecoes: {} }), /não é um backup/);
  await assert.rejects(() => armazenamento.restaurar(null), /não é um backup/);
  await assert.rejects(() => armazenamento.restaurar({ aplicativo: 'obd2-painel', colecoes: { viagens: 'x' } }), /corrompido/);

  assert.ok(await armazenamento.viagem(viagem.id));
  assert.equal((await armazenamento.configuracao()).tema, 'escuro');
});

test('restaurar esquece as amostras pendentes da viagem que deixou de existir', async () => {
  const { armazenamento: origem } = await aparelhoComDados();
  const backup = pelaViaDoArquivo(await origem.exportar());

  const destino = await abrir();
  const emCurso = await destino.comecarViagem();
  await destino.guardarAmostra(emCurso.id, criarAmostra(1000, { '0D': 10 }));
  await destino.restaurar(backup);

  // O que estava na fila não pode reaparecer como bloco de uma viagem apagada.
  assert.equal(await destino.descarregar(emCurso.id), null);
  assert.deepEqual(await destino.amostrasDa(emCurso.id), []);
});

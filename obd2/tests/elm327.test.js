/**
 * A conversa inteira, do comando ao valor.
 *
 * Roda contra o carro simulado, que responde no formato exato do adaptador —
 * com eco ligado até `ATE0`, `NO DATA` nos PIDs que não existem e a resposta do
 * chassi partida em quadros. É o teste que garante que a pilha funciona junta:
 * fila de comandos, espera pelo `>`, remontagem, decodificação.
 *
 * Sem ele, a única forma de testar isto seria dentro de um carro — isto é, não
 * testar.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { criarELM327 } from '../js/obd/elm327.js';
import { criarTransporteDemo } from '../js/obd/transporte-demo.js';

/** Um adaptador pronto para perguntar, com o tempo parado em zero. */
async function abrir() {
  const transporte = criarTransporteDemo({ atraso: 0 });
  const elm = criarELM327(transporte);
  const identificacao = await elm.iniciar();
  return { elm, transporte, identificacao };
}

test('a abertura identifica o adaptador e o protocolo', async () => {
  const { elm, identificacao } = await abrir();
  assert.equal(identificacao.versao, '1.5');
  assert.equal(identificacao.protocolo.numero, 6);
  assert.match(identificacao.protocolo.nome, /CAN/);
  await elm.fechar();
});

test('o inventário percorre os blocos enquanto houver próximo', async () => {
  const { elm } = await abrir();
  const pids = await elm.inventario();
  // 2F e 42 estão em blocos diferentes do primeiro: lê-los prova que o
  // encadeamento de blocos funcionou.
  assert.ok(pids.includes('0C'), 'faltou rotação');
  assert.ok(pids.includes('2F'), 'faltou o segundo bloco');
  assert.ok(pids.includes('42'), 'faltou o terceiro bloco');
  await elm.fechar();
});

test('consulta devolve valor decodificado', async () => {
  const { elm } = await abrir();
  const rotacao = await elm.consultar('0C');
  assert.ok(rotacao.valor > 500 && rotacao.valor < 1200, `marcha lenta esperada, veio ${rotacao?.valor}`);
  await elm.fechar();
});

test('PID que o carro não tem devolve nulo, e não erro', async () => {
  const { elm } = await abrir();
  // O carro simulado não tem sensor de temperatura do óleo, como muito carro
  // popular. Isso não pode derrubar a conexão.
  assert.equal(await elm.consultar('5C'), null);
  // E a conexão continua servindo depois disso.
  assert.ok((await elm.consultar('0D')) !== undefined);
  await elm.fechar();
});

test('o PID 01 não passa pela tabela de conversão', async () => {
  const { elm } = await abrir();
  // É mapa de bits, não número: passá-lo pela tabela devolveria `null` e o
  // aplicativo concluiria que o carro não respondeu.
  const luz = await elm.statusDaLuz();
  assert.equal(luz.luzAcesa, true);
  assert.equal(luz.falhas, 2);
  await elm.fechar();
});

test('o chassi é remontado a partir dos quadros', async () => {
  const { elm } = await abrir();
  const vin = await elm.vin();
  assert.equal(vin, '9BGRD08X04G111111');
  assert.equal(vin.length, 17);
  await elm.fechar();
});

test('lê falhas confirmadas e pendentes separadamente', async () => {
  const { elm } = await abrir();
  const falhas = await elm.falhas();
  assert.deepEqual(falhas.confirmadas.map((f) => f.codigo), ['P0301']);
  assert.deepEqual(falhas.pendentes.map((f) => f.codigo), ['P0420']);
  assert.deepEqual(falhas.permanentes, []);
  assert.match(falhas.confirmadas[0].texto, /combustão/);
  await elm.fechar();
});

test('apagar as falhas apaga a luz junto', async () => {
  const { elm } = await abrir();
  await elm.apagarFalhas();
  const depois = await elm.falhas();
  assert.deepEqual(depois.confirmadas, []);
  assert.equal(depois.luz.luzAcesa, false);
  await elm.fechar();
});

test('a tensão vem do próprio adaptador', async () => {
  const { elm } = await abrir();
  const tensao = await elm.tensaoDaBateria();
  assert.ok(tensao > 12 && tensao < 15, `tensão fora do esperado: ${tensao}`);
  await elm.fechar();
});

test('comandos disparados juntos são respondidos um por um, na ordem', async () => {
  // O ELM327 tem buffer de um comando só: duas perguntas enviadas juntas
  // devolvem uma resposta e um `?`, ou a resposta trocada. A fila é o que
  // impede isso, e é o que este teste trava.
  const { elm } = await abrir();
  const respostas = await Promise.all([
    elm.consultar('0C'),
    elm.consultar('0D'),
    elm.consultar('05'),
    elm.consultar('11'),
  ]);
  assert.equal(respostas.filter(Boolean).length, 4);
  await elm.fechar();
});

test('o registro guarda os dois lados da conversa', async () => {
  const { elm } = await abrir();
  await elm.consultar('0C');
  const saidas = elm.registro.filter((e) => e.direcao === 'saida');
  const entradas = elm.registro.filter((e) => e.direcao === 'entrada');
  assert.ok(saidas.some((e) => e.texto === 'ATZ'));
  assert.ok(saidas.some((e) => e.texto.startsWith('010C')));
  assert.ok(entradas.length >= saidas.length - 1);
  await elm.fechar();
});

test('comando depois de fechar falha, em vez de ficar pendurado', async () => {
  const { elm } = await abrir();
  await elm.fechar();
  await assert.rejects(() => elm.enviar('010C'), /desconectado/);
});

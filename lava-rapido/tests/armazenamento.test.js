/**
 * Testes do serviço de armazenamento.
 *
 * Rodam sobre o driver em memória, que copia o que entra e o que sai como o
 * IndexedDB faz. O que se verifica aqui é o comportamento que a tela depende:
 * o fluxo do atendimento inteiro, a dívida que não pode sumir, o backup que
 * precisa voltar igual, o PIN e a demonstração que não pode levar junto o
 * movimento de verdade.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { criarDriverEmMemoria } from '../js/armazenamento/memoria.js';
import { criarArmazenamento, CONFIGURACAO_PADRAO } from '../js/armazenamento/storage.js';
import { caixa } from '../js/dominio/caixa.js';
import { dia } from '../js/dominio/datas.js';

const INSTANTE = new Date(2026, 8, 12, 14, 35).getTime();

/**
 * Um relógio que anda.
 *
 * Congelar o tempo parecia mais simples e escondia um caso real: duas lavagens
 * gravadas no mesmo milissegundo empatam na ordenação, e o «último serviço» da
 * placa podia sair o primeiro. Com o relógio andando um minuto por leitura, a
 * ordem dos testes é a ordem dos fatos.
 */
function relogio(inicio = INSTANTE, passo = 60000) {
  let atual = inicio;
  return () => {
    const agora = atual;
    atual += passo;
    return agora;
  };
}

/** Um aplicativo recém-instalado, numa quinta à tarde. */
async function novo(agora = relogio()) {
  return criarArmazenamento(criarDriverEmMemoria(), { agora });
}

async function registrarHatch(armazenamento, extras = {}) {
  return armazenamento.registrarLavagem({
    placa: 'ABC1D23',
    tipo: 'hatch',
    modelo: 'Onix',
    servicoId: 'externa-interna',
    servicoNome: 'Lavagem Externa + Interna',
    valor: 4000,
    ...extras,
  });
}

/* ------------------------------------------------------------- semeadura */

test('a primeira abertura já vem utilizável', async () => {
  const a = await novo();
  assert.equal((await a.servicos()).length, 6);
  assert.equal((await a.precos()).length, 25);
  const configuracao = await a.configuracao();
  assert.equal(configuracao.nome, CONFIGURACAO_PADRAO.nome);
  assert.equal(configuracao.pin, null, 'sem PIN, nada fica trancado no primeiro dia');
});

test('reabrir não devolve os preços de fábrica a quem já reajustou', async () => {
  const driver = criarDriverEmMemoria();
  const primeira = await criarArmazenamento(driver, { agora: relogio() });
  await primeira.salvarPreco({ tipo: 'hatch', servicoId: 'externa', valor: 3000 });
  await primeira.salvarConfiguracao({ nome: 'Lava-Rápido do Zé' });

  const segunda = await criarArmazenamento(driver, { agora: relogio() });
  const tabela = await segunda.precos();
  assert.equal(tabela.find((p) => p.id === 'hatch:externa').valor, 3000);
  assert.equal((await segunda.configuracao()).nome, 'Lava-Rápido do Zé');
});

/* ------------------------------------------- o critério final de aceitação */

test('fluxo completo: registrar, iniciar, finalizar, receber, caixa e fechamento', async () => {
  const a = await novo();

  const opcoes = await a.opcoesDeServico('hatch');
  const escolhido = opcoes.find((o) => o.servico.id === 'externa-interna');
  assert.equal(escolhido.valor, 4000, 'o preço vem da tabela, não do código da tela');

  const lavagem = await registrarHatch(a, { valor: escolhido.valor });
  assert.equal(lavagem.estado, 'lavando', 'INICIAR LAVAGEM registra já em lavagem');
  assert.equal(lavagem.dia, dia(INSTANTE));

  assert.equal((await a.fila()).length, 1);
  assert.equal((await a.resumoDeHoje()).emLavagem, 1);

  await a.finalizar(lavagem.id);
  assert.equal((await a.fila()).length, 0, 'sai do pátio ao finalizar');
  assert.equal((await a.pendentes()).length, 1, 'e vira dívida enquanto não pagam');

  const paga = await a.receber(lavagem.id, 'pix');
  assert.equal(paga.estado, 'pago');
  assert.equal(paga.pagamento.forma, 'pix');
  assert.equal(paga.pagamento.valor, 4000);

  const resumo = await a.resumoDeHoje();
  assert.equal(resumo.lavagens, 1);
  assert.equal(resumo.recebido, 4000);
  assert.equal(resumo.pendentes, 0);
  assert.equal(resumo.movimento[0].id, lavagem.id, 'aparece no movimento do dia');

  const contas = caixa(await a.lavagensDoDia(dia(INSTANTE)));
  assert.equal(contas.faturamento, 4000);
  assert.equal(contas.porForma.pix, 4000);

  const backup = await a.exportar();
  assert.equal(backup.colecoes.lavagens.length, 1);
});

test('as cinco formas de pagamento chegam ao caixa, pendente inclusive', async () => {
  const a = await novo();
  const formas = ['pix', 'dinheiro', 'debito', 'credito'];
  for (const forma of formas) {
    const l = await registrarHatch(a, { valor: 1000 });
    await a.finalizar(l.id);
    await a.receber(l.id, forma);
  }
  const devendo = await registrarHatch(a, { valor: 2500 });
  await a.finalizar(devendo.id);
  await a.deixarPendente(devendo.id);

  const contas = caixa(await a.lavagensDoDia(dia(INSTANTE)));
  assert.deepEqual(contas.porForma, { pix: 1000, dinheiro: 1000, debito: 1000, credito: 1000 });
  assert.equal(contas.recebido, 4000);
  assert.equal(contas.pendente, 2500);
  assert.equal(contas.faturamento, 6500);
});

test('a lavagem pode ficar aguardando antes de começar', async () => {
  const a = await novo();
  const l = await registrarHatch(a);
  const guardada = await a.lavagem(l.id);
  assert.equal(guardada.estado, 'lavando', 'o padrão é começar na hora');

  const espera = await a.registrarLavagem({
    placa: 'XYZ2K44', tipo: 'sedan', servicoId: 'externa', servicoNome: 'Lavagem Externa', valor: 3000,
  }, { iniciarAgora: false });
  assert.equal(espera.estado, 'aguardando');
  assert.equal((await a.fila()).length, 2, 'quem espera também está no pátio');
  assert.equal((await a.resumoDeHoje()).emLavagem, 1, 'mas só um está sendo lavado');
});

/* ------------------------------------------------------------ a placa é o cliente */

test('a placa conhecida traz o histórico, sem cadastro nenhum', async () => {
  const a = await novo();
  assert.equal(await a.fichaDaPlaca('ABC1D23'), null, 'placa nova não inventa ficha');

  const primeira = await registrarHatch(a);
  await a.finalizar(primeira.id);
  await a.receber(primeira.id, 'pix');
  await registrarHatch(a, { servicoId: 'externa', servicoNome: 'Lavagem Externa', valor: 2500 });

  const ficha = await a.fichaDaPlaca('ABC1D23');
  assert.equal(ficha.lavagens, 2);
  assert.equal(ficha.tipo, 'hatch');
  assert.equal(ficha.modelo, 'Onix');
  assert.equal(ficha.ultimoServicoId, 'externa', 'a última é a primeira da lista');
});

test('lavagem sem placa é registrada e não cria veículo fantasma', async () => {
  const a = await novo();
  const l = await a.registrarLavagem({
    placa: null, tipo: 'outro', servicoId: 'externa', servicoNome: 'Lavagem Externa', valor: 3000,
  });
  assert.equal(l.placa, null);
  assert.equal((await a.veiculos()).length, 0);
  assert.equal((await a.resumoDeHoje()).lavagens, 1, 'e mesmo assim conta no movimento');
});

/* ----------------------------------------------------------------- dívida */

test('a dívida não some: fica nos pendentes até alguém receber', async () => {
  const a = await novo();
  const l = await registrarHatch(a, { valor: 7000 });
  await a.finalizar(l.id);
  await a.deixarPendente(l.id);

  let resumo = await a.resumoDeHoje();
  assert.equal(resumo.pendentes, 1);
  assert.equal(resumo.valorPendente, 7000);
  assert.equal(resumo.recebido, 0);

  await a.receber(l.id, 'dinheiro');
  resumo = await a.resumoDeHoje();
  assert.equal(resumo.pendentes, 0);
  assert.equal(resumo.recebido, 7000);
});

test('pendência de ontem continua aparecendo hoje', async () => {
  // O pior defeito possível numa tela de pendentes seria mostrar só as do dia:
  // a dívida de ontem sumiria da vista e nunca seria cobrada.
  const ontem = new Date(2026, 8, 11, 15).getTime();
  const driver = criarDriverEmMemoria();
  const dOntem = await criarArmazenamento(driver, { agora: relogio(ontem) });
  const l = await registrarHatch(dOntem, { valor: 4500 });
  await dOntem.finalizar(l.id);
  await dOntem.deixarPendente(l.id);

  const hoje = await criarArmazenamento(driver, { agora: relogio() });
  const resumo = await hoje.resumoDeHoje();
  assert.equal(resumo.lavagens, 0, 'o movimento de hoje é de hoje');
  assert.equal(resumo.pendentes, 1, 'a dívida de ontem continua à vista');
  assert.equal(resumo.valorPendente, 4500);
});

/* ------------------------------------------------------- cancelar e apagar */

test('cancelar tira das contas e mantém o rastro; apagar acerta a contagem da placa', async () => {
  const a = await novo();
  const primeira = await registrarHatch(a);
  const segunda = await registrarHatch(a);
  await a.cancelar(primeira.id, 'cliente desistiu');

  assert.equal((await a.resumoDeHoje()).lavagens, 1);
  assert.equal((await a.lavagem(primeira.id)).motivoDoCancelamento, 'cliente desistiu');
  assert.equal((await a.fichaDaPlaca('ABC1D23')).lavagens, 1, 'a cancelada sai do histórico da placa');

  await a.apagarLavagem(segunda.id);
  assert.equal(await a.lavagem(segunda.id), null);
  const veiculo = await a.veiculo('ABC1D23');
  assert.equal(veiculo.lavagens, 1, 'a contagem do veículo desce junto');
});

/* ------------------------------------------------------------- preços e serviços */

test('mudar o preço hoje não reescreve o que foi cobrado ontem', async () => {
  const a = await novo();
  const lavagem = await registrarHatch(a, { valor: 4000 });
  await a.salvarPreco({ tipo: 'hatch', servicoId: 'externa-interna', valor: 5000 });

  assert.equal((await a.lavagem(lavagem.id)).valor, 4000);
  const opcoes = await a.opcoesDeServico('hatch');
  assert.equal(opcoes.find((o) => o.servico.id === 'externa-interna').valor, 5000);
});

test('apagar o preço tira o serviço do atendimento daquele veículo', async () => {
  const a = await novo();
  await a.salvarPreco({ tipo: 'hatch', servicoId: 'externa-caixa', valor: null });
  const ids = (await a.opcoesDeServico('hatch')).map((o) => o.servico.id);
  assert.ok(!ids.includes('externa-caixa'));
});

test('remover um serviço leva os preços dele e deixa o histórico intacto', async () => {
  const a = await novo();
  const lavagem = await registrarHatch(a);
  await a.removerServico('externa-interna');

  assert.ok(!(await a.servicos()).some((s) => s.id === 'externa-interna'));
  assert.ok(!(await a.precos()).some((p) => p.servicoId === 'externa-interna'));
  assert.equal((await a.lavagem(lavagem.id)).servicoNome, 'Lavagem Externa + Interna',
    'o nome cobrado fica copiado dentro da lavagem justamente para isto');
});

test('serviço novo entra na lista e recebe preço', async () => {
  const a = await novo();
  const criado = await a.salvarServico({ nome: 'Lavagem de Motor' });
  assert.ok(criado.id);
  await a.salvarPreco({ tipo: 'suv', servicoId: criado.id, valor: 9000 });
  const opcoes = await a.opcoesDeServico('suv');
  assert.equal(opcoes.find((o) => o.servico.id === criado.id).valor, 9000);
});

/* ---------------------------------------------------------------- equipe */

test('funcionário fica registrado na lavagem e some do atendimento quando inativo', async () => {
  const a = await novo();
  const joao = await a.salvarFuncionario({ nome: 'João' });
  const lavagem = await registrarHatch(a, { funcionarioId: joao.id, funcionarioNome: joao.nome });
  assert.equal(lavagem.funcionarioNome, 'João');

  await a.salvarFuncionario({ ...joao, ativo: false });
  assert.equal((await a.funcionarios()).length, 0);
  assert.equal((await a.funcionarios({ incluirInativos: true })).length, 1);
  assert.equal((await a.lavagem(lavagem.id)).funcionarioNome, 'João', 'o histórico não muda');
});

/* --------------------------------------------------------------- despesas */

test('despesas entram no período e podem ser removidas', async () => {
  const a = await novo();
  await a.salvarDespesa({ descricao: 'Shampoo', valor: 18000, categoria: 'produto' });
  await a.salvarDespesa({ descricao: 'Água', valor: 9500, categoria: 'agua' });
  const despesas = await a.despesas();
  assert.equal(despesas.length, 2);
  assert.equal(despesas[0].dia, dia(INSTANTE));

  await a.removerDespesa(despesas[0].id);
  assert.equal((await a.despesas()).length, 1);
});

/* ------------------------------------------------------------------- PIN */

test('o PIN tranca o que muda dinheiro, e é guardado como resumo', async () => {
  const a = await novo();
  assert.equal(await a.temPin(), false);
  assert.equal(await a.conferirPin('qualquer'), true, 'sem PIN definido, nada está trancado');

  await a.definirPin('1234');
  const configuracao = await a.configuracao();
  assert.ok(await a.temPin());
  assert.ok(!String(configuracao.pin).includes('1234'), 'o PIN não pode ficar legível no banco');
  assert.equal(await a.conferirPin('1234'), true);
  assert.equal(await a.conferirPin('4321'), false);

  await a.definirPin('123456');
  assert.equal(await a.conferirPin('123456'), true);
  await a.definirPin(null);
  assert.equal(await a.temPin(), false);
});

/* ---------------------------------------------------------------- backup */

test('backup exporta tudo e a restauração devolve o mesmo movimento', async () => {
  const a = await novo();
  const l = await registrarHatch(a);
  await a.finalizar(l.id);
  await a.receber(l.id, 'pix');
  await a.salvarDespesa({ descricao: 'Cera', valor: 5000, categoria: 'produto' });
  await a.salvarFuncionario({ nome: 'Pedro' });
  await a.salvarConfiguracao({ nome: 'Lava-Rápido do Zé' });
  const backup = await a.exportar();

  for (const colecao of ['configuracao', 'servicos', 'precos', 'funcionarios', 'veiculos', 'lavagens', 'despesas']) {
    assert.ok(backup.colecoes[colecao], `falta ${colecao} no backup`);
  }

  // Outro aparelho, banco vazio.
  const outro = await novo();
  await outro.restaurar(backup);
  assert.equal((await outro.configuracao()).nome, 'Lava-Rápido do Zé');
  assert.equal((await outro.resumoDeHoje()).recebido, 4000);
  assert.equal((await outro.fichaDaPlaca('ABC1D23')).lavagens, 1);
  assert.equal((await outro.despesas()).length, 1);
  assert.equal((await outro.funcionarios()).length, 1);
});

test('restaurar substitui, e não mistura', async () => {
  // Somar o arquivo ao que já existe duplicaria o movimento de quem restaurou
  // no aparelho errado, e ninguém saberia dizer quais lavagens são reais.
  const a = await novo();
  const backupVazio = await a.exportar();
  await registrarHatch(a);
  assert.equal((await a.resumoDeHoje()).lavagens, 1);

  await a.restaurar(backupVazio);
  assert.equal((await a.resumoDeHoje()).lavagens, 0);
});

test('arquivo que não é backup do aplicativo é recusado', async () => {
  const a = await novo();
  await registrarHatch(a);
  await assert.rejects(() => a.restaurar({ aplicativo: 'outra-coisa' }), /não é um backup/);
  await assert.rejects(() => a.restaurar(null), /não é um backup/);
  assert.equal((await a.resumoDeHoje()).lavagens, 1, 'e nada foi apagado na tentativa');
});

/* ---------------------------------------------------------- demonstração */

test('a demonstração enche as telas e sai sem levar o que é real', async () => {
  const a = await novo();
  await a.instalarDemonstracao();
  const comDemo = await a.resumoDeHoje();
  assert.ok(comDemo.lavagens >= 4);
  assert.ok(comDemo.pendentes >= 1, 'a demonstração mostra também uma pendência');
  assert.ok((await a.funcionarios()).length >= 3);
  assert.equal((await a.configuracao()).demonstracao, true);

  // O dono experimenta de manhã e começa a usar à tarde, no mesmo aparelho.
  const real = await registrarHatch(a, { placa: 'ABC1D23' });

  await a.apagarDemonstracao();
  const depois = await a.resumoDeHoje();
  assert.equal(depois.lavagens, 1, 'só a lavagem de verdade fica');
  assert.equal(depois.movimento[0].id, real.id);
  assert.equal((await a.funcionarios()).length, 0);
  assert.equal((await a.configuracao()).demonstracao, false);
  assert.equal((await a.fichaDaPlaca('ABC1D23')).lavagens, 1,
    'a contagem da placa é refeita, e não apagada junto');
});

/* ------------------------------------------------------------- limpeza */

test('apagar movimento preserva preços e ajustes; apagar tudo recomeça', async () => {
  const a = await novo();
  await a.salvarPreco({ tipo: 'hatch', servicoId: 'externa', valor: 3300 });
  await a.salvarConfiguracao({ nome: 'Lava-Rápido do Zé' });
  await registrarHatch(a);

  await a.apagarMovimento();
  assert.equal((await a.resumoDeHoje()).lavagens, 0);
  assert.equal((await a.precos()).find((p) => p.id === 'hatch:externa').valor, 3300);
  assert.equal((await a.configuracao()).nome, 'Lava-Rápido do Zé');

  await a.apagarTudo();
  assert.equal((await a.precos()).find((p) => p.id === 'hatch:externa').valor, 2500, 'volta ao de fábrica');
  assert.equal((await a.configuracao()).nome, CONFIGURACAO_PADRAO.nome);
});

/* -------------------------------------------------------------- pagamentos */

test('a lista de pagamentos é montada a partir das lavagens pagas', async () => {
  const a = await novo();
  const l = await registrarHatch(a);
  await a.finalizar(l.id);
  await a.receber(l.id, 'debito');
  const pagamentos = await a.pagamentos();
  assert.equal(pagamentos.length, 1);
  assert.equal(pagamentos[0].forma, 'debito');
  assert.equal(pagamentos[0].valor, 4000);
  assert.equal(pagamentos[0].lavagemId, l.id);
});

/* ------------------------------------------------------------ fechamento */

test('o fechamento guardado é uma fotografia, e refazer sobrescreve', async () => {
  const a = await novo();
  const l = await registrarHatch(a);
  await a.finalizar(l.id);
  await a.receber(l.id, 'pix');

  await a.guardarFechamento({ dia: dia(INSTANTE), quantidade: 1, faturamento: 4000 });
  let guardado = await a.fechamento(dia(INSTANTE));
  assert.equal(guardado.faturamento, 4000);

  await a.guardarFechamento({ dia: dia(INSTANTE), quantidade: 2, faturamento: 6500 });
  guardado = await a.fechamento(dia(INSTANTE));
  assert.equal(guardado.faturamento, 6500);
  assert.equal((await a.fechamentos()).length, 1, 'um fechamento por dia');
});

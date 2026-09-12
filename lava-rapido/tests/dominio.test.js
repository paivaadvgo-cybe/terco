/**
 * Testes do domínio: placa, preços, estados e datas.
 *
 * São funções pequenas, sem banco e sem tela, e é exatamente por isso que
 * erram sem chamar atenção. Uma placa normalizada de dois jeitos diferentes
 * duplica o cliente no histórico; uma passagem de estado permitida a mais
 * transforma dois toques num botão molhado em dois registros de pagamento.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizar, eValida, paraRegistro, exibir } from '../js/dominio/placa.js';
import { tabelaPadrao, precoDe, chave, servicosDisponiveis } from '../js/dominio/precos.js';
import { SERVICOS_PADRAO, nomeCurto } from '../js/dominio/servicos.js';
import { TIPOS, nomeDoTipo } from '../js/dominio/veiculos.js';
import * as Lavagem from '../js/dominio/lavagem.js';
import { dia, inicioDoDia, fimDoDia, exibirDia, hora, intervalo, diasDoIntervalo } from '../js/dominio/datas.js';

/* ------------------------------------------------------------------ placa */

test('a placa é a mesma chave, tenha sido digitada como for', () => {
  // O mesmo carro digitado de cinco jeitos, no teclado do celular, em pé.
  for (const digitado of ['ABC1D23', 'abc1d23', 'abc-1d23', ' ABC 1D23 ', 'AbC1d23']) {
    assert.equal(normalizar(digitado), 'ABC1D23', `«${digitado}» deveria virar ABC1D23`);
  }
});

test('reconhece o padrão antigo e o Mercosul, e recusa o que não é placa', () => {
  assert.ok(eValida('ABC1234'), 'padrão antigo');
  assert.ok(eValida('ABC1D23'), 'Mercosul');
  assert.ok(eValida('XYZ9K88'), 'moto Mercosul');
  assert.ok(!eValida('AB1234'), 'curta demais');
  assert.ok(!eValida('ABCD123'), 'letra onde vai dígito');
  assert.ok(!eValida(''), 'vazia');
});

test('sem placa é nulo, e não uma placa vazia', () => {
  // Se `''` e `null` convivessem, haveria dois «sem placa» e um deles viraria
  // uma placa em branco no histórico, agrupando carros que nada têm em comum.
  assert.equal(paraRegistro(''), null);
  assert.equal(paraRegistro('   '), null);
  assert.equal(paraRegistro('abc1d23'), 'ABC1D23');
  assert.equal(exibir(null), 'SEM PLACA');
});

/* ------------------------------------------------------------------ preços */

test('a tabela inicial traz os valores do enunciado, em centavos', () => {
  const tabela = tabelaPadrao();
  assert.equal(precoDe(tabela, 'hatch', 'externa'), 2500);
  assert.equal(precoDe(tabela, 'hatch', 'completa'), 5500);
  assert.equal(precoDe(tabela, 'sedan', 'externa-interna'), 4500);
  assert.equal(precoDe(tabela, 'suv', 'externa-caixa'), 6500);
  assert.equal(precoDe(tabela, 'picape', 'completa'), 7500);
  assert.equal(precoDe(tabela, 'van', 'externa'), 4500);
  assert.equal(precoDe(tabela, 'moto', 'moto'), 1500);
});

test('célula sem preço é «não vendemos», e não «de graça»', () => {
  const tabela = tabelaPadrao();
  assert.equal(precoDe(tabela, 'moto', 'externa-interna'), null);
  const opcoes = servicosDisponiveis(SERVICOS_PADRAO, tabela, 'moto');
  const ids = opcoes.map((o) => o.servico.id);
  assert.deepEqual(ids, ['moto', 'personalizado'],
    'a moto só vende lavagem de moto e o personalizado');
  // E o preço zero jamais aparece como opção clicável com valor.
  assert.ok(!opcoes.some((o) => o.valor === 0));
});

test('o serviço personalizado está disponível para todo tipo de veículo', () => {
  const tabela = tabelaPadrao();
  for (const tipo of TIPOS) {
    const opcoes = servicosDisponiveis(SERVICOS_PADRAO, tabela, tipo.id);
    assert.ok(opcoes.some((o) => o.servico.personalizado),
      `${tipo.nome} ficaria sem saída se a tabela não cobrisse o caso`);
  }
});

test('serviço desativado some do atendimento sem sumir da tabela', () => {
  const tabela = tabelaPadrao();
  const servicos = SERVICOS_PADRAO.map((s) => (s.id === 'externa' ? { ...s, ativo: false } : s));
  const ids = servicosDisponiveis(servicos, tabela, 'hatch').map((o) => o.servico.id);
  assert.ok(!ids.includes('externa'));
  assert.ok(ids.includes('externa-interna'));
});

test('a chave do preço é estável', () => {
  assert.equal(chave('hatch', 'externa-interna'), 'hatch:externa-interna');
});

test('o nome curto cabe no cartão', () => {
  assert.equal(nomeCurto('Lavagem Externa + Interna + Caixa de Roda'), 'Externa + Interna + Caixa');
  // Sem podar o «de» junto, o cartão do movimento dizia «Biz · de Moto».
  assert.equal(nomeCurto('Lavagem de Moto'), 'Moto');
  assert.equal(nomeDoTipo('suv'), 'SUV');
  assert.equal(nomeDoTipo('inexistente'), 'inexistente');
});

/* ------------------------------------------------------------------ estados */

test('o fluxo do enunciado funciona inteiro', () => {
  let l = { estado: 'aguardando', valor: 4000 };
  l = Lavagem.iniciar(l, 100);
  assert.equal(l.estado, 'lavando');
  l = Lavagem.finalizar(l, 200);
  assert.equal(l.estado, 'finalizado');
  l = Lavagem.receber(l, 'pix', 300);
  assert.equal(l.estado, 'pago');
  assert.deepEqual(l.pagamento, { forma: 'pix', valor: 4000, em: 300 });
});

test('quem não recebe vai para pendente, e pendente ainda pode ser pago', () => {
  let l = Lavagem.marcarPendente(Lavagem.finalizar({ estado: 'lavando', valor: 2500 }, 1), 2);
  assert.equal(l.estado, 'pendente');
  l = Lavagem.receber(l, 'dinheiro', 3);
  assert.equal(l.estado, 'pago');
  assert.equal(l.pagamento.valor, 2500);
});

test('o segundo toque no botão molhado não registra nada', () => {
  // Defeito real de aplicativo de campo: o dedo bate duas vezes, e a segunda
  // finalização move a hora de conclusão ou cria um segundo pagamento.
  const paga = Lavagem.receber(Lavagem.finalizar({ estado: 'lavando', valor: 1000 }, 1), 'pix', 2);
  assert.throws(() => Lavagem.receber(paga, 'pix', 3), /não pode ir/);
  assert.throws(() => Lavagem.finalizar(paga, 4), /não pode ir/);
  assert.throws(() => Lavagem.iniciar(paga, 5), /não pode ir/);
});

test('forma de pagamento desconhecida é recusada', () => {
  const pronta = Lavagem.finalizar({ estado: 'lavando', valor: 1000 }, 1);
  assert.throws(() => Lavagem.receber(pronta, 'boleto', 2), /forma de pagamento/);
});

test('cancelar é possível de qualquer estado, inclusive do pago', () => {
  const paga = Lavagem.receber(Lavagem.finalizar({ estado: 'lavando', valor: 1000 }, 1), 'pix', 2);
  assert.equal(Lavagem.cancelar(paga, 'erro de digitação', 3).estado, 'cancelado');
  assert.equal(Lavagem.cancelar({ estado: 'aguardando' }, '', 1).estado, 'cancelado');
  // E de cancelado não se volta: seria ressuscitar dinheiro já retirado da conta.
  assert.throws(() => Lavagem.iniciar({ estado: 'cancelado' }, 1), /não pode ir/);
});

test('as classificações que a tela usa', () => {
  assert.ok(Lavagem.emAtendimento({ estado: 'lavando' }));
  assert.ok(Lavagem.emAtendimento({ estado: 'aguardando' }));
  assert.ok(!Lavagem.emAtendimento({ estado: 'finalizado' }));
  // Finalizado sem pagamento é dívida tanto quanto pendente: é a lavagem
  // entregue no meio do movimento em que ninguém tocou em botão nenhum.
  assert.ok(Lavagem.devendo({ estado: 'finalizado' }));
  assert.ok(Lavagem.devendo({ estado: 'pendente' }));
  assert.ok(!Lavagem.devendo({ estado: 'pago' }));
  assert.ok(Lavagem.recebida({ estado: 'pago' }));
});

/* ------------------------------------------------------------------- datas */

test('o dia é o do aparelho, e a lavagem da noite não escorrega para amanhã', () => {
  // Com `toISOString`, uma lavagem das 22h no Brasil cairia no dia seguinte, e
  // o fechamento não bateria com a gaveta.
  const noite = new Date(2026, 8, 12, 22, 30).getTime();
  assert.equal(dia(noite), '2026-09-12');
  assert.equal(exibirDia(dia(noite)), '12/09/2026');
  assert.equal(hora(noite), '22:30');
});

test('o intervalo de um dia inclui a virada e exclui o dia seguinte', () => {
  const meio = new Date(2026, 8, 12, 12).getTime();
  const hoje = intervalo('hoje', meio);
  const ultimoInstante = new Date(2026, 8, 12, 23, 59, 59, 999).getTime();
  assert.ok(ultimoInstante >= hoje.de && ultimoInstante < hoje.ate, 'a lavagem da virada precisa contar');
  assert.equal(hoje.ate, inicioDoDia('2026-09-13'));
  assert.equal(fimDoDia('2026-09-12'), inicioDoDia('2026-09-13'));
});

test('os filtros de período cobrem o que a tela oferece', () => {
  const agora = new Date(2026, 8, 12, 10).getTime();
  assert.equal(intervalo('ontem', agora).de, inicioDoDia('2026-09-11'));
  assert.equal(diasDoIntervalo(intervalo('7dias', agora)).length, 7);
  assert.equal(intervalo('mes', agora).de, inicioDoDia('2026-09-01'));
  const livre = intervalo('personalizado', agora, { de: '2026-08-01', ate: '2026-08-31' });
  assert.equal(livre.de, inicioDoDia('2026-08-01'));
  assert.equal(livre.ate, inicioDoDia('2026-09-01'));
  assert.equal(livre.rotulo, '01/08/2026 a 31/08/2026');
});

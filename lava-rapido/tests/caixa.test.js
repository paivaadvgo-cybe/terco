/**
 * Testes das contas: caixa, fechamento, despesas e resultado.
 *
 * É o único lugar do aplicativo onde um erro silencioso vira prejuízo. Um
 * cancelamento que continua somando, um pendente contado como recebido, um
 * ticket médio dividido pelo número errado de lavagens: nenhum desses quebra a
 * tela, todos aparecem como um número plausível — e é por isso que cada um
 * tem um teste com nome próprio aqui.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  caixa, porServico, porFuncionario, porTipo, totalDeDespesas, despesasPorCategoria,
  resultadoOperacional, fechamentoDoDia, resumoDoPeriodo, noIntervalo,
} from '../js/dominio/caixa.js';
import { dia, intervalo, diasDoIntervalo } from '../js/dominio/datas.js';

const HOJE = new Date(2026, 8, 12, 14, 0).getTime();
const emHoras = (h) => new Date(2026, 8, 12, h, 0).getTime();

const paga = (valor, forma, extras = {}) => ({
  estado: 'pago', valor, criadaEm: emHoras(9), dia: dia(emHoras(9)),
  pagamento: { forma, valor, em: emHoras(9) }, ...extras,
});

const pendente = (valor, extras = {}) => ({
  estado: 'pendente', valor, criadaEm: emHoras(10), dia: dia(emHoras(10)), ...extras,
});

test('o caixa separa o que foi vendido do que foi recebido', () => {
  const contas = caixa([
    paga(4000, 'pix'), paga(2500, 'dinheiro'), paga(4500, 'debito'),
    paga(7000, 'credito'), pendente(5000),
  ]);
  assert.equal(contas.quantidade, 5);
  assert.equal(contas.faturamento, 23000, 'faturamento inclui quem saiu devendo');
  assert.equal(contas.recebido, 18000, 'recebido é só o que entrou');
  assert.equal(contas.pendente, 5000);
  assert.deepEqual(contas.porForma, { pix: 4000, dinheiro: 2500, debito: 4500, credito: 7000 });
});

test('as quatro formas aparecem mesmo zeradas', () => {
  // Linha que some quando o valor é zero faz quem confere procurar o que não
  // sumiu — e desconfiar do resto da conta.
  const contas = caixa([paga(1000, 'pix')]);
  assert.deepEqual(Object.keys(contas.porForma), ['pix', 'dinheiro', 'debito', 'credito']);
  assert.equal(contas.porForma.credito, 0);
});

test('lavagem cancelada não entra em conta nenhuma', () => {
  const contas = caixa([paga(4000, 'pix'), { estado: 'cancelado', valor: 99900, criadaEm: emHoras(8) }]);
  assert.equal(contas.quantidade, 1);
  assert.equal(contas.faturamento, 4000);
  assert.equal(contas.ticketMedio, 4000);
});

test('o carro que ainda está no pátio não é faturamento', () => {
  // Contar a lavagem em andamento inflaria o caixa do dia com dinheiro que
  // ainda não existe — e que pode nunca existir, se o serviço for cancelado.
  const contas = caixa([paga(4000, 'pix'), { estado: 'lavando', valor: 5000, criadaEm: emHoras(13) }]);
  assert.equal(contas.quantidade, 1);
  assert.equal(contas.faturamento, 4000);
});

test('finalizado sem pagamento conta como pendente', () => {
  const contas = caixa([{ estado: 'finalizado', valor: 3000, criadaEm: emHoras(11) }]);
  assert.equal(contas.faturamento, 3000);
  assert.equal(contas.recebido, 0);
  assert.equal(contas.pendente, 3000);
});

test('o ticket médio divide pelo número de lavagens que contam', () => {
  const contas = caixa([paga(4000, 'pix'), paga(2500, 'pix'), { estado: 'cancelado', valor: 1000, criadaEm: 1 }]);
  assert.equal(contas.ticketMedio, 3250);
  assert.equal(caixa([]).ticketMedio, 0, 'dia sem movimento não divide por zero');
});

test('o caixa soma o valor efetivamente pago, não o de tabela', () => {
  // O pagamento guarda o próprio valor. Se um dia houver desconto, é o valor do
  // pagamento que vale — e o teste existe para que isso não se perca.
  const contas = caixa([{
    estado: 'pago', valor: 5000, criadaEm: emHoras(9),
    pagamento: { forma: 'pix', valor: 4500, em: emHoras(9) },
  }]);
  assert.equal(contas.recebido, 4500);
});

test('agrupamentos por serviço, tipo e funcionário', () => {
  const lavagens = [
    paga(4000, 'pix', { servicoId: 'ei', servicoNome: 'Externa + Interna', tipo: 'hatch', funcionarioId: '1', funcionarioNome: 'João' }),
    paga(4000, 'pix', { servicoId: 'ei', servicoNome: 'Externa + Interna', tipo: 'sedan', funcionarioId: '2', funcionarioNome: 'Pedro' }),
    paga(2500, 'pix', { servicoId: 'e', servicoNome: 'Externa', tipo: 'hatch', funcionarioId: '1', funcionarioNome: 'João' }),
    pendente(1500, { servicoId: 'm', servicoNome: 'Moto', tipo: 'moto' }),
  ];
  const servicos = porServico(lavagens);
  assert.equal(servicos[0].nome, 'Externa + Interna');
  assert.equal(servicos[0].quantidade, 2);
  assert.equal(servicos[0].valor, 8000);

  assert.deepEqual(porTipo(lavagens).map((t) => `${t.chave}:${t.quantidade}`), ['hatch:2', 'sedan:1', 'moto:1']);

  const equipe = porFuncionario(lavagens);
  assert.equal(equipe.length, 2, 'a lavagem sem responsável não inventa um');
  assert.equal(equipe[0].nome, 'João');
  assert.equal(equipe[0].quantidade, 2);
});

test('despesas somam e se agrupam por categoria', () => {
  const despesas = [
    { valor: 18000, categoria: 'produto' },
    { valor: 9500, categoria: 'agua' },
    { valor: 2000, categoria: 'produto' },
  ];
  assert.equal(totalDeDespesas(despesas), 29500);
  const categorias = despesasPorCategoria(despesas);
  assert.equal(categorias[0].chave, 'produto');
  assert.equal(categorias[0].valor, 20000);
});

test('resultado operacional é receita menos despesa, e pode ser negativo', () => {
  const contas = resultadoOperacional([paga(100000, 'pix'), pendente(25000)], [{ valor: 30000 }]);
  assert.equal(contas.receita, 125000);
  assert.equal(contas.recebido, 100000);
  assert.equal(contas.pendente, 25000);
  assert.equal(contas.despesas, 30000);
  assert.equal(contas.resultado, 95000);

  const ruim = resultadoOperacional([paga(5000, 'pix')], [{ valor: 12000 }]);
  assert.equal(ruim.resultado, -7000, 'um dia de prejuízo precisa aparecer como prejuízo');
});

test('o fechamento do dia junta tudo que a tela mostra', () => {
  const hoje = dia(HOJE);
  const lavagens = [
    paga(4000, 'pix', { servicoId: 'ei', servicoNome: 'Externa + Interna', tipo: 'hatch' }),
    paga(2500, 'dinheiro', { servicoId: 'e', servicoNome: 'Externa', tipo: 'hatch' }),
    pendente(7000, { servicoId: 'c', servicoNome: 'Completa', tipo: 'suv' }),
    { estado: 'cancelado', valor: 5000, criadaEm: emHoras(8), dia: hoje },
    // De ontem: não pode entrar no fechamento de hoje.
    { ...paga(9900, 'pix'), criadaEm: new Date(2026, 8, 11, 9).getTime(), dia: '2026-09-11' },
  ];
  const despesas = [{ valor: 3000, dia: hoje }, { valor: 1000, dia: '2026-09-11' }];
  const fecha = fechamentoDoDia(hoje, lavagens, despesas);

  assert.equal(fecha.dia, hoje);
  assert.equal(fecha.quantidade, 3);
  assert.equal(fecha.faturamento, 13500);
  assert.equal(fecha.recebido, 6500);
  assert.equal(fecha.pendente, 7000);
  assert.equal(fecha.ticketMedio, 4500);
  assert.equal(fecha.despesas, 3000, 'a despesa de ontem fica em ontem');
  assert.equal(fecha.resultado, 10500);
  assert.equal(fecha.canceladas, 1);
  assert.equal(fecha.servicos.length, 3);
});

test('o resumo do período tira a média pelos dias com movimento', () => {
  // Um lava-rápido que fecha domingo teria a média puxada para baixo por um dia
  // em que ninguém trabalhou — e a conta pareceria queda de movimento.
  const lavagens = [
    { ...paga(4000, 'pix'), criadaEm: new Date(2026, 8, 10, 9).getTime(), dia: '2026-09-10' },
    { ...paga(6000, 'pix'), criadaEm: new Date(2026, 8, 10, 11).getTime(), dia: '2026-09-10' },
    { ...paga(5000, 'pix'), criadaEm: new Date(2026, 8, 12, 9).getTime(), dia: '2026-09-12' },
  ];
  const periodo = intervalo('7dias', HOJE);
  const resumo = resumoDoPeriodo(lavagens, [], diasDoIntervalo(periodo));
  assert.equal(resumo.dias, 7);
  assert.equal(resumo.diasComMovimento, 2);
  assert.equal(resumo.mediaDiariaLavagens, 1.5);
  assert.equal(resumo.mediaDiariaFaturamento, 7500);
});

test('o recorte por intervalo usa fim exclusivo', () => {
  const periodo = intervalo('hoje', HOJE);
  const naVirada = { criadaEm: periodo.ate - 1 };
  const depois = { criadaEm: periodo.ate };
  assert.deepEqual(noIntervalo([naVirada, depois], periodo), [naVirada]);
});

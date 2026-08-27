/**
 * Testes das primitivas do motor: arredondamento, taxas e calendário.
 *
 * O plano de testes previa cinco arquivos, todos de regra financeira. Este
 * sexto existe porque arredondamento, unidade de taxa e contagem de dias são
 * onde os erros silenciosos nascem — uma taxa lida como 2,17 em vez de 0,0217
 * erra por cem vezes sem dar sinal, e é mais barato pegar isso aqui do que
 * dentro de um cronograma de duzentas parcelas.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { roundMoney, ehPraticamenteZero } from '../js/engine/arredondamento.js';
import {
  criarTaxa, taxaDePercentual, paraMensal, paraUnidade,
  comporPeriodos, aplicarBonus, descreverTaxa,
} from '../js/engine/juros.js';
import { gerarVencimentos, diasEntre } from '../js/engine/calendario.js';
import { ErroDeSimulacao } from '../js/engine/erros.js';

const perto = (obtido, esperado, tolerancia, rotulo) => assert.ok(
  Math.abs(obtido - esperado) <= tolerancia,
  `${rotulo}: obtido ${obtido}, esperado ${esperado} (tolerância ${tolerancia})`,
);

test('roundMoney desempata os casos que o binário deixa logo abaixo do meio', () => {
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(2.675), 2.68);
  assert.equal(roundMoney(-1.005), -1.01);
  assert.equal(roundMoney(1916.8055555555557), 1916.81);
  assert.equal(roundMoney(0), 0);
});

test('ehPraticamenteZero separa ruído de ponto flutuante de resíduo real', () => {
  assert.ok(ehPraticamenteZero(6.82e-12));
  assert.ok(!ehPraticamenteZero(0.01), 'um centavo é resíduo, não ruído');
  assert.ok(!ehPraticamenteZero(389.72));
});

test('a taxa carrega a unidade, e pontos percentuais viram decimal', () => {
  assert.deepEqual(taxaDePercentual(2.27, 'mensal'), { valor: 0.0227, unidade: 'mensal', tipo: 'efetiva' });
  assert.equal(descreverTaxa(criarTaxa(0.0217, 'mensal')), '2,1700% a.m.');
});

test('a conversão anual para mensal do FCO reproduz a planilha', () => {
  // 'FCO Empresarial'!C23 = (D16+1)^(1/12)-1, com D16 = 0,10267
  const mensal = paraMensal(criarTaxa(0.10267, 'anual'), 'mensalComposta');
  assert.equal(mensal.valor, 0.008177799635617378);
  assert.equal(mensal.unidade, 'mensal');
});

test('a convenção de dias úteis não é a composição em doze meses', () => {
  const anual = criarTaxa(0.05, 'anual');
  const diasUteis = paraMensal(anual, 'diasUteis').valor;
  const composta = paraMensal(anual, 'mensalComposta').valor;
  assert.ok(diasUteis > composta, 'o expoente 22/252 é maior que 1/12');
  perto(diasUteis / composta, 1.0477, 0.001, 'razão entre as duas convenções');
});

test('comporPeriodos monta a taxa dos pagamentos não mensais do FCO', () => {
  const mensal = criarTaxa(0.01, 'mensal');
  assert.equal(comporPeriodos(mensal, 1), mensal, 'período de um mês não altera a taxa');
  perto(comporPeriodos(mensal, 12).valor, 1.01 ** 12 - 1, 1e-15, 'doze meses');
});

test('ida e volta entre unidades preserva a taxa', () => {
  const mensal = criarTaxa(0.0165, 'mensal');
  perto(paraUnidade(paraUnidade(mensal, 'anual'), 'mensal').valor, 0.0165, 1e-15, 'mensal → anual → mensal');
});

test('o bônus por fator vale para as linhas de Giro e Investimento', () => {
  // 'Tabela de Encargos'!E5 = C5*0,77
  const cheia = criarTaxa(0.023951442892062056, 'mensal');
  const bonus = aplicarBonus(cheia, { tipo: 'fator', fator: 0.77 });
  assert.equal(bonus.valor, 0.018442611026887785);
});

test('o bônus tabelado de Transportes não é 0,77 da taxa cheia', () => {
  // GoiásFomento Taxi: cheia 2,19% a.m., com bônus 1,59% a.m.
  const cheia = criarTaxa(0.0219, 'mensal');
  const tabelado = aplicarBonus(cheia, { tipo: 'tabelado', taxa: criarTaxa(0.0159, 'mensal') });
  assert.equal(tabelado.valor, 0.0159);
  assert.notEqual(roundMoney(cheia.valor * 0.77, 6), 0.0159,
    'se coincidisse, o fator 0,77 poderia ser confundido com regra geral');
});

test('unidade desconhecida é erro, não conversão silenciosa', () => {
  assert.throws(() => criarTaxa(0.01, 'quinzenal'), (e) => (
    e instanceof ErroDeSimulacao && e.codigo === 'UNIDADE_DE_TAXA_DESCONHECIDA'
  ));
});

test('taxa não numérica é erro, e não vira NaN adiante', () => {
  assert.throws(() => criarTaxa(undefined, 'mensal'), (e) => (
    e instanceof ErroDeSimulacao && e.codigo === 'TAXA_INVALIDA'
  ));
  assert.throws(() => criarTaxa(NaN, 'mensal'), (e) => e.codigo === 'TAXA_INVALIDA');
});

test('o calendário de trinta dias é o da planilha', () => {
  const v = gerarVencimentos('2026-08-06', 3, '30dias');
  assert.deepEqual(v.map((x) => x.dataVencimento), ['2026-09-05', '2026-10-05', '2026-11-04']);
  assert.deepEqual(v.map((x) => x.diasDesdeLiberacao), [30, 60, 90]);
});

test('o calendário civil não escorrega para o mês seguinte', () => {
  const v = gerarVencimentos('2026-01-31', 3, 'civil');
  assert.deepEqual(v.map((x) => x.dataVencimento), ['2026-02-28', '2026-03-31', '2026-04-30']);
});

test('diasEntre atravessa a virada do ano', () => {
  assert.equal(diasEntre('2026-12-31', '2027-01-01'), 1);
  assert.equal(diasEntre('2026-01-01', '2027-01-01'), 365);
});

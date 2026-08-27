/**
 * Testes dos indexadores.
 *
 * O plano de testes não previa este arquivo. Ele existe porque a Fase 9 tem um
 * risco próprio, e não é de aritmética: o item 18 do escopo descreve a
 * arquitetura como «taxa base + indexador = taxa aplicável», e a planilha não
 * faz essa soma em lugar nenhum. Um teste que fixe isso é o que impede a
 * fórmula genérica de voltar por engano numa manutenção futura.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INDEXADORES, SELIC, TR, INPC,
  obterIndexador, sugerirValor, resolverIndexador, indexadorDoGrupo, COMPOSICOES,
} from '../js/indexadores/indexadores.js';
import { PARAMETROS } from '../js/data/parametros.js';
import { gerarCronogramaSAC } from '../js/engine/sac.js';
import { criarTaxa, paraMensal } from '../js/engine/juros.js';
import { ErroDeSimulacao } from '../js/engine/erros.js';

test('os três indexadores do escopo estão registrados e são independentes', () => {
  assert.deepEqual(Object.keys(INDEXADORES).sort(), ['INPC', 'SELIC', 'TR']);
  for (const codigo of Object.keys(INDEXADORES)) {
    const i = obterIndexador(codigo);
    assert.equal(i.codigo, codigo);
    assert.equal(i.unidade, 'anual');
    assert.ok(i.fonte && i.nome && i.descricao);
  }
});

test('as referências vêm da tabela de encargos, com a origem anotada', () => {
  assert.equal(SELIC.referencia.valor, 0.1375, "'Tabela de Encargos'!E37");
  assert.equal(TR.referencia.valor, 0.0119, "'Tabela de Encargos'!E43");
  assert.equal(SELIC.referencia.vigencia, PARAMETROS.versao);
  assert.match(SELIC.referencia.origem, /Tabela de Encargos/);
});

test('o INPC não tem referência, porque a planilha não traz nenhum valor dele', () => {
  // Ele aparece uma única vez no arquivo, e só como rótulo em Linhas Fungetur.
  assert.equal(INPC.referencia, null, 'nulo, e não zero — zero seria um número, e seria usado');
  assert.equal(sugerirValor('INPC'), null);
});

test('o valor do indexador é obrigatório, e a sugestão não é aplicada em silêncio', () => {
  // Um indexador defasado produz simulação plausível e errada; é para isso que
  // o item 38 do escopo prevê «Indexador não informado».
  for (const codigo of ['SELIC', 'TR', 'INPC']) {
    assert.throws(() => resolverIndexador(codigo), (e) => (
      e instanceof ErroDeSimulacao && e.codigo === 'INDEXADOR_NAO_INFORMADO'
    ), `${codigo} sem valor deveria recusar`);
  }
  // A mensagem carrega a sugestão, para quem precise dela.
  try {
    resolverIndexador('SELIC');
  } catch (e) {
    assert.match(e.message, /0\.1375/);
    assert.match(e.message, /Tabela de Encargos/);
  }
});

test('informado o valor, sai uma taxa com unidade', () => {
  const taxa = resolverIndexador('SELIC', { valor: 0.1 });
  assert.deepEqual(taxa, { valor: 0.1, unidade: 'anual', tipo: 'efetiva' });
  const mensal = resolverIndexador('TR', { valor: 0.0107, unidade: 'mensal' });
  assert.equal(mensal.unidade, 'mensal', 'a unidade pode ser sobrescrita quando a fonte for outra');
});

test('indexador desconhecido é erro, não silêncio', () => {
  assert.throws(() => obterIndexador('IGPM'), (e) => e.codigo === 'INDEXADOR_NAO_INFORMADO');
  assert.throws(() => resolverIndexador('CDI', { valor: 0.1 }), (e) => e.codigo === 'INDEXADOR_NAO_INFORMADO');
  // O código é aceito sem diferenciar maiúsculas.
  assert.equal(obterIndexador('selic').codigo, 'SELIC');
});

test('cada grupo da tabela de encargos aponta para o seu indexador, ou para nenhum', () => {
  assert.equal(indexadorDoGrupo('Linhas Fungetur', PARAMETROS).codigo, 'SELIC');
  assert.equal(indexadorDoGrupo('Linhas FINEP - PORTE I e II', PARAMETROS).codigo, 'TR');
  assert.equal(indexadorDoGrupo('Linhas FINEP - PORTE III', PARAMETROS).codigo, 'TR');
  assert.equal(indexadorDoGrupo('Linhas para Capital de Giro', PARAMETROS), null);
  assert.equal(indexadorDoGrupo('Linhas FCO Empresarial', PARAMETROS), null);
  assert.throws(() => indexadorDoGrupo('Linhas Inexistentes', PARAMETROS),
    (e) => e.codigo === 'PARAMETRO_INCOMPATIVEL');
});

test('a composição é componente separado, e não soma de taxas', () => {
  for (const codigo of Object.keys(INDEXADORES)) {
    assert.equal(obterIndexador(codigo).composicao, 'componenteSeparado');
  }
  assert.deepEqual(Object.keys(COMPOSICOES), ['componenteSeparado'],
    'não há modo de soma implementado, porque a planilha não tem nenhum');
});

test('somar as duas taxas daria outro número — é por isso que a soma não existe', () => {
  // O CASO 005 é 'Linhas Fungetur' com taxa fixa de 5% a.a. e indexador de 10%
  // a.a. O juro da primeira parcela vale 4.334,338197110748 na planilha.
  const entrada = {
    valorFinanciado: 1007000, valorSolicitado: 1000000, prazo: 60, carencia: 3,
    taxa: criarTaxa(0.05, 'anual'), convencaoTaxa: 'diasUteis',
  };

  const separado = gerarCronogramaSAC({ ...entrada, taxaIndexador: resolverIndexador('SELIC', { valor: 0.1 }) });
  assert.equal(separado.cronograma[0].juros, 4334.338197110748, "'Linhas Fungetur'!C24");

  // A leitura genérica — somar 5% e 10% numa taxa só de 15% — dá outra coisa.
  const somado = gerarCronogramaSAC({ ...entrada, taxa: criarTaxa(0.05 + 0.1, 'anual') });
  assert.notEqual(somado.cronograma[0].juros, separado.cronograma[0].juros);
  assert.ok(Math.abs(somado.cronograma[0].juros - separado.cronograma[0].juros) > 1000,
    'a diferença é de milhares de reais logo na primeira parcela, não de arredondamento');
});

test('o indexador rende à parte e ainda entra na base do juro fixo', () => {
  const entrada = {
    valorFinanciado: 1007000, valorSolicitado: 1000000, prazo: 60, carencia: 3,
    taxa: criarTaxa(0.05, 'anual'), convencaoTaxa: 'diasUteis',
    taxaIndexador: resolverIndexador('SELIC', { valor: 0.1 }),
  };
  const r = gerarCronogramaSAC(entrada);
  const p = r.cronograma[0];

  const iFixa = paraMensal(criarTaxa(0.05, 'anual'), 'diasUteis').valor;
  const iIndex = paraMensal(criarTaxa(0.1, 'anual'), 'diasUteis').valor;

  assert.equal(p.jurosIndexador, 1007000 * iIndex, 'o indexador rende sobre o saldo');
  assert.equal(p.juros, iFixa * (1007000 + p.jurosIndexador),
    'e o juro fixo incide sobre o saldo mais o juro do indexador do mesmo período');
  assert.ok(p.juros > 1007000 * iFixa, 'por isso o juro fixo é maior que o juro sobre o saldo puro');
  // O saldo não absorve o juro do indexador: ele é pago na prestação.
  assert.equal(p.saldoFinal, 1007000, 'na carência o saldo fica parado');
  assert.equal(p.prestacao, p.juros + p.jurosIndexador, 'os dois componentes são cobrados');
});

test('ABERTO-09 · a aba e a tabela discordam nas duas linhas indexadas', () => {
  // Fungetur: a aba rotula INPC e traz 10%; a tabela chama de Selic e traz 13,75%.
  // FINEP: o nome bate, mas a aba traz 1,07% contra 1,19% da tabela.
  // Os dois valores das abas são digitados à mão — a coluna que existiria para
  // buscá-los por linha está vazia. Nada disso foi conciliado.
  assert.notEqual(SELIC.referencia.valor, 0.1, 'o valor salvo na aba Fungetur não é o da tabela');
  assert.notEqual(TR.referencia.valor, 0.0107, 'o valor salvo na aba FINEP não é o da tabela');
  // Enquanto não houver decisão, o motor exige que alguém informe qual vale.
  assert.throws(() => resolverIndexador('SELIC'), (e) => e.codigo === 'INDEXADOR_NAO_INFORMADO');
});

/**
 * Testes do motor PRICE.
 *
 * O PRICE é extensão, não migração: a planilha não monta nenhum cronograma de
 * prestação constante. A única âncora do arquivo inteiro é a célula `AL18` de
 * 'Linhas Investimento', e é por isso que aqui há mais teste de propriedade —
 * prestação constante, amortização crescente, saldo que fecha — do que
 * comparação contra número da planilha: sem referência externa, é a coerência
 * interna que precisa carregar o peso.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { calcularPMT, gerarCronogramaPRICE } from '../js/engine/price.js';
import { gerarCronogramaSAC } from '../js/engine/sac.js';
import { criarTaxa } from '../js/engine/juros.js';
import { ErroDeSimulacao } from '../js/engine/erros.js';

const TOLERANCIA = 1e-9;
const TOLERANCIA_SALDO = 1e-6;

const perto = (obtido, esperado, rotulo, tolerancia = TOLERANCIA) => assert.ok(
  Math.abs(obtido - esperado) <= tolerancia,
  `${rotulo}: obtido ${obtido}, esperado ${esperado} (tolerância ${tolerancia})`,
);

const base = {
  valorFinanciado: 100000,
  prazo: 60,
  carencia: 0,
  taxa: criarTaxa(0.0165, 'mensal'),
};

const rodar = (extra = {}) => gerarCronogramaPRICE({ ...base, ...extra });
const naParcela = (r, n) => r.cronograma[n - 1];

// ───────────────────────────────────────────────────── a âncora da planilha

test('PRICE-04 · a âncora AL18 de Linhas Investimento', () => {
  // AL18 = PMT(AJ18; AJ19; −AJ17), com AJ18 = TIR do fluxo com bônus.
  // O Excel guardou 2729.6846378193432; a diferença de 4,5e-13 é o último bit,
  // que a rotina interna dele arredonda de outro jeito. Fica muito abaixo da
  // tolerância, e persegui-la seria perseguir ruído binário.
  const pmt = calcularPMT(100000, 0.017859866497962784, 60);
  perto(pmt, 2729.6846378193432, 'AL18', 1e-9);
  assert.ok(Math.abs(pmt - 2729.6846378193432) < 1e-12, 'a diferença é de menos de um ULP');
});

// ───────────────────────────────────────────────────────────── propriedades

test('PRICE-01 · a prestação é a mesma em todas as parcelas', () => {
  const r = rodar();
  const prestacoes = r.cronograma.map((p) => p.prestacao);
  for (const valor of prestacoes) {
    perto(valor, prestacoes[0], 'prestação constante', 1e-9);
  }
  perto(r.totais.primeiraParcela, r.totais.ultimaParcela, 'primeira e última são iguais');
});

test('PRICE-02 · a amortização cresce e o juro diminui a cada parcela', () => {
  const r = rodar();
  for (let n = 2; n <= 60; n += 1) {
    assert.ok(naParcela(r, n).amortizacao > naParcela(r, n - 1).amortizacao,
      `a amortização da parcela ${n} deveria ser maior que a da anterior`);
    assert.ok(naParcela(r, n).juros < naParcela(r, n - 1).juros,
      `o juro da parcela ${n} deveria ser menor que o da anterior`);
  }
});

test('PRICE-03 · taxa zero: a prestação é o principal repartido', () => {
  const r = rodar({ prazo: 10, taxa: criarTaxa(0, 'mensal') });
  assert.equal(r.premissas.prestacaoConstante, 10000);
  for (const p of r.cronograma) {
    assert.equal(p.juros, 0);
    assert.equal(p.amortizacao, 10000);
  }
  assert.equal(r.totais.saldoResidual, 0);
});

test('PRICE-05 · o saldo fecha em todos os prazos', () => {
  const cenarios = [
    { prazo: 1, carencia: 0 }, { prazo: 12, carencia: 0 }, { prazo: 36, carencia: 3 },
    { prazo: 60, carencia: 12 }, { prazo: 144, carencia: 36 }, { prazo: 240, carencia: 120 },
  ];
  for (const cenario of cenarios) {
    const r = rodar(cenario);
    const rotulo = `prazo ${cenario.prazo}, carência ${cenario.carencia}`;
    perto(r.totais.saldoResidual, 0, `${rotulo}: saldo final`, TOLERANCIA_SALDO);
    perto(r.totais.totalAmortizacao, 100000, `${rotulo}: soma das amortizações`, TOLERANCIA_SALDO);
    assert.equal(r.avisos.length, 0, `${rotulo}: um PRICE bem formado não avisa nada`);
  }
});

test('PRICE · sem carência, a primeira amortização é a prestação menos o juro', () => {
  const r = rodar();
  perto(naParcela(r, 1).juros, 100000 * 0.0165, 'juro da primeira parcela');
  perto(naParcela(r, 1).amortizacao, r.premissas.prestacaoConstante - 100000 * 0.0165, 'amortização da primeira');
});

test('PRICE · carência com juros pagos: saldo constante e prestação igual ao juro', () => {
  const r = rodar({ carencia: 6 });
  for (let n = 1; n <= 6; n += 1) {
    const p = naParcela(r, n);
    assert.equal(p.regime, 'carencia');
    assert.equal(p.amortizacao, 0);
    assert.equal(p.saldoFinal, 100000);
    perto(p.prestacao, p.juros, `parcela ${n}: prestação é só o juro`);
  }
  assert.equal(r.premissas.pagamentos, 54, 'a prestação constante cobre as parcelas amortizantes');
});

test('PRICE · carência capitalizada: o juro seguinte incide sobre o saldo crescido', () => {
  // Regressão. O saldo cresce na carência, e a primeira parcela depois dela
  // precisa cobrar juros sobre o saldo crescido — não sobre o valor
  // financiado original. Quando esse acompanhamento falhava, o saldo final
  // fechava com dezenas de reais de sobra em vez de ruído de ponto flutuante.
  const r = rodar({ prazo: 48, carencia: 18, taxa: criarTaxa(0.005, 'mensal'), tratamentoCarencia: 'capitalizados' });
  const saldoEsperado = 100000 * 1.005 ** 18;
  perto(r.premissas.saldoAoFimDaCarencia, saldoEsperado, 'saldo ao fim da carência');
  perto(naParcela(r, 18).saldoFinal, saldoEsperado, 'saldo da última parcela de carência');
  perto(naParcela(r, 19).juros, saldoEsperado * 0.005, 'juro da primeira parcela amortizante');
  perto(r.totais.saldoResidual, 0, 'saldo final', TOLERANCIA_SALDO);
  for (let n = 1; n <= 18; n += 1) {
    assert.equal(naParcela(r, n).prestacao, 0, `nada é pago na parcela ${n}`);
  }
});

test('PRICE · periodicidade semestral', () => {
  const r = rodar({ prazo: 72, carencia: 12, periodicidade: 6 });
  const amortizantes = r.cronograma.filter((p) => p.amortizacao > 0);
  assert.equal(amortizantes.length, 10);
  assert.equal(r.premissas.pagamentos, 10);
  for (const p of amortizantes) {
    perto(p.prestacao, r.premissas.prestacaoConstante, `parcela ${p.parcela}: prestação constante`);
  }
  perto(r.totais.saldoResidual, 0, 'saldo final', TOLERANCIA_SALDO);
});

// ──────────────────────────────────────────────── o que o motor não aceita

test('PRICE · recusa a base de amortização divergente do saldo', () => {
  for (const base of ['planilha', 'valorSolicitado']) {
    assert.throws(() => rodar({ baseAmortizacao: base, valorSolicitado: 90000 }), (e) => (
      e instanceof ErroDeSimulacao && e.codigo === 'PARAMETRO_INCOMPATIVEL'
    ), `a base "${base}" deveria ser recusada`);
  }
});

test('PRICE · recusa indexador, em vez de inventar uma prestação não constante', () => {
  assert.throws(() => rodar({ taxaIndexador: criarTaxa(0.1, 'anual') }), (e) => (
    e instanceof ErroDeSimulacao && e.codigo === 'PARAMETRO_INCOMPATIVEL'
  ));
});

test('PRICE · as validações de prazo e carência valem igual ao SAC', () => {
  const casos = [
    [{ prazo: 0 }, 'PRAZO_INVALIDO'],
    [{ prazo: 12.5 }, 'PRAZO_INVALIDO'],
    [{ carencia: -1 }, 'CARENCIA_INVALIDA'],
    [{ prazo: 12, carencia: 12 }, 'CARENCIA_INVALIDA'],
    [{ valorFinanciado: 0 }, 'VALOR_INVALIDO'],
    [{ prazo: 60, carencia: 7, periodicidade: 6 }, 'PERIODICIDADE_INCOMPATIVEL'],
  ];
  for (const [entrada, codigo] of casos) {
    assert.throws(() => rodar(entrada), (e) => (
      e instanceof ErroDeSimulacao && e.codigo === codigo
    ), `${JSON.stringify(entrada)} deveria produzir ${codigo}`);
  }
  assert.throws(() => calcularPMT(100000, 0.01, 0), (e) => e.codigo === 'PRAZO_INVALIDO');
});

test('PRICE · nenhuma parcela contém NaN ou Infinity', () => {
  const r = rodar({ prazo: 96, carencia: 24, taxa: criarTaxa(0.15, 'anual') });
  for (const p of r.cronograma) {
    for (const campo of ['saldoInicial', 'juros', 'amortizacao', 'prestacao', 'saldoFinal']) {
      assert.ok(Number.isFinite(p[campo]), `parcela ${p.parcela}, campo ${campo}: ${p[campo]}`);
    }
  }
});

// ───────────────────────────────────────────── o que o comparador vai medir

test('PRICE contra SAC · a prestação começa menor e termina maior', () => {
  const entrada = { valorFinanciado: 100000, prazo: 60, carencia: 6, taxa: criarTaxa(0.0165, 'mensal') };
  const price = gerarCronogramaPRICE(entrada);
  const sac = gerarCronogramaSAC(entrada);

  const primeiraAmortizante = (r) => r.cronograma.find((p) => p.amortizacao > 0).prestacao;
  assert.ok(primeiraAmortizante(price) < primeiraAmortizante(sac),
    'a primeira parcela amortizante do PRICE é menor que a do SAC');
  assert.ok(price.totais.ultimaParcela > sac.totais.ultimaParcela,
    'a última parcela do PRICE é maior que a do SAC');
  assert.ok(price.totais.totalJuros > sac.totais.totalJuros,
    'o PRICE amortiza mais devagar, então paga mais juros no total');

  perto(price.totais.totalAmortizacao, sac.totais.totalAmortizacao,
    'os dois amortizam o mesmo principal', TOLERANCIA_SALDO);
});

test('PRICE e SAC devolvem a mesma forma de resultado', () => {
  const entrada = { valorFinanciado: 100000, prazo: 24, carencia: 3, taxa: criarTaxa(0.02, 'mensal') };
  const price = gerarCronogramaPRICE(entrada);
  const sac = gerarCronogramaSAC(entrada);

  assert.deepEqual(Object.keys(price).sort(), Object.keys(sac).sort());
  assert.deepEqual(Object.keys(price.totais).sort(), Object.keys(sac.totais).sort());
  assert.deepEqual(Object.keys(price.cronograma[0]).sort(), Object.keys(sac.cronograma[0]).sort());
  assert.equal(price.premissas.sistema, 'PRICE');
  assert.equal(sac.premissas.sistema, 'SAC');
});

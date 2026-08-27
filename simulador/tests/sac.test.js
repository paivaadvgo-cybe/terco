/**
 * Testes do motor SAC.
 *
 * Duas famílias. Os casos SAC-01 a SAC-14 verificam o comportamento do motor
 * em si; os casos âncora comparam contra números que o próprio Excel calculou
 * e deixou em cache no arquivo salvo — esses são a prova de que a
 * reimplementação reproduz a planilha, e não apenas uma ideia de SAC.
 *
 * A tolerância é apertada de propósito. A planilha não arredonda em etapa
 * nenhuma, então o motor deve bater com ela em precisão dupla; 1e-9 absorve
 * diferença de ordem de operações, não arredondamento. Onde a igualdade é
 * exata, o teste exige exatidão.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

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

const rodar = (extra = {}) => gerarCronogramaSAC({ ...base, ...extra });
const naParcela = (r, n) => r.cronograma[n - 1];

// ─────────────────────────────────────────────────────────── comportamento

test('SAC-01 · sem carência: amortização constante e saldo final zero', () => {
  const r = rodar();
  assert.equal(r.cronograma.length, 60);
  const amortizacoes = new Set(r.cronograma.map((p) => p.amortizacao));
  assert.equal(amortizacoes.size, 1, 'a amortização do SAC não varia');
  perto(naParcela(r, 1).amortizacao, 100000 / 60, 'amortização');
  perto(r.totais.saldoResidual, 0, 'saldo final', TOLERANCIA_SALDO);
  assert.equal(r.avisos.length, 0, 'um SAC bem formado não avisa nada');
});

test('SAC-02 · carência com juros pagos: saldo constante, prestação igual ao juro', () => {
  const r = rodar({ carencia: 6 });
  for (let n = 1; n <= 6; n += 1) {
    const p = naParcela(r, n);
    assert.equal(p.regime, 'carencia');
    assert.equal(p.amortizacao, 0, `parcela ${n} não amortiza`);
    assert.equal(p.saldoFinal, 100000, `parcela ${n} mantém o saldo`);
    perto(p.prestacao, p.juros, `parcela ${n}: prestação é só o juro`);
  }
  assert.equal(naParcela(r, 7).regime, 'amortizacao');
  perto(naParcela(r, 7).amortizacao, 100000 / 54, 'amortização divide o prazo menos a carência');
});

test('SAC-03 · carência capitalizada: saldo cresce e nada é pago', () => {
  const r = rodar({ carencia: 6, tratamentoCarencia: 'capitalizados' });
  for (let n = 1; n <= 6; n += 1) {
    const p = naParcela(r, n);
    assert.equal(p.prestacao, 0, `parcela ${n} não é paga`);
    assert.ok(p.saldoFinal > p.saldoInicial, `parcela ${n} faz o saldo crescer`);
  }
  perto(r.premissas.saldoAoFimDaCarencia, 100000 * 1.0165 ** 6, 'saldo ao fim da carência');
  perto(naParcela(r, 7).amortizacao, r.premissas.saldoAoFimDaCarencia / 54,
    'a amortização divide o saldo capitalizado, não o valor financiado');
  perto(r.totais.saldoResidual, 0, 'saldo final', TOLERANCIA_SALDO);
});

test('SAC-04 · prazo mínimo de uma parcela', () => {
  const r = rodar({ prazo: 1 });
  assert.equal(r.cronograma.length, 1);
  perto(naParcela(r, 1).amortizacao, 100000, 'a única parcela leva todo o principal');
  perto(r.totais.saldoResidual, 0, 'saldo final', TOLERANCIA_SALDO);
});

test('SAC-05 · prazo máximo de 240 parcelas', () => {
  const r = rodar({ prazo: 240, carencia: 60 });
  assert.equal(r.cronograma.length, 240);
  assert.equal(r.totais.quantidadeDeParcelasPagas, 240, 'a carência também é paga, só que sem amortizar');
  perto(r.totais.saldoResidual, 0, 'saldo final', TOLERANCIA_SALDO);
});

test('SAC-06 · taxa zero: prestação é só amortização', () => {
  const r = rodar({ taxa: criarTaxa(0, 'mensal') });
  for (const p of r.cronograma) {
    assert.equal(p.juros, 0);
    assert.equal(p.prestacao, p.amortizacao);
  }
  perto(r.totais.totalPago, 100000, 'sem juros, paga-se exatamente o principal', TOLERANCIA_SALDO);
});

test('SAC-07 · taxa elevada: juros decrescentes e nenhum valor inválido', () => {
  const r = rodar({ taxa: criarTaxa(0.10, 'mensal') });
  for (const p of r.cronograma) {
    assert.ok(Number.isFinite(p.juros) && Number.isFinite(p.prestacao),
      `parcela ${p.parcela} produziu valor não finito`);
  }
  for (let n = 2; n <= 60; n += 1) {
    assert.ok(naParcela(r, n).juros < naParcela(r, n - 1).juros,
      `o juro da parcela ${n} deveria ser menor que o da anterior`);
  }
});

test('SAC-08 · carência de prazo menos um: uma parcela leva todo o principal', () => {
  const r = rodar({ prazo: 12, carencia: 11 });
  assert.equal(r.cronograma.filter((p) => p.amortizacao > 0).length, 1);
  perto(naParcela(r, 12).amortizacao, 100000, 'a última parcela amortiza tudo');
  perto(r.totais.saldoResidual, 0, 'saldo final', TOLERANCIA_SALDO);
});

test('SAC-09 · carência igual ao prazo é recusada', () => {
  assert.throws(() => rodar({ prazo: 12, carencia: 12 }), (e) => (
    e instanceof ErroDeSimulacao && e.codigo === 'CARENCIA_INVALIDA'
  ));
  assert.throws(() => rodar({ prazo: 12, carencia: 13 }), (e) => e.codigo === 'CARENCIA_INVALIDA');
});

test('SAC-10 · periodicidade semestral: paga de seis em seis meses', () => {
  const r = rodar({ prazo: 72, carencia: 12, periodicidade: 6 });
  const pagas = r.cronograma.filter((p) => p.prestacao > 0);
  const amortizantes = r.cronograma.filter((p) => p.amortizacao > 0);
  assert.equal(amortizantes.length, 10, 'sessenta meses de amortização, a cada seis');
  assert.equal(pagas.length, 12, 'mais os dois semestres de carência, que pagam só o juro');
  for (const p of pagas) {
    assert.equal(p.parcela % 6, 0, `a parcela ${p.parcela} não é mês de pagamento`);
  }
  for (const p of r.cronograma.filter((x) => x.prestacao === 0)) {
    assert.equal(p.amortizacao, 0);
    assert.equal(p.juros, 0);
  }
  perto(amortizantes[0].amortizacao, 100000 / 60 * 6, 'a amortização do período acumula seis meses');
  assert.equal(amortizantes[0].parcela, 18, 'a primeira amortização é o semestre seguinte ao fim da carência');
  perto(pagas[0].amortizacao, 0, 'o primeiro pagamento ainda é de carência, e só paga juro');
  perto(r.totais.saldoResidual, 0, 'saldo final', TOLERANCIA_SALDO);
});

test('SAC-11 · periodicidade que não divide prazo ou carência é recusada', () => {
  // Prazo 60 com carência 6 e período 6 é compatível: 54 e 6 são múltiplos de 6.
  assert.doesNotThrow(() => rodar({ prazo: 60, carencia: 6, periodicidade: 6 }));
  // Carência 7 não é múltipla de 6, e o resto do prazo tampouco.
  assert.throws(() => rodar({ prazo: 60, carencia: 7, periodicidade: 6 }), (e) => (
    e instanceof ErroDeSimulacao && e.codigo === 'PERIODICIDADE_INCOMPATIVEL'
  ));
  // Carência múltipla, mas o prazo de amortização não.
  assert.throws(() => rodar({ prazo: 61, carencia: 6, periodicidade: 6 }), (e) => (
    e instanceof ErroDeSimulacao && e.codigo === 'PERIODICIDADE_INCOMPATIVEL'
  ));
  assert.throws(() => rodar({ periodicidade: 5 }), (e) => e.codigo === 'PARAMETRO_INCOMPATIVEL');
});

test('SAC-12 e SAC-13 · o saldo fecha e as amortizações somam o principal', () => {
  const cenarios = [
    { prazo: 1, carencia: 0 }, { prazo: 12, carencia: 0 }, { prazo: 36, carencia: 3 },
    { prazo: 60, carencia: 12 }, { prazo: 144, carencia: 36 }, { prazo: 240, carencia: 120 },
  ];
  for (const cenario of cenarios) {
    const r = rodar(cenario);
    const rotulo = `prazo ${cenario.prazo}, carência ${cenario.carencia}`;
    perto(r.totais.saldoResidual, 0, `${rotulo}: saldo final`, TOLERANCIA_SALDO);
    perto(r.totais.totalAmortizacao, 100000, `${rotulo}: soma das amortizações`, TOLERANCIA_SALDO);
  }
});

test('SAC-14 · a base "planilha" troca na parcela 13 e deixa resíduo', () => {
  const r = rodar({
    valorFinanciado: 103507.5, valorSolicitado: 100000,
    prazo: 60, carencia: 6, baseAmortizacao: 'planilha',
  });
  perto(naParcela(r, 12).amortizacao, 100000 / 54, 'a parcela 12 ainda divide o valor solicitado');
  perto(naParcela(r, 13).amortizacao, 103507.5 / 54, 'a parcela 13 já divide o financiado');
  assert.equal(naParcela(r, 12).memoria.baseAmortizacao, 'valorSolicitado');
  assert.equal(naParcela(r, 13).memoria.baseAmortizacao, 'valorFinanciado');

  perto(r.totais.saldoResidual, 389.7222222222, 'o resíduo de ABERTO-07', 1e-6);
  assert.equal(r.avisos.length, 1);
  assert.equal(r.avisos[0].codigo, 'SALDO_RESIDUAL');

  const corrigido = rodar({
    valorFinanciado: 103507.5, valorSolicitado: 100000,
    prazo: 60, carencia: 6, baseAmortizacao: 'valorFinanciado',
  });
  perto(corrigido.totais.saldoResidual, 0, 'com base única o saldo fecha', TOLERANCIA_SALDO);
});

test('entradas inválidas viram erro com código, nunca NaN', () => {
  const casos = [
    [{ prazo: 0 }, 'PRAZO_INVALIDO'],
    [{ prazo: 12.5 }, 'PRAZO_INVALIDO'],
    [{ prazo: null }, 'PRAZO_INVALIDO'],
    [{ carencia: -1 }, 'CARENCIA_INVALIDA'],
    [{ valorFinanciado: 0 }, 'VALOR_INVALIDO'],
    [{ valorFinanciado: -100 }, 'VALOR_INVALIDO'],
    [{ valorFinanciado: undefined }, 'VALOR_INVALIDO'],
    [{ baseAmortizacao: 'chute' }, 'PARAMETRO_INCOMPATIVEL'],
    [{ tratamentoCarencia: 'talvez' }, 'PARAMETRO_INCOMPATIVEL'],
  ];
  for (const [entrada, codigo] of casos) {
    assert.throws(() => rodar(entrada), (e) => (
      e instanceof ErroDeSimulacao && e.codigo === codigo
    ), `${JSON.stringify(entrada)} deveria produzir ${codigo}`);
  }
});

test('nenhuma parcela contém NaN ou Infinity', () => {
  const r = rodar({ prazo: 96, carencia: 24, taxa: criarTaxa(0.15, 'anual'), convencaoTaxa: 'mensalComposta' });
  for (const p of r.cronograma) {
    for (const campo of ['saldoInicial', 'juros', 'amortizacao', 'prestacao', 'saldoFinal']) {
      assert.ok(Number.isFinite(p[campo]), `parcela ${p.parcela}, campo ${campo}: ${p[campo]}`);
    }
  }
});

// ─────────────────────────────────────────── âncoras extraídas da planilha

test('CASO 001 · Linhas Investimento, valor a valor', () => {
  const r = gerarCronogramaSAC({
    valorFinanciado: 103507.5, valorSolicitado: 100000,
    prazo: 60, carencia: 6, taxa: criarTaxa(0.0165, 'mensal'),
    baseAmortizacao: 'planilha', dataProposta: '2026-08-06',
  });
  // Célula a célula, contra o cache do Excel.
  assert.equal(naParcela(r, 1).juros, 1707.87375, 'C24');
  assert.equal(naParcela(r, 1).amortizacao, 0, 'D24');
  assert.equal(naParcela(r, 1).saldoFinal, 103507.5, 'E24');
  assert.equal(naParcela(r, 7).juros, 1707.87375, 'C30');
  assert.equal(naParcela(r, 7).amortizacao, 1851.851851851852, 'D30');
  assert.equal(naParcela(r, 7).saldoFinal, 101655.64814814815, 'E30');
  assert.equal(naParcela(r, 7).prestacao, 3559.725601851852, 'F30');
  assert.equal(naParcela(r, 60).juros, 38.05770833333201, 'C83');
  assert.equal(naParcela(r, 60).amortizacao, 1916.8055555555557, 'D83');
  assert.equal(naParcela(r, 60).saldoFinal, 389.7222222221417, 'E83 — o resíduo de ABERTO-07');
  assert.equal(naParcela(r, 60).prestacao, 1954.8632638888876, 'F83');
});

test('CASO 002 · Linhas Giro Puro, incluindo a renda para aval', () => {
  const r = gerarCronogramaSAC({
    valorFinanciado: 62149.635, valorSolicitado: 60000,
    prazo: 60, carencia: 6, taxa: criarTaxa(0.005, 'mensal'),
    baseAmortizacao: 'valorFinanciado',
  });
  assert.equal(naParcela(r, 1).juros, 310.748175, 'C24');
  assert.equal(naParcela(r, 7).juros, 310.748175, 'C30');
  assert.equal(naParcela(r, 7).amortizacao, 1150.9191666666668, 'D30');
  assert.equal(naParcela(r, 7).saldoFinal, 60998.715833333335, 'E30');
  // B19 = LARGE(F23:F241;1)*3, acima do piso de 2.424,00
  assert.equal(r.totais.maiorParcela * 3, 4385.002025, 'B19, renda para aval');
  perto(r.totais.saldoResidual, 0, 'a base única fecha o saldo', TOLERANCIA_SALDO);
});

test('CASO 004 · FCO Empresarial: taxa anual convertida para mensal', () => {
  const r = gerarCronogramaSAC({
    valorFinanciado: 1007000, valorSolicitado: 1000000,
    prazo: 84, carencia: 12, taxa: criarTaxa(0.10267, 'anual'),
    convencaoTaxa: 'mensalComposta', baseAmortizacao: 'valorFinanciado',
  });
  assert.equal(r.premissas.taxaMensal.valor, 0.008177799635617378, 'C23');
  assert.equal(naParcela(r, 1).juros, 8235.0442330667, 'AN24');
  assert.equal(naParcela(r, 13).amortizacao, 13986.111111111111, 'AV24');
  perto(r.totais.saldoResidual, 0, 'saldo final', TOLERANCIA_SALDO);
});

test('CASO 005 · Linhas Fungetur: taxa fixa sobre saldo mais juro do indexador', () => {
  const r = gerarCronogramaSAC({
    valorFinanciado: 1007000, valorSolicitado: 1000000,
    prazo: 60, carencia: 3,
    taxa: criarTaxa(0.05, 'anual'), taxaIndexador: criarTaxa(0.1, 'anual'),
    convencaoTaxa: 'diasUteis', baseAmortizacao: 'valorFinanciado',
  });
  // C24 = ((C23+1)^(22/252)-1) * (F23 + D24) — a base inclui o juro do indexador
  assert.equal(naParcela(r, 1).juros, 4334.338197110748, 'C24');
  assert.ok(naParcela(r, 1).jurosIndexador > 0, 'o indexador cobra à parte');
  perto(r.totais.saldoResidual, 0, 'saldo final', TOLERANCIA_SALDO);
});

test('CASO 006 · Produtor Empreendedor: carência capitalizada', () => {
  const r = gerarCronogramaSAC({
    valorFinanciado: 54597.2, valorSolicitado: 50000,
    prazo: 48, carencia: 18, taxa: criarTaxa(0.005, 'mensal'),
    tratamentoCarencia: 'capitalizados',
  });
  assert.equal(naParcela(r, 1).saldoFinal, 54870.185999999994, 'BG24');
  assert.equal(naParcela(r, 1).prestacao, 0, 'nada é pago na carência');
  // BH23 = XLOOKUP(B16; A24:A71; BG24:BG71)
  assert.equal(r.premissas.saldoAoFimDaCarencia, 59725.45709935819, 'BH23');
  perto(r.totais.saldoResidual, 0, 'saldo final', TOLERANCIA_SALDO);
});

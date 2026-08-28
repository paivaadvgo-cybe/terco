/**
 * Testes dos encargos: TAC, IOF, FGI, FAMPE, FUNDEQ, aval e alienação.
 *
 * Diferente do PRICE, aqui há âncora de sobra: a planilha calcula cada um
 * destes encargos em várias abas, com valores em cache. Onde a igualdade é
 * exata, o teste exige exatidão — e ela é exata em todos os casos deste
 * arquivo.
 *
 * Os valores esperados foram lidos do cache do Excel, não recalculados a
 * partir da fórmula: um teste que confere a implementação contra a própria
 * fórmula que ela implementa não prova nada.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { calcularTAC, explicarTAC, ESCADA_PADRAO } from '../js/encargos/tac.js';
import { calcularIOF, iofDaParcela, PARAMETROS_IOF } from '../js/encargos/iof.js';
import { calcularFGI, buscarFatorK } from '../js/encargos/fgi.js';
import { calcularFAMPE } from '../js/encargos/fampe.js';
import {
  calcularGarantia, calcularFUNDEQ, calcularRendaParaAval, calcularAlienacaoImovel,
} from '../js/encargos/garantias.js';
import { PARAMETROS } from '../js/data/parametros.js';
import { ErroDeSimulacao } from '../js/engine/erros.js';

const TABELA_K = PARAMETROS.fatorKFGI.fatores;
const perto = (obtido, esperado, rotulo, tolerancia = 1e-9) => assert.ok(
  Math.abs(obtido - esperado) <= tolerancia,
  `${rotulo}: obtido ${obtido}, esperado ${esperado} (tolerância ${tolerancia})`,
);

// ─────────────────────────────────────────────────────────────────── TAC

test('TAC · a escada padrão nas faixas e nas bordas', () => {
  const casos = [
    [1, 50], [100, 50], [3000, 50],
    [3000.01, 3000.01 * 0.03],
    [14000, 420], [21000, 420],
    [21000.01, 21000.01 * 0.02],
    [100000, 2000],
    [100000.01, 2000 + 100000.01 * 0.005],
    [2000000, 12000],
  ];
  for (const [valor, esperado] of casos) {
    perto(calcularTAC(valor), esperado, `TAC padrão de ${valor}`);
  }
});

test('TAC · a escada é contínua na borda dos R$ 21.000', () => {
  // A faixa de 3% chega travada no teto; a de 2% começa logo acima dele.
  assert.equal(calcularTAC(21000), 420);
  perto(calcularTAC(21000.01), 420.0002, 'a faixa seguinte não dá um salto');
});

test('TAC · as nove âncoras da planilha, exatas', () => {
  // Doze das treze células que calculam TAC usam a escada padrão; só
  // 'Linhas Giro Puro'!F15 usa a variante com o fator 1,015.
  assert.equal(calcularTAC(60000, { variante: 'giroPuro', financiada: true }), 1217.9999999999998, 'Giro Puro F15');
  assert.equal(calcularTAC(60000), 1200, 'Giro Puro I15');
  assert.equal(calcularTAC(100000), 2000, 'Investimento F15');
  assert.equal(calcularTAC(44000), 880, 'Transportes F15');
  assert.equal(calcularTAC(5000), 150, 'Mais Crédito F15');
  assert.equal(calcularTAC(21000), 420, 'Mais Crédito (2) F15');
  assert.equal(calcularTAC(1000000), 7000, 'FCO G15');
  assert.equal(calcularTAC(300000), 3500, 'FINEP G15');
  assert.equal(calcularTAC(50000), 1000, 'Produtor G15');
});

test('TAC · ABERTO-02: a variante de Giro Puro passa do próprio teto', () => {
  // O teste do teto usa valor × 0,03; o valor cobrado usa valor × 1,015 × 0,03.
  assert.equal(calcularTAC(14000), 420, 'a escada padrão respeita o teto');
  perto(calcularTAC(14000, { variante: 'giroPuro' }), 426.3,
    'a variante cobra 6,30 acima do teto que o próprio teste impõe');
  // E as duas variantes divergem já na primeira faixa percentual.
  perto(calcularTAC(3000.01, { variante: 'giroPuro' }), 3000.01 * 1.015 * 0.03, 'faixa de 3% com o fator');
  // Na variante financiada, o degrau dos R$ 3.000 se desloca.
  assert.equal(calcularTAC(3000, { variante: 'giroPuro' }), 50, 'descontada: ainda no degrau fixo');
  perto(calcularTAC(3000, { variante: 'giroPuro', financiada: true }), 91.35,
    'financiada: 3000 × 1,015 passa de 3.000 e cai na faixa de 3%');
});

test('TAC · a escada vem dos parâmetros, não do código', () => {
  const propria = [
    { ate: 1000, tipo: 'fixo', valor: 10 },
    { ate: null, tipo: 'percentual', taxa: 0.01 },
  ];
  assert.equal(calcularTAC(500, { escada: propria }), 10);
  assert.equal(calcularTAC(5000, { escada: propria }), 50);
  assert.equal(ESCADA_PADRAO.length, 4, 'a escada padrão continua intacta');
});

test('TAC · a memória de cálculo diz qual faixa pegou', () => {
  const e = explicarTAC(14000);
  assert.equal(e.valor, 420);
  assert.equal(e.faixa.ate, 21000);
  assert.match(e.descricao, /até 21000/);
});

test('TAC · recusa valor inválido', () => {
  assert.throws(() => calcularTAC(-1), (e) => e.codigo === 'VALOR_INVALIDO');
  assert.throws(() => calcularTAC(undefined), (e) => e.codigo === 'VALOR_INVALIDO');
  assert.throws(() => calcularTAC(1000, { variante: 'chute' }), (e) => e.codigo === 'PARAMETRO_INCOMPATIVEL');
});

// ─────────────────────────────────────────────────────────────────── IOF

const IOF_GIRO = {
  valorSolicitado: 60000, prazo: 60, carencia: 6,
  financiado: true, dataProposta: '2026-08-06',
};

test('IOF-01 · o adicional é 0,38% do valor liberado', () => {
  assert.equal(calcularIOF(IOF_GIRO).adicional, 228, "'Linhas Giro Puro'!AE24");
});

test('IOF-02 e IOF-03 · dias proporcionais até o teto de 365', () => {
  const r = calcularIOF(IOF_GIRO);
  // AG36, a primeira parcela que amortiza: 210 dias × 0,0041% × 1.111,11
  assert.equal(r.parcelas[6].iof, 9.566666666666666, "'Linhas Giro Puro'!AG36");
  assert.equal(r.parcelas[6].dias, 210);
  assert.equal(r.parcelas[6].diasCobrados, 210, 'abaixo do teto, conta os dias corridos');
  // Da parcela 13 em diante, 30n passa de 365 e todas contam o mesmo.
  for (const p of r.parcelas.filter((x) => x.parcela >= 13)) {
    assert.equal(p.diasCobrados, 365, `parcela ${p.parcela}`);
  }
  const iguais = new Set(r.parcelas.filter((p) => p.parcela >= 13).map((p) => p.iof));
  assert.equal(iguais.size, 1, 'com os dias travados, o IOF por parcela se estabiliza');
});

test('IOF · a carência não gera IOF diário, porque não há amortização', () => {
  const r = calcularIOF(IOF_GIRO);
  for (const p of r.parcelas.filter((x) => x.parcela <= 6)) {
    assert.equal(p.amortizacao, 0);
    assert.equal(p.iof, 0);
  }
});

test('IOF · ABERTO-08: a divergência contra a planilha é exatamente o truncamento', () => {
  // A planilha soma AG30:AG83, uma faixa fixa de linhas. Nesta operação as
  // fórmulas do bloco só foram arrastadas até a parcela 48, de modo que
  // AE25 = 676,50 corresponde a 42 parcelas, não às 54 que o contrato tem.
  const r = calcularIOF(IOF_GIRO);
  const ate48 = r.parcelas.filter((p) => p.parcela <= 48).reduce((s, p) => s + p.iof, 0);
  assert.equal(ate48, 676.5, "'Linhas Giro Puro'!AE25 — a soma truncada");
  assert.ok(r.diario > ate48, 'o motor soma o cronograma inteiro');
  // A diferença é exatamente o que a planilha deixou de fora, e nada mais.
  const omitidas = r.parcelas.filter((p) => p.parcela > 48).reduce((s, p) => s + p.iof, 0);
  perto(r.diario - ate48, omitidas, 'a divergência é só o truncamento');
});

test('IOF-04 e IOF-05 · a alíquota simples vale até R$ 30.000', () => {
  const dentro = calcularIOF({ valorSolicitado: 30000, prazo: 24, carencia: 0 });
  const fora = calcularIOF({ valorSolicitado: 30000.01, prazo: 24, carencia: 0 });
  assert.equal(dentro.modo, 'simples');
  assert.equal(dentro.aliquotaDiariaUsada, PARAMETROS_IOF.aliquotaDiariaSimples);
  assert.equal(fora.modo, 'normal');
  assert.equal(fora.aliquotaDiariaUsada, PARAMETROS_IOF.aliquotaDiariaNormal);
  assert.ok(fora.diario > dentro.diario * 2, 'a alíquota normal é cerca de três vezes a simples');
});

test('IOF · a razão entre as duas alíquotas é a mesma das somas da planilha', () => {
  // AE26 / AE25 = 226,05 / 676,50, que é aliquotaSimples / aliquotaNormal.
  perto(226.04999999999987 / 676.5,
    PARAMETROS_IOF.aliquotaDiariaSimples / PARAMETROS_IOF.aliquotaDiariaNormal,
    'razão entre as alíquotas', 1e-12);
});

test('IOF-06 · financiado multiplica o total por 1,03', () => {
  const desc = calcularIOF({ ...IOF_GIRO, financiado: false });
  const fin = calcularIOF({ ...IOF_GIRO, financiado: true });
  perto(fin.total, desc.total * 1.03, 'fator de financiamento');
});

test('IOF-07 · quando não incide, é zero e não quase zero', () => {
  const r = calcularIOF({ ...IOF_GIRO, incide: false });
  assert.equal(r.total, 0);
  assert.equal(r.adicional, 0);
  assert.equal(r.parcelas.length, 0);
  assert.equal(r.modo, 'naoIncide');
});

test('IOF-08 · a base é o valor solicitado, não o financiado', () => {
  // Duas operações com o mesmo valor pedido e encargos financiados diferentes
  // produzem o mesmo IOF diário, porque a base não olha para o financiado.
  const a = calcularIOF({ valorSolicitado: 60000, prazo: 60, carencia: 6 });
  const b = calcularIOF({ valorSolicitado: 60000, prazo: 60, carencia: 6 });
  assert.equal(a.diario, b.diario);
  // E a amortização de cada parcela é o solicitado dividido pelas amortizantes.
  perto(a.parcelas[6].amortizacao, 60000 / 54, 'base da parcela');
});

test('IOF · a fórmula da parcela, isolada', () => {
  assert.equal(iofDaParcela(210, 1111.111111111111, 0.000041), 9.566666666666666);
  assert.equal(iofDaParcela(400, 1000, 0.000041), 365 * 0.000041 * 1000, 'trava em 365 dias');
  assert.equal(iofDaParcela(365, 1000, 0.000041), 365 * 0.000041 * 1000, 'no limite, trava também');
});

// ─────────────────────────────────────────────────────────────────── FGI

test('FGI-01 a FGI-04 · fatores K nas bordas da tabela', () => {
  assert.equal(buscarFatorK(3, TABELA_K), 0.0142);
  assert.equal(buscarFatorK(60, TABELA_K), 0.001);
  assert.equal(buscarFatorK(103, TABELA_K), 0.0005);
  assert.equal(Object.keys(TABELA_K).length, 101, 'a tabela cobre 3 a 103 meses');
});

test('FGI-03 · ABERTO-04: no prazo 84 vale a primeira ocorrência', () => {
  // A linha 90 traz 84 com fator 0,0007; a linha 100 repete 84 com 0,0006.
  // O XLOOKUP devolve a primeira, e a segunda é inalcançável.
  assert.equal(buscarFatorK(84, TABELA_K), 0.0007);
  const duplicidades = PARAMETROS.fatorKFGI.duplicidadesIgnoradas;
  assert.equal(duplicidades.length, 1);
  assert.equal(duplicidades[0].prazo, 84);
  assert.equal(duplicidades[0].fatorIgnorado, 0.0006);
  assert.equal(duplicidades[0].fatorEmVigor, 0.0007);
});

test('FGI-05 a FGI-07 · prazo fora da tabela é erro, nunca interpolação', () => {
  for (const prazo of [2, 104, 240, 61.5]) {
    assert.throws(() => buscarFatorK(prazo, TABELA_K), (e) => (
      e instanceof ErroDeSimulacao && e.codigo === 'FATOR_K_NAO_ENCONTRADO'
    ), `prazo ${prazo} deveria recusar`);
  }
  // A tabela é feita de degraus, não de uma curva: entre 60 e 61 o fator cai
  // de 0,0010 para 0,0009 e não há nada no meio. Interpolar produziria um
  // preço de garantia que ninguém aprovou, e com cara de plausível.
  assert.equal(buscarFatorK(60, TABELA_K), 0.001);
  assert.equal(buscarFatorK(61, TABELA_K), 0.0009);
});

test('FGI-08 · a fórmula reproduz o CASO 003', () => {
  const r = calcularFGI({
    valorSolicitado: 60000, tac: 1218, iof: 931.635,
    percentualGarantido: 0.8, prazo: 60, tabelaFatorK: TABELA_K,
  });
  assert.equal(r.valor, 3133.5950420168074, "'Fator K - FGI'!I30");
  assert.equal(r.baseVL, 62149.635, 'I26');
  assert.equal(r.fatorK, 0.001, 'I25');
});

test('FGI · a base parte do valor solicitado, não do financiado', () => {
  const r = calcularFGI({
    valorSolicitado: 60000, tac: 1218, iof: 931.635,
    percentualGarantido: 0.8, prazo: 60, tabelaFatorK: TABELA_K,
  });
  assert.equal(r.baseVL, 60000 + 1218 + 931.635);
});

test('FGI · recusa quando o encargo não converge, em vez de devolver Infinity', () => {
  // Com K × %G × prazo ≥ 1 o denominador zera: não há valor finito.
  assert.throws(() => calcularFGI({
    valorSolicitado: 10000, percentualGarantido: 1, prazo: 100, fatorK: 0.02,
  }), (e) => e instanceof ErroDeSimulacao && e.codigo === 'PARAMETRO_INCOMPATIVEL');
});

// ───────────────────────────────────────────────────────── outras garantias

test('GAR-01 e GAR-02 · FAMPE e FUNDEQ têm hoje a mesma fórmula', () => {
  const entrada = { valorSolicitado: 60000, percentualGarantido: 0.8, prazo: 60 };
  assert.equal(calcularFAMPE(entrada).valor, 2880, "'Linhas Giro Puro'!M21");
  assert.equal(calcularFUNDEQ(entrada).valor, 2880, "'Linhas Giro Puro'!M23");
  assert.equal(calcularGarantia(1, entrada).modalidade, 'FAMPE');
  assert.equal(calcularGarantia(3, entrada).modalidade, 'FUNDEQ');
});

test('GAR · o seletor de modalidade cobre as três da planilha', () => {
  const entrada = {
    valorSolicitado: 60000, tac: 1218, iof: 931.635,
    percentualGarantido: 0.8, prazo: 60, tabelaFatorK: TABELA_K,
  };
  assert.equal(calcularGarantia(1, entrada).valor, 2880);
  assert.equal(calcularGarantia(2, entrada).valor, 3133.5950420168074);
  assert.equal(calcularGarantia(3, entrada).valor, 2880);
  assert.throws(() => calcularGarantia(4, entrada), (e) => e.codigo === 'PARAMETRO_INCOMPATIVEL');
});

test('GAR · Produtor Empreendedor cobra sem percentual garantido', () => {
  // E15 = B15 × B17 × 0,001, sem o fator de cobertura.
  assert.equal(calcularFAMPE({ valorSolicitado: 50000, percentualGarantido: 1, prazo: 48 }).valor, 2400,
    "'Produtor Empreendedor'!E15");
});

test('GAR-03 e GAR-04 · renda para aval, com e sem o piso', () => {
  const alta = calcularRendaParaAval(1461.6673416666667);
  assert.equal(alta.valor, 4385.002025, "'Linhas Giro Puro'!B19");
  assert.equal(alta.aplicouPiso, false);

  const baixa = calcularRendaParaAval(500);
  assert.equal(baixa.valor, 2424, "'Mais Crédito'!B19 — o piso");
  assert.equal(baixa.aplicouPiso, true);

  // Na fronteira exata o piso não se aplica: a fórmula testa estritamente menor.
  assert.equal(calcularRendaParaAval(808).valor, 2424);
  assert.equal(calcularRendaParaAval(808).aplicouPiso, false);
});

test('GAR-05 · alienação de imóvel nas quatro formas da planilha', () => {
  assert.equal(calcularAlienacaoImovel({ valorSolicitado: 60000 }).valor, 128571.42857142858, 'Giro Puro D19');
  assert.equal(calcularAlienacaoImovel({ valorSolicitado: 100000 }).valor, 214285.7142857143, 'Investimento D19');
  assert.equal(calcularAlienacaoImovel({ valorSolicitado: 44000 }).valor, 94285.71428571429, 'Transportes D19');
  assert.equal(calcularAlienacaoImovel({
    valorSolicitado: 1000000, parteGarantida: 800000, descontaParteGarantida: false,
  }).valor, 2142857.142857143, 'FCO D19 — nunca desconta');
  // Produtor Empreendedor só exige imóvel acima de R$ 50.000.
  assert.equal(calcularAlienacaoImovel({ valorSolicitado: 50000, valorMinimo: 50000 }).valor, 0, 'Produtor D19');
  assert.equal(calcularAlienacaoImovel({ valorSolicitado: 50000, valorMinimo: 50000 }).dispensada, true);
});

test('GAR-05 · com FGI, a parte já coberta é descontada', () => {
  const semFGI = calcularAlienacaoImovel({ valorSolicitado: 60000 });
  const comFGI = calcularAlienacaoImovel({ valorSolicitado: 60000, parteGarantida: 48000 });
  perto(comFGI.valor, (60000 - 48000) * 1.5 / 0.7, 'desconta a parte garantida');
  assert.ok(comFGI.valor < semFGI.valor);
});

test('GAR-06 · parâmetros inválidos são recusados', () => {
  assert.throws(() => calcularFAMPE({ valorSolicitado: 1000, percentualGarantido: 0.8, prazo: 0 }),
    (e) => e.codigo === 'PRAZO_INVALIDO');
  assert.throws(() => calcularFAMPE({ valorSolicitado: undefined, percentualGarantido: 0.8, prazo: 12 }),
    (e) => e.codigo === 'VALOR_INVALIDO');
  assert.throws(() => calcularAlienacaoImovel({ valorSolicitado: 1000, percentualMaximo: 0 }),
    (e) => e.codigo === 'PARAMETRO_INCOMPATIVEL');
});

test('nenhum encargo devolve NaN ou Infinity', () => {
  const resultados = [
    calcularTAC(1), calcularTAC(1e9),
    calcularIOF({ valorSolicitado: 1, prazo: 1, carencia: 0 }).total,
    calcularFGI({ valorSolicitado: 1, percentualGarantido: 0.2, prazo: 3, tabelaFatorK: TABELA_K }).valor,
    calcularFAMPE({ valorSolicitado: 1, percentualGarantido: 0.2, prazo: 1 }).valor,
    calcularRendaParaAval(0).valor,
    calcularAlienacaoImovel({ valorSolicitado: 1 }).valor,
  ];
  for (const [i, v] of resultados.entries()) {
    assert.ok(Number.isFinite(v), `resultado ${i} não é finito: ${v}`);
  }
});

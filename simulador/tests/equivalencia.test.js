/**
 * Teste de equivalência: aplicativo × planilha, célula a célula.
 *
 * Os casos não são escritos aqui. São extraídos da própria planilha por
 * `ferramentas/extrair_casos.py`, que lê o estado salvo de cada aba — a
 * operação que alguém simulou e o cronograma que o Excel calculou para ela —
 * com todos os dígitos que o arquivo guardou. Números transcritos à mão para
 * um teste provam menos: quem transcreve escolhe o que copiar, e tende a
 * copiar o que já confere.
 *
 * A tolerância padrão é de um centavo, como o item 36 do escopo estabelece.
 * Ela quase não é usada: a planilha não arredonda em etapa nenhuma, e o motor
 * também não, de modo que os valores coincidem bit a bit. Onde a igualdade é
 * exata, o teste exige exatidão, porque uma tolerância generosa esconderia
 * justamente a regressão que ela deveria pegar.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { gerarCronogramaSAC } from '../js/engine/sac.js';
import { criarTaxa } from '../js/engine/juros.js';
import { calcularTIR, montarFluxo } from '../js/engine/tir.js';
import { calcularTAC } from '../js/encargos/tac.js';
import { calcularIOF } from '../js/encargos/iof.js';
import { calcularRendaParaAval, calcularAlienacaoImovel } from '../js/encargos/garantias.js';

const CENTAVO = 0.01;
const { casos } = JSON.parse(fs.readFileSync(new URL('./casos-equivalencia.json', import.meta.url), 'utf8'));

/** Reproduz o cronograma da aba com os parâmetros que a própria aba declara. */
function cronogramaDoCaso(caso) {
  const e = caso.entrada;
  return gerarCronogramaSAC({
    valorFinanciado: e.valorFinanciado,
    valorSolicitado: e.valorSolicitado,
    prazo: e.prazo,
    carencia: e.carencia,
    taxa: criarTaxa(e.taxa.valor, e.taxa.unidade),
    taxaIndexador: e.indexador ? criarTaxa(e.indexador.valor, e.indexador.unidade) : null,
    convencaoTaxa: e.convencaoTaxa,
    baseAmortizacao: e.baseAmortizacao,
    tratamentoCarencia: e.tratamentoCarencia,
    dataProposta: e.dataProposta,
  });
}

test('a planilha de referência rendeu casos para todas as abas de produto', () => {
  assert.equal(casos.length, 9);
  const totalDeParcelas = casos.reduce((n, c) => n + c.parcelas.length, 0);
  assert.equal(totalDeParcelas, 468, 'quatrocentas e sessenta e oito parcelas a conferir');
});

// ───────────────────────────────────────────────────────────── cronograma

for (const caso of casos) {
  test(`CRONOGRAMA · ${caso.aba} — ${caso.parcelas.length} parcelas, valor a valor`, () => {
    const r = cronogramaDoCaso(caso);
    assert.equal(r.cronograma.length, caso.entrada.prazo);

    for (const p of caso.parcelas) {
      const meu = r.cronograma[p.parcela - 1];
      const onde = `${caso.aba}, parcela ${p.parcela}`;

      assert.equal(meu.juros, p.juros, `${onde}: juros`);
      assert.equal(meu.amortizacao, p.amortizacao, `${onde}: amortização`);
      assert.equal(meu.saldoFinal, p.saldo, `${onde}: saldo`);
      assert.equal(meu.prestacao, p.prestacao, `${onde}: prestação`);
      if (p.jurosIndexador !== undefined && p.jurosIndexador !== null) {
        assert.equal(meu.jurosIndexador, p.jurosIndexador, `${onde}: juros do indexador`);
      }
    }
  });
}

test('CRONOGRAMA · nenhum valor difere, nem dentro da tolerância', () => {
  // O teste acima já exige igualdade exata; este mede a distância para
  // registrá-la no relatório, e para que uma regressão apareça como número e
  // não só como falha.
  let pior = 0;
  let comparados = 0;
  for (const caso of casos) {
    const r = cronogramaDoCaso(caso);
    for (const p of caso.parcelas) {
      const meu = r.cronograma[p.parcela - 1];
      for (const [excel, motor] of [
        [p.juros, meu.juros], [p.amortizacao, meu.amortizacao],
        [p.saldo, meu.saldoFinal], [p.prestacao, meu.prestacao],
      ]) {
        pior = Math.max(pior, Math.abs(excel - motor));
        comparados += 1;
      }
    }
  }
  assert.equal(comparados, 1872);
  assert.equal(pior, 0, `a maior diferença deveria ser zero, e é ${pior}`);
});

// ─────────────────────────────────────────────────────────────── encargos

for (const caso of casos) {
  test(`ENCARGOS · ${caso.aba}`, () => {
    const e = caso.entrada;
    const r = cronogramaDoCaso(caso);

    // A variante de TAC com o fator 1,015 existe numa aba só.
    const variante = caso.aba === 'Linhas Giro Puro' ? 'giroPuro' : 'padrao';
    const financiada = caso.bandeiras?.tacFinanciada ?? true;
    assert.ok(Math.abs(calcularTAC(e.valorSolicitado, { variante, financiada }) - caso.encargos.tac) <= CENTAVO,
      `${caso.aba}: TAC`);

    if (caso.encargos.rendaParaAval !== null && caso.encargos.rendaParaAval !== undefined) {
      assert.equal(calcularRendaParaAval(r.totais.maiorParcela).valor, caso.encargos.rendaParaAval,
        `${caso.aba}: renda exigida do avalista`);
    }
    if (caso.encargos.alienacao !== null && caso.encargos.alienacao !== undefined) {
      assert.equal(calcularAlienacaoImovel({ valorSolicitado: e.valorSolicitado }).valor, caso.encargos.alienacao,
        `${caso.aba}: alienação de imóvel`);
    }
  });
}

// ───────────────────────────────────────────────────────────────── IOF

for (const caso of casos.filter((c) => c.iof?.incide)) {
  test(`IOF · ${caso.aba} — a divergência é exatamente o truncamento`, () => {
    const e = caso.entrada;
    const iof = calcularIOF({
      valorSolicitado: e.valorSolicitado, prazo: e.prazo, carencia: e.carencia,
      financiado: false, dataProposta: e.dataProposta,
    });

    // O adicional não depende do cronograma, e por isso confere sempre.
    assert.ok(Math.abs(iof.adicional - caso.iof.adicional) <= CENTAVO, `${caso.aba}: IOF adicional`);

    // Qual das duas somas diárias vale depende do valor: até R$ 30.000 a
    // planilha usa a alíquota simples, acima dela a normal. Comparar contra a
    // errada faria o teste acusar uma divergência que não existe.
    const alvo = iof.modo === 'simples' ? caso.iof.simplesTruncado : caso.iof.normalTruncado;

    /*
     * O ponto onde a planilha para de somar não é o mesmo em toda aba: a soma
     * percorre uma faixa fixa de linhas, mas as fórmulas que alimentam essas
     * linhas foram arrastadas até alturas diferentes. Em vez de presumir onde
     * o corte cai, o teste procura: se existe um número de parcelas cuja soma
     * dá exatamente o valor da planilha, então a diferença é truncamento e
     * nada mais. Se não existe, é divergência de regra, e aí o teste falha.
     */
    let acumulado = 0;
    let corte = 0;
    for (const p of iof.parcelas) {
      acumulado += p.iof;
      if (Math.abs(acumulado - alvo) <= CENTAVO) corte = p.parcela;
    }
    assert.ok(corte > 0,
      `${caso.aba}: nenhuma soma parcial dá ${alvo}; a diferença não é truncamento`);
    assert.ok(corte <= e.prazo, `${caso.aba}: o corte não pode passar do prazo`);

    const omitidas = iof.parcelas.filter((p) => p.parcela > corte).reduce((s, p) => s + p.iof, 0);
    assert.ok(Math.abs((iof.diario - alvo) - omitidas) <= CENTAVO,
      `${caso.aba}: o que sobra deveria ser só o que a planilha deixou de fora`);
  });
}

// ─────────────────────────────────────────────────────────────────── TIR

test('TIR · Linhas Investimento, onde o cronograma da planilha está completo', () => {
  const caso = casos.find((c) => c.aba === 'Linhas Investimento');
  const r = cronogramaDoCaso(caso);
  const tir = calcularTIR(montarFluxo(caso.entrada.valorSolicitado, r.cronograma));
  // A diferença é do critério de parada da iteração, não da regra.
  assert.ok(Math.abs(tir - caso.tir.comBonus) < 1e-12,
    `TIR: planilha ${caso.tir.comBonus}, motor ${tir}`);
});

test('TIR · Linhas Giro Puro diverge, e a causa é conhecida', () => {
  // Nessa aba as fórmulas do cronograma param na parcela 48 de um contrato de
  // 60. O fluxo que a planilha passa ao IRR tem doze parcelas a menos, e
  // devolve uma taxa negativa: −0,11% ao mês para um contrato que rende juros.
  // Não é divergência do motor, é ABERTO-08 chegando à TIR.
  const caso = casos.find((c) => c.aba === 'Linhas Giro Puro');
  assert.ok(caso.tir.comBonus < 0, 'a planilha devolve TIR negativa nesta aba');
  assert.equal(caso.parcelas.length, 48);
  assert.equal(caso.entrada.prazo, 60);

  const r = cronogramaDoCaso(caso);
  const tir = calcularTIR(montarFluxo(caso.entrada.valorSolicitado, r.cronograma));
  assert.ok(tir > 0, 'com o contrato inteiro, a taxa é positiva');

  // E o motor reproduz o número da planilha quando recebe o mesmo fluxo curto.
  const truncado = calcularTIR(montarFluxo(caso.entrada.valorSolicitado, r.cronograma.slice(0, 48)));
  assert.ok(Math.abs(truncado - caso.tir.comBonus) < 1e-9,
    `com o fluxo truncado: planilha ${caso.tir.comBonus}, motor ${truncado}`);
});

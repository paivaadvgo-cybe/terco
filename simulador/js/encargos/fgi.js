/**
 * FGI — Fundo Garantidor para Investimentos.
 *
 * O encargo sai de um fator K tabelado por prazo, e a tabela é consultada com
 * busca **exata**: a planilha usa XLOOKUP sem modo de correspondência, e um
 * prazo que não esteja na tabela produz #N/A, não um valor interpolado. Aqui
 * produz erro pelo mesmo motivo — interpolar seria inventar um preço de
 * garantia que ninguém aprovou.
 */

import { erro, exigirNumeroFinito } from './../engine/erros.js';

/**
 * Fator K do prazo.
 *
 * A tabela cobre 3 a 103 meses. Onde há duplicidade — o prazo 84 aparece duas
 * vezes, com fatores diferentes — vale a primeira ocorrência, que é o que o
 * XLOOKUP devolve; ver ABERTO-04. Acima de 103 meses não há fator, e linhas de
 * prazo longo como FCO Verde e Fungetur Capital Fixo caem nesse vazio; ver
 * ABERTO-05.
 */
export function buscarFatorK(prazo, tabela) {
  if (!tabela || typeof tabela !== 'object') {
    erro('PARAMETRO_INCOMPATIVEL', 'Tabela de fator K não informada.', { prazo });
  }
  if (!Number.isInteger(prazo)) {
    erro('FATOR_K_NAO_ENCONTRADO',
      `O prazo ${prazo} não é inteiro, e a tabela do FGI não interpola.`, { prazo });
  }
  const fator = tabela[String(prazo)];
  if (fator === undefined) {
    const prazos = Object.keys(tabela).map(Number);
    erro('FATOR_K_NAO_ENCONTRADO',
      `Não há fator K para ${prazo} meses; a tabela cobre de ${Math.min(...prazos)} a ${Math.max(...prazos)}.`,
      { prazo, minimo: Math.min(...prazos), maximo: Math.max(...prazos) });
  }
  return fator;
}

/**
 * Encargo de garantia do FGI.
 *
 *     VL  = valorSolicitado + TAC + IOF
 *     ECG = (K × VL × %G × P) / (1 − K × %G × P)
 *
 * A base parte do valor **solicitado**, não do financiado: a planilha soma TAC
 * e IOF ao valor pedido, sejam eles financiados ou descontados. Quando os dois
 * são financiados os números coincidem, e é por isso que a distinção passa
 * despercebida no estado salvo.
 *
 * O denominador `1 − K × %G × P` é o que torna o encargo financiado sobre si
 * mesmo. Se ele chegar a zero ou ficar negativo, não há valor finito, e a
 * função recusa em vez de devolver Infinity.
 */
export function calcularFGI(entrada) {
  const { valorSolicitado, tac = 0, iof = 0, percentualGarantido, prazo, tabelaFatorK, fatorK } = entrada;

  exigirNumeroFinito(valorSolicitado, 'VALOR_INVALIDO', 'valor solicitado');
  exigirNumeroFinito(percentualGarantido, 'PARAMETRO_INCOMPATIVEL', 'percentual garantido');
  const k = fatorK ?? buscarFatorK(prazo, tabelaFatorK);

  const vl = valorSolicitado + tac + iof;
  const denominador = 1 - k * percentualGarantido * prazo;
  if (denominador <= 0) {
    erro('PARAMETRO_INCOMPATIVEL',
      `O encargo do FGI não converge: K × %G × prazo = ${(k * percentualGarantido * prazo).toFixed(6)}, `
      + 'que precisa ser menor que 1.',
      { fatorK: k, percentualGarantido, prazo });
  }

  const valor = (k * (vl * percentualGarantido) * prazo) / denominador;
  return {
    valor,
    fatorK: k,
    baseVL: vl,
    percentualGarantido,
    prazo,
    memoria: `K = ${k} (prazo ${prazo}). VL = ${valorSolicitado} + ${tac} + ${iof} = ${vl}. `
      + `ECG = (${k} × ${vl} × ${percentualGarantido} × ${prazo}) / (1 − ${k} × ${percentualGarantido} × ${prazo}) = ${valor}.`,
  };
}

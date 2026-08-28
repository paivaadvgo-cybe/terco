/**
 * FAMPE — Fundo de Aval às Micro e Pequenas Empresas.
 *
 *     encargo = valorSolicitado × percentualGarantido × fator × prazo
 *
 * com fator 0,001. É a fórmula de `Linhas Giro Puro!M21`, e a mesma que
 * `Linhas Investimento!F17` e `Linhas Transportes!F17` aplicam pelas duas
 * classes de garantia — na classe 2 a planilha escreve `F19 × 0,001 × prazo`,
 * mas `F19` é `valorSolicitado × percentualGarantido`, de modo que as duas
 * expressões são a mesma conta.
 *
 * Diferente do FGI, não há tabela nem fator por prazo: o prazo entra
 * linearmente, e o encargo cresce em proporção direta a ele.
 */

import { erro, exigirNumeroFinito } from './../engine/erros.js';

export const FATOR_FAMPE = 0.001;

export function calcularFAMPE(entrada) {
  const { valorSolicitado, percentualGarantido, prazo, fator = FATOR_FAMPE } = entrada;

  exigirNumeroFinito(valorSolicitado, 'VALOR_INVALIDO', 'valor solicitado');
  exigirNumeroFinito(percentualGarantido, 'PARAMETRO_INCOMPATIVEL', 'percentual garantido');
  if (!Number.isInteger(prazo) || prazo < 1) {
    erro('PRAZO_INVALIDO', `Recebido ${JSON.stringify(prazo)}.`, { prazo });
  }

  const valor = valorSolicitado * percentualGarantido * fator * prazo;
  return {
    valor,
    percentualGarantido,
    prazo,
    memoria: `FAMPE = ${valorSolicitado} × ${percentualGarantido} × ${fator} × ${prazo} = ${valor}.`,
  };
}

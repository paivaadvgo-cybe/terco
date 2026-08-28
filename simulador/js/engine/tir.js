/**
 * TIR — taxa interna de retorno.
 *
 * A planilha calcula duas, com `IRR`: uma sobre o fluxo das prestações com
 * bônus e outra sobre o fluxo com a taxa cheia. O fluxo começa com o valor
 * **solicitado** negativo — não o financiado — e segue com as prestações.
 *
 * A planilha chama isso de TIR, e não de CET. A nomenclatura foi preservada:
 * o CET exigiria trazer todos os encargos para dentro do fluxo, e a planilha
 * não faz isso. Chamar de CET aqui seria batizar de outra coisa um número que
 * não é essa coisa.
 */

import { erro } from './erros.js';

const MAXIMO_DE_ITERACOES = 200;
const TOLERANCIA = 1e-12;

/** Valor presente líquido do fluxo à taxa dada. */
export function valorPresenteLiquido(fluxo, taxa) {
  let total = 0;
  for (let k = 0; k < fluxo.length; k += 1) {
    total += fluxo[k] / (1 + taxa) ** k;
  }
  return total;
}

/**
 * Calcula a TIR do fluxo.
 *
 * Newton-Raphson a partir de um chute, com bisseção de reserva quando ele
 * escapa do intervalo ou a derivada some. Sem troca de sinal no fluxo não há
 * raiz, e o resultado é erro — nunca `NaN`, que passaria adiante disfarçado
 * de número.
 */
export function calcularTIR(fluxo, opcoes = {}) {
  const { chute = 0.01, minimo = -0.9999, maximo = 10 } = opcoes;

  if (!Array.isArray(fluxo) || fluxo.length < 2) {
    erro('TIR_SEM_SOLUCAO', 'O fluxo precisa de ao menos duas entradas.', { tamanho: fluxo?.length });
  }
  if (fluxo.some((v) => !Number.isFinite(v))) {
    erro('TIR_SEM_SOLUCAO', 'O fluxo contém valor não finito.', { fluxo });
  }
  const temNegativo = fluxo.some((v) => v < 0);
  const temPositivo = fluxo.some((v) => v > 0);
  if (!temNegativo || !temPositivo) {
    erro('TIR_SEM_SOLUCAO',
      'O fluxo não troca de sinal: sem saída e entrada, não há taxa que o zere.',
      { temNegativo, temPositivo });
  }

  let taxa = chute;
  for (let i = 0; i < MAXIMO_DE_ITERACOES; i += 1) {
    const vpl = valorPresenteLiquido(fluxo, taxa);
    if (Math.abs(vpl) < TOLERANCIA) return taxa;

    let derivada = 0;
    for (let k = 1; k < fluxo.length; k += 1) {
      derivada -= (k * fluxo[k]) / (1 + taxa) ** (k + 1);
    }
    if (derivada === 0 || !Number.isFinite(derivada)) break;

    const proxima = taxa - vpl / derivada;
    if (!Number.isFinite(proxima) || proxima <= minimo || proxima >= maximo) break;
    if (Math.abs(proxima - taxa) < TOLERANCIA) return proxima;
    taxa = proxima;
  }

  return porBissecao(fluxo, minimo, maximo);
}

function porBissecao(fluxo, minimo, maximo) {
  let a = minimo;
  let b = maximo;
  let fa = valorPresenteLiquido(fluxo, a);
  let fb = valorPresenteLiquido(fluxo, b);

  if (fa * fb > 0) {
    erro('TIR_SEM_SOLUCAO',
      `Não há raiz entre ${minimo} e ${maximo}: o valor presente líquido não muda de sinal no intervalo.`,
      { minimo, maximo, vplNoMinimo: fa, vplNoMaximo: fb });
  }

  for (let i = 0; i < MAXIMO_DE_ITERACOES; i += 1) {
    const meio = (a + b) / 2;
    const fm = valorPresenteLiquido(fluxo, meio);
    if (Math.abs(fm) < TOLERANCIA || (b - a) / 2 < TOLERANCIA) return meio;
    if (fa * fm < 0) { b = meio; fb = fm; } else { a = meio; fa = fm; }
  }
  return (a + b) / 2;
}

/**
 * Monta o fluxo de caixa a partir de um cronograma, no formato da planilha:
 * o valor solicitado sai negativo no instante zero, e cada prestação entra.
 */
export function montarFluxo(valorSolicitado, cronograma) {
  return [-valorSolicitado, ...cronograma.map((p) => p.prestacao)];
}

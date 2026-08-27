/**
 * Motor SAC — Sistema de Amortização Constante.
 *
 * É o único sistema que a planilha implementa: em todas as doze abas a
 * amortização é uma fração fixa de um valor inicial e a prestação é a soma
 * dela com os juros do período. O que muda de aba para aba são quatro coisas,
 * e todas as quatro são parâmetro aqui, nenhuma é constante:
 *
 *   1. como a carência trata os juros — pagos em onze abas, capitalizados na
 *      linha 2 de 'Produtor Empreendedor', onde nada é pago e o saldo cresce;
 *   2. qual valor a amortização divide — e a planilha usa dois, trocando de
 *      um para o outro na parcela 13 (ver ABERTO-07);
 *   3. de quantos em quantos meses se paga — mensal a anual, no FCO;
 *   4. se há um segundo componente de juros indexado, como no Fungetur e no
 *      FINEP.
 *
 * O motor não arredonda. A precisão é dupla do saldo inicial ao total, como
 * na planilha, e o arredondamento é assunto de quem exibe.
 */

import { paraMensal, comporPeriodos } from './juros.js';
import { gerarVencimentos } from './calendario.js';
import {
  prepararEntrada, resumirCronograma, saldoAposCarenciaCapitalizada,
  PARCELA_DA_TROCA_DE_BASE, BASES_AMORTIZACAO, TRATAMENTOS_CARENCIA,
} from './cronograma.js';

export { BASES_AMORTIZACAO, TRATAMENTOS_CARENCIA };

/**
 * Gera o cronograma completo.
 *
 * @param {object} entrada
 * @param {number} entrada.valorFinanciado     Saldo devedor inicial.
 * @param {number} [entrada.valorSolicitado]   O que o cliente pediu, sem encargos.
 * @param {number} entrada.prazo               Meses, inclui a carência.
 * @param {number} entrada.carencia            Meses.
 * @param {object} entrada.taxa                Taxa, com unidade.
 * @param {object} [entrada.taxaIndexador]     Segundo componente de juros.
 * @param {string} [entrada.convencaoTaxa]     'mensalComposta' ou 'diasUteis'.
 * @param {number} [entrada.periodicidade]     Meses entre pagamentos.
 * @param {string} [entrada.baseAmortizacao]
 * @param {string} [entrada.tratamentoCarencia]
 * @param {string} [entrada.dataProposta]
 * @param {string} [entrada.modoCalendario]
 */
export function gerarCronogramaSAC(entrada) {
  const e = prepararEntrada(entrada, { motor: 'O motor SAC' });

  const taxaMensal = paraMensal(e.taxa, e.convencaoTaxa);
  const taxaDoPeriodo = comporPeriodos(taxaMensal, e.periodicidade);
  const taxaIndexadorMensal = e.taxaIndexador ? paraMensal(e.taxaIndexador, e.convencaoTaxa) : null;

  const amortizantes = e.prazo - e.carencia;
  const vencimentos = gerarVencimentos(e.dataProposta, e.prazo, e.modoCalendario);

  const saldoAoFimDaCarencia = e.tratamentoCarencia === 'capitalizados'
    ? saldoAposCarenciaCapitalizada(e.valorFinanciado, taxaMensal.valor, e.carencia)
    : null;

  const baseFixa = saldoAoFimDaCarencia
    ?? (e.baseAmortizacao === 'valorSolicitado' ? e.valorSolicitado : e.valorFinanciado);

  const baseDaParcela = (n) => (
    e.baseAmortizacao === 'planilha' && saldoAoFimDaCarencia === null
      ? (n < PARCELA_DA_TROCA_DE_BASE ? e.valorSolicitado : e.valorFinanciado)
      : baseFixa
  );

  const cronograma = [];
  let saldo = e.valorFinanciado;
  let saldoNoInicioDoPeriodo = saldo;

  for (let n = 1; n <= e.prazo; n += 1) {
    const saldoInicial = saldo;
    const naCarencia = n <= e.carencia;
    // O ritmo de pagamento é contado desde a liberação, e vale também durante
    // a carência: é o que dá sentido à validação AL21 da planilha, que exige
    // carência múltipla inteira do período. Na carência paga-se só o juro.
    const ehMesDePagamento = n % e.periodicidade === 0;

    let juros = 0;
    let jurosIndexador = 0;
    let amortizacao = 0;
    let prestacao = 0;
    let formula;

    if (naCarencia && e.tratamentoCarencia === 'capitalizados') {
      // O juro do mês entra no saldo em vez de ser cobrado.
      juros = saldoInicial * taxaMensal.valor;
      saldo = saldoInicial * (1 + taxaMensal.valor);
      // O saldo cresceu: a primeira parcela depois da carência precisa cobrar
      // juros sobre ele, e não sobre o valor financiado original.
      saldoNoInicioDoPeriodo = saldo;
      formula = 'saldo = saldoAnterior × (1 + taxa); prestação = 0';
    } else if (ehMesDePagamento) {
      if (taxaIndexadorMensal) {
        jurosIndexador = saldoNoInicioDoPeriodo * taxaIndexadorMensal.valor;
        juros = taxaDoPeriodo.valor * (saldoNoInicioDoPeriodo + jurosIndexador);
        formula = 'jurosIndexador = saldo × taxaIndexador; juros = taxaFixa × (saldo + jurosIndexador)';
      } else {
        juros = saldoNoInicioDoPeriodo * taxaDoPeriodo.valor;
        formula = 'juros = saldo × taxa';
      }
      if (!naCarencia) {
        amortizacao = baseDaParcela(n) / amortizantes * e.periodicidade;
        saldo = saldoInicial - amortizacao;
        formula += '; amortização = base / parcelasAmortizantes × período';
      }
      prestacao = juros + jurosIndexador + amortizacao;
      saldoNoInicioDoPeriodo = saldo;
    } else {
      formula = 'mês sem pagamento: o período ainda não fechou';
    }

    cronograma.push({
      parcela: n,
      regime: naCarencia ? 'carencia' : 'amortizacao',
      dataVencimento: vencimentos[n - 1].dataVencimento,
      diasPeriodo: vencimentos[n - 1].diasPeriodo,
      diasDesdeLiberacao: vencimentos[n - 1].diasDesdeLiberacao,
      saldoInicial,
      taxaAplicada: taxaMensal.valor,
      juros,
      jurosIndexador,
      amortizacao,
      encargos: 0,
      prestacao,
      saldoFinal: saldo,
      memoria: {
        formula,
        baseAmortizacao: amortizacao === 0 ? null
          : (e.baseAmortizacao === 'planilha'
            ? (n < PARCELA_DA_TROCA_DE_BASE ? 'valorSolicitado' : 'valorFinanciado')
            : e.baseAmortizacao),
        ehMesDePagamento,
      },
    });
  }

  return {
    cronograma,
    ...resumirCronograma(cronograma, e, {
      sistema: 'SAC', taxaMensal, taxaDoPeriodo, saldoAoFimDaCarencia,
    }),
  };
}

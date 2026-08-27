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

import { erro, exigirNumeroFinito } from './erros.js';
import { paraMensal, comporPeriodos } from './juros.js';
import { gerarVencimentos } from './calendario.js';
import { ehPraticamenteZero } from './arredondamento.js';

/** De qual valor sai a amortização. */
export const BASES_AMORTIZACAO = {
  valorFinanciado: 'Divide o valor financiado — fecha o saldo em zero',
  valorSolicitado: 'Divide o valor solicitado, sem os encargos financiados',
  planilha: 'Reproduz a planilha: valor solicitado até a parcela 12, financiado da 13 em diante (ABERTO-07)',
};

/** O que acontece com os juros durante a carência. */
export const TRATAMENTOS_CARENCIA = {
  pagos: 'Juros cobrados mês a mês; saldo constante; prestação igual ao juro',
  capitalizados: 'Juros somados ao saldo; nada é pago na carência',
};

/** Onde a planilha troca a base da amortização. */
const PARCELA_DA_TROCA_DE_BASE = 13;

const PERIODICIDADES = [1, 2, 3, 6, 12];

function validar(e) {
  exigirNumeroFinito(e.valorFinanciado, 'VALOR_INVALIDO', 'valor financiado');
  if (e.valorFinanciado <= 0) {
    erro('VALOR_INVALIDO', 'O valor financiado precisa ser positivo.', { valor: e.valorFinanciado });
  }
  if (!Number.isInteger(e.prazo) || e.prazo < 1) {
    erro('PRAZO_INVALIDO', `Recebido ${JSON.stringify(e.prazo)}; esperado inteiro de no mínimo 1.`, { prazo: e.prazo });
  }
  if (!Number.isInteger(e.carencia) || e.carencia < 0) {
    erro('CARENCIA_INVALIDA', `Recebida ${JSON.stringify(e.carencia)}; esperado inteiro de no mínimo 0.`, { carencia: e.carencia });
  }
  if (e.carencia >= e.prazo) {
    erro('CARENCIA_INVALIDA',
      `Carência de ${e.carencia} meses não deixa nenhuma parcela para amortizar num prazo de ${e.prazo}.`,
      { carencia: e.carencia, prazo: e.prazo });
  }
  if (!(e.baseAmortizacao in BASES_AMORTIZACAO)) {
    erro('PARAMETRO_INCOMPATIVEL', `Base de amortização desconhecida: "${e.baseAmortizacao}".`, { base: e.baseAmortizacao });
  }
  if (!(e.tratamentoCarencia in TRATAMENTOS_CARENCIA)) {
    erro('PARAMETRO_INCOMPATIVEL', `Tratamento de carência desconhecido: "${e.tratamentoCarencia}".`, { tratamento: e.tratamentoCarencia });
  }
  if (!PERIODICIDADES.includes(e.periodicidade)) {
    erro('PARAMETRO_INCOMPATIVEL', `Periodicidade ${e.periodicidade} não é uma das previstas: ${PERIODICIDADES.join(', ')}.`, { periodicidade: e.periodicidade });
  }
  if (e.periodicidade > 1) {
    const amortizantes = e.prazo - e.carencia;
    if (amortizantes % e.periodicidade !== 0 || e.carencia % e.periodicidade !== 0) {
      erro('PERIODICIDADE_INCOMPATIVEL',
        `Com pagamento a cada ${e.periodicidade} meses, carência (${e.carencia}) e prazo de amortização (${amortizantes}) precisam ser múltiplos inteiros.`,
        { periodicidade: e.periodicidade, carencia: e.carencia, amortizantes });
    }
  }
  if (e.baseAmortizacao !== 'valorFinanciado') {
    exigirNumeroFinito(e.valorSolicitado, 'VALOR_INVALIDO', 'valor solicitado');
  }
}

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
  const e = {
    valorSolicitado: entrada.valorFinanciado,
    taxaIndexador: null,
    convencaoTaxa: 'mensalComposta',
    periodicidade: 1,
    baseAmortizacao: 'valorFinanciado',
    tratamentoCarencia: 'pagos',
    dataProposta: '1970-01-01',
    modoCalendario: '30dias',
    ...entrada,
  };
  validar(e);

  const taxaMensal = paraMensal(e.taxa, e.convencaoTaxa);
  const taxaDoPeriodo = comporPeriodos(taxaMensal, e.periodicidade);
  const taxaIndexadorMensal = e.taxaIndexador ? paraMensal(e.taxaIndexador, e.convencaoTaxa) : null;

  const amortizantes = e.prazo - e.carencia;
  const vencimentos = gerarVencimentos(e.dataProposta, e.prazo, e.modoCalendario);

  // Com juros capitalizados a amortização divide o saldo ao fim da carência,
  // não o valor financiado: o saldo cresceu enquanto nada era pago.
  const saldoAoFimDaCarencia = e.tratamentoCarencia === 'capitalizados'
    ? e.valorFinanciado * (1 + taxaMensal.valor) ** e.carencia
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

  return { cronograma, ...resumir(cronograma, e, { taxaMensal, taxaDoPeriodo, saldoAoFimDaCarencia }) };
}

function resumir(cronograma, e, derivadas) {
  const soma = (campo) => cronograma.reduce((total, p) => total + p[campo], 0);
  const pagas = cronograma.filter((p) => p.prestacao > 0);
  const saldoResidual = cronograma[cronograma.length - 1].saldoFinal;

  const avisos = [];
  if (!ehPraticamenteZero(saldoResidual)) {
    avisos.push({
      codigo: 'SALDO_RESIDUAL',
      valor: saldoResidual,
      mensagem: `Restou saldo devedor de ${saldoResidual.toFixed(2)} depois da última parcela. `
        + 'Não é arredondamento — o motor não arredonda. Com a base de amortização '
        + '"planilha", é o efeito de ABERTO-07: as parcelas até a 12 dividem o valor '
        + 'solicitado e as seguintes dividem o financiado.',
    });
  }

  return {
    totais: {
      totalJuros: soma('juros'),
      totalJurosIndexador: soma('jurosIndexador'),
      totalAmortizacao: soma('amortizacao'),
      totalPago: soma('prestacao'),
      saldoResidual,
      primeiraParcela: pagas.length ? pagas[0].prestacao : 0,
      ultimaParcela: pagas.length ? pagas[pagas.length - 1].prestacao : 0,
      maiorParcela: pagas.length ? Math.max(...pagas.map((p) => p.prestacao)) : 0,
      quantidadeDeParcelasPagas: pagas.length,
    },
    premissas: {
      sistema: 'SAC',
      prazo: e.prazo,
      carencia: e.carencia,
      periodicidade: e.periodicidade,
      baseAmortizacao: e.baseAmortizacao,
      tratamentoCarencia: e.tratamentoCarencia,
      convencaoTaxa: e.convencaoTaxa,
      taxaMensal: derivadas.taxaMensal,
      taxaDoPeriodo: derivadas.taxaDoPeriodo,
      saldoAoFimDaCarencia: derivadas.saldoAoFimDaCarencia,
      valorFinanciado: e.valorFinanciado,
      valorSolicitado: e.valorSolicitado,
    },
    avisos,
  };
}

/**
 * Motor PRICE — prestação constante.
 *
 * Este motor é extensão, não migração. A planilha não monta nenhum cronograma
 * PRICE: em todas as doze abas a amortização é fração fixa de um valor
 * inicial. A única aparição do sistema no arquivo inteiro é a célula `AL18` de
 * 'Linhas Investimento', que calcula
 *
 *     PMT(TIR do fluxo com bônus; prazo; −valorSolicitado)
 *
 * como indicador solto, à direita da aba — mostra qual seria a prestação
 * constante equivalente, sobre o valor solicitado, à taxa que o próprio fluxo
 * SAC produziu. Não alimenta cronograma, total nem encargo. É a única âncora
 * que existe, e é contra ela que este motor é validado.
 *
 * Por ser extensão, o motor admite só o que tem sentido financeiro fechado, e
 * recusa o resto em vez de inventar: nada de base de amortização divergente do
 * saldo (que é o defeito ABERTO-07 da planilha, e no PRICE não teria nem a
 * desculpa de reproduzir comportamento existente), nada de indexador (um
 * segundo componente variável tornaria a prestação não constante, e não há
 * referência nenhuma de como a planilha faria isso).
 */

import { erro } from './erros.js';
import { paraMensal, comporPeriodos } from './juros.js';
import { gerarVencimentos } from './calendario.js';
import {
  prepararEntrada, resumirCronograma, saldoAposCarenciaCapitalizada,
} from './cronograma.js';

/**
 * Prestação constante que amortiza `principal` em `pagamentos` prestações à
 * taxa `taxaDoPeriodo`.
 *
 *     PMT = VP × [ i(1+i)^n ] / [ (1+i)^n − 1 ]
 *
 * Com taxa zero a fórmula divide zero por zero; o limite é o principal
 * repartido em partes iguais, e é isso que a função devolve.
 */
export function calcularPMT(principal, taxaDoPeriodo, pagamentos) {
  if (!Number.isInteger(pagamentos) || pagamentos < 1) {
    erro('PRAZO_INVALIDO', `Número de pagamentos inválido: ${pagamentos}.`, { pagamentos });
  }
  if (taxaDoPeriodo === 0) return principal / pagamentos;
  const fator = (1 + taxaDoPeriodo) ** pagamentos;
  return principal * taxaDoPeriodo * fator / (fator - 1);
}

/**
 * Gera o cronograma PRICE.
 *
 * Recebe e devolve a mesma forma que `gerarCronogramaSAC`, para que o
 * comparador e o relatório tratem os dois sem saber qual é qual.
 */
export function gerarCronogramaPRICE(entrada) {
  const e = prepararEntrada(entrada, {
    motor: 'O motor PRICE',
    basesAceitas: ['valorFinanciado'],
    aceitaIndexador: false,
  });

  const taxaMensal = paraMensal(e.taxa, e.convencaoTaxa);
  const taxaDoPeriodo = comporPeriodos(taxaMensal, e.periodicidade);
  const vencimentos = gerarVencimentos(e.dataProposta, e.prazo, e.modoCalendario);

  const saldoAoFimDaCarencia = e.tratamentoCarencia === 'capitalizados'
    ? saldoAposCarenciaCapitalizada(e.valorFinanciado, taxaMensal.valor, e.carencia)
    : null;

  // O principal que a prestação amortiza é sempre o saldo que existirá quando
  // a amortização começar — com juros pagos na carência, o valor financiado;
  // com juros capitalizados, o saldo já crescido.
  const principal = saldoAoFimDaCarencia ?? e.valorFinanciado;
  const pagamentos = (e.prazo - e.carencia) / e.periodicidade;
  const prestacaoConstante = calcularPMT(principal, taxaDoPeriodo.valor, pagamentos);

  const cronograma = [];
  let saldo = e.valorFinanciado;
  let saldoNoInicioDoPeriodo = saldo;

  for (let n = 1; n <= e.prazo; n += 1) {
    const saldoInicial = saldo;
    const naCarencia = n <= e.carencia;
    const ehMesDePagamento = n % e.periodicidade === 0;

    let juros = 0;
    let amortizacao = 0;
    let prestacao = 0;
    let formula;

    if (naCarencia && e.tratamentoCarencia === 'capitalizados') {
      juros = saldoInicial * taxaMensal.valor;
      saldo = saldoInicial * (1 + taxaMensal.valor);
      // O saldo cresceu: a primeira parcela depois da carência precisa cobrar
      // juros sobre ele, e não sobre o valor financiado original.
      saldoNoInicioDoPeriodo = saldo;
      formula = 'saldo = saldoAnterior × (1 + taxa); prestação = 0';
    } else if (ehMesDePagamento) {
      juros = saldoNoInicioDoPeriodo * taxaDoPeriodo.valor;
      if (naCarencia) {
        prestacao = juros;
        formula = 'juros = saldo × taxa; na carência a prestação é só o juro';
      } else {
        amortizacao = prestacaoConstante - juros;
        saldo = saldoInicial - amortizacao;
        prestacao = prestacaoConstante;
        formula = 'juros = saldo × taxa; amortização = prestação − juros';
      }
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
      jurosIndexador: 0,
      amortizacao,
      encargos: 0,
      prestacao,
      saldoFinal: saldo,
      memoria: {
        formula,
        prestacaoConstante,
        ehMesDePagamento,
      },
    });
  }

  return {
    cronograma,
    ...resumirCronograma(cronograma, e, {
      sistema: 'PRICE', taxaMensal, taxaDoPeriodo, saldoAoFimDaCarencia,
      prestacaoConstante, pagamentos,
    }),
  };
}

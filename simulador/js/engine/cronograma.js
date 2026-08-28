/**
 * O que SAC e PRICE têm em comum.
 *
 * Os dois motores recebem a mesma entrada, validam as mesmas coisas e
 * devolvem a mesma forma de resultado — é o que permite ao comparador tratar
 * um e outro sem saber qual é qual, e ao relatório imprimir os dois com o
 * mesmo código. O que difere é só como cada parcela é montada.
 */

import { erro, exigirNumeroFinito } from './erros.js';
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
export const PARCELA_DA_TROCA_DE_BASE = 13;

export const PERIODICIDADES = [1, 2, 3, 6, 12];

const PADROES = {
  taxaIndexador: null,
  convencaoTaxa: 'mensalComposta',
  periodicidade: 1,
  baseAmortizacao: 'valorFinanciado',
  tratamentoCarencia: 'pagos',
  dataProposta: '1970-01-01',
  modoCalendario: '30dias',
};

/**
 * Completa a entrada com os padrões e valida.
 *
 * @param {object} entrada
 * @param {object} [restricoes]
 * @param {string[]} [restricoes.basesAceitas]  Bases de amortização que este motor admite.
 * @param {boolean} [restricoes.aceitaIndexador]
 * @param {string} [restricoes.motor]  Nome do motor, para a mensagem de erro.
 */
export function prepararEntrada(entrada, restricoes = {}) {
  const {
    basesAceitas = Object.keys(BASES_AMORTIZACAO),
    aceitaIndexador = true,
    motor = 'o motor',
  } = restricoes;

  const e = { valorSolicitado: entrada.valorFinanciado, ...PADROES, ...entrada };

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
  if (!basesAceitas.includes(e.baseAmortizacao)) {
    erro('PARAMETRO_INCOMPATIVEL',
      `${motor} não admite a base "${e.baseAmortizacao}"; aceita ${basesAceitas.join(' ou ')}.`,
      { base: e.baseAmortizacao, basesAceitas });
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
  if (e.taxaIndexador && !aceitaIndexador) {
    erro('PARAMETRO_INCOMPATIVEL',
      `${motor} não admite indexador: um segundo componente de juros variável tornaria a prestação não constante, `
      + 'e a planilha não tem nenhum cronograma assim para servir de referência.',
      { motor });
  }
  if (e.baseAmortizacao !== 'valorFinanciado') {
    exigirNumeroFinito(e.valorSolicitado, 'VALOR_INVALIDO', 'valor solicitado');
  }
  return e;
}

/**
 * Monta totais, premissas e avisos a partir do cronograma pronto.
 * Vale para qualquer sistema de amortização.
 */
export function resumirCronograma(cronograma, e, derivadas = {}) {
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
      prazo: e.prazo,
      carencia: e.carencia,
      periodicidade: e.periodicidade,
      baseAmortizacao: e.baseAmortizacao,
      tratamentoCarencia: e.tratamentoCarencia,
      convencaoTaxa: e.convencaoTaxa,
      valorFinanciado: e.valorFinanciado,
      valorSolicitado: e.valorSolicitado,
      ...derivadas,
    },
    avisos,
  };
}

/**
 * Saldo ao fim da carência quando os juros são capitalizados — é ele que a
 * amortização divide, e não o valor financiado, porque o saldo cresceu
 * enquanto nada era pago. A planilha o obtém por XLOOKUP sobre a própria
 * coluna do saldo; aqui é a mesma conta em forma fechada.
 */
export function saldoAposCarenciaCapitalizada(valorFinanciado, taxaMensal, carencia) {
  return valorFinanciado * (1 + taxaMensal) ** carencia;
}

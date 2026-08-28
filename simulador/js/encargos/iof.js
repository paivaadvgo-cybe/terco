/**
 * IOF.
 *
 * Três alíquotas e duas bases. A adicional incide uma vez sobre o valor
 * liberado; as duas diárias incidem parcela a parcela sobre a amortização,
 * multiplicadas pelos dias decorridos desde a liberação — com teto de 365
 * dias, de modo que da décima terceira parcela em diante todas contam o mesmo.
 *
 * Duas coisas contrariam o palpite e vêm da planilha:
 *
 *   1. a base diária é o **valor solicitado** dividido pelas parcelas
 *      amortizantes, não o financiado — mesmo quando encargos são financiados
 *      e o saldo devedor é outro;
 *   2. quando o IOF é financiado, o total ainda é multiplicado por 1,03.
 */

import { erro, exigirNumeroFinito } from './../engine/erros.js';
import { gerarVencimentos } from './../engine/calendario.js';
import { PARAMETROS } from './../data/parametros.js';

/**
 * Alíquotas do IOF. Vêm do arquivo de parâmetros, e não de literais escritos
 * aqui: uma alíquota muda por norma, e quem a muda administra a página, não
 * edita o código. `calcularIOF` aceita outro conjunto por argumento, que é
 * como o conjunto vigente chega até aqui.
 */
export const PARAMETROS_IOF = PARAMETROS.encargos.iof;

/**
 * IOF diário de uma parcela.
 *
 *     iof = min(dias, 365) × alíquota × amortização
 */
export function iofDaParcela(dias, amortizacao, aliquota, limiteDeDias = PARAMETROS_IOF.limiteDeDias) {
  return (dias < limiteDeDias ? dias : limiteDeDias) * aliquota * amortizacao;
}

/**
 * Calcula o IOF da operação inteira.
 *
 * @param {object} entrada
 * @param {number} entrada.valorSolicitado
 * @param {number} entrada.prazo
 * @param {number} entrada.carencia
 * @param {boolean} [entrada.incide]          Falso zera o IOF.
 * @param {boolean} [entrada.financiado]      Aplica o fator 1,03.
 * @param {boolean} [entrada.permiteAliquotaSimples]
 * @param {string} [entrada.dataProposta]
 * @param {string} [entrada.modoCalendario]
 * @param {object} [entrada.parametros]
 */
export function calcularIOF(entrada) {
  const {
    valorSolicitado, prazo, carencia,
    incide = true, financiado = false, permiteAliquotaSimples = true,
    dataProposta = '1970-01-01', modoCalendario = '30dias',
    parametros = PARAMETROS_IOF,
  } = entrada;

  exigirNumeroFinito(valorSolicitado, 'VALOR_INVALIDO', 'valor solicitado');
  if (!Number.isInteger(prazo) || prazo < 1) {
    erro('PRAZO_INVALIDO', `Recebido ${JSON.stringify(prazo)}.`, { prazo });
  }
  if (!Number.isInteger(carencia) || carencia < 0 || carencia >= prazo) {
    erro('CARENCIA_INVALIDA', `Recebida ${JSON.stringify(carencia)} para prazo ${prazo}.`, { carencia, prazo });
  }

  if (!incide) {
    return {
      total: 0, adicional: 0, diario: 0, financiado,
      aliquotaDiariaUsada: 0, modo: 'naoIncide', parcelas: [],
    };
  }

  const usaSimples = permiteAliquotaSimples && valorSolicitado <= parametros.tetoParaAliquotaSimples;
  const aliquotaDiaria = usaSimples ? parametros.aliquotaDiariaSimples : parametros.aliquotaDiariaNormal;

  const amortizantes = prazo - carencia;
  const amortizacaoBase = valorSolicitado / amortizantes;
  const vencimentos = gerarVencimentos(dataProposta, prazo, modoCalendario);

  const parcelas = vencimentos.map((v) => {
    const amortizacao = v.parcela <= carencia ? 0 : amortizacaoBase;
    return {
      parcela: v.parcela,
      dias: v.diasDesdeLiberacao,
      diasCobrados: Math.min(v.diasDesdeLiberacao, parametros.limiteDeDias),
      amortizacao,
      iof: iofDaParcela(v.diasDesdeLiberacao, amortizacao, aliquotaDiaria, parametros.limiteDeDias),
    };
  });

  const adicional = valorSolicitado * parametros.aliquotaAdicional;
  const diario = parcelas.reduce((total, p) => total + p.iof, 0);
  const bruto = adicional + diario;
  const total = financiado ? bruto * parametros.fatorFinanciamento : bruto;

  return {
    total,
    adicional,
    diario,
    financiado,
    aliquotaDiariaUsada: aliquotaDiaria,
    modo: usaSimples ? 'simples' : 'normal',
    parcelas,
    memoria: `IOF adicional = ${valorSolicitado} × ${parametros.aliquotaAdicional} = ${adicional}. `
      + `IOF diário (${usaSimples ? 'alíquota simples' : 'alíquota normal'}) somado parcela a parcela = ${diario}. `
      + (financiado ? `Financiado: total × ${parametros.fatorFinanciamento}. ` : '')
      + `Total = ${total}.`,
  };
}

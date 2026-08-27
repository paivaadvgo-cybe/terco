/**
 * Datas de vencimento e contagem de dias.
 *
 * A planilha não usa calendário civil: a coluna de datas do bloco de IOF
 * avança de trinta em trinta dias a partir da data da proposta
 * (`AB(n) = AB(n−1) + 30`), e a contagem de dias que alimenta o IOF é a
 * diferença até a data de liberação. Um mês de trinta dias e um mês civil dão
 * IOF diferente, então o modo é explícito e o padrão é o da planilha.
 */

import { erro } from './erros.js';

export const MODOS = {
  '30dias': 'Meses de trinta dias corridos, como a planilha faz',
  civil: 'Calendário civil, com o mesmo dia do mês seguinte',
};

const MS_POR_DIA = 86400000;

/** Aceita 'AAAA-MM-DD', Date ou milissegundos, e devolve sempre UTC. */
export function comoData(valor) {
  if (valor instanceof Date) return new Date(Date.UTC(
    valor.getUTCFullYear(), valor.getUTCMonth(), valor.getUTCDate()));
  if (typeof valor === 'number') return new Date(valor);
  if (typeof valor === 'string') {
    const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
    if (partes) {
      return new Date(Date.UTC(+partes[1], +partes[2] - 1, +partes[3]));
    }
  }
  return erro('PARAMETRO_INCOMPATIVEL', `Data inválida: ${JSON.stringify(valor)}.`, { valor });
}

export function comoTexto(data) {
  return comoData(data).toISOString().slice(0, 10);
}

export function diasEntre(inicio, fim) {
  return Math.round((comoData(fim).getTime() - comoData(inicio).getTime()) / MS_POR_DIA);
}

function somarDias(data, dias) {
  return new Date(comoData(data).getTime() + dias * MS_POR_DIA);
}

/**
 * No modo civil, um vencimento em 31 de janeiro mais um mês cai em 28 ou 29
 * de fevereiro — o último dia do mês, e não 3 de março.
 */
function somarMeses(data, meses) {
  const d = comoData(data);
  const dia = d.getUTCDate();
  const alvo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), Math.min(dia, ultimoDia)));
}

/**
 * Gera os vencimentos de um cronograma.
 *
 * @returns {Array<{parcela, dataVencimento, diasPeriodo, diasDesdeLiberacao}>}
 */
export function gerarVencimentos(dataLiberacao, parcelas, modo = '30dias') {
  if (!(modo in MODOS)) {
    erro('PARAMETRO_INCOMPATIVEL', `Modo de calendário desconhecido: "${modo}".`, { modo });
  }
  if (!Number.isInteger(parcelas) || parcelas < 0) {
    erro('PRAZO_INVALIDO', `Número de parcelas inválido: ${parcelas}.`, { parcelas });
  }

  const liberacao = comoData(dataLiberacao);
  const vencimentos = [];
  let anterior = liberacao;

  for (let n = 1; n <= parcelas; n += 1) {
    const data = modo === '30dias' ? somarDias(liberacao, 30 * n) : somarMeses(liberacao, n);
    vencimentos.push({
      parcela: n,
      dataVencimento: comoTexto(data),
      diasPeriodo: diasEntre(anterior, data),
      diasDesdeLiberacao: diasEntre(liberacao, data),
    });
    anterior = data;
  }
  return vencimentos;
}

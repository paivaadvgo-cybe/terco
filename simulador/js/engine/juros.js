/**
 * Taxas de juros: representação, unidade e conversão.
 *
 * A planilha guarda a mesma grandeza em quatro unidades — pontos percentuais
 * mensais em 'Linhas Giro Puro', decimais mensais nas demais abas mensais,
 * decimais anuais no FCO e pontos percentuais anuais no Fungetur e no FINEP.
 * Um número solto não diz de qual delas veio, e 2,17 confundido com 0,0217 é
 * um erro de cem vezes que não dá sinal nenhum. Por isso toda taxa deste
 * motor é um objeto com a unidade dentro, e converter uma taxa produz outra
 * taxa — nunca um número.
 */

import { erro, exigirNumeroFinito } from './erros.js';

/** Quantos meses cada unidade cobre. */
export const UNIDADES = {
  mensal: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

/**
 * As duas conversões de taxa anual para taxa do período que a planilha usa —
 * e elas não dão o mesmo número.
 *
 * O FCO compõe em doze meses; o Fungetur e o FINEP compõem em vinte e dois
 * dias úteis dentro de um ano de duzentos e cinquenta e dois. Como
 * 22/252 = 0,08730 é maior que 1/12 = 0,08333, a taxa do período do Fungetur
 * sai cerca de 4,8% acima da mensal composta da mesma taxa anual. A escolha
 * é regra do produto, não detalhe de implementação.
 */
export const CONVENCOES = {
  mensalComposta: {
    expoente: 1 / 12,
    descricao: 'Composição em doze meses: (1+i)^(1/12) − 1',
  },
  diasUteis: {
    expoente: 22 / 252,
    descricao: 'Composição em vinte e dois dias úteis de duzentos e cinquenta e dois: (1+i)^(22/252) − 1',
  },
};

/**
 * Cria uma taxa a partir de um valor decimal.
 *
 * @param {number} valor  Decimal: 0.0217 para 2,17%.
 * @param {string} unidade  Uma chave de UNIDADES.
 * @param {string} tipo  'efetiva' ou 'nominal'.
 */
export function criarTaxa(valor, unidade = 'mensal', tipo = 'efetiva') {
  exigirNumeroFinito(valor, 'TAXA_INVALIDA', 'valor da taxa');
  if (!(unidade in UNIDADES)) {
    erro('UNIDADE_DE_TAXA_DESCONHECIDA', `Recebida "${unidade}".`, { unidade });
  }
  if (valor < -1) {
    erro('TAXA_INVALIDA', 'Uma taxa abaixo de −100% não tem sentido financeiro.', { valor });
  }
  return Object.freeze({ valor, unidade, tipo });
}

/** Converte pontos percentuais em decimal, preservando a unidade. */
export function taxaDePercentual(percentual, unidade = 'mensal', tipo = 'efetiva') {
  exigirNumeroFinito(percentual, 'TAXA_INVALIDA', 'percentual da taxa');
  return criarTaxa(percentual / 100, unidade, tipo);
}

function exigirTaxa(taxa) {
  if (taxa === null || typeof taxa !== 'object' || !('valor' in taxa) || !('unidade' in taxa)) {
    erro('TAXA_INVALIDA', 'Esperado um objeto de taxa com valor e unidade.', { taxa });
  }
  if (!(taxa.unidade in UNIDADES)) {
    erro('UNIDADE_DE_TAXA_DESCONHECIDA', `Recebida "${taxa.unidade}".`, { taxa });
  }
  return taxa;
}

/**
 * Converte para taxa mensal equivalente.
 *
 * Com a convenção de dias úteis, a conversão parte sempre da taxa anual: é
 * assim que Fungetur e FINEP a aplicam, e converter primeiro para anual e
 * depois pelo expoente 22/252 preserva o número da planilha.
 */
export function paraMensal(taxa, convencao = 'mensalComposta') {
  exigirTaxa(taxa);
  const regra = CONVENCOES[convencao];
  if (regra === undefined) {
    erro('PARAMETRO_INCOMPATIVEL', `Convenção de taxa desconhecida: "${convencao}".`, { convencao });
  }
  if (convencao === 'diasUteis') {
    const anual = paraUnidade(taxa, 'anual');
    return criarTaxa((1 + anual.valor) ** regra.expoente - 1, 'mensal', taxa.tipo);
  }
  return paraUnidade(taxa, 'mensal');
}

/** Converte entre unidades por composição, que é o que a planilha faz. */
export function paraUnidade(taxa, destino) {
  exigirTaxa(taxa);
  if (!(destino in UNIDADES)) {
    erro('UNIDADE_DE_TAXA_DESCONHECIDA', `Recebida "${destino}".`, { destino });
  }
  if (taxa.unidade === destino) return taxa;
  const razao = UNIDADES[destino] / UNIDADES[taxa.unidade];
  return criarTaxa((1 + taxa.valor) ** razao - 1, destino, taxa.tipo);
}

/**
 * Compõe a taxa de um período de vários meses, como o FCO faz nos pagamentos
 * bimestrais, trimestrais, semestrais e anuais: (1 + i)^p − 1.
 */
export function comporPeriodos(taxaMensal, meses) {
  exigirTaxa(taxaMensal);
  if (!Number.isInteger(meses) || meses < 1) {
    erro('PARAMETRO_INCOMPATIVEL', `Número de meses inválido: ${meses}.`, { meses });
  }
  if (meses === 1) return taxaMensal;
  return criarTaxa((1 + taxaMensal.valor) ** meses - 1, 'mensal', taxaMensal.tipo);
}

/**
 * Aplica a regra de bônus da linha.
 *
 * O fator 0,77 vale para treze linhas — Giro, Investimento e Tecnologia — e
 * não para as demais: Transportes e Microcrédito têm taxa de bônus própria
 * tabelada, que não é 0,77 da cheia, e o FCO tem colunas separadas por
 * município. Por isso a regra é um parâmetro da linha, e o fator nunca é
 * constante do código.
 */
export function aplicarBonus(taxaCheia, regra) {
  exigirTaxa(taxaCheia);
  if (!regra || regra.tipo === 'nenhum') return taxaCheia;

  if (regra.tipo === 'fator') {
    exigirNumeroFinito(regra.fator, 'TAXA_NAO_PARAMETRIZADA', 'fator de bônus');
    return criarTaxa(taxaCheia.valor * regra.fator, taxaCheia.unidade, taxaCheia.tipo);
  }

  if (regra.tipo === 'tabelado') {
    const tabelada = exigirTaxa(regra.taxa);
    return paraUnidade(tabelada, taxaCheia.unidade);
  }

  return erro('TAXA_NAO_PARAMETRIZADA', `Regra de bônus desconhecida: "${regra.tipo}".`, { regra });
}

/** Formata para leitura humana. Só a interface deve chamar. */
export function descreverTaxa(taxa, casas = 4) {
  exigirTaxa(taxa);
  const sufixo = { mensal: 'a.m.', bimestral: 'a.b.', trimestral: 'a.t.', semestral: 'a.s.', anual: 'a.a.' };
  return `${(taxa.valor * 100).toFixed(casas).replace('.', ',')}% ${sufixo[taxa.unidade]}`;
}

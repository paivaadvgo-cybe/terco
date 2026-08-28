/**
 * TAC — Taxa de Abertura de Crédito.
 *
 * Uma escada de quatro faixas. Doze das treze células que calculam TAC na
 * planilha usam a mesma escada; a décima terceira, `Linhas Giro Puro!F15`,
 * usa uma variante com um fator 1,015 aplicado de forma assimétrica, e é ela
 * que produz ABERTO-02. As duas estão aqui, e nenhuma é padrão implícito —
 * quem chama escolhe, porque a planilha não diz qual é a regra.
 *
 * Os degraus não são constantes do código: vivem na tabela, que vem dos
 * parâmetros, para que uma mudança de vigência não exija tocar em lógica.
 */

import { erro, exigirNumeroFinito } from './../engine/erros.js';

/**
 * A escada padrão, como está em `Linhas Investimento!F15` e em mais onze
 * células. `ate` é o limite superior inclusivo da faixa; `null` é a última.
 */
export const ESCADA_PADRAO = Object.freeze([
  Object.freeze({ ate: 3000, tipo: 'fixo', valor: 50 }),
  Object.freeze({ ate: 21000, tipo: 'percentual', taxa: 0.03, teto: 420 }),
  Object.freeze({ ate: 100000, tipo: 'percentual', taxa: 0.02 }),
  Object.freeze({ ate: null, tipo: 'fixoMaisPercentual', fixo: 2000, taxa: 0.005 }),
]);

/** O fator que só aparece em `Linhas Giro Puro`. */
export const FATOR_GIRO_PURO = 1.015;

export const VARIANTES = {
  padrao: 'A escada como doze das treze células da planilha a aplicam',
  giroPuro: 'A variante de Linhas Giro Puro, com o fator 1,015 — ver ABERTO-02',
};

function faixaDe(valor, escada) {
  const faixa = escada.find((f) => f.ate === null || valor <= f.ate);
  if (faixa === undefined) {
    erro('PARAMETRO_INCOMPATIVEL', 'A escada da TAC não tem faixa final.', { valor });
  }
  return faixa;
}

function aplicarFaixa(faixa, base) {
  if (faixa.tipo === 'fixo') return faixa.valor;
  if (faixa.tipo === 'percentual') {
    const bruto = base * faixa.taxa;
    return faixa.teto !== undefined && bruto > faixa.teto ? faixa.teto : bruto;
  }
  if (faixa.tipo === 'fixoMaisPercentual') return faixa.fixo + base * faixa.taxa;
  return erro('PARAMETRO_INCOMPATIVEL', `Tipo de faixa desconhecido: "${faixa.tipo}".`, { faixa });
}

/**
 * A variante de `Linhas Giro Puro`, reproduzida literalmente.
 *
 * Ela não é a escada padrão com um fator por cima. O fator entra em lugares
 * diferentes conforme a TAC seja descontada ou financiada, e na faixa dos 3%
 * do ramo descontado **o teto é testado sobre uma base e o valor cobrado sobre
 * outra** — é daí que sai a possibilidade de a TAC passar dos R$ 420,00 que o
 * próprio teste pretende impor. Escrever isso como um caso geral esconderia a
 * assimetria; escrito assim, ela fica à vista.
 */
function variantéGiroPuro(valor, financiada) {
  const f = FATOR_GIRO_PURO;
  if (!financiada) {
    if (valor <= 3000) return 50;
    if (valor <= 21000) return valor * 0.03 <= 420 ? valor * f * 0.03 : 420;
    if (valor <= 100000) return valor * 0.02;
    return 2000 + valor * 0.005;
  }
  if (valor * f <= 3000) return 50;
  if (valor * f <= 21000) return valor * f * 0.03 <= 420 ? valor * f * 0.03 : 420;
  if (valor <= 100000) return valor * f * 0.02;
  return 2000 + valor * f * 0.005;
}

/**
 * Calcula a TAC.
 *
 * @param {number} valor  Valor solicitado.
 * @param {object} [opcoes]
 * @param {string} [opcoes.variante]    'padrao' ou 'giroPuro'.
 * @param {boolean} [opcoes.financiada] Só muda o resultado na variante giroPuro.
 * @param {Array} [opcoes.escada]       Substitui a escada padrão.
 */
export function calcularTAC(valor, opcoes = {}) {
  const { variante = 'padrao', financiada = false, escada = ESCADA_PADRAO } = opcoes;
  exigirNumeroFinito(valor, 'VALOR_INVALIDO', 'valor para a TAC');
  if (valor < 0) {
    erro('VALOR_INVALIDO', 'A TAC não incide sobre valor negativo.', { valor });
  }
  if (!(variante in VARIANTES)) {
    erro('PARAMETRO_INCOMPATIVEL', `Variante de TAC desconhecida: "${variante}".`, { variante });
  }
  if (variante === 'giroPuro') return variantéGiroPuro(valor, financiada);
  return aplicarFaixa(faixaDe(valor, escada), valor);
}

/** Memória de cálculo: qual faixa pegou e por quê. */
export function explicarTAC(valor, opcoes = {}) {
  const { variante = 'padrao', financiada = false, escada = ESCADA_PADRAO } = opcoes;
  const faixa = faixaDe(valor, escada);
  const valorCalculado = calcularTAC(valor, opcoes);
  const limite = faixa.ate === null ? 'acima da última faixa' : `até ${faixa.ate}`;
  return {
    valor: valorCalculado,
    variante,
    financiada,
    faixa: { ...faixa },
    descricao: `Valor de ${valor} cai na faixa ${limite}, do tipo ${faixa.tipo}`
      + (variante === 'giroPuro' ? `, com o fator ${FATOR_GIRO_PURO} de Linhas Giro Puro` : '')
      + `. TAC = ${valorCalculado}.`,
  };
}

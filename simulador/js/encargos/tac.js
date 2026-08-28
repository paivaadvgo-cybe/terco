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
import { PARAMETROS } from './../data/parametros.js';

/**
 * A escada padrão, como está em `Linhas Investimento!F15` e em mais onze
 * células. `ate` é o limite superior inclusivo da faixa; `null` é a última.
 */
export const ESCADA_PADRAO = PARAMETROS.encargos.tac.escadaPadrao;

/** O fator que só aparece em `Linhas Giro Puro`. */
export const FATOR_GIRO_PURO = PARAMETROS.encargos.tac.fatorGiroPuro;

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
/**
 * A forma que `Linhas Giro Puro!F15` escreve, com o fator 1,015 — ver ABERTO-02.
 *
 * O fator não entra nas quatro faixas do mesmo jeito, e não entra igual quando
 * a TAC é financiada e quando não é: na terceira faixa não financiada ele
 * simplesmente não aparece, e o teto da segunda é testado sobre uma base e
 * cobrado sobre outra. Essa irregularidade é a inconsistência registrada, e
 * está reproduzida literalmente.
 *
 * O que mudou em relação à transcrição original é só a origem dos números: as
 * faixas vêm da escada, não de literais. Uma escada alterada pela
 * administração precisa valer aqui também — deixar estes números fixos faria a
 * variante continuar cobrando a tabela velha, calada.
 */
function variantéGiroPuro(valor, financiada, escada, f) {
  const forma = conferirFormaDaEscada(escada);
  const [t1, t2, t3, t4] = forma;

  if (!financiada) {
    if (valor <= t1.ate) return t1.valor;
    if (valor <= t2.ate) return valor * t2.taxa <= t2.teto ? valor * f * t2.taxa : t2.teto;
    if (valor <= t3.ate) return valor * t3.taxa;
    return t4.fixo + valor * t4.taxa;
  }
  if (valor * f <= t1.ate) return t1.valor;
  if (valor * f <= t2.ate) return valor * f * t2.taxa <= t2.teto ? valor * f * t2.taxa : t2.teto;
  if (valor <= t3.ate) return valor * f * t3.taxa;
  return t4.fixo + valor * f * t4.taxa;
}

/**
 * A variante de Giro Puro só sabe escrever a escada de quatro faixas na forma
 * exata da planilha. Se a administração publicar outra forma — uma faixa a
 * mais, um tipo diferente —, a variante não tem como reproduzir a assimetria,
 * e recusar é a única resposta honesta: calcular assim mesmo devolveria um
 * número plausível e sem regra por trás.
 */
function conferirFormaDaEscada(escada) {
  const tipos = ['fixo', 'percentual', 'percentual', 'fixoMaisPercentual'];
  const compativel = escada.length === tipos.length
    && escada.every((faixa, i) => faixa.tipo === tipos[i])
    && escada[1].teto !== undefined
    && escada[3].ate === null;
  if (!compativel) {
    erro('PARAMETRO_INCOMPATIVEL',
      'A variante de TAC de Linhas Giro Puro só reproduz a escada de quatro faixas '
      + '(fixo, percentual com teto, percentual, fixo mais percentual). A escada vigente '
      + 'tem outra forma, e a assimetria do fator não tem como ser aplicada a ela.',
      { escada });
  }
  return escada;
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
  const {
    variante = 'padrao', financiada = false,
    escada = ESCADA_PADRAO, fatorGiroPuro = FATOR_GIRO_PURO,
  } = opcoes;
  exigirNumeroFinito(valor, 'VALOR_INVALIDO', 'valor para a TAC');
  if (valor < 0) {
    erro('VALOR_INVALIDO', 'A TAC não incide sobre valor negativo.', { valor });
  }
  if (!(variante in VARIANTES)) {
    erro('PARAMETRO_INCOMPATIVEL', `Variante de TAC desconhecida: "${variante}".`, { variante });
  }
  if (variante === 'giroPuro') return variantéGiroPuro(valor, financiada, escada, fatorGiroPuro);
  return aplicarFaixa(faixaDe(valor, escada), valor);
}

/** Memória de cálculo: qual faixa pegou e por quê. */
export function explicarTAC(valor, opcoes = {}) {
  const {
    variante = 'padrao', financiada = false,
    escada = ESCADA_PADRAO, fatorGiroPuro = FATOR_GIRO_PURO,
  } = opcoes;
  const faixa = faixaDe(valor, escada);
  const valorCalculado = calcularTAC(valor, opcoes);
  const limite = faixa.ate === null ? 'acima da última faixa' : `até ${faixa.ate}`;
  return {
    valor: valorCalculado,
    variante,
    financiada,
    faixa: { ...faixa },
    descricao: `Valor de ${valor} cai na faixa ${limite}, do tipo ${faixa.tipo}`
      + (variante === 'giroPuro' ? `, com o fator ${fatorGiroPuro} de Linhas Giro Puro` : '')
      + `. TAC = ${valorCalculado}.`,
  };
}

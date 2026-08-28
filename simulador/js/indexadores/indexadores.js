/**
 * Registro de indexadores.
 *
 * O item 18 do escopo descreve a arquitetura como «taxa base + indexador =
 * taxa aplicável». **A planilha não faz essa soma.** Varri as 32.580 fórmulas:
 * não há uma única que some a taxa fixa com o indexador. Onde há indexador —
 * Fungetur e FINEP — ele é um segundo componente de juros, cobrado à parte e
 * ainda entrando na base do juro fixo do mesmo período:
 *
 *     jurosIndexador = ((1 + indexador)^(22/252) − 1) × saldo
 *     jurosFixo      = ((1 + taxaFixa)^(22/252)  − 1) × (saldo + jurosIndexador)
 *
 * Somar as duas taxas daria outro número, e adotar a soma seria trocar a regra
 * existente por uma regra genérica — exatamente o que o item 42 proíbe sem
 * autorização. Por isso `composicao` é `componenteSeparado` em todos os três
 * indexadores, e a soma não está implementada em lugar nenhum.
 *
 * O valor do indexador **não é buscado** por linha: a coluna que existiria
 * para isso está vazia nas duas abas, e o número é digitado numa célula única.
 * Aqui ele é sempre informado por quem simula, com o valor da tabela oferecido
 * como sugestão — nunca aplicado em silêncio, porque um indexador defasado
 * produz uma simulação plausível e errada.
 */

import { erro } from './../engine/erros.js';
import { criarTaxa } from './../engine/juros.js';
import { SELIC } from './selic.js';
import { TR } from './tr.js';
import { INPC } from './inpc.js';

export { SELIC, TR, INPC };

export const INDEXADORES = Object.freeze({
  SELIC, TR, INPC,
});

export const COMPOSICOES = Object.freeze({
  componenteSeparado:
    'O indexador rende juros à parte, e entra na base do juro fixo do mesmo período. '
    + 'É o que Fungetur e FINEP fazem, e a única composição que a planilha exerce.',
});

/** Descritor do indexador, ou erro se o código não existir. */
export function obterIndexador(codigo) {
  const indexador = INDEXADORES[String(codigo).toUpperCase()];
  if (indexador === undefined) {
    erro('INDEXADOR_NAO_INFORMADO',
      `Indexador desconhecido: ${JSON.stringify(codigo)}. Conhecidos: ${Object.keys(INDEXADORES).join(', ')}.`,
      { codigo });
  }
  return indexador;
}

/**
 * Valor sugerido para preencher o formulário — nunca aplicado sozinho.
 * Devolve `null` quando a planilha não traz referência, como no INPC.
 */
export function sugerirValor(codigo) {
  const { referencia } = obterIndexador(codigo);
  return referencia ? { ...referencia } : null;
}

/**
 * Resolve o indexador numa taxa utilizável pelo motor.
 *
 * O valor é obrigatório. Cair no valor da tabela quando ele falta produziria
 * uma simulação com taxa de mercado defasada e sem aviso nenhum; é o caso que
 * o erro `INDEXADOR_NAO_INFORMADO` existe para impedir.
 */
export function resolverIndexador(codigo, opcoes = {}) {
  const indexador = obterIndexador(codigo);
  const { valor, unidade = indexador.unidade } = opcoes;

  if (valor === undefined || valor === null) {
    const sugestao = indexador.referencia
      ? ` A tabela de ${indexador.referencia.vigencia} traz ${indexador.referencia.valor}, em ${indexador.referencia.origem}.`
      : ' A planilha não traz nenhum valor de referência para este indexador.';
    erro('INDEXADOR_NAO_INFORMADO',
      `O valor de ${indexador.codigo} precisa ser informado.${sugestao}`,
      { codigo: indexador.codigo, referencia: indexador.referencia });
  }

  return criarTaxa(valor, unidade, 'efetiva');
}

/**
 * Qual indexador rege um grupo da tabela de encargos, se houver.
 * Devolve `null` para os grupos sem indexador, que são a maioria.
 */
export function indexadorDoGrupo(nomeDoGrupo, parametros) {
  const grupo = parametros.tabelaDeEncargos.find((g) => g.grupo === nomeDoGrupo);
  if (grupo === undefined) {
    erro('PARAMETRO_INCOMPATIVEL', `Grupo desconhecido na tabela de encargos: "${nomeDoGrupo}".`, { nomeDoGrupo });
  }
  return grupo.indexador ? obterIndexador(grupo.indexador) : null;
}

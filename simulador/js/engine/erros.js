/**
 * Erros do motor financeiro.
 *
 * O motor nunca devolve NaN, Infinity nem um número plausível vindo de
 * parâmetro ausente: onde a conta não pode ser feita, ele lança um erro que
 * diz qual regra faltou. É o que separa "a parcela é R$ 0,00" de "não sei
 * calcular esta parcela".
 */

export const CODIGOS = {
  PRAZO_INVALIDO: 'Prazo inválido.',
  CARENCIA_INVALIDA: 'Carência superior ao permitido.',
  VALOR_ACIMA_DO_LIMITE: 'Valor acima do limite da linha.',
  VALOR_ABAIXO_DO_MINIMO: 'Valor abaixo do mínimo da linha.',
  VALOR_INVALIDO: 'Valor inválido.',
  TAXA_NAO_PARAMETRIZADA: 'Taxa não parametrizada.',
  TAXA_INVALIDA: 'Taxa inválida.',
  UNIDADE_DE_TAXA_DESCONHECIDA: 'Unidade de taxa desconhecida.',
  FATOR_K_NAO_ENCONTRADO: 'Fator K não encontrado para este prazo.',
  INDEXADOR_NAO_INFORMADO: 'Indexador não informado.',
  PERIODICIDADE_INCOMPATIVEL: 'Prazo ou carência não são múltiplos do período.',
  PARAMETRO_INCOMPATIVEL: 'Parâmetro incompatível.',
  TIR_SEM_SOLUCAO: 'O fluxo não tem taxa interna de retorno.',
  REGRA_EM_ABERTO: 'A regra desta combinação não está definida.',
};

export class ErroDeSimulacao extends Error {
  constructor(codigo, detalhe = '', dados = {}) {
    const base = CODIGOS[codigo];
    if (base === undefined) {
      throw new Error(`Código de erro desconhecido: ${codigo}`);
    }
    super(detalhe ? `${base} ${detalhe}` : base);
    this.name = 'ErroDeSimulacao';
    this.codigo = codigo;
    this.detalhe = detalhe;
    this.dados = dados;
  }
}

export function erro(codigo, detalhe, dados) {
  throw new ErroDeSimulacao(codigo, detalhe, dados);
}

/** Recusa o que viraria NaN ou Infinity mais adiante, onde a origem já se perdeu. */
export function exigirNumeroFinito(valor, codigo, nome) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    erro(codigo, `${nome} recebeu ${JSON.stringify(valor)}.`, { [nome]: valor });
  }
  return valor;
}

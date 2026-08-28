/**
 * Garantias: seleção da modalidade, renda para aval e alienação de imóvel.
 *
 * A planilha oferece três modalidades de encargo de garantia, escolhidas pela
 * célula `L24`: FAMPE, FGI e FUNDEQ. FAMPE e FUNDEQ têm a mesma fórmula —
 * ficam separados aqui porque são fundos distintos, e nada garante que as
 * tabelas continuem iguais na próxima vigência.
 */

import { erro, exigirNumeroFinito } from './../engine/erros.js';
import { calcularFAMPE, FATOR_FAMPE } from './fampe.js';
import { calcularFGI } from './fgi.js';

export const MODALIDADES = {
  1: 'FAMPE',
  2: 'FGI',
  3: 'FUNDEQ',
};

/** Piso da renda exigida para aval, escrito direto na fórmula da planilha. */
export const PISO_RENDA_PARA_AVAL = 2424;

/** FUNDEQ tem, hoje, a mesma fórmula do FAMPE. */
export function calcularFUNDEQ(entrada) {
  const resultado = calcularFAMPE({ fator: FATOR_FAMPE, ...entrada });
  return { ...resultado, memoria: resultado.memoria.replace('FAMPE', 'FUNDEQ') };
}

/**
 * Calcula o encargo da modalidade escolhida.
 *
 * @param {number|string} modalidade  1/FAMPE, 2/FGI ou 3/FUNDEQ.
 */
export function calcularGarantia(modalidade, entrada) {
  const nome = typeof modalidade === 'number' ? MODALIDADES[modalidade] : modalidade;
  if (nome === 'FAMPE') return { modalidade: nome, ...calcularFAMPE(entrada) };
  if (nome === 'FUNDEQ') return { modalidade: nome, ...calcularFUNDEQ(entrada) };
  if (nome === 'FGI') return { modalidade: nome, ...calcularFGI(entrada) };
  return erro('PARAMETRO_INCOMPATIVEL',
    `Modalidade de garantia desconhecida: ${JSON.stringify(modalidade)}.`, { modalidade });
}

/**
 * Renda mínima exigida do avalista.
 *
 *     renda = max(maiorPrestacao × 3, piso)
 *
 * Uniforme nas nove abas que a calculam, ainda que escrita de dois jeitos —
 * umas testam `< piso` e outras `>= piso`, dando no mesmo. O piso de
 * R$ 2.424,00 está escrito direto na fórmula, sem rótulo em lugar nenhum da
 * planilha; aqui ele é parâmetro.
 */
export function calcularRendaParaAval(maiorPrestacao, opcoes = {}) {
  const { multiplicador = 3, piso = PISO_RENDA_PARA_AVAL } = opcoes;
  exigirNumeroFinito(maiorPrestacao, 'VALOR_INVALIDO', 'maior prestação');

  const calculada = maiorPrestacao * multiplicador;
  const valor = calculada < piso ? piso : calculada;
  return {
    valor,
    maiorPrestacao,
    multiplicador,
    piso,
    aplicouPiso: calculada < piso,
    memoria: `Maior prestação ${maiorPrestacao} × ${multiplicador} = ${calculada}`
      + (calculada < piso ? `, abaixo do piso de ${piso}; vale o piso.` : `.`),
  };
}

/**
 * Valor de imóvel exigido em alienação.
 *
 *     alienacao = (valorSolicitado − parteGarantida) × cobertura / percentualMaximo
 *
 * com cobertura 1,5 e percentual máximo 0,7. A forma varia por família de
 * produto, e todas as variações são parâmetro:
 *
 *   - `Giro Puro`, `Investimento`, `Transportes` e `Mais Crédito` descontam a
 *     parte já coberta pelo FGI quando há FGI;
 *   - `FCO Empresarial` e `FCO Rural` nunca descontam;
 *   - `Produtor Empreendedor` só exige imóvel acima de um valor mínimo, e
 *     abaixo dele devolve zero.
 */
export function calcularAlienacaoImovel(entrada) {
  const {
    valorSolicitado, parteGarantida = 0,
    cobertura = 1.5, percentualMaximo = 0.7,
    descontaParteGarantida = true, valorMinimo = null,
  } = entrada;

  exigirNumeroFinito(valorSolicitado, 'VALOR_INVALIDO', 'valor solicitado');
  if (percentualMaximo <= 0) {
    erro('PARAMETRO_INCOMPATIVEL', 'O percentual máximo de garantia precisa ser positivo.', { percentualMaximo });
  }

  if (valorMinimo !== null && valorSolicitado <= valorMinimo) {
    return {
      valor: 0,
      dispensada: true,
      memoria: `Valor de ${valorSolicitado} não passa do mínimo de ${valorMinimo}; não há exigência de imóvel.`,
    };
  }

  const base = descontaParteGarantida ? valorSolicitado - parteGarantida : valorSolicitado;
  const valor = base * cobertura / percentualMaximo;
  return {
    valor,
    dispensada: false,
    base,
    memoria: `(${valorSolicitado}${descontaParteGarantida && parteGarantida ? ` − ${parteGarantida}` : ''})`
      + ` × ${cobertura} / ${percentualMaximo} = ${valor}.`,
  };
}

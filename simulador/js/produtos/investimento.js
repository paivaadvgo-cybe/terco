/**
 * Investimento — aba `Linhas Investimento`.
 *
 * Segue a escada padrão da TAC e o SAC com juros pagos na carência. É uma das
 * cinco abas em que a base da amortização troca na parcela 13 — as doze
 * primeiras dividem o valor solicitado e as seguintes o financiado —, e por
 * isso `baseAmortizacao` é `'planilha'`: reproduz o resíduo de ABERTO-07 em
 * vez de escondê-lo.
 *
 * É também a única aba do arquivo com um indicador de PRICE, a célula `AL18`.
 */
export const PERFIL = Object.freeze({
  codigo: 'investimento',
  nome: 'Investimento',
  abaDeOrigem: 'Linhas Investimento',
  gruposDeEncargos: ['Linhas para Investimentos', 'Linhas Especiais Investimentos'],
  regras: Object.freeze({
    convencaoTaxa: 'mensalComposta',
    varianteTAC: 'padrao',
    baseAmortizacao: 'planilha',
    tratamentoCarencia: 'pagos',
    bonus: Object.freeze({ tipo: 'fator', fator: 0.77 }),
    alienacao: Object.freeze({ descontaParteGarantida: true }),
    indexador: null,
    periodicidades: Object.freeze([1]),
    modalidadesDeGarantia: Object.freeze(['FAMPE', 'FGI', 'FUNDEQ']),
    percentualGarantidoMinimo: 0.2,
  }),
  linhasEmAberto: Object.freeze([]),
});
export default PERFIL;

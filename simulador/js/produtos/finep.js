/**
 * FINEP — aba `Linhas FINEP`.
 *
 * Inovação. Como o Fungetur, taxa fixa anual mais indexador por dias úteis,
 * sem bônus; o indexador é a TR.
 *
 * O que distingue a família é o **porte**: portes I e II usam uma tabela de
 * taxas e o porte III usa outra, com a mesma linha custando 4,2% ao ano no
 * primeiro caso e 5,5% no segundo. As linhas têm ainda um valor mínimo, que
 * nenhuma outra família tem.
 */
export const PERFIL = Object.freeze({
  codigo: 'finep',
  nome: 'FINEP — Inovação',
  abaDeOrigem: 'Linhas FINEP',
  gruposDeEncargos: ['Linhas FINEP - PORTE I e II', 'Linhas FINEP - PORTE III'],
  regras: Object.freeze({
    convencaoTaxa: 'diasUteis',
    varianteTAC: 'padrao',
    baseAmortizacao: 'valorFinanciado',
    tratamentoCarencia: 'pagos',
    bonus: Object.freeze({ tipo: 'nenhum' }),
    alienacao: Object.freeze({ descontaParteGarantida: true }),
    indexador: 'TR',
    periodicidades: Object.freeze([1]),
    modalidadesDeGarantia: Object.freeze(['FAMPE', 'FGI', 'FUNDEQ']),
    percentualGarantidoMinimo: 0.2,
    exigePorte: true,
    portes: Object.freeze({
      1: 'Linhas FINEP - PORTE I e II',
      2: 'Linhas FINEP - PORTE I e II',
      3: 'Linhas FINEP - PORTE III',
    }),
  }),
  linhasEmAberto: Object.freeze([]),
});
export default PERFIL;

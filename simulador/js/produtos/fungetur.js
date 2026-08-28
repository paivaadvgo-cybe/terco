/**
 * Fungetur — aba `Linhas Fungetur`.
 *
 * Turismo. Taxa fixa anual mais indexador, com a conversão por dias úteis —
 * `(1 + i)^(22/252) − 1`, e não a composição em doze meses. Não há bônus.
 *
 * Qual índice rege a linha é ABERTO-09: a aba rotula INPC e traz 10%, a
 * `Tabela de Encargos` chama de Selic e traz 13,75%, e o valor é digitado à
 * mão em ambas. Por isso o indexador é obrigatório a cada simulação.
 */
export const PERFIL = Object.freeze({
  codigo: 'fungetur',
  nome: 'Fungetur — Turismo',
  abaDeOrigem: 'Linhas Fungetur',
  gruposDeEncargos: ['Linhas Fungetur'],
  regras: Object.freeze({
    convencaoTaxa: 'diasUteis',
    varianteTAC: 'padrao',
    baseAmortizacao: 'valorFinanciado',
    tratamentoCarencia: 'pagos',
    bonus: Object.freeze({ tipo: 'nenhum' }),
    alienacao: Object.freeze({ descontaParteGarantida: true }),
    indexador: 'SELIC',
    periodicidades: Object.freeze([1]),
    modalidadesDeGarantia: Object.freeze(['FAMPE', 'FGI', 'FUNDEQ']),
    percentualGarantidoMinimo: 0.2,
  }),
  linhasEmAberto: Object.freeze([]),
});
export default PERFIL;

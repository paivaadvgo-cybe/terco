/**
 * Transportes — aba `Linhas Transportes`.
 *
 * Táxi, mototáxi, transporte escolar, TransGás e feirantes. A diferença que
 * importa está no bônus: aqui ele **não** é 0,77 da taxa cheia, é uma taxa
 * própria tabelada. Em `GoiásFomento Taxi` a cheia é 2,19% e a com bônus é
 * 1,59%, enquanto 2,19 × 0,77 daria 1,686 — quase, e por isso perigoso.
 */
export const PERFIL = Object.freeze({
  codigo: 'transportes',
  nome: 'Transportes',
  abaDeOrigem: 'Linhas Transportes',
  gruposDeEncargos: ['Linhas Especiais para Transportes'],
  regras: Object.freeze({
    convencaoTaxa: 'mensalComposta',
    varianteTAC: 'padrao',
    baseAmortizacao: 'planilha',
    tratamentoCarencia: 'pagos',
    bonus: Object.freeze({ tipo: 'tabelado' }),
    alienacao: Object.freeze({ descontaParteGarantida: true }),
    indexador: null,
    periodicidades: Object.freeze([1]),
    modalidadesDeGarantia: Object.freeze(['FAMPE', 'FGI', 'FUNDEQ']),
    percentualGarantidoMinimo: 0.2,
  }),
  linhasEmAberto: Object.freeze([]),
});
export default PERFIL;

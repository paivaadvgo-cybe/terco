/**
 * Capital de giro — aba `Linhas Giro Puro`.
 *
 * A família que mais destoa das outras. É a única cuja TAC leva o fator 1,015
 * (ABERTO-02) e a única cuja tabela interna de taxas está em pontos
 * percentuais, e não em decimal (ABERTO-03) — por isso as taxas vêm da
 * `Tabela de Encargos`, que está em decimal e é a fonte oficial.
 *
 * Em compensação, é a única aba mensal cuja amortização divide o mesmo valor
 * do começo ao fim: o saldo fecha em zero, sem o resíduo de ABERTO-07.
 */
export const PERFIL = Object.freeze({
  codigo: 'giro',
  nome: 'Capital de Giro',
  abaDeOrigem: 'Linhas Giro Puro',
  gruposDeEncargos: ['Linhas para Capital de Giro', 'Linhas Especiais de Giro Puro'],
  regras: Object.freeze({
    convencaoTaxa: 'mensalComposta',
    varianteTAC: 'giroPuro',
    baseAmortizacao: 'valorFinanciado',
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

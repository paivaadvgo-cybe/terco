/**
 * Microcrédito — abas `Mais Crédito` e `Mais Crédito (2)`.
 *
 * A segunda aba é cópia da primeira, oculta, e difere só na validação do
 * valor: `Mais Crédito` limita a R$ 5.000 e `Mais Crédito (2)` permite até
 * R$ 21.000 na primeira linha. As tabelas internas das duas trazem limites de
 * R$ 21.000 e R$ 300.000, que não conferem com nenhuma das validações — ver
 * ABERTO-14.
 *
 * O percentual garantido é 1 nesta família, e não 0,8: o encargo de garantia
 * cobre o valor inteiro.
 */
export const PERFIL = Object.freeze({
  codigo: 'microcredito',
  nome: 'Microcrédito Produtivo',
  abaDeOrigem: 'Mais Crédito',
  gruposDeEncargos: ['Linha Microcrédito'],
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
    percentualGarantidoPadrao: 1,
  }),
  linhasEmAberto: Object.freeze([
    Object.freeze({
      nome: 'GoiásFomento Microcrédito Produtivo - Capital de Giro',
      celula: "'Tabela de Encargos'!C34 e E34",
      codigo: 'TAXA_NAO_PARAMETRIZADA',
      motivo: 'A tabela oficial traz prazo, carência e limite desta linha, mas as duas '
        + 'células de taxa estão vazias. Ver ABERTO-14.',
    }),
  ]),
});
export default PERFIL;

/**
 * Selic.
 *
 * A `Tabela de Encargos` nomeia a Selic como indexador das linhas Fungetur,
 * com 13,75% ao ano. A aba `Linhas Fungetur`, porém, rotula a mesma célula
 * como INPC e traz 10%. Nenhum dos dois números é buscado: são digitados. Ver
 * ABERTO-09.
 */

export const SELIC = Object.freeze({
  codigo: 'SELIC',
  nome: 'Taxa Selic',
  fonte: 'Banco Central do Brasil',
  unidade: 'anual',
  composicao: 'componenteSeparado',
  descricao: 'Taxa básica de juros da economia, definida pelo Copom.',
  referencia: Object.freeze({
    valor: 0.1375,
    unidade: 'anual',
    origem: "'Tabela de Encargos'!E37:E40",
    vigencia: '2024-12-16',
  }),
});

export default SELIC;

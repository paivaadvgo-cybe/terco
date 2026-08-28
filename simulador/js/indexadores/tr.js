/**
 * TR — Taxa Referencial.
 *
 * Indexador das linhas FINEP nas duas fontes da planilha, com o nome batendo
 * mas o número não: a `Tabela de Encargos` traz 1,19% ao ano e a aba
 * `Linhas FINEP` traz 1,07%, digitado à mão. Ver ABERTO-09.
 */

export const TR = Object.freeze({
  codigo: 'TR',
  nome: 'Taxa Referencial',
  fonte: 'Banco Central do Brasil',
  unidade: 'anual',
  composicao: 'componenteSeparado',
  descricao: 'Taxa Referencial, calculada a partir da remuneração dos CDB/RDB.',
  referencia: Object.freeze({
    valor: 0.0119,
    unidade: 'anual',
    origem: "'Tabela de Encargos'!E43:E49",
    vigencia: '2024-12-16',
  }),
});

export default TR;

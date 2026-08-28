/**
 * INPC.
 *
 * O INPC aparece na planilha uma única vez, e só como rótulo: a célula `C16`
 * de `Linhas Fungetur` o nomeia, enquanto a `Tabela de Encargos` chama a mesma
 * coluna de Selic. Não há em lugar nenhum do arquivo um valor de INPC.
 *
 * Por isso `referencia` é nula, e não zero: zero seria um número, e um número
 * seria usado. Quem escolher o INPC precisa informar o valor — é o que o item
 * 38 do escopo chama de «Indexador não informado».
 */

export const INPC = Object.freeze({
  codigo: 'INPC',
  nome: 'Índice Nacional de Preços ao Consumidor',
  fonte: 'IBGE',
  unidade: 'anual',
  composicao: 'componenteSeparado',
  descricao: 'Índice de inflação medido pelo IBGE para famílias de renda baixa.',
  referencia: null,
});

export default INPC;

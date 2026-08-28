/**
 * Selic.
 *
 * A `Tabela de Encargos` nomeia a Selic como indexador das linhas Fungetur,
 * com 13,75% ao ano. A aba `Linhas Fungetur`, porém, rotula a mesma célula
 * como INPC e traz 10%. Nenhum dos dois números é buscado: são digitados. Ver
 * ABERTO-09.
 */

import { PARAMETROS } from './../data/parametros.js';

export const SELIC = PARAMETROS.indexadores.SELIC;

export default SELIC;

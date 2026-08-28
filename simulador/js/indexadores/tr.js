/**
 * TR — Taxa Referencial.
 *
 * Indexador das linhas FINEP nas duas fontes da planilha, com o nome batendo
 * mas o número não: a `Tabela de Encargos` traz 1,19% ao ano e a aba
 * `Linhas FINEP` traz 1,07%, digitado à mão. Ver ABERTO-09.
 */

import { PARAMETROS } from './../data/parametros.js';

export const TR = PARAMETROS.indexadores.TR;

export default TR;

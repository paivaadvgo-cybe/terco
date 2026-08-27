/**
 * FCO Empresarial — aba `FCO Empresarial`.
 *
 * Fundo Constitucional de Financiamento do Centro-Oeste, linhas empresariais:
 * MEI, empresarial por porte, giro dissociado, PNMPO e geração de energia.
 *
 * Três coisas separam esta família das mensais:
 *
 *   1. **A taxa é anual**, apesar de o cabeçalho da aba dizer `a.m.` — o
 *      rótulo está errado e o cálculo, certo, com `(1 + i)^(1/12) − 1`
 *      (ABERTO-10);
 *   2. **o município muda a taxa**: prioritário e não prioritário têm colunas
 *      próprias de taxa cheia e de bônus, e a diferença é grande — a linha
 *      `FCO Empresarial - (Pequeno)` custa 8,90% ao ano no prioritário e
 *      12,77% no não prioritário;
 *   3. **a alienação não desconta** a parte já coberta por garantia, ao
 *      contrário das famílias mensais.
 *
 * Duas linhas não podem ser simuladas. As células que selecionariam a taxa de
 * `FCO PNMPO Giro Dissociado` e de `FCO Mini e Micro Geração de Energia`
 * contêm `#REF!`: a referência foi perdida e a planilha não diz qual era.
 * Deduzi-la seria inventar preço de crédito. Ver ABERTO-12.
 */
export const PERFIL = Object.freeze({
  codigo: 'fco',
  nome: 'FCO Empresarial',
  abaDeOrigem: 'FCO Empresarial',
  gruposDeEncargos: ['Linhas FCO Empresarial'],
  regras: Object.freeze({
    convencaoTaxa: 'mensalComposta',
    varianteTAC: 'padrao',
    baseAmortizacao: 'planilha',
    tratamentoCarencia: 'pagos',
    bonus: Object.freeze({ tipo: 'tabelado' }),
    alienacao: Object.freeze({ descontaParteGarantida: false }),
    indexador: null,
    // A periodicidade da planilha chega ao cronograma pela metade (ABERTO-13):
    // a coluna de juros a consulta, a de amortização não. Só o mensal, que é o
    // estado salvo, exercita um caminho coerente.
    periodicidades: Object.freeze([1]),
    exigeMunicipio: true,
    modalidadesDeGarantia: Object.freeze(['FAMPE', 'FGI', 'FUNDEQ']),
    percentualGarantidoMinimo: 0.2,
  }),
  linhasEmAberto: Object.freeze([
    Object.freeze({
      nome: 'FCO PNMPO Giro Dissociado',
      celula: "'FCO Empresarial'!C11",
      motivo: 'A célula que seleciona a taxa desta linha contém #REF!. Ver ABERTO-12.',
    }),
    Object.freeze({
      nome: 'FCO Mini e Micro Geração de Energia',
      celula: "'FCO Empresarial'!C12",
      motivo: 'A célula que seleciona a taxa desta linha contém #REF!. Ver ABERTO-12.',
    }),
  ]),
});
export default PERFIL;
